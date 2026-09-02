#!/usr/bin/env bash
# Print the current Cloudflare quick-tunnel URL for SMOCHA.
journalctl --user -u cloudflared-smocha.service --no-pager -n 500 2>/dev/null \
  | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | tail -1