import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { YouTubePlaylistService, extractPlaylistId, YouTubeApiException } from "./src/services/youtubePlaylistService";

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

const transferSessions = new Map<string, TransferSession>();

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
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // MusicBrainz Metadata Proxy (Primary identity/metadata finder with required User-Agent)
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
      res.status(502).json({ success: false, error: err?.message || "Failed to query MusicBrainz" });
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
      res.status(502).json({ success: false, error: err?.message || "Failed to query Deezer" });
    }
  });

  // YouTube API status endpoint (safe, never exposes keys)
  app.get("/api/youtube/status", (req, res) => {
    const serverKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    const configured = Boolean(
      serverKey &&
      serverKey.trim() &&
      serverKey !== "MY_YOUTUBE_API_KEY" &&
      serverKey !== '""' &&
      serverKey !== "''"
    );
    res.json({
      configured,
      provider: "youtube-data-api-v3"
    });
  });

  // YouTube Playlist endpoint (secure server-side official API request)
  app.post("/api/youtube/playlist", async (req, res) => {
    try {
      const { playlistId, apiKey } = req.body || {};
      if (!playlistId || typeof playlistId !== "string" || !playlistId.trim()) {
        return res.status(400).json({
          success: false,
          errorCode: "YOUTUBE_INVALID_URL",
          message: "Invalid YouTube or YouTube Music playlist link. Please provide a valid playlist ID or URL."
        });
      }

      const cleanPlaylistId = extractPlaylistId(playlistId) || playlistId.trim();
      const cleanPlaylistUrl = `https://www.youtube.com/playlist?list=${cleanPlaylistId}`;

      // Precedence: User-supplied custom key -> server YOUTUBE_API_KEY -> server VITE_YOUTUBE_API_KEY
      const customKey = typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : undefined;
      const serverKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
      const effectiveKey =
        customKey ||
        (serverKey && serverKey.trim() && serverKey !== "MY_YOUTUBE_API_KEY" && serverKey !== '""' && serverKey !== "''"
          ? serverKey.trim()
          : "");

      if (!effectiveKey) {
        return res.status(400).json({
          success: false,
          errorCode: "YOUTUBE_API_KEY_MISSING",
          message:
            "A YouTube Data API v3 key is required to import playlists. Click 'Get / Manage YouTube API Key' to create or view your key in Google Cloud Credentials, then enter it below."
        });
      }

      const playlist = await YouTubePlaylistService.fetchViaOfficialYouTubeAPI(
        cleanPlaylistId,
        cleanPlaylistUrl,
        effectiveKey
      );

      // Return safe normalized data without leaking any credentials
      res.json({
        success: true,
        playlist
      });
    } catch (err: any) {
      if (err instanceof YouTubeApiException) {
        return res.status(400).json({
          success: false,
          errorCode: err.errorCode,
          message: err.message
        });
      }
      console.error("YouTube playlist API error:", err?.message || err);
      res.status(500).json({
        success: false,
        errorCode: "YOUTUBE_NETWORK_ERROR",
        message: err?.message || "An unexpected error occurred while fetching the YouTube playlist."
      });
    }
  });

  // Create temporary transfer session (Supports PC -> Phone and Phone -> PC)
  app.post("/api/transfer/create", (req, res) => {
    try {
      const { payload, direction = 'pc_to_phone', expiresInSeconds = 600 } = req.body;
      
      // If PC -> Phone, payload is required upfront.
      // If Phone -> PC, payload will be uploaded by the phone later.
      if (direction === 'pc_to_phone' && (!payload || !payload.data)) {
        return res.status(400).json({ success: false, error: "INVALID_PAYLOAD", message: "Invalid transfer payload" });
      }

      const sessionId = `tr_${crypto.randomUUID()}`;
      const token = crypto.randomBytes(16).toString("hex");
      const createdAt = Date.now();
      const expiresAt = createdAt + expiresInSeconds * 1000;

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
      res.status(500).json({ success: false, error: "SERVER_ERROR", message: err.message });
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

      if (session.token !== token) {
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
      res.status(500).json({ success: false, error: "SERVER_ERROR", message: err.message });
    }
  });

  // Upload endpoint for Phone -> PC transfer
  app.post("/api/transfer/session/:sessionId/upload", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = (req.body.token as string) || (req.query.token as string) || (req.headers["x-transfer-token"] as string);
      const { payload } = req.body;

      const session = transferSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Transfer session not found or has expired." });
      }

      if (session.token !== token) {
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

      session.payload = payload;
      session.status = "data_ready";

      res.json({
        success: true,
        message: "Data uploaded successfully.",
        status: session.status
      });
    } catch (err: any) {
      console.error("Error uploading transfer data:", err);
      res.status(500).json({ success: false, error: "SERVER_ERROR", message: err.message });
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

      if (session.token !== token) {
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
    } catch (err: any) {
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

      if (session.token !== token) {
        return res.status(403).json({ success: false, error: "UNAUTHORIZED" });
      }

      session.status = "completed";
      delete session.payload;

      res.json({ success: true, message: "Transfer session completed successfully." });
    } catch (err: any) {
      res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });

  // Cancel session
  app.post("/api/transfer/session/:sessionId/cancel", (req, res) => {
    try {
      const { sessionId } = req.params;
      const token = (req.body.token as string) || (req.query.token as string) || (req.headers["x-transfer-token"] as string);

      const session = transferSessions.get(sessionId);
      if (session && session.token === token) {
        session.status = "cancelled";
        delete session.payload;
      }

      res.json({ success: true, message: "Transfer session cancelled." });
    } catch (err: any) {
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
