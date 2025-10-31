import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || process.env.ADMIN_BEARER || process.env.ADMIN_API_TOKEN || '').trim();
const SERVER_TOKEN = process.env.SERVER_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const PUBG_API_KEY = (process.env.PUBG_API_KEY || '').trim();
const PUBG_PLATFORM = (process.env.PUBG_PLATFORM || 'steam').trim();
const PUBG_SHARDS = ['steam','kakao','xbox','psn','stadia'];
const STEAM_API_KEY = (process.env.STEAM_API_KEY || '').trim();
const YOUTUBE_API_KEY = (process.env.YOUTUBE_API_KEY || '').trim();

const { Pool } = pkg;
const pool = DATABASE_URL
  ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// In-memory stores (replace with DB in production)
const mem = { members: [], news: [], ytChannels: [] };

function newId() {
  return String(Date.now()) + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
}

const hasDb = () => !!pool;

async function dbInit() {
  if (!hasDb()) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar TEXT,
      pubg_id TEXT,
      pubg_platform TEXT,
      stats JSONB DEFAULT '{}'::jsonb,
      scope TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      thumb TEXT,
      source TEXT,
      url TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS youtube_channels (
      id TEXT PRIMARY KEY,
      title TEXT,
      url TEXT,
      auto_publish BOOLEAN DEFAULT TRUE
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS news_url_unique ON news (url)`);
}
await dbInit().catch(err => console.error('db init failed', err));
try {
  if (hasDb()) {
    await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS news_url_unique ON news (url) WHERE url IS NOT NULL AND url <> ''");
    await pool.query("ALTER TABLE members ADD COLUMN IF NOT EXISTS pubg_platform TEXT");
  }
} catch (e) {
  console.error('index ensure failed', e);
}

// Middleware helpers
function getBearer(req) {
  const auth = (req.get('authorization') || '').trim();
  const m = auth.match(/^bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(401).json({ error: 'Admin token not configured' });
  const token = getBearer(req);
  const ok = token && token === ADMIN_TOKEN;
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
  app.get(`${prefix}/health`, (_req, res) => res.json({ ok: true, message: 'SRBIJA Clan server is online' }));
  app.get(`${prefix}/status`, (_req, res) => res.json({ ok: true, message: 'SRBIJA Clan server is online' }));

  // Auth check
  app.get(`${prefix}/auth/check`, (req, res) => {
    const token = getBearer(req);
    const ok = !!ADMIN_TOKEN && token === ADMIN_TOKEN;
    return res.sendStatus(ok ? 204 : 401);
  });

  // Members
  app.get(`${prefix}/members`, async (_req, res) => {
    if (!hasDb()) return res.json(mem.members);
    try {
      const r = await pool.query('SELECT id, nickname, avatar, pubg_id AS "pubgId", pubg_platform AS "pubgPlatform", stats, scope FROM members ORDER BY nickname ASC');
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });

  app.post(`${prefix}/members`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    const { nickname, avatar, pubgId, pubgPlatform, stats, scope } = req.body || {};
    if (!nickname) return res.status(400).json({ error: 'nickname required' });
    const m = {
      id: randomUUID(),
      nickname,
      avatar: avatar || 'https://i.pravatar.cc/128',
      pubgId: pubgId || '',
      stats: stats || { matches: 0, wins: 0, kd: 0, rank: '-', damage: 0 },
      pubgPlatform: pubgPlatform || null,
      scope: scope || 'overall',
    };
    if (!hasDb()) {
      mem.members.push(m);
      return res.status(201).json(m);
    }
    try {
      const q = 'INSERT INTO members (id, nickname, avatar, pubg_id, pubg_platform, stats, scope) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nickname, avatar, pubg_id AS "pubgId", pubg_platform AS "pubgPlatform", stats, scope';
      const r = await pool.query(q, [m.id, m.nickname, m.avatar, m.pubgId, m.pubgPlatform, m.stats, m.scope]);
      res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });

  app.put(`${prefix}/members/:id`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!hasDb()) {
      const idx = mem.members.findIndex(m => m.id === id);
      if (idx === -1) return res.status(404).json({ error: 'not_found' });
      mem.members[idx] = { ...mem.members[idx], ...req.body };
      return res.json(mem.members[idx]);
    }
    // Build dynamic update
    const fields = [];
    const values = [];
    let i = 1;
    const map = { nickname: 'nickname', avatar: 'avatar', pubgId: 'pubg_id', pubgPlatform: 'pubg_platform', stats: 'stats', scope: 'scope' };
    for (const k of Object.keys(map)) {
      if (req.body[k] !== undefined) { fields.push(`${map[k]} = $${i++}`); values.push(req.body[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: 'no_fields' });
    values.push(id);
    try {
      const q = `UPDATE members SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, nickname, avatar, pubg_id AS "pubgId", stats, scope`;
      const r = await pool.query(q, values);
      if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });

  app.delete(`${prefix}/members/:id`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!hasDb()) {
      const idx = mem.members.findIndex(m => m.id === id);
      if (idx === -1) return res.status(404).json({ error: 'not_found' });
      mem.members.splice(idx, 1);
      return res.sendStatus(204);
    }
    try {
    const r = await pool.query('DELETE FROM members WHERE id = $1', [id]);
      if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
      res.sendStatus(204);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });

  // News
  app.get(`${prefix}/news`, async (_req, res) => {
    if (!hasDb()) return res.json(mem.news);
    try {
      const r = await pool.query('SELECT id, title, description AS "desc", thumb, source, url FROM news ORDER BY id DESC LIMIT 100');
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });

  app.post(`${prefix}/news`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    const { title, desc, thumb, source, url } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title required' });
    if (!hasDb()) {
      const n = { id: randomUUID(), title, desc: desc || '', thumb: thumb || '', source: source || 'discord', url: url || '' };
      mem.news.unshift(n);
      return res.status(201).json(n);
    }
    try {
      const safeUrl = (url && url.trim()) ? url.trim() : null;
      const idVal = newId();
      const q = `
        INSERT INTO news (id, title, description, thumb, source, url)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (url) DO UPDATE
          SET title = EXCLUDED.title,
              description = EXCLUDED.description,
              thumb = EXCLUDED.thumb,
              source = EXCLUDED.source
        RETURNING id, title, description AS "desc", thumb, source, url`;
      const r = await pool.query(q, [idVal, title, desc || '', thumb || '', source || 'discord', safeUrl]);
      res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error('POST /news failed', e);
      // Try to return existing by URL if conflict without RETURNING (older PG)
      try {
        const safeUrl = (url && url.trim()) ? url.trim() : null;
        if (safeUrl) {
          const r2 = await pool.query('SELECT id, title, description AS "desc", thumb, source, url FROM news WHERE url = $1 LIMIT 1', [safeUrl]);
          if (r2.rowCount) return res.status(200).json(r2.rows[0]);
        }
      } catch {}
      res.status(500).json({ error: 'db_error' });
    }
  });

  app.put(`${prefix}/news/:id`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!hasDb()) {
      const idx = mem.news.findIndex(n => String(n.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not_found' });
      mem.news[idx] = { ...mem.news[idx], ...req.body };
      return res.json(mem.news[idx]);
    }
    const fields = [];
    const values = [];
    let i = 1;
    const map = { title: 'title', desc: 'description', thumb: 'thumb', source: 'source', url: 'url' };
    for (const k of Object.keys(map)) {
      if (req.body[k] !== undefined) {
        if (k === 'url') {
          const v = (req.body[k] && req.body[k].trim()) ? req.body[k].trim() : null;
          fields.push(`${map[k]} = $${i++}`); values.push(v);
        } else {
          fields.push(`${map[k]} = $${i++}`); values.push(req.body[k]);
        }
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'no_fields' });
    values.push(id);
    const q = `UPDATE news SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, title, description AS "desc", thumb, source, url`;
    try {
      const r = await pool.query(q, values);
      if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
      res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });

  app.delete(`${prefix}/news/:id`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!hasDb()) {
      const idx = mem.news.findIndex(n => String(n.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not_found' });
      mem.news.splice(idx, 1);
      return res.sendStatus(204);
    }
    try {
      const r = await pool.query('DELETE FROM news WHERE id = $1', [id]);
      if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
      res.sendStatus(204);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
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

  // YouTube admin (DB-backed, fallback to memory)
  app.get(`${prefix}/youtube/channels`, requireAdmin, async (_req, res) => {
    if (!hasDb()) return res.json(mem.ytChannels);
    try {
      const r = await pool.query('SELECT id, title, url, auto_publish FROM youtube_channels ORDER BY title NULLS LAST, id');
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });
  app.post(`${prefix}/youtube/channels`, requireAdmin, async (req, res) => {
    const { urlOrId, title } = req.body || {};
    if (!urlOrId) return res.status(400).json({ error: 'urlOrId required' });
    const id = urlOrId.trim();
    const ch = { id, url: urlOrId, title: title || '' };
    if (!hasDb()) {
      const existing = mem.ytChannels.find(c => c.id === id);
      if (existing) Object.assign(existing, ch); else mem.ytChannels.push(ch);
      return res.status(existing ? 200 : 201).json(ch);
    }
    try {
      const q = `INSERT INTO youtube_channels (id, title, url) VALUES ($1,$2,$3)
                 ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url
                 RETURNING id, title, url, auto_publish`;
      const r = await pool.query(q, [ch.id, ch.title, ch.url]);
      res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });
  app.delete(`${prefix}/youtube/channels/:id`, requireAdmin, async (req, res) => {
    const { id } = req.params;
    if (!hasDb()) {
      const idx = mem.ytChannels.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ error: 'not_found' });
      mem.ytChannels.splice(idx, 1);
      return res.sendStatus(204);
    }
    try {
      const r = await pool.query('DELETE FROM youtube_channels WHERE id = $1', [id]);
      if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
      res.sendStatus(204);
    } catch (e) { res.status(500).json({ error: 'db_error' }); }
  });
  app.post(`${prefix}/news/sync-youtube`, requireAdmin, async (_req, res) => {
    const work = async () => {
      // Load channels
      let channels = [];
      if (hasDb()) {
        const r = await pool.query('SELECT id, url FROM youtube_channels');
        channels = r.rows;
      } else {
        channels = mem.ytChannels;
      }
      // Helpers to resolve to UC id
      const isUC = (s='') => /^UC[\w-]{21,}$/.test(s);
      const extractUCFromUrl = (s='') => {
        const m = s.match(/channel\/(UC[\w-]+)/i); return m ? m[1] : '';
      };
      const resolveUC = async (input) => {
        const raw = (input || '').trim();
        if (!raw) return '';
        if (isUC(raw)) return raw;
        const fromUrl = extractUCFromUrl(raw); if (fromUrl) return fromUrl;
        if (!YOUTUBE_API_KEY) return '';
        // @handle
        if (raw.startsWith('@')) {
          try {
            const d = await fetchJson(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(raw)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`, {}, 10000);
            const ch = d && d.items && d.items[0];
            return ch ? ch.id : '';
          } catch {}
        }
        // Legacy username
        try {
          const d = await fetchJson(`https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(raw)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`, {}, 10000);
          const ch = d && d.items && d.items[0];
          if (ch && ch.id) return ch.id;
        } catch {}
        // Search as last resort
        try {
          const d = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(raw)}&maxResults=1&key=${encodeURIComponent(YOUTUBE_API_KEY)}`, {}, 10000);
          const it = d && d.items && d.items[0] && d.items[0].snippet;
          const id = d && d.items && d.items[0] && d.items[0].id && d.items[0].id.channelId;
          return id || '';
        } catch {}
        return '';
      };
      // Collect existing urls for de-dupe
      let existing = new Set();
      if (hasDb()) {
        const r = await pool.query('SELECT url FROM news WHERE url IS NOT NULL');
        existing = new Set(r.rows.map(x => x.url));
      } else {
        existing = new Set(mem.news.map(n => n.url).filter(Boolean));
      }
      let added = 0;
      for (const ch of channels) {
        const id = ((ch.id || ch.url) || '').trim();
        const uc = await resolveUC(id);
        if (!uc) continue;
        try {
          const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(uc)}`;
          const xml = await fetchText(feedUrl, { headers: { 'user-agent': 'Mozilla/5.0 SRBIJA/1.0' } }, 10000);
          const vidRe = /<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>/gi;
          let m2; let count = 0;
          while ((m2 = vidRe.exec(xml)) && count < 5) {
            const vid = m2[1];
            const title = m2[2];
            const url = `https://www.youtube.com/watch?v=${vid}`;
            if (existing.has(url)) { count++; continue; }
            const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
            if (!hasDb()) {
              mem.news.unshift({ id: randomUUID(), title, desc: '', thumb, source: 'youtube', url });
            } else {
              const idVal = newId();
              await pool.query('INSERT INTO news (id, title, description, thumb, source, url) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (url) DO NOTHING', [idVal, title, '', thumb, 'youtube', url]);
            }
            existing.add(url);
            added++;
            count++;
          }
        } catch {}
      }
      return added;
    };
    try {
      const added = await work();
      res.status(202).json({ added });
    } catch {
      res.status(202).json({ added: 0 });
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

  // PUBG integration
  const isAccountId = (v) => typeof v === 'string' && /^account\./.test(v);
  const pubgHeaders = () => ({
    'Authorization': `Bearer ${PUBG_API_KEY}`,
    'Accept': 'application/vnd.api+json',
  });
  const pubgFetch = (path, platform) => fetchJson(`https://api.pubg.com${path.replace('{platform}', platform)}`, { headers: pubgHeaders() }, 12000);

  async function resolveAccountId(nameOrId, platform) {
    const v = (nameOrId || '').trim();
    if (!v) return '';
    if (isAccountId(v)) return v;
    const shard = (platform || PUBG_PLATFORM);
    const data = await pubgFetch(`/shards/{platform}/players?filter[playerNames]=${encodeURIComponent(v)}`, shard);
    const first = data && data.data && data.data[0];
    return first ? first.id : '';
  }

  function sumStats(gameModeStats) {
    const modes = Object.values(gameModeStats || {});
    const acc = { matches: 0, wins: 0, kills: 0, deaths: 0, damage: 0 };
    for (const m of modes) {
      acc.matches += (m.roundsPlayed || 0);
      acc.wins += (m.wins || 0);
      acc.kills += (m.kills || 0);
      acc.deaths += (m.losses !== undefined ? m.losses : (m.roundsPlayed || 0) - (m.wins || 0));
      acc.damage += (m.damageDealt || 0);
    }
    const kd = acc.deaths > 0 ? +(acc.kills / acc.deaths).toFixed(2) : acc.kills;
    return { matches: acc.matches, wins: acc.wins, kd, rank: '-', damage: Math.round(acc.damage) };
  }

  async function fetchLifetimeStats(accountId, platform) {
    const shard = (platform || PUBG_PLATFORM);
    const d = await pubgFetch(`/shards/{platform}/players/${accountId}/seasons/lifetime`, shard);
    const gms = d && d.data && d.data.attributes && d.data.attributes.gameModeStats;
    return sumStats(gms || {});
  }

  async function fetchSteamAvatarFromAccountId(accountId) {
    try {
      if (!STEAM_API_KEY) return '';
      if (!/^account\.steam\./.test(accountId)) return '';
      const steamId = accountId.split('.')?.[2] || '';
      if (!/^\d{17}$/.test(steamId)) return '';
      const data = await fetchJson(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(STEAM_API_KEY)}&steamids=${encodeURIComponent(steamId)}`, {}, 10000);
      const p = data && data.response && data.response.players && data.response.players[0];
      return (p && (p.avatarfull || p.avatarmedium || p.avatar)) || '';
    } catch { return ''; }
  }

  // Admin-triggered refresh by member id
  app.post(`${prefix}/members/:id/refresh-pubg`, requireServerTokenIfSet, requireAdmin, async (req, res) => {
    if (!PUBG_API_KEY) return res.status(501).json({ error: 'pubg_api_key_missing' });
    const mid = req.params.id;
    try {
      // Load existing member
      let member;
      if (hasDb()) {
        const r = await pool.query('SELECT id, nickname, avatar, pubg_id AS "pubgId", pubg_platform AS "pubgPlatform", stats, scope FROM members WHERE id = $1', [mid]);
        member = r.rows[0];
      } else {
        member = mem.members.find(m => m.id === mid);
      }
      if (!member) return res.status(404).json({ error: 'member_not_found' });
      // Resolve account id if needed
      let accountId = '';
      if (member.pubgId && isAccountId(member.pubgId)) accountId = member.pubgId;
      let shard = member.pubgPlatform || PUBG_PLATFORM;
      if (!PUBG_SHARDS.includes(shard)) shard = PUBG_PLATFORM;
      if (!accountId) accountId = await resolveAccountId(member.pubgId || member.nickname, shard);
      if (!accountId) return res.status(404).json({ error: 'pubg_id_not_found' });
      // Fetch lifetime stats
      const stats = await fetchLifetimeStats(accountId, shard);
      // Try Steam avatar if applicable
      let newAvatar = '';
      try { newAvatar = await fetchSteamAvatarFromAccountId(accountId); } catch {}
      const nextAvatar = newAvatar || member.avatar;
      // Persist
      if (hasDb()) {
        const q = 'UPDATE members SET pubg_id = $1, pubg_platform = $2, stats = $3, avatar = $4 WHERE id = $5 RETURNING id, nickname, avatar, pubg_id AS "pubgId", pubg_platform AS "pubgPlatform", stats, scope';
        const r = await pool.query(q, [accountId, shard, stats, nextAvatar, mid]);
        return res.json(r.rows[0]);
      } else {
        member.pubgId = accountId; member.pubgPlatform = shard; member.stats = stats; member.avatar = nextAvatar;
        return res.json(member);
      }
    } catch (e) {
      const m = /HTTP\s(\d+)/.exec(String(e));
      const code = m ? m[1] : '500';
      return res.status(502).json({ error: 'pubg_fetch_failed', code: String(code) });
    }
  });

  // Convenience lookups
  app.get(`${prefix}/pubg/resolve`, async (req, res) => {
    if (!PUBG_API_KEY) return res.status(501).json({ error: 'pubg_api_key_missing' });
    const q = (req.query.q || '').toString();
    try {
      const id = await resolveAccountId(q);
      res.json({ accountId: id });
    } catch (e) { res.status(502).json({ error: 'resolve_failed' }); }
  });
  app.get(`${prefix}/pubg/:accountId/lifetime`, async (req, res) => {
    if (!PUBG_API_KEY) return res.status(501).json({ error: 'pubg_api_key_missing' });
    const accountId = req.params.accountId;
    try {
      const stats = await fetchLifetimeStats(accountId);
      res.json({ accountId, stats });
    } catch (e) { res.status(502).json({ error: 'pubg_fetch_failed' }); }
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
