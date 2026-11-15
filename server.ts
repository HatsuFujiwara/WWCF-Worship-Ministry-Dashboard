import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

interface TransferSession {
  sessionId: string;
  token: string;
  direction: 'pc_to_phone' | 'phone_to_pc';
  createdAt: number;
  expiresAt: number;
  status: 'waiting' | 'connected' | 'data_ready' | 'transferring' | 'completed' | 'expired' | 'cancelled';
  payload?: {
    app: string;
    version: string;
    exportedAt: string;
    direction?: string;
    data: {
      members?: any[];
      songs?: any[];
      schedules?: any[];
      labels?: string[];
      songFamilies?: any[];
      templates?: any[];
      memberAvailability?: any[];
      songFamiliarity?: any[];
      draft?: any;
    };
  };
}

const MAX_SESSIONS = 200;
const MAX_RECORD_LIMIT = 5000;
const MAX_LABELS_LIMIT = 1000;
const MAX_LABEL_LENGTH = 100;
const MAX_METADATA_QUERY_LENGTH = 300;
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const METADATA_CACHE_MAX_ENTRIES = 200;
const METADATA_RATE_WINDOW_MS = 60 * 1000;
const METADATA_RATE_MAX_REQUESTS = 30;

// Architectural note: transferSessions is intentionally stored in-memory for single-instance
// or sticky-session deployments. Ephemeral QR transfer sessions do not persist across server
// restarts or multi-instance horizontal scaling without an external shared session store.
const transferSessions = new Map<string, TransferSession>();

const metadataResponseCache = new Map<string, { expiresAt: number; data: unknown }>();
const metadataRateBuckets = new Map<string, { windowStart: number; count: number }>();

const TRANSFER_ARRAY_COLLECTIONS = [
  'members',
  'songs',
  'schedules',
  'songFamilies',
  'templates',
  'memberAvailability',
  'songFamiliarity'
] as const;

function validateLabelsBounds(labels: unknown): { error: string; statusError: 'PAYLOAD_TOO_LARGE' | 'INVALID_PAYLOAD' } | null {
  if (labels === undefined) return null;
  if (!Array.isArray(labels)) {
    return { error: 'Labels payload must be an array of strings.', statusError: 'INVALID_PAYLOAD' };
  }
  if (labels.length > MAX_LABELS_LIMIT) {
    return {
      error: `Labels exceed the maximum allowed limit of ${MAX_LABELS_LIMIT} items.`,
      statusError: 'PAYLOAD_TOO_LARGE'
    };
  }
  for (const lbl of labels) {
    if (typeof lbl !== 'string' || lbl.trim().length > MAX_LABEL_LENGTH) {
      return {
        error: `Each label must be a string of at most ${MAX_LABEL_LENGTH} characters.`,
        statusError: 'INVALID_PAYLOAD'
      };
    }
  }
  return null;
}

function validateTransferPayloadData(
  data: unknown
): { error: string; statusError: 'PAYLOAD_TOO_LARGE' | 'INVALID_PAYLOAD' } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'Transfer payload data must be an object.', statusError: 'INVALID_PAYLOAD' };
  }
  const record = data as Record<string, unknown>;
  for (const key of TRANSFER_ARRAY_COLLECTIONS) {
    const val = record[key];
    if (val === undefined) continue;
    if (!Array.isArray(val)) {
      return {
        error: `Transfer collection "${key}" must be an array.`,
        statusError: 'INVALID_PAYLOAD'
      };
    }
    if (val.length > MAX_RECORD_LIMIT) {
      return {
        error: `Records in "${key}" exceed the maximum allowed limit of ${MAX_RECORD_LIMIT} items.`,
        statusError: 'PAYLOAD_TOO_LARGE'
      };
    }
  }
  if (record.draft !== undefined && record.draft !== null) {
    if (typeof record.draft !== 'object' || Array.isArray(record.draft)) {
      return {
        error: 'Transfer field "draft" must be an object when present.',
        statusError: 'INVALID_PAYLOAD'
      };
    }
  }
  return validateLabelsBounds(record.labels);
}

function buildTransferCounts(data: NonNullable<TransferSession['payload']>['data']) {
  return {
    members: Array.isArray(data.members) ? data.members.length : 0,
    songs: Array.isArray(data.songs) ? data.songs.length : 0,
    schedules: Array.isArray(data.schedules) ? data.schedules.length : 0,
    labels: Array.isArray(data.labels) ? data.labels.length : 0,
    songFamilies: Array.isArray(data.songFamilies) ? data.songFamilies.length : 0,
    templates: Array.isArray(data.templates) ? data.templates.length : 0,
    memberAvailability: Array.isArray(data.memberAvailability) ? data.memberAvailability.length : 0,
    songFamiliarity: Array.isArray(data.songFamiliarity) ? data.songFamiliarity.length : 0,
    hasDraft: Boolean(data.draft)
  };
}

function resolveTransferOrigin(req: express.Request, port: number): string {
  const configuredAppUrl = (process.env.APP_URL || '').trim();
  if (configuredAppUrl && configuredAppUrl !== 'MY_APP_URL') {
    try {
      const parsed = new URL(configuredAppUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Fall back to validated request origin below
    }
  }

  const rawHost = (req.get('host') || '').trim();
  const isSafeHost = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(rawHost);
  if (!isSafeHost) {
    return `http://localhost:${port}`;
  }

  const forwardedProtoRaw = req.get('x-forwarded-proto');
  const firstForwardedProto = typeof forwardedProtoRaw === 'string'
    ? forwardedProtoRaw.split(',')[0].trim().toLowerCase()
    : '';
  const proto =
    firstForwardedProto === 'https' || firstForwardedProto === 'http'
      ? firstForwardedProto
      : (req.secure || req.protocol === 'https' ? 'https' : 'http');

  return `${proto}://${rawHost}`;
}

function checkMetadataRateLimit(req: express.Request): boolean {
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').trim();
  const now = Date.now();
  const existing = metadataRateBuckets.get(ip);
  if (!existing || now - existing.windowStart >= METADATA_RATE_WINDOW_MS) {
    if (metadataRateBuckets.size > 1000) {
      for (const [k, v] of metadataRateBuckets.entries()) {
        if (now - v.windowStart >= METADATA_RATE_WINDOW_MS) {
          metadataRateBuckets.delete(k);
        }
      }
    }
    metadataRateBuckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (existing.count >= METADATA_RATE_MAX_REQUESTS) {
    return false;
  }
  existing.count += 1;
  return true;
}

function getCachedMetadata(cacheKey: string): unknown | null {
  const entry = metadataResponseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    metadataResponseCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function setCachedMetadata(cacheKey: string, data: unknown): void {
  const now = Date.now();
  if (metadataResponseCache.size >= METADATA_CACHE_MAX_ENTRIES) {
    for (const [k, v] of metadataResponseCache.entries()) {
      if (now > v.expiresAt) metadataResponseCache.delete(k);
    }
    if (metadataResponseCache.size >= METADATA_CACHE_MAX_ENTRIES) {
      const oldestKey = metadataResponseCache.keys().next().value;
      if (oldestKey !== undefined) metadataResponseCache.delete(oldestKey);
    }
  }
  metadataResponseCache.set(cacheKey, {
    expiresAt: now + METADATA_CACHE_TTL_MS,
    data
  });
}

/**
 * Timing-safe token comparison to prevent side-channel timing attacks
 */
function safeTokenCompare(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Cleanup expired sessions every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of transferSessions.entries()) {
    if (now > session.expiresAt + 60000) {
      transferSessions.delete(id);
    }
  }
}, 2 * 60 * 1000);

async function startServer() {
  const app = express();

  // Parse command line arguments or environment variables
  const portArgIndex = process.argv.indexOf('--port') !== -1 ? process.argv.indexOf('--port') : process.argv.indexOf('-p');
  const hostArgIndex = process.argv.indexOf('--host') !== -1 ? process.argv.indexOf('--host') : process.argv.indexOf('-h');
  const cliPort = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : NaN;
  const PORT = !isNaN(cliPort) && cliPort > 0 ? cliPort : (Number(process.env.PORT) || 3000);
  const HOST = hostArgIndex !== -1 ? process.argv[hostArgIndex + 1] : (process.env.HOST || "0.0.0.0");

  // HTTP Security Headers & Cache Management
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
    }
    next();
  });

  // Limit JSON body size to 15MB
  app.use(express.json({ limit: "15mb" }));

  // API routes FIRST
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // MusicBrainz Metadata Proxy (User-Agent header required by MusicBrainz API terms)
  app.get("/api/metadata/musicbrainz", async (req, res) => {
    try {
      if (!checkMetadataRateLimit(req)) {
        return res.status(429).json({
          success: false,
          error: "Too many metadata lookup requests. Please wait a moment and try again."
        });
      }
      const rawQuery = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (!rawQuery) {
        return res.status(400).json({ success: false, error: "Query parameter is required" });
      }
      if (rawQuery.length > MAX_METADATA_QUERY_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Query parameter must be ${MAX_METADATA_QUERY_LENGTH} characters or fewer`
        });
      }
      const cacheKey = `mb:${rawQuery.toLowerCase()}`;
      const cached = getCachedMetadata(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const mbUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(rawQuery)}&fmt=json`;
      const response = await fetch(mbUrl, {
        headers: {
          "User-Agent": "WWCFSantaCruzLineupScheduler/1.0 (contact@wwcf.org)",
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        return res.status(response.status).json({ success: false, error: `MusicBrainz error: ${response.statusText}` });
      }
      const data = await response.json();
      setCachedMetadata(cacheKey, data);
      res.json({ success: true, data });
    } catch (err: any) {
      console.warn("MusicBrainz proxy fetch error:", err?.message || err);
      res.status(502).json({ success: false, error: "Failed to query MusicBrainz" });
    }
  });

  // Deezer Metadata Proxy (Secondary fallback)
  app.get("/api/metadata/deezer", async (req, res) => {
    try {
      if (!checkMetadataRateLimit(req)) {
        return res.status(429).json({
          success: false,
          error: "Too many metadata lookup requests. Please wait a moment and try again."
        });
      }
      const rawQuery = typeof req.query.query === "string" ? req.query.query.trim() : "";
      if (!rawQuery) {
        return res.status(400).json({ success: false, error: "Query parameter is required" });
      }
      if (rawQuery.length > MAX_METADATA_QUERY_LENGTH) {
        return res.status(400).json({
          success: false,
          error: `Query parameter must be ${MAX_METADATA_QUERY_LENGTH} characters or fewer`
        });
      }
      const cacheKey = `dz:${rawQuery.toLowerCase()}`;
      const cached = getCachedMetadata(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached });
      }

      const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(rawQuery)}&limit=5`;
      const response = await fetch(deezerUrl, {
        headers: {
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) {
        return res.status(response.status).json({ success: false, error: `Deezer error: ${response.statusText}` });
      }
      const data = await response.json();
      setCachedMetadata(cacheKey, data);
      res.json({ success: true, data });
    } catch (err: any) {
      console.warn("Deezer proxy fetch error:", err?.message || err);
      res.status(502).json({ success: false, error: "Failed to query Deezer" });
    }
  });



  // Create temporary transfer session (Supports PC -> Phone and Phone -> PC)
  app.post("/api/transfer/create", (req, res) => {
    try {
      // Session cap check to prevent resource exhaustion
      if (transferSessions.size >= MAX_SESSIONS) {
        const now = Date.now();
        for (const [id, s] of transferSessions.entries()) {
          if (now > s.expiresAt) transferSessions.delete(id);
        }
        if (transferSessions.size >= MAX_SESSIONS) {
          return res.status(429).json({
            success: false,
            error: "RATE_LIMITED",
            message: "Active transfer session limit reached. Please wait a moment and try again."
          });
        }
      }

      const { payload, direction = 'pc_to_phone', expiresInSeconds = 600 } = req.body || {};

      // Validate bounds and collection types if payload data is provided
      if (payload?.data !== undefined) {
        const payloadErr = validateTransferPayloadData(payload.data);
        if (payloadErr) {
          return res.status(400).json({
            success: false,
            error: payloadErr.statusError,
            message: payloadErr.error
          });
        }
      }

      // If PC -> Phone, payload is required upfront.
      // If Phone -> PC, payload will be uploaded by the phone later.
      if (direction === 'pc_to_phone' && (!payload || !payload.data)) {
        return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "Invalid transfer payload" });
      }

      const sessionId = `tr_${crypto.randomUUID()}`;
      const token = crypto.randomBytes(16).toString("hex");
      const createdAt = Date.now();
      const clampedExpiresIn = Math.min(Math.max(Number(expiresInSeconds) || 600, 60), 3600);
      const expiresAt = createdAt + clampedExpiresIn * 1000;

      const session: TransferSession = {
        sessionId,
        token,
        direction: direction === 'phone_to_pc' ? 'phone_to_pc' : 'pc_to_phone',
        createdAt,
        expiresAt,
        status: "waiting",
        payload: direction === 'pc_to_phone' ? payload : undefined
      };

      transferSessions.set(sessionId, session);

      const origin = resolveTransferOrigin(req, PORT);
      const qrData = `${origin}/#transferSessionId=${sessionId}&token=${token}`;

      res.json({
        success: true,
        sessionId,
        token,
        direction: session.direction,
        expiresAt,
        qrData
      });
    } catch (err: any) {
      console.error("Failed to create transfer session:", err);
      res.status(500).json({ success: false, error: "SERVER_ERROR", message: "Failed to initialize transfer session." });
    }
  });

  // Get session details & data (Phone connecting or PC polling)
  app.get("/api/transfer/session/:sessionId", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = req.headers["x-transfer-token"] as string | undefined;

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Transfer session not found or has expired." });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED", message: "Invalid session token." });
      }

      const now = Date.now();
      if (now > session.expiresAt) {
        session.status = "expired";
        return res.status(410).json({ success: false, error: "EXPIRED", message: "This transfer session has expired." });
      }

      if (session.status === "completed") {
        return res.status(410).json({ success: false, error: "ALREADY_USED", message: "This transfer session has already been used." });
      }

      if (session.status === "cancelled") {
        return res.status(410).json({ success: false, error: "CANCELLED", message: "This transfer session was cancelled." });
      }

      // Mark as connected if was waiting
      if (session.status === "waiting") {
        session.status = "connected";
      }

      const data = session.payload?.data || {};

      res.json({
        success: true,
        sessionId: session.sessionId,
        direction: session.direction,
        status: session.status,
        expiresAt: session.expiresAt,
        counts: buildTransferCounts(data),
        payload: session.payload
      });
    } catch (err: any) {
      console.error("Error retrieving transfer session:", err);
      res.status(500).json({ success: false, error: "SERVER_ERROR", message: "Failed to retrieve transfer session." });
    }
  });

  // Upload endpoint for Phone -> PC transfer
  app.post("/api/transfer/session/:sessionId/upload", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = (req.headers["x-transfer-token"] as string | undefined) || (req.body?.token as string | undefined);
      const { payload } = req.body || {};

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Transfer session not found or has expired." });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED", message: "Invalid session token." });
      }

      const now = Date.now();
      if (now > session.expiresAt) {
        session.status = "expired";
        return res.status(410).json({ success: false, error: "EXPIRED", message: "This transfer session has expired." });
      }

      if (session.status === "completed") {
        return res.status(410).json({ success: false, error: "ALREADY_USED", message: "This transfer session has already been used." });
      }

      if (session.status === "cancelled") {
        return res.status(410).json({ success: false, error: "CANCELLED", message: "This transfer session was cancelled." });
      }

      if (session.direction !== "phone_to_pc") {
        return res.status(400).json({ success: false, error: "INVALID_DIRECTION", message: "This session is not configured to receive phone uploads." });
      }

      if (!payload || !payload.data) {
        return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "Invalid transfer payload data." });
      }

      const payloadErr = validateTransferPayloadData(payload.data);
      if (payloadErr) {
        return res.status(400).json({
          success: false,
          error: payloadErr.statusError,
          message: payloadErr.error
        });
      }

      session.payload = payload;
      session.status = "data_ready";

      res.json({
        success: true,
        message: "Data uploaded successfully.",
        status: session.status
      });
    } catch (err: any) {
      console.error("Error uploading transfer data:", err);
      res.status(500).json({ success: false, error: "SERVER_ERROR", message: "Failed to upload transfer data." });
    }
  });

  // Get status only (lightweight polling endpoint for PC)
  app.get("/api/transfer/session/:sessionId/status", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = req.headers["x-transfer-token"] as string | undefined;

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND", status: "expired" });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED" });
      }

      const now = Date.now();
      if (now > session.expiresAt) {
        session.status = "expired";
        return res.status(410).json({ success: false, error: "EXPIRED", status: "expired" });
      }

      const data = session.payload?.data;

      res.json({
        success: true,
        sessionId: session.sessionId,
        direction: session.direction,
        status: session.status,
        expiresAt: session.expiresAt,
        counts: data ? buildTransferCounts(data) : undefined
      });
    } catch (_err: any) {
      res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });

  // Complete session (Phone confirms import OR PC confirms import)
  app.post("/api/transfer/session/:sessionId/complete", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = (req.headers["x-transfer-token"] as string | undefined) || (req.body?.token as string | undefined);

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND" });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED" });
      }

      if (Date.now() > session.expiresAt) {
        session.status = "expired";
        return res.status(410).json({ success: false, error: "EXPIRED", message: "This transfer session has expired." });
      }

      session.status = "completed";
      delete session.payload;

      res.json({ success: true, message: "Transfer session completed successfully." });
    } catch (_err: any) {
      res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });

  // Cancel session
  app.post("/api/transfer/session/:sessionId/cancel", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = (req.headers["x-transfer-token"] as string | undefined) || (req.body?.token as string | undefined);

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Transfer session not found or has expired." });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED", message: "Invalid session token." });
      }

      if (Date.now() > session.expiresAt) {
        session.status = "expired";
        return res.status(410).json({ success: false, error: "EXPIRED", message: "This transfer session has expired." });
      }

      session.status = "cancelled";
      delete session.payload;

      res.json({ success: true, message: "Transfer session cancelled." });
    } catch (_err: any) {
      res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
