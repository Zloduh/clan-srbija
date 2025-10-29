// server/index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import fetch from "node-fetch";

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

// Simple API auth (optional): allow all for now; add bearer check here if needed

// Members CRUD
app.get("/api/members", (req, res) => {
  const data = readJson(MEMBERS_FILE);
  res.json(data);
});
app.post("/api/members", (req, res) => {
  const data = readJson(MEMBERS_FILE);
  const item = { id: String(Date.now()), ...req.body };
  data.unshift(item);
  writeJson(MEMBERS_FILE, data);
  res.status(201).json(item);
});
app.put("/api/members/:id", (req, res) => {
  const data = readJson(MEMBERS_FILE);
  const idx = data.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data[idx] = { ...data[idx], ...req.body, id: data[idx].id };
  writeJson(MEMBERS_FILE, data);
  res.json(data[idx]);
});
app.delete("/api/members/:id", (req, res) => {
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
app.post("/api/news", (req, res) => {
  const data = readJson(NEWS_FILE);
  const item = { id: Date.now(), ...req.body };
  data.unshift(item);
  writeJson(NEWS_FILE, data);
  res.status(201).json(item);
});
app.put("/api/news/:id", (req, res) => {
  const data = readJson(NEWS_FILE);
  const id = Number(req.params.id);
  const idx = data.findIndex(n => n.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  data[idx] = { ...data[idx], ...req.body, id };
  writeJson(NEWS_FILE, data);
  res.json(data[idx]);
});
app.delete("/api/news/:id", (req, res) => {
  const data = readJson(NEWS_FILE);
  const id = Number(req.params.id);
  const next = data.filter(n => n.id !== id);
  writeJson(NEWS_FILE, next);
  res.status(204).end();
});

// PUBG proxy endpoints
const PUBG_API_KEY = process.env.PUBG_API_KEY || process.env.PUBG_TOKEN;
const PUBG_REGION = process.env.PUBG_REGION || "steam";
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

app.get("/api/status", (req, res) => {
  res.json({ message: "SRBIJA Clan server is online 🔥" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
