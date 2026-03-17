#!/usr/bin/env bash
# stop.sh — stop the full humidity tracker stack

set -euo pipefail

PROXY_PORT="${PROXY_PORT:-8899}"
SOCAT_PID_FILE="${TMPDIR:-/tmp}/.humidity_tracker_socat.pid"

# ── Stop socat proxy ───────────────────────────────────────────────────────
if [[ -f "$SOCAT_PID_FILE" ]]; then
  SOCAT_PID=$(cat "$SOCAT_PID_FILE")
  if kill -0 "$SOCAT_PID" 2>/dev/null; then
    echo "[proxy] stopping PID $SOCAT_PID"
    kill "$SOCAT_PID" 2>/dev/null || true
  fi
  rm -f "$SOCAT_PID_FILE"
fi

# Kill any remaining socat children (--fork spawns per-connection children)
pkill -f "socat.*TCP-LISTEN:${PROXY_PORT}" 2>/dev/null && echo "[proxy] stopped listener" || true
pkill -f "socat.*cu\.usb"                  2>/dev/null && echo "[proxy] stopped children" || true

# ── Stop Docker services ──────────────────────────────────────────────────
echo "[docker] stopping all services..."
docker compose down

echo "Stack stopped."
