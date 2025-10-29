// server/index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
// Use global fetch available in Node 18+
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
function log(...args) { if (DEBUG) console.log('[DEBUG]', ...args); }

const app = express();
const PORT = process.env.PORT || 10000;
// Database: Render PostgreSQL via DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

async function dbInit() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar TEXT,
      pubg_id TEXT,
      stats JSONB DEFAULT '{}'::jsonb,
      scope TEXT
    );
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_channels (
      id TEXT PRIMARY KEY,
      title TEXT,
      url TEXT,
      auto_publish BOOLEAN DEFAULT true
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news (
      id BIGINT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      thumb TEXT,
      source TEXT,
      url TEXT
    );
  `);
}
await dbInit().catch(err => console.error('DB init failed', err));

// JSON file fallback removed in favor of DB

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// Client log endpoint for debugging
app.post('/api/log', (req, res) => {
  log('client-log', req.body && req.body.message, req.body && req.body.meta);
  res.status(204).end();
});

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
// Auth check endpoint: returns 204 if authorized
app.get('/api/auth/check', requireAdmin, (req, res) => {
  // If middleware passes, we are authorized
  res.status(204).end();
});

// Members CRUD (DB)
app.get("/api/members", async (req, res) => {
  try {
    log('GET /api/members');
    if (!pool) return res.json([]);
    const r = await pool.query('SELECT id, nickname, avatar, pubg_id as "pubgId", stats, scope FROM members ORDER BY nickname ASC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.post("/api/members", requireAdmin, async (req, res) => {
  try {
    log('POST /api/members', req.body);
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    const id = String(Date.now());
    const { nickname, avatar, pubgId, stats = {}, scope = 'overall' } = req.body || {};
    await pool.query('INSERT INTO members (id, nickname, avatar, pubg_id, stats, scope) VALUES ($1,$2,$3,$4,$5::jsonb,$6)', [id, nickname, avatar, pubgId, JSON.stringify(stats), scope]);
    res.status(201).json({ id, nickname, avatar, pubgId, stats, scope });
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.put("/api/members/:id", requireAdmin, async (req, res) => {
  try {
    log('PUT /api/members/:id', req.params.id, req.body);
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    const id = req.params.id;
    const { nickname, avatar, pubgId, stats = {}, scope } = req.body || {};
    await pool.query('UPDATE members SET nickname=COALESCE($2,nickname), avatar=COALESCE($3,avatar), pubg_id=COALESCE($4,pubg_id), stats=COALESCE($5::jsonb,stats), scope=COALESCE($6,scope) WHERE id=$1', [id, nickname, avatar, pubgId, JSON.stringify(stats), scope]);
    const r = await pool.query('SELECT id, nickname, avatar, pubg_id as "pubgId", stats, scope FROM members WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.delete("/api/members/:id", requireAdmin, async (req, res) => {
  try {
    log('DELETE /api/members/:id', req.params.id);
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    await pool.query('DELETE FROM members WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});

// News CRUD (DB)
app.get("/api/news", async (req, res) => {
  try {
    log('GET /api/news');
    if (!pool) return res.json([]);
    const r = await pool.query('SELECT id, title, description as "desc", thumb, source, url FROM news ORDER BY id DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.post("/api/news", requireAdmin, async (req, res) => {
  try {
    log('POST /api/news', req.body);
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    const id = Date.now();
    const { title, desc, description, thumb, source, url } = req.body || {};
    const dbDesc = (typeof description !== 'undefined') ? description : desc;
    await pool.query('INSERT INTO news (id, title, description, thumb, source, url) VALUES ($1,$2,$3,$4,$5,$6)', [id, title, dbDesc, thumb, source, url]);
    res.status(201).json({ id, title, desc: dbDesc, thumb, source, url });
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.put("/api/news/:id", requireAdmin, async (req, res) => {
  try {
    log('PUT /api/news/:id', req.params.id, req.body);
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    const id = Number(req.params.id);
    const { title, desc, description, thumb, source, url } = req.body || {};
    const dbDesc = (typeof description !== 'undefined') ? description : desc;
    await pool.query('UPDATE news SET title=COALESCE($2,title), description=COALESCE($3,description), thumb=COALESCE($4,thumb), source=COALESCE($5,source), url=COALESCE($6,url) WHERE id=$1', [id, title, dbDesc, thumb, source, url]);
    const r = await pool.query('SELECT id, title, description as "desc", thumb, source, url FROM news WHERE id=$1', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.delete("/api/news/:id", requireAdmin, async (req, res) => {
  try {
    log('DELETE /api/news/:id', req.params.id);
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    await pool.query('DELETE FROM news WHERE id=$1', [Number(req.params.id)]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});

// PUBG proxy endpoints
const PUBG_API_KEY = process.env.PUBG_API_KEY || process.env.PUBG_TOKEN;
const PUBG_REGION = process.env.PUBG_REGION || process.env.PUBG_PLATFORM || "steam";
const PUBG_BASE = `https://api.pubg.com/shards/${PUBG_REGION}`;

async function pubgFetch(pathname) {
  if (!PUBG_API_KEY) {
    log('PUBG key missing');
    throw new Error("PUBG_API_KEY missing");
  }
  log('PUBG fetch', pathname);
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
    log('PUBG player lookup', req.params.name);
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
    log('PUBG stats get', req.params.playerId);
    const id = req.params.playerId;

    // 1️⃣ Get all seasons
    const seasonsRes = await pubgFetch(`/seasons`);
    if (!seasonsRes.ok) return res.status(seasonsRes.status).send(seasonsRes.body);

    const current = (seasonsRes.body.data || []).find(s => s.attributes.isCurrentSeason);
    if (!current) return res.status(404).json({ error: 'No current season found' });

    const seasonId = current.id;
    log('Using current season', seasonId);

    // 2️⃣ Fetch player stats for that season
    const statsRes = await pubgFetch(`/players/${id}/seasons/${seasonId}`);
    if (!statsRes.ok) return res.status(statsRes.status).send(statsRes.body);

    const doc = statsRes.body;
    const s = doc.data?.attributes?.gameModeStats || {};

    // 3️⃣ Simplified summary (priority order)
    const gm = s["squad-fpp"] || s["duo-fpp"] || s["solo-fpp"] || s["squad"] || s["duo"] || s["solo"] || {};
    const overall = {
      matches: gm.roundsPlayed || 0,
      wins: gm.wins || 0,
      kd: gm.kills ? ((gm.kills) / Math.max(1, gm.losses || (gm.roundsPlayed - gm.wins))).toFixed(2) : 0,
      adr: gm.damageDealt && gm.roundsPlayed ? (gm.damageDealt / Math.max(1, gm.roundsPlayed)).toFixed(0) : 0
    };

    res.json({ season: seasonId, overall, modes: s });
  } catch (e) {
    log('PUBG stats failed', e);
    res.status(500).json({ error: "PUBG stats failed" });
  }
});


// YouTube helper: extract videoId from url and fetch metadata via Data API v3

app.get('/api/youtube/oembed', async (req, res) => {
  try {
    const key = process.env.YOUTUBE_API_KEY;
    const url = String(req.query.url || '');
    log('YouTube oembed', { url, hasKey: !!key });
    if (!key) return res.status(500).json({ error: 'YOUTUBE_API_KEY missing' });

    let videoId = null;
    try {
      const u = new URL(url);
      videoId = u.searchParams.get('v');
    } catch (_) {}
    if (!videoId) {
      const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(url);
      videoId = m && m[1];
    }
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${key}`);
    const data = await ytRes.json();
    const item = data.items && data.items[0];
    if (!item) return res.status(404).json({ error: 'Video not found' });

    const sn = item.snippet || {};
    const thumb = sn.thumbnails && (sn.thumbnails.maxres || sn.thumbnails.high || sn.thumbnails.medium || sn.thumbnails.default);

    res.json({
      provider: 'youtube',
      url,
      videoId: item.id,
      title: sn.title,
      description: sn.description,
      author_name: sn.channelTitle,
      published_at: sn.publishedAt,
      thumbnail_url: thumb && thumb.url
    });
  } catch (e) { log('YouTube error', e && e.message); res.status(500).json({ error: 'YouTube fetch failed' }); }
});


async function ytResolveChannelId(urlOrId, key) {
  if (/^UC[0-9A-Za-z_-]{20,}$/.test(urlOrId)) return urlOrId;
  const m = /\/channel\/(UC[0-9A-Za-z_-]{20,})/.exec(urlOrId);
  if (m) return m[1];
  const cleaned = String(urlOrId).replace(/^https?:\/\/(www\.)?youtube\.com\//, '').trim();
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(cleaned)}&maxResults=1&key=${key}`);
  const j = await resp.json();
  const ch = j.items && j.items[0];
  return ch ? ch.snippet.channelId : null;
}
async function ytFetchLatestVideos(channelId, key, maxResults = 10) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&type=video&maxResults=${maxResults}&key=${key}`;
  const r = await fetch(url);
  const j = await r.json();
  return (j.items || []).map(it => ({
    videoId: it.id.videoId,
    title: it.snippet.title,
    description: it.snippet.description,
    thumb: (it.snippet.thumbnails && (it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || it.snippet.thumbnails.default?.url)) || null,
    publishedAt: it.snippet.publishedAt,
    channelTitle: it.snippet.channelTitle,
    url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
  }));
}



// YouTube channels CRUD (admin)
app.get('/api/youtube/channels', requireAdmin, async (req, res) => {
  try {
    if (!pool) return res.json([]);
    const r = await pool.query('SELECT id, title, url, auto_publish FROM youtube_channels ORDER BY title NULLS LAST, id');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'DB error' }); }
});
app.post('/api/youtube/channels', requireAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return res.status(500).json({ error: 'YOUTUBE_API_KEY missing' });
    const { urlOrId = '', title = null, auto_publish = true } = req.body || {};
    const channelId = await ytResolveChannelId(String(urlOrId), key);
    if (!channelId) return res.status(400).json({ error: 'Unable to resolve channelId' });
    await pool.query(
      'INSERT INTO youtube_channels (id, title, url, auto_publish) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET title=COALESCE(EXCLUDED.title, youtube_channels.title), url=EXCLUDED.url, auto_publish=EXCLUDED.auto_publish',
      [channelId, title, urlOrId, !!auto_publish]
    );
    res.status(201).json({ id: channelId, title, url: urlOrId, auto_publish: !!auto_publish });
  } catch (e) { log('yt add error', e?.message); res.status(500).json({ error: 'Add channel failed' }); }
});
app.delete('/api/youtube/channels/:id', requireAdmin, async (req, res) => {
  try {
    if (!pool) return res.status(500).json({ error: 'DB not configured' });
    await pool.query('DELETE FROM youtube_channels WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { res.status(500).json({ error: 'Delete failed' }); }
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
    log('Twitch oembed', { url });
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
  } catch (e) { log('Twitch error', e && e.message); res.status(500).json({ error: 'Twitch fetch failed' }); }
});

// Discord placeholder
app.get('/api/discord/resolve', async (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

app.get("/api/status", (req, res) => {
  res.json({ message: "SRBIJA Clan server is online 🔥" });
});

app.get('/admin', (req, res) => {
  log('serve /admin');
  res.sendFile(path.join(__dirname, '../admin.html'));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});


async function runYouTubeSyncOnce() {
  if (!pool) { log('YouTube sync skipped: no DB'); return; }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) { log('YouTube sync skipped: missing YOUTUBE_API_KEY'); return; }
  try {
    const channels = await pool.query('SELECT id, title, auto_publish FROM youtube_channels');
    for (const ch of channels.rows) {
      const vids = await ytFetchLatestVideos(ch.id, key, 10);
      for (const v of vids) {
        const exists = await pool.query('SELECT 1 FROM news WHERE url=$1 LIMIT 1', [v.url]);
        if (exists.rowCount) continue;
        const id = Date.now();
        await pool.query(
          'INSERT INTO news (id, title, description, thumb, source, url) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, v.title, v.description, v.thumb, 'youtube', v.url]
        );
        log('YouTube sync: inserted', v.url);
      }
    }
  } catch (e) { log('YouTube sync error', e?.message); }
}
app.post('/api/news/sync-youtube', requireAdmin, async (req, res) => {
  await runYouTubeSyncOnce();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});


/** YouTube auto-sync schedule */
setTimeout(runYouTubeSyncOnce, 10_000);               // initial run after boot
setInterval(runYouTubeSyncOnce, 3 * 60 * 60 * 1000);  // every 3 hours
