SRBIJA Proxy Server (Node/Express)

Purpose
- Keep API keys server-side (safe). Frontend never stores secrets.
- Provide simple JSON endpoints the site can use for metadata/stats.

Endpoints
- GET /health -> { ok: true }
- GET /youtube/oembed?url=... -> { title, author_name, thumbnail_url, url }
  - Uses public oEmbed; API key not required.
- GET /twitch/oembed?url=... -> { title, author_name, thumbnail_url, url }
  - Uses public oEmbed; no credentials required.
- GET /discord/resolve?url=... -> { title, description, thumbnail, url }
  - Public OG scraping only
- GET /pubg/:playerId -> { matches, wins, kd, rank, damage, raw }
  - Placeholder unless PUBG_API_KEY is wired with full integration.

Security
- ADMIN_TOKEN required for admin write operations (send as Authorization: Bearer <token>).
- Optional SERVER_TOKEN. When set, include header x-server-token in frontend/server-to-server requests.

Setup
1) cp .env.example .env and fill values (set ADMIN_TOKEN at minimum)
2) (Docker) docker compose up --build
   (Node) npm install && npm start

Deploy
- Any Node host (VPS, Render, Railway). Or convert to serverless functions.

Notes
- PUBG normalization here is minimal placeholder; wire actual stats aggregation later.
- The frontend uses only base URLs (no secrets). Configure Admin > API with these server URLs.
