import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_BEARER || process.env.ADMIN_API_TOKEN || '';
const SERVER_TOKEN = process.env.SERVER_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// In-memory stores (replace with DB in production)
const db = {
  members: [],
  news: [],
};

// Middleware helpers
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(401).json({ error: 'Admin token not configured' });
  const auth = req.get('authorization') || '';
  const ok = auth.toLowerCase().startsWith('bearer ') && auth.slice(7) === ADMIN_TOKEN;
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireServerTokenIfSet(req, res, next) {
  if (!SERVER_TOKEN) return next();
  const token = req.get('x-server-token');
  if (token !== SERVER_TOKEN) return res.status(401).json({ error: 'Invalid server token' });
  next();
}

// Utility: safe fetch with timeout
async function fetchJson(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// Basic health
function mountRoutes(prefix = '') {
  // Health
  app.get(`${prefix}/health`, (_req, res) => res.json({ ok: true }));
  app.get(`${prefix}/status`, (_req, res) => res.json({ ok: true }));

  // Auth check
  app.get(`${prefix}/auth/check`, (req, res) => {
    const auth = req.get('authorization') || '';
    const ok = ADMIN_TOKEN && auth.toLowerCase().startsWith('bearer ') && auth.slice(7) === ADMIN_TOKEN;
    return res.sendStatus(ok ? 204 : 401);
  });

  // Members
  app.get(`${prefix}/members`, (_req, res) => {
    res.json(db.members);
  });

  app.post(`${prefix}/members`, requireServerTokenIfSet, requireAdmin, (req, res) => {
    const { nickname, avatar, pubgId, stats, scope } = req.body || {};
    if (!nickname) return res.status(400).json({ error: 'nickname required' });
    const m = {
      id: randomUUID(),
      nickname,
      avatar: avatar || 'https://i.pravatar.cc/128',
      pubgId: pubgId || '',
      stats: stats || { matches: 0, wins: 0, kd: 0, rank: '-', damage: 0 },
      scope: scope || 'overall',
    };
    db.members.push(m);
    res.status(201).json(m);
  });

  app.put(`${prefix}/members/:id`, requireServerTokenIfSet, requireAdmin, (req, res) => {
    const { id } = req.params;
    const idx = db.members.findIndex(m => m.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    db.members[idx] = { ...db.members[idx], ...req.body };
    res.json(db.members[idx]);
  });

  app.delete(`${prefix}/members/:id`, requireServerTokenIfSet, requireAdmin, (req, res) => {
    const { id } = req.params;
    const idx = db.members.findIndex(m => m.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    db.members.splice(idx, 1);
    res.sendStatus(204);
  });

  // News
  app.get(`${prefix}/news`, (_req, res) => {
    res.json(db.news);
  });

  app.post(`${prefix}/news`, requireServerTokenIfSet, requireAdmin, (req, res) => {
    const { title, desc, thumb, source, url } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    const n = { id: randomUUID(), title, desc: desc || '', thumb: thumb || '', source: source || 'discord', url: url || '' };
    db.news.unshift(n);
    res.status(201).json(n);
  });

  app.put(`${prefix}/news/:id`, requireServerTokenIfSet, requireAdmin, (req, res) => {
    const { id } = req.params;
    const idx = db.news.findIndex(n => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    db.news[idx] = { ...db.news[idx], ...req.body };
    res.json(db.news[idx]);
  });

  app.delete(`${prefix}/news/:id`, requireServerTokenIfSet, requireAdmin, (req, res) => {
    const { id } = req.params;
    const idx = db.news.findIndex(n => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    db.news.splice(idx, 1);
    res.sendStatus(204);
  });

  // oEmbed helpers
  app.get(`${prefix}/youtube/oembed`, async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
      // Prefer public oEmbed; API key optional
      const data = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      res.json({ title: data.title, author_name: data.author_name, thumbnail_url: data.thumbnail_url, url });
    } catch (e) {
      res.status(502).json({ error: 'youtube_oembed_failed', detail: String(e) });
    }
  });

  app.get(`${prefix}/twitch/oembed`, async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
      const data = await fetchJson(`https://embed.twitch.tv/oembed?format=json&url=${encodeURIComponent(url)}`);
      res.json({ title: data.title || data.author_name || 'Twitch', author_name: data.author_name, thumbnail_url: data.thumbnail_url || '', url });
    } catch (e) {
      res.status(502).json({ error: 'twitch_oembed_failed', detail: String(e) });
    }
  });

  app.get(`${prefix}/discord/resolve`, async (req, res) => {
    const url = req.query.url;
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'valid url required' });
    try {
      const html = await fetchText(url, { headers: { 'user-agent': 'Mozilla/5.0 SRBIJA/1.0' } });
      const pick = (name) => {
        const m = html.match(new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]+name=["']og:${name}["'][^>]+content=["']([^"']+)["']`, 'i'));
        return m ? m[1] : '';
      };
      const title = pick('title') || '';
      const description = pick('description') || '';
      const thumbnail = pick('image') || '';
      res.json({ title, description, thumbnail, url });
    } catch (e) {
      res.status(502).json({ error: 'discord_resolve_failed', detail: String(e) });
    }
  });

  // Optional PUBG placeholder
  app.get(`${prefix}/pubg/:playerId`, async (req, res) => {
    const { playerId } = req.params;
    const hasKey = !!process.env.PUBG_API_KEY;
    // Placeholder normalization; integrate real PUBG API if desired.
    const sample = { matches: 0, wins: 0, kd: 0, rank: '-', damage: 0 };
    res.json({ ...sample, raw: hasKey ? { note: 'Integrate PUBG API here' } : null, playerId });
  });
}

// Mount both root and /api paths so either works
mountRoutes('');
mountRoutes('/api');

// Static hosting (serve frontend from repo root when deployed as one service)
try {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const staticRoot = path.resolve(serverDir, '..'); // repo root
  app.use(express.static(staticRoot, { index: false, maxAge: '1h' }));
  app.get('/', (_req, res) => res.sendFile(path.join(staticRoot, 'index.html')));
  app.get('/admin', (_req, res) => res.sendFile(path.join(staticRoot, 'admin.html')));
} catch (e) {
  // ignore static errors; API still functions
}

app.listen(PORT, () => {
  console.log(`[srbija] listening on :${PORT}`);
});
