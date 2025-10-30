Setup

Prerequisites
- Frontend: any static file server or hosting platform.
- Backend (optional/proxy): Node 20+ or Docker.

Environment
1) Copy `server/.env.example` to `server/.env` and set values based on your providers.
2) If you plan to persist data, configure a database and connection string (e.g., Postgres). Otherwise, implement an in‑memory store for development.

Local Development
- Start backend (Docker):
  - At repo root: `docker compose up --build`
  - The proxy listens on `http://localhost:8787`.
- Start backend (Node):
  - `cd server && npm install && npm start`
- Serve frontend:
  - Option A: serve the root folder with a static server and reverse‑proxy `/api` to your backend.
  - Option B: serve static from the backend (implement static hosting in `server/index.js`) so the same origin handles both `/` and `/api`.

Configuring `/api` base
- The frontend calls relative `/api/...` paths. In dev/prod, prefer a reverse proxy that mounts the API under `/api` (e.g., Nginx). If you cannot proxy, you can adjust fetch base paths in JS to point to your API host, but keeping the relative `/api` is simpler.

Secrets
- Keep API keys in `server/.env` only. The frontend must never embed secrets.

