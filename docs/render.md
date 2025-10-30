⚙️ 1. General Setup

Your project is a Node.js + Express backend serving a static frontend (HTML/JS/CSS) — all deployed as a single Render Web Service.

Frontend (index.html, script.js, assets): Static site for visitors (clan homepage, news, roster, etc.)

Backend API (index.js): Express server providing /api/... endpoints for members, news, PUBG stats, YouTube, and Twitch integrations.

Both frontend and backend are built and served from the same Render app (https://clan-srbija.onrender.com).

🧱 2. Render Service Configuration

Render Settings:

Service type: Web Service

Environment: Node.js

Start Command: node index.js

Region: Frankfurt (EU Central)

Port: Auto-detected via process.env.PORT (Render sets this automatically)

Instance Type: Free plan (0.1 CPU, 512MB RAM)

Environment Variables set in Render dashboard:

Key	Purpose
DATABASE_URL	Render PostgreSQL connection string
ADMIN_API_TOKEN	Protects admin endpoints (for write operations)
PUBG_API_KEY	Your PUBG API key
YOUTUBE_API_KEY	Used for YouTube video/channel info
TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET	Twitch OAuth credentials
NODE_ENV	"production" to enable HTTPS redirect
DEBUG	1 or true enables verbose server logs
🗄️ 3. Database (Render PostgreSQL)

The backend auto-initializes the database if it doesn’t exist:

CREATE TABLE members (...);
CREATE TABLE youtube_channels (...);
CREATE TABLE news (...);


All persistent data (clan roster, news, YouTube channels) is stored there.
If DATABASE_URL is missing, the API still runs but skips DB actions.

🌐 4. Backend API (index.js)

Main routes and integrations:

🔸 Core API
Route	Method	Description
/api/status	GET	Health check (“server is online 🔥”)
/api/members	CRUD	Manage clan members and their PUBG stats
/api/news	CRUD	Manage news feed (manual or auto-published YouTube/Twitch content)
/api/youtube/*	GET/POST	Fetch and sync latest videos
/api/pubg/*	GET/POST	Proxy to official PUBG API
/api/twitch/oembed	GET	Retrieve Twitch stream/video data
/api/members/:id/refresh-pubg	POST	Refresh PUBG stats for one player
🔒 Auth

Protected routes use a Bearer token in header:
Authorization: Bearer <ADMIN_API_TOKEN>

If no token is set (for dev), all routes are open.

🧩 5. Frontend (script.js)

Client-side logic automatically connects to the backend:

Environment switch:
const ENV = {
  mode: (localhost) ? 'development' : 'production',
  apiBase: (localhost)
    ? 'http://localhost:3000'
    : 'https://clan-srbija.onrender.com'
};

Key frontend responsibilities:

Fetch /api/news and /api/members on load

Display clan members with PUBG stats

Update stats via /api/members/:id/refresh-pubg

Render news cards, leaderboard, and smooth animations

Handle “refresh” button for individual player stats (this triggered your earlier refresh is not defined issue — fixed now since it’s inside the correct scope)

🔁 6. Auto-Sync Features

The backend has a scheduled task:

setTimeout(runYouTubeSyncOnce, 10_000);
setInterval(runYouTubeSyncOnce, 3 * 60 * 60 * 1000);


That means:

It auto-syncs YouTube channel videos every 3 hours

Newly found videos are added to the news table automatically

🧠 7. Deployment Flow
Local development
npm install
node index.js


Visit http://localhost:3000

Production (Render)

Render runs:

npm install
node index.js


and automatically:

Detects port (PORT)

Connects to the PostgreSQL service

Uses environment variables securely

Serves your entire site via HTTPS at
https://clan-srbija.onrender.com

✅ 8. Summary Diagram
[ Browser ]
    │
    ▼
[ Render Web Service: clan-srbija ]
 ├─ Serves static files (index.html, script.js)
 └─ Express backend (index.js)
      ├─ Connects to Render PostgreSQL
      ├─ Fetches PUBG API data
      ├─ Syncs YouTube/Twitch feeds
      └─ Provides JSON endpoints to frontend