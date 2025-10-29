SRBIJA Proxy Server (Node/Express)

Purpose
- Keep API keys server-side (safe). Frontend never stores secrets.
- Provide simple JSON endpoints the site can use for metadata/stats.

Endpoints
- GET /health -> { ok: true }
- GET /youtube/oembed?url=... -> { title, author_name, thumbnail_url, url }
  - Requires YOUTUBE_API_KEY
- GET /twitch/oembed?url=... -> { title, author_name, thumbnail_url, url }
  - Requires TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
- GET /discord/resolve?url=... -> { title, description, thumbnail, url }
  - Public OG scraping only
- GET /pubg/:playerId -> { matches, wins, kd, rank, damage, raw }
  - Requires PUBG_API_KEY, optional PUBG_PLATFORM (steam/xbox/psn/etc.)

Security
- Optional SERVER_TOKEN. When set, include header x-server-token in frontend requests.

Setup
1) cp .env.example .env and fill values
2) (Docker) docker compose up --build
   (Node) npm install && npm start

Deploy
- Any Node host (VPS, Render, Railway). Or convert to serverless functions.

Notes
- PUBG normalization here is minimal placeholder; wire actual stats aggregation later.
- The frontend uses only base URLs (no secrets). Configure Admin > API with these server URLs.
