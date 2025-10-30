Deployment

Recommended Architecture
- Static hosting for the frontend (CDN or object storage), plus a separate API service for `/api`.
- Use a reverse proxy (e.g., Nginx) so the site and API share the same origin. Example mapping:
  - `/` → static files
  - `/api` → Node/Express proxy (`server/`)

Static Hosting Options
- Nginx, Apache, or any CDN (Netlify, Cloudflare Pages, S3+CloudFront, etc.).
- Upload the root files: `index.html`, `admin.html`, `styles.css`, `assets/`, and any scripts.

API Hosting Options
- Docker on a VPS, Render, Railway, Fly.io, or any Node host.
- Expose the service on an internal network and proxy it behind your main domain under `/api`.

Environment
- Set the variables from `server/.env.example` in your hosting environment.
- Never expose API keys to the frontend; keep them server‑side only.

Security
- Require bearer auth for admin routes.
- Optionally set `SERVER_TOKEN` and validate incoming requests with `x-server-token` for an extra layer on select endpoints.
- Configure CORS only if you do not use a same‑origin reverse proxy.

Observability
- Log request summaries and errors in the API service.
- Add health checks: `/api/health` should return `{ ok: true }`.

