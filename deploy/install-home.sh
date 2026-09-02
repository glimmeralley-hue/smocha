#!/usr/bin/env bash
# One-shot installer for the SMOCHA home deployment.
#   - installs cloudflared
#   - installs + enables the two systemd services (SMOCHA + tunnel)
#   - prints your public URL
#
# Run:  bash deploy/install-home.sh        (sudo will ask for your password)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/4 Installing cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  sudo pacman -S --noconfirm --needed cloudflared || {
    echo "pacman install failed — trying AUR helper";
    if command -v paru >/dev/null 2>&1; then paru -S --noconfirm cloudflared;
    elif command -v yay >/dev/null 2>&1; then yay -S --noconfirm cloudflared;
    else echo "❌ cloudflared not installed — install it manually (sudo pacman -S cloudflared)"; exit 1; fi
  }
fi
cloudflared --version

echo "==> 2/4 Installing systemd units"
sudo cp deploy/smocha.service /etc/systemd/system/smocha.service
sudo cp deploy/cloudflared-smocha.service /etc/systemd/system/cloudflared-smocha.service
sudo systemctl daemon-reload

echo "==> 3/4 Enabling services (start now + on every boot, restart on crash)"
sudo systemctl enable --now smocha.service
sudo systemctl enable --now cloudflared-smocha.service

echo "==> 4/4 Finding your public URL"
sleep 8
URL=$(sudo journalctl -u cloudflared-smocha.service --no-pager -n 400 2>/dev/null \
  | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1 || true)
if [ -n "$URL" ]; then
  echo
  echo "🎉 SMOCHA is LIVE at:  $URL"
  echo "Open it in any browser. Share it with the crew."
  echo
  echo "⚠️ Quick-tunnel URL changes if the tunnel restarts. Find the current one with:"
  echo "   sudo journalctl -u cloudflared-smocha.service --no-pager | grep trycloudflare | tail -1"
else
  echo "Couldn't auto-detect the URL yet. Check it with:"
  echo "   sudo journalctl -u cloudflared-smocha.service --no-pager | grep trycloudflare | tail -1"
fi
echo
echo "Local health check:  curl http://127.0.0.1:5000/api/health"