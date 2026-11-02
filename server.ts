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
      draft?: any;
    };
  };
}

const MAX_SESSIONS = 200;
const MAX_RECORD_LIMIT = 5000;
const transferSessions = new Map<string, TransferSession>();

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
      const query = (req.query.query as string) || "";
      if (!query.trim()) {
        return res.status(400).json({ success: false, error: "Query parameter is required" });
      }
      const mbUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json`;
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
      res.json({ success: true, data });
    } catch (err: any) {
      console.warn("MusicBrainz proxy fetch error:", err?.message || err);
      res.status(502).json({ success: false, error: "Failed to query MusicBrainz" });
    }
  });

  // Deezer Metadata Proxy (Secondary fallback)
  app.get("/api/metadata/deezer", async (req, res) => {
    try {
      const query = (req.query.query as string) || "";
      if (!query.trim()) {
        return res.status(400).json({ success: false, error: "Query parameter is required" });
      }
      const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`;
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

      // Validate bounds on payload records if provided
      if (payload?.data) {
        const counts = [
          Array.isArray(payload.data.members) ? payload.data.members.length : 0,
          Array.isArray(payload.data.songs) ? payload.data.songs.length : 0,
          Array.isArray(payload.data.schedules) ? payload.data.schedules.length : 0,
          Array.isArray(payload.data.songFamilies) ? payload.data.songFamilies.length : 0
        ];
        if (counts.some(c => c > MAX_RECORD_LIMIT)) {
          return res.status(400).json({
            success: false,
            error: "PAYLOAD_TOO_LARGE",
            message: `Records exceed the maximum allowed limit of ${MAX_RECORD_LIMIT} items per category.`
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

      const protocol = req.protocol;
      const host = req.get("host");
      const qrData = `${protocol}://${host}?transferSessionId=${sessionId}&token=${token}`;

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
      const token = (req.query.token as string) || (req.headers["x-transfer-token"] as string);

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
        counts: {
          members: Array.isArray(data.members) ? data.members.length : 0,
          songs: Array.isArray(data.songs) ? data.songs.length : 0,
          schedules: Array.isArray(data.schedules) ? data.schedules.length : 0,
          songFamilies: Array.isArray(data.songFamilies) ? data.songFamilies.length : 0,
          hasDraft: Boolean(data.draft)
        },
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
      const token = (req.body.token as string) || (req.query.token as string) || (req.headers["x-transfer-token"] as string);
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

      // Record limit validation
      const counts = [
        Array.isArray(payload.data.members) ? payload.data.members.length : 0,
        Array.isArray(payload.data.songs) ? payload.data.songs.length : 0,
        Array.isArray(payload.data.schedules) ? payload.data.schedules.length : 0,
        Array.isArray(payload.data.songFamilies) ? payload.data.songFamilies.length : 0
      ];
      if (counts.some(c => c > MAX_RECORD_LIMIT)) {
        return res.status(400).json({
          success: false,
          error: "PAYLOAD_TOO_LARGE",
          message: `Payload exceeds the allowed maximum limit of ${MAX_RECORD_LIMIT} records.`
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
      const token = (req.query.token as string) || (req.headers["x-transfer-token"] as string);

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND", status: "expired" });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED" });
      }

      if (Date.now() > session.expiresAt) {
        session.status = "expired";
      }

      const data = session.payload?.data;

      res.json({
        success: true,
        sessionId: session.sessionId,
        direction: session.direction,
        status: session.status,
        expiresAt: session.expiresAt,
        counts: data ? {
          members: Array.isArray(data.members) ? data.members.length : 0,
          songs: Array.isArray(data.songs) ? data.songs.length : 0,
          schedules: Array.isArray(data.schedules) ? data.schedules.length : 0,
          songFamilies: Array.isArray(data.songFamilies) ? data.songFamilies.length : 0,
          hasDraft: Boolean(data.draft)
        } : undefined
      });
    } catch (_err: any) {
      res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });

  // Complete session (Phone confirms import OR PC confirms import)
  app.post("/api/transfer/session/:sessionId/complete", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = (req.body.token as string) || (req.query.token as string) || (req.headers["x-transfer-token"] as string);

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND" });
      }

      if (!safeTokenCompare(session.token, token)) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED" });
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
      const token = (req.body.token as string) || (req.query.token as string) || (req.headers["x-transfer-token"] as string);

      const session = transferSessions.get(sessionId);
      if (session && safeTokenCompare(session.token, token)) {
        session.status = "cancelled";
        delete session.payload;
      }

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
