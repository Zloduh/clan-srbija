Admin

Login
- Visit `/admin`.
- Enter the admin API token and click Login.
- On success, the token is kept in sessionStorage under `srbija_admin_token` and sent as `Authorization: Bearer <token>` on admin actions.

Members
- List shows current members with nickname and PUBG ID.
- Add: fill Nickname, Avatar URL (optional), PUBG ID (optional), then Add.
- Edit: click Edit to open the modal and update values.
- Delete: click Delete to remove the member.

News
- Add: paste a link (YouTube/Twitch/Discord), choose source, and optionally set Title/Thumbnail.
  - If Title is empty and Source is YouTube/Twitch, the admin UI calls the oEmbed helper to prefill Title/Thumb.
- Edit: update a news item title inline via prompt.
- Delete: remove the news item.

YouTube Channels
- Removed. Only manual news posts are supported.

Implementation Notes
- Admin uses `/api/news` and `/api/members` endpoints. See `docs/api.md` for request/response shapes.
- Ensure your backend enforces bearer auth and optionally a server token header on write operations.
