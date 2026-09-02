#!/usr/bin/env bash
# One-shot, NO-SUDO installer for the SMOCHA home deployment.
#   - downloads cloudflared (static binary → ~/.local/bin)
#   - installs + enables two USER-scope systemd services (SMOCHA + tunnel)
#   - prints your public URL
#
# Run:  bash deploy/install-home.sh
set -euo pipefail
cd "$(dirname "$0")/.."
USER_UNITS="$HOME/.config/systemd/user"

echo "==> 1/4 Installing cloudflared (user binary, no sudo)"
mkdir -p "$HOME/.local/bin"
if [ ! -x "$HOME/.local/bin/cloudflared" ]; then
  curl -sL -m 300 -o "$HOME/.local/bin/cloudflared" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$HOME/.local/bin/cloudflared"
fi
"$HOME/.local/bin/cloudflared" --version

echo "==> 2/4 Installing user-scope systemd units"
mkdir -p "$USER_UNITS"
# Ensure .env + built client exist before enabling (fail loud, not silent)
[ -f server/.env ] || { echo "❌ server/.env missing — create it first"; exit 1; }
[ -f client/dist/index.html ] || { echo "❌ client/dist missing — run: npm run build --prefix client"; exit 1; }
cp deploy/smocha.service "$USER_UNITS/smocha.service"
cp deploy/cloudflared-smocha.service "$USER_UNITS/cloudflared-smocha.service"
systemctl --user daemon-reload

echo "==> 3/4 Enabling services (start now + at every login, restart on crash)"
systemctl --user enable --now smocha.service
systemctl --user enable --now cloudflared-smocha.service

echo "==> 4/4 Finding your public URL"
sleep 8
URL=$(journalctl --user -u cloudflared-smocha.service --no-pager -n 400 2>/dev/null \
  | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
if [ -n "$URL" ]; then
  echo
  echo "🎉 SMOCHA is LIVE at:  $URL"
  echo "Open it in any browser. Share it with the crew."
  echo
else
  echo "Couldn't auto-detect the URL yet. Find it with:"
  echo "   journalctl --user -u cloudflared-smocha.service --no-pager | grep trycloudflare | tail -1"
fi
echo
echo "Local health check:  curl http://127.0.0.1:5000/api/health"
echo "Optional (no card, one-time, needs sudo): run everything even before you log in:"
echo "   sudo loginctl enable-linger $USER"