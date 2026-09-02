# ☕ SMOCHA — The Crew Event Hub

A private, invite-only hangout scheduler for your crew. Dark, moody, premium — built with React + Vite, Express, and SQLite.

## Features

- **Passcode gate** — enter `SMOCHA` to get in
- **Crew sidebar** — circular avatar bubbles with breathing online status dots, tooltips, and glow ring for you
- **Live presence** — heartbeat keeps you "online" while the app is open (no more phantom offline)
- **Hangouts** — create, RSVP (down/maybe/can't), countdown flips, photo galleries
- **Admin panel** — manage crew, promote/revoke admins, delete users & hangouts, reset demo data
- **Profiles** — custom avatars, bios, edit mode
- **Custom SVG icon set** — zero emoji
- **Framer Motion** — spring card reveals, page transitions, micro-interactions
- **Mobile bottom tab bar** — native-feeling navigation on phones
- **Error boundary** — no more white screens on render crashes

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + Framer Motion |
| Backend | Node.js + Express |
| Database | SQLite (node:sqlite) |
| Auth | JWE-encrypted tokens via `jose` + bcrypt (passcode: `SMOCHA`) |
| Photos | Multer uploads |
| Security | Helmet, layered express-rate-limit, express-validator, magic-byte validation |

## Local Development

### Prerequisites
- Node.js 22+ (uses built-in `node:sqlite`)

### 1. Start everything (server + client together)
```bash
npm install            # installs concurrently (root)
npm run dev            # starts BOTH server (5000) and client (5173)
```

> **Why this matters:** running only the Vite client without the Express server causes `ECONNREFUSED` proxy errors. The root `npm run dev` starts both.

### Or run them separately
```bash
# Terminal 1 — server
cd server && npm install && npm run dev

# Terminal 2 — client
cd client && npm install && npm run dev
```

Server runs on http://localhost:5000. On first run it seeds 5 demo crew members (password: `smocha123`).

### Demo accounts
| Username | Password | Role | Online |
|----------|----------|------|--------|
| dyllan   | smocha123 | admin | ✅ |
| maya     | smocha123 | member | ✅ |
| kofi     | smocha123 | member | ✅ |
| zuri     | smocha123 | member | ❌ |
| leo      | smocha123 | member | ❌ |

Passcode to enter the app: `SMOCHA`

## Environment Variables

Copy `server/.env.example` to `server/.env` and tweak:

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | `smocha-dev-secret` (dev only) | HKDF source for the AES-256-GCM key that **encrypts** every token (JWE). **Must** be set ≥ 32 chars in production |
| `CREW_PASSCODE` | `SMOCHA` | Crew gate passcode — change in production |
| `ADMIN_USERNAMES` | `dyllan` | Comma-separated usernames that get admin role |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | CORS whitelist |
| `TRUST_PROXY` | `0` (dev), `1` (prod) | Proxy hops in front of the server — rate limiting keys on the real client IP |
| `JWT_TTL` | `24h` | Token lifetime (`jose` format: `2h`, `1d`, seconds…) |
| `SEED_DEMO` | `true` (dev), `false` (prod) | Seed demo crew on a fresh DB |
| `DB_PATH` | `<server>/data/smocha.db` | SQLite file location (tests point at a temp file) |
| `LOG_LEVEL` | `dev` / `info` (prod) | Request logging: `dev`/`info`/`warn`/`silent` |
| `RATE_*` | see `.env.example` | Tune per-IP and per-user rate limits |
| `PORT` | `5000` | Server port |

Production requires `JWT_SECRET` (≥ 32 chars) and `CREW_PASSCODE` — the server fails fast if they're missing. Run the security test suite with `npm test` (server + auth + rate-limit coverage).

## Admin Panel

Navigate to `/admin` (or the shield icon in the sidebar). Only users with `is_admin = 1` can access it. From here you can:

- View live stats (crew, hangouts, photos, RSVPs)
- Promote / revoke admin roles
- Delete any non-admin user (cascades their hangouts, photos, RSVPs + removes files from disk)
- Delete any hangout
- Wipe all demo data (non-admin users + their content)

**Tip:** To make someone an admin without the UI, add their username to `ADMIN_USERNAMES` and restart — or use the Promote button in the admin panel.

## Security

- **SQL injection** — 100% prepared statements
- **JWT → JWE (encrypted tokens)** — every token is a fully **encrypted** JSON Web
  Encryption token (AES-256-GCM with an HKDF-derived key from `JWT_SECRET`), so the
  id/username claims are opaque to anyone who reads a token. Algorithms pinned
  (`dir` + `A256GCM`), issuer/audience verified, 24h expiry (configurable via
  `JWT_TTL`), unique `jti` per token, and a `token_version` claim enables
  instant session revocation (admin panel → revoke user sessions).
- **Rate limiting** (layered, keyed on the **real client IP** behind proxies):
  global (200/15min/IP), auth routes (15/15min/IP — brute-force protection),
  per-user (300/15min), uploads (30/15min — disk-write protection),
  event refresh (5/15min) and import (10/15min). All tunable via `RATE_*` env vars.
- **CORS** — explicit origin whitelist
- **Uploads** — magic-byte signature validation (rejects fake images), 10MB cap, extension whitelist, upload rate limit
- **Validation** — express-validator on all user input
- **Passwords** — bcrypt (10 rounds), min 8 chars
- **Headers** — Helmet, strict CSP in production
- **Errors** — no stack traces leaked in production
- **Process guards** — unhandled rejections logged, uncaught exceptions trigger a clean shutdown, `EADDRINUSE` handled
- **File cleanup** — no orphaned uploads on delete
- **Client** — request timeouts, 401 auto-logout, error boundary
- **Logging** — structured JSON request logs (`LOG_LEVEL` = `dev|info|warn|silent`), never logs bodies or tokens

> **Note on JWE:** encryption keeps claims unreadable if a token leaks (defense-in-depth
> against XSS/exfiltration). It does **not** prevent an attacker who has the token from
> *using* it — a JWE is still a bearer credential. Use short `JWT_TTL`, rotate `JWT_SECRET`
> only on a schedule, and revoke sessions via the admin panel if one is compromised.

## Deployment

### Option A: Render

**Backend (server/)**
1. Create a new **Web Service** on Render
2. Connect your repo, set:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add environment variables (see table above)
4. Deploy. Note: SQLite data is ephemeral on Render's free tier — use a persistent disk (paid) or switch to a hosted DB for production.

**Frontend (client/)**
1. Create a new **Static Site** on Render
2. Set:
   - **Root Directory**: `client`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
3. Set `VITE_API_URL` to your deployed backend URL.

### Option B: Railway

**Backend**
1. Create a new project on Railway, add a service from your repo
2. Set **Root Directory** to `server`
3. Add `JWT_SECRET` and `CREW_PASSCODE` env vars

**Frontend**
1. Add a second service for `client`
2. Set **Root Directory** to `client`
3. Build command: `npm install && npm run build`
4. Start command: `npm run preview`
5. Update `VITE_API_URL` to point to your backend's public URL

### Production notes
- Set a strong `JWT_SECRET` (`openssl rand -hex 32`) — it encrypts (JWE) every token
- Change `CREW_PASSCODE` from the default `SMOCHA`
- Set `ALLOWED_ORIGINS` to your actual frontend domain
- Set `TRUST_PROXY` to the number of proxy hops in front of the server (1 behind Render/Nginx, 0 if the server faces the internet directly)
- `SEED_DEMO` defaults to `false` in production — no known-password demo accounts on a live DB
- Consider shorter `JWT_TTL` for tighter session expiry
- SQLite is file-based — for multi-instance or persistent hosting, consider migrating to PostgreSQL

## Project Structure

```
hangout/
├── package.json      # root dev script (server + client together)
├── server/
│   ├── index.js      # Express app, all API routes + security middleware
│   ├── db.js         # SQLite schema + migration
│   ├── .env.example  # env var template
│   ├── data/         # SQLite database file
│   └── uploads/      # avatars/ + photos/
└── client/
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx               # routes + guards
        ├── AuthContext.jsx       # auth state
        ├── api.js                # API client (timeout, 401 handling)
        ├── index.css             # design system
        ├── components/
        │   ├── AppShell.jsx      # sidebar + heartbeat + mobile tab bar
        │   ├── Avatar.jsx        # avatar + online dot + glow
        │   ├── ErrorBoundary.jsx # render crash safety net
        │   ├── HangoutCard.jsx   # card + countdown flips
        │   └── icons.jsx         # custom SVG icon set
        └── pages/
            ├── Landing.jsx       # passcode gate
            ├── Auth.jsx          # login/signup
            ├── Dashboard.jsx     # hangout grid
            ├── HangoutDetail.jsx
            ├── NewHangout.jsx
            ├── CrewPage.jsx
            ├── ProfilePage.jsx
            └── AdminPage.jsx     # admin control room
```

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/check-passcode` | Validate crew passcode |
| POST | `/api/signup` | Create account (requires passcode) |
| POST | `/api/login` | Get JWT |
| GET | `/api/me` | Current user |
| PUT | `/api/me` | Update profile |
| POST | `/api/me/avatar` | Upload avatar |
| POST | `/api/heartbeat` | Presence heartbeat + live crew status |
| GET | `/api/crew` | All members + online status |
| GET | `/api/users/:id` | Single profile + their hangouts |
| GET | `/api/hangouts` | List all hangouts |
| POST | `/api/hangouts` | Create hangout (multipart) |
| GET | `/api/hangouts/:id` | Hangout detail + RSVPs + photos |
| POST | `/api/hangouts/:id/rsvp` | Set RSVP status |
| POST | `/api/hangouts/:id/photos` | Upload photo |
| DELETE | `/api/hangouts/:id` | Delete hangout (creator only) |
| GET | `/api/admin/stats` | Admin stats |
| GET | `/api/admin/users` | Admin user list |
| GET | `/api/admin/hangouts` | Admin hangout list |
| POST | `/api/admin/users/:id/toggle-admin` | Promote/revoke admin |
| POST | `/api/admin/users/:id/revoke` | Revoke all of a user's sessions (bumps `token_version`) |
| DELETE | `/api/admin/users/:id` | Delete user + content |
| DELETE | `/api/admin/hangouts/:id` | Delete hangout |
| DELETE | `/api/admin/photos/:id` | Delete photo |
| POST | `/api/admin/reset-demo` | Wipe all demo data |