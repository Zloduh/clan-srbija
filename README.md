SRBIJA PUBG Clan Portal

Overview
- Static frontend in the repo root (`index.html`, `styles.css`, assets/) and a dedicated admin UI (`admin.html`, `admin.js`).
- Optional Node/Express proxy backend under `server/` intended to keep API keys server‑side and provide simple JSON endpoints for the site and admin tools.
- Admin UI expects CRUD endpoints for members and news, plus oEmbed helpers for YouTube/Twitch and a lightweight auth check.

Features
- News feed with external posts (Discord, YouTube, Twitch).
- Roster with player cards and placeholder stats display.
- Leaderboard table with search/sort UI.
- Admin dashboard: login by token, manage members and news, optional YouTube channel sync placeholders.

Quick Start
- Frontend (static):
  - Serve the root folder with any static file server (for example VS Code Live Server, Nginx, or a temporary local server). Opening `index.html` directly from disk won’t work for admin functions because they call `/api/...`.
  - In development, run a static server for the frontend and an API server that responds on the same origin under `/api` (or configure a reverse proxy so `/api` maps to the backend).
- Backend (Node proxy):
  - Copy `server/.env.example` to `server/.env` and fill values.
  - Docker: run `docker compose up --build` to start the proxy on port 8787.
  - Node: `cd server && npm install && npm start` (expects `index.js` to implement the endpoints described in docs).

Documentation
- docs/overview.md — App structure and responsibilities.
- docs/setup.md — Local setup for frontend and backend.
- docs/api.md — Expected backend API contract for the frontend/admin.
- docs/admin.md — Admin workflows and data shapes.
- docs/deployment.md — Static hosting + API deployment patterns.

Status Notes
- `server/index.js` is currently a stub. Use `docs/api.md` to implement the minimal endpoints needed by the frontend/admin, or point the app to an existing API that matches the same contract.
- The UI already includes placeholders for PUBG stats and social feeds. Wire those when the corresponding backend endpoints are ready.

