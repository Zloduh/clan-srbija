Overview
- Root frontend: `index.html` (site), `admin.html` (admin), `styles.css` (theme), `assets/` (icons/images).
- Admin logic: `admin.js` calls `/api/...` endpoints for auth, members, news, and oEmbed helpers.
- Backend (optional/proxy): `server/` Node/Express service meant to keep API keys secret and normalize 3rd‑party responses for the frontend. Ships with Dockerfile and compose config exposing port 8787.

Responsibilities
- Frontend
  - Render news, roster, leaderboard, and modals.
  - Admin dashboard for CRUD of members and news.
  - Calls relative `/api/...` paths, assuming the API is served on the same origin or reverse‑proxied.
- Backend (to implement or provide)
  - Auth: token check for admin actions.
  - Members: CRUD storage (e.g., Postgres, SQLite, or in‑memory for dev).
  - News: CRUD storage with optional oEmbed enrichment.
  - oEmbed helpers: YouTube/Twitch lookups with server‑side keys.
  - Optional PUBG stats normalization endpoint.

Data Model (expected by the UI)
- Member
  - id: string
  - nickname: string
  - avatar: string (URL)
  - pubgId: string
  - stats: { matches: number, wins: number, kd: number, rank: string, damage: number }
  - scope: string (e.g., "overall")
- News Item
  - id: string
  - title: string
  - desc: string
  - thumb: string (URL)
  - source: 'discord' | 'youtube' | 'twitch' | string
  - url: string (optional)

Routing
- Public site: `/` serves the static files (index, styles, assets).
- Admin: `/admin` serves `admin.html` and uses `/api` routes for data operations.

