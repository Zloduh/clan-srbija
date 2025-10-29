// server/index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
// Use global fetch available in Node 18+

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const MEMBERS_FILE = path.join(DATA_DIR, "members.json");
const NEWS_FILE = path.join(DATA_DIR, "news.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEMBERS_FILE)) fs.writeFileSync(MEMBERS_FILE, "[]", "utf-8");
  if (!fs.existsSync(NEWS_FILE)) fs.writeFileSync(NEWS_FILE, "[]", "utf-8");
}
function readJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, "utf-8")); } catch { return []; }
}
function writeJson(fp, obj) {
  fs.writeFileSync(fp, JSON.stringify(obj, null, 2));
}
ensureDataFiles();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] !== "https" && process.env.NODE_ENV === "production") {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

app.use(express.static(path.join(__dirname, "../")));

// Simple Bearer token middleware for write operations
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";
function requireAdmin(req, res, next) {
  if (!ADMIN_API_TOKEN) return next(); // if not set, allow all (for quick prod testing)
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ") && auth.slice(7) === ADMIN_API_TOKEN) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// Members CRUD
app.get("/api/members", (req, res) => {
  const data = readJson(MEMBERS_FILE);
  res.json(data);
});
app.post("/api/members", requireAdmin, (req, res) => {
  const data = readJson(MEMBERS_FILE);
  const item = { id: String(Date.now()), ...req.body };
  data.unshift(item);
  writeJson(MEMBERS_FILE, data);
  res.status(201).json(item);
});
app.put("/api/members/:id", requireAdmin, (req, res) => {
  const data = readJson(MEMBERS_FILE);
  const idx = data.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data[idx] = { ...data[idx], ...req.body, id: data[idx].id };
  writeJson(MEMBERS_FILE, data);
  res.json(data[idx]);
});
app.delete("/api/members/:id", requireAdmin, (req, res) => {
  const data = readJson(MEMBERS_FILE);
  const next = data.filter(m => m.id !== req.params.id);
  writeJson(MEMBERS_FILE, next);
  res.status(204).end();
});

// News CRUD
app.get("/api/news", (req, res) => {
  const data = readJson(NEWS_FILE);
  res.json(data);
});
app.post("/api/news", requireAdmin, (req, res) => {
  const data = readJson(NEWS_FILE);
  const item = { id: Date.now(), ...req.body };
  data.unshift(item);
  writeJson(NEWS_FILE, data);
  res.status(201).json(item);
});
app.put("/api/news/:id", requireAdmin, (req, res) => {
  const data = readJson(NEWS_FILE);
  const id = Number(req.params.id);
  const idx = data.findIndex(n => n.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data[idx] = { ...data[idx], ...req.body, id };
  writeJson(NEWS_FILE, data);
  res.json(data[idx]);
});
app.delete("/api/news/:id", requireAdmin, (req, res) => {
  const data = readJson(NEWS_FILE);
  const id = Number(req.params.id);
  const next = data.filter(n => n.id !== id);
  writeJson(NEWS_FILE, next);
  res.status(204).end();
});

// PUBG proxy endpoints
const PUBG_API_KEY = process.env.PUBG_API_KEY || process.env.PUBG_TOKEN;
const PUBG_REGION = process.env.PUBG_REGION || process.env.PUBG_PLATFORM || "steam";
const PUBG_BASE = `https://api.pubg.com/shards/${PUBG_REGION}`;

async function pubgFetch(pathname) {
  if (!PUBG_API_KEY) throw new Error("PUBG_API_KEY missing");
  const res = await fetch(`${PUBG_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${PUBG_API_KEY}`,
      Accept: "application/vnd.api+json"
    }
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, body: text };
  }
  const json = await res.json();
  return { ok: true, status: res.status, body: json };
}

// Resolve player by name -> { id, name }
app.get("/api/pubg/player/:name", async (req, res) => {
  try {
    const q = encodeURIComponent(req.params.name);
    const r = await pubgFetch(`/players?filter[playerNames]=${q}`);
    if (!r.ok) return res.status(r.status).send(r.body);
    const data = r.body;
    const player = data.data && data.data[0];
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json({ id: player.id, name: player.attributes.name });
  } catch (e) { res.status(500).json({ error: "PUBG lookup failed" }); }
});

// Season stats current -> simplified shape
app.get("/api/pubg/stats/:playerId", async (req, res) => {
  try {
    const seasonId = "latest"; // PUBG supports /seasons?filter[seasonType]=official; mapping simplified
    const id = req.params.playerId;
    const r = await pubgFetch(`/players/${id}/seasons/${seasonId}`);
    if (!r.ok) return res.status(r.status).send(r.body);
    const doc = r.body;
    const s = doc.data && doc.data.attributes && doc.data.attributes.gameModeStats || {};
    // Compose an overall summary (example using squad-fpp if present else any)
    const gm = s["squad-fpp"] || s["duo-fpp"] || s["solo-fpp"] || s["squad"] || s["duo"] || s["solo"] || {};
    const overall = {
      matches: gm.roundsPlayed || 0,
      wins: gm.wins || 0,
      kd: gm.kills ? ((gm.kills) / Math.max(1, gm.losses || (gm.roundsPlayed - gm.wins))).toFixed(2) : 0,
      adr: gm.damageDealt && gm.roundsPlayed ? (gm.damageDealt / Math.max(1, gm.roundsPlayed)).toFixed(0) : 0
    };
    res.json({ season: seasonId, overall, modes: s });
  } catch (e) { res.status(500).json({ error: "PUBG stats failed" }); }
});

// YouTube helper: extract videoId from url and fetch metadata via Data API v3
app.get('/api/youtube/oembed', async (req, res) => {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    const url = req.query.url || '';
    if (!key) return res.status(500).json({ error: 'YOUTUBE_API_KEY missing' });
    const idMatch = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/.exec(url);
    const videoId = idMatch && idMatch[1];
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });
    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${key}`);
    const data = await ytRes.json();
    const item = data.items && data.items[0];
    if (!item) return res.status(404).json({ error: 'Video not found' });
    const sn = item.snippet;
    const thumb = sn.thumbnails && (sn.thumbnails.maxres || sn.thumbnails.high || sn.thumbnails.medium || sn.thumbnails.default);
    res.json({
      title: sn.title,
      author_name: sn.channelTitle,
      thumbnail_url: thumb && thumb.url,
      url,
      provider: 'youtube'
    });
  } catch (e) { res.status(500).json({ error: 'YouTube fetch failed' }); }
});

// Twitch helper: get app access token, then basic metadata for a channel or video
async function twitchToken() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  const resp = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`, { method: 'POST' });
  const json = await resp.json();
  return json.access_token ? { token: json.access_token, clientId: id } : null;
}
app.get('/api/twitch/oembed', async (req, res) => {
  try {
    const url = req.query.url || '';
    const auth = await twitchToken();
    if (!auth) return res.status(500).json({ error: 'Twitch credentials missing' });
    // Detect video vs channel
    const videoMatch = /twitch\.tv\/videos\/(\d+)/.exec(url);
    const channelMatch = /twitch\.tv\/([A-Za-z0-9_]+)/.exec(url);
    let meta = null;
    if (videoMatch) {
      const vId = videoMatch[1];
      const r = await fetch(`https://api.twitch.tv/helix/videos?id=${vId}`, { headers: { 'Client-ID': auth.clientId, 'Authorization': `Bearer ${auth.token}` }});
      const j = await r.json();
      const it = j.data && j.data[0];
      if (it) meta = { title: it.title, author_name: it.user_name, thumbnail_url: it.thumbnail_url && it.thumbnail_url.replace(/%\{width\}|\{width\}/g,'1280').replace(/%\{height\}|\{height\}/g,'720') };
    } else if (channelMatch) {
      const login = channelMatch[1];
      const r = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, { headers: { 'Client-ID': auth.clientId, 'Authorization': `Bearer ${auth.token}` }});
      const j = await r.json();
      const it = j.data && j.data[0];
      if (it) meta = { title: it.display_name, author_name: it.display_name, thumbnail_url: it.profile_image_url };
    }
    if (!meta) return res.status(400).json({ error: 'Unsupported Twitch URL' });
    res.json({ ...meta, url, provider: 'twitch' });
  } catch (e) { res.status(500).json({ error: 'Twitch fetch failed' }); }
});

// Discord placeholder
app.get('/api/discord/resolve', async (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

app.get("/api/status", (req, res) => {
  res.json({ message: "SRBIJA Clan server is online 🔥" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
