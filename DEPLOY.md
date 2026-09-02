# Deploying SMOCHA for $0

The app is a **single Node process** (Express serves the API *and* the built
client from `client/dist`, plus `/uploads`). That makes it easy to host
anywhere that runs Node 22+. State lives in two folders:

- `server/data/` — SQLite database (`smocha.db` + WAL)
- `server/uploads/` — uploaded photos + scraped event images

**Any host with an ephemeral disk will lose these on restart.** Pick a
deployment option accordingly.

---

## Option 1 (recommended): Oracle Cloud "Always Free" VM

The only genuinely free-forever host with **persistent disk and no sleep**.
You get a small ARM VM (4 cores / 24 GB RAM) that stays on 24/7 — perfect for
the events scraper schedule. Requires a credit card for identity checks, but
never charges on the Always Free tier.

### Steps

1. Create an **Ampere A1** VM (Ubuntu 22.04+) at cloud.oracle.com — Always
   Free eligible shape. Open ports `80` (and `22`) in the VM + VCN firewall
   lists.
2. SSH in and install Node 22:

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```

3. Clone & build:

   ```bash
   git clone <your-repo-url> smocha && cd smocha
   npm install --prefix server && npm install --prefix client && npm run build
   ```

4. Configure env (`server/.env`):

   ```bash
   cp server/.env.example server/.env
   # then edit: JWT_SECRET=$(openssl rand -hex 32), CREW_PASSCODE,
   # ADMIN_USERNAMES, SEED_DEMO=false, ALLOWED_ORIGINS=https://yourdomain,
   # NODE_ENV=production, IG_SESSIONID (your Option-B cookie)
   ```

5. Run it as a service that survives reboots — `/etc/systemd/system/smocha.service`:

   ```ini
   [Unit]
   Description=SMOCHA hangout hub
   After=network.target

   [Service]
   WorkingDirectory=/home/ubuntu/smocha/server
   ExecStart=/usr/bin/node index.js
   Environment=NODE_ENV=production
   Environment=PORT=80
   # Server faces the internet directly here (no proxy in front) → 0 hops.
   Environment=TRUST_PROXY=0
   Restart=always
   User=ubuntu

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl enable --now smocha
   ```

6. Daily backups (SQLite is a single file — just copy it):

   ```bash
   crontab -e
   # 3am daily backup of the whole data dir
   0 3 * * * tar -czf ~/smocha-backup-$(date +\%F).tar.gz -C ~/smocha/server data uploads
   ```

Done — the scraper runs on schedule, uploads persist, restarts are SIGTERM-clean.

---

## Option 2 (zero-config, but ephemeral): Render free tier

Fastest to set up (connect GitHub repo, use `render.yaml` in this repo), but
**free web services sleep after 15 min idle and the disk is wiped on every
deploy/restart** — meaning your SQLite data and uploads vanish. Workable only
if you add an external backup/restore step (e.g. GitHub Actions that tars
`server/data` somewhere durable between deploys). Fine for demos; not
recommended for real crew data.

```yaml
# render.yaml (in repo) — Build: install all deps then build client ; Start: npm start
services:
  - type: web
    name: smocha
    runtime: node
    plan: free
    buildCommand: npm install --prefix server && npm install --prefix client && npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: CREW_PASSCODE
        sync: false
      - key: SEED_DEMO
        value: "false"
      - key: EVENTS_ENABLED
        value: "true"
      - key: TRUST_PROXY
        value: "1"
```

---

## Option 3: Docker anywhere

A `Dockerfile` ships with the repo (multi-stage: builds the client, ships a
slim runtime). Works on any host that gives you a VM + Docker — including the
Oracle VM above:

```bash
docker build -t smocha .
docker run -d --name smocha -p 80:5000 \
  -v /srv/smocha/data:/app/server/data \
  -v /srv/smocha/uploads:/app/server/uploads \
  --env-file server/.env smocha
```

The volume mounts are what keep the DB + uploads persistent.

---

## Not suitable (honest notes)

- **Vercel / Netlify for the server** — serverless functions have no
  persistent filesystem; `node:sqlite` needs a real disk. (You *could* host
  just the client there and point `VITE_API_URL` at a separate API host, but
  that doubles the setup for no cost saving.)
- **Fly.io / Railway** — no meaningful free tier for new accounts anymore.
- **Supabase/Neon** — Postgres, not SQLite; would require rewriting the data
  layer.

## Production env checklist

| Var | Required | Notes |
|---|---|---|
| `JWT_SECRET` | ✅ prod | `openssl rand -hex 32` (≥ 32 chars) — HKDF source for the AES-256-GCM key that **encrypts** tokens (JWE); server exits without it or if too short in prod |
| `CREW_PASSCODE` | ✅ prod | signup gate for the crew |
| `TRUST_PROXY` | ✅ (behind proxy) | proxy hops before this server: `1` on Render/free hosts, `0` if it faces the internet directly. Rate limiting keys on the real client IP |
| `ADMIN_USERNAMES` | – | comma-separated, default `dyllan` |
| `SEED_DEMO` | – | defaults to `false` in prod (no known-password demo accounts); explicit `true` re-enables |
| `ALLOWED_ORIGINS` | – | only matters for cross-origin API calls; same-origin serving needs none |
| `JWT_TTL` | – | token lifetime, default `24h`; tighten for shorter sessions |
| `DB_PATH` | – | SQLite path, default `<server>/data/smocha.db` |
| `LOG_LEVEL` | – | `dev`/`info`/`warn`/`silent`, default `info` in prod |
| `RATE_*` | – | tune per-IP/per-user rate limits (see `server/.env.example`) |
| `NODE_ENV` | ✅ | `production` — enables strict CSP + client serving |
| `PORT` | – | default 5000 |
| `EVENTS_ENABLED` | – | `false` to disable the scraper |
| `EVENTS_REFRESH_HOURS` | – | default 6 |
| `IG_SESSIONID` | – | Option-B Instagram cookie (throwaway account!) |
| `X_API_TOKEN` | – | optional, raises X oEmbed limits |
