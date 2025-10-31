API Contract

Auth
- GET `/api/auth/check`
  - Headers: `Authorization: Bearer <ADMIN_TOKEN>`
  - Returns: 204 on success, 401 otherwise

Members
- GET `/api/members`
  - Returns: `Member[]`
- POST `/api/members`
  - Body: `Member` (without id) — server assigns `id`
  - Returns: created `Member`
- PUT `/api/members/:id`
  - Body: partial `Member` fields to update
  - Returns: updated `Member`
- DELETE `/api/members/:id`
  - Returns: 204

News
- GET `/api/news`
  - Returns: `News[]`
- POST `/api/news`
  - Body: `News` (without id) — server assigns `id`
  - Returns: created `News`
- PUT `/api/news/:id`
  - Body: partial `News`
  - Returns: updated `News`
- DELETE `/api/news/:id`
  - Returns: 204

oEmbed Helpers
- GET `/api/youtube/oembed?url=...`
  - Uses public oEmbed; no API key required
  - Returns: `{ title, author_name, thumbnail_url, url }`
- GET `/api/twitch/oembed?url=...`
  - Uses public oEmbed
  - Returns: `{ title, author_name, thumbnail_url, url }`
- GET `/api/discord/resolve?url=...`
  - Public OG scraping only — no secrets
  - Returns: `{ title, description, thumbnail, url }`

PUBG
- GET `/api/pubg/:playerId`
  - Requires: `PUBG_API_KEY`, optional `PUBG_PLATFORM`
  - Returns: `{ matches, wins, kd, rank, damage, raw }`

Removed endpoints
- The app no longer supports YouTube channel subscriptions or RSS sync endpoints.

Headers and Security
- Admin endpoints require bearer auth: `Authorization: Bearer <ADMIN_TOKEN>`
- Optionally support a server‑level token: `x-server-token: <SERVER_TOKEN>` for requests that should be restricted even without admin auth.

Types
- Member
  - `{ id: string, nickname: string, avatar: string, pubgId?: string, stats: { matches: number, wins: number, kd: number, rank: string, damage: number }, scope: string }`
- News
  - `{ id: string, title: string, desc: string, thumb: string, source: string, url?: string }`
