#!/usr/bin/env bash
# start.sh — start the full humidity tracker stack
#
# On macOS, Docker Desktop cannot pass USB/serial devices into containers.
# This script bridges the Arduino serial port to a TCP socket on the host,
# which the api container reaches via host.docker.internal:8899.
#
# Prerequisites: socat  →  brew install socat
#
# Usage:
#   ./start.sh                        # auto-detect serial port
#   SERIAL_DEV=/dev/cu.usbmodem1234 ./start.sh
#   ./start.sh --build                # force Docker image rebuild

set -euo pipefail

PROXY_PORT="${PROXY_PORT:-8899}"
SERIAL_BAUD="${SERIAL_BAUD:-9600}"

# ── Detect serial device ───────────────────────────────────────────────────
if [[ -z "${SERIAL_DEV:-}" ]]; then
  # Pick the first USB modem device found
  SERIAL_DEV=$(ls /dev/cu.usbmodem* /dev/cu.usbserial* /dev/ttyUSB* 2>/dev/null | head -1 || true)
  if [[ -z "$SERIAL_DEV" ]]; then
    echo "Error: no Arduino serial device found."
    echo "Connect the Arduino and retry, or set SERIAL_DEV explicitly:"
    echo "  SERIAL_DEV=/dev/cu.usbmodem1234 ./start.sh"
    exit 1
  fi
fi

echo "[serial] using device: $SERIAL_DEV"

# ── Check socat ────────────────────────────────────────────────────────────
if ! command -v socat &>/dev/null; then
  echo "Error: socat is not installed."
  echo "Install it with:  brew install socat"
  exit 1
fi

# ── Release the serial device if anything is holding it ────────────────────
# Kill by process name first (previous socat runs), then fall back to lsof
# to catch any stray process (old uvicorn, Arduino serial monitor, etc.).
pkill -f "socat.*TCP-LISTEN:${PROXY_PORT}" 2>/dev/null && echo "[proxy] stopped listener"  || true
pkill -f "socat.*${SERIAL_DEV}"            2>/dev/null && echo "[proxy] stopped children"  || true
# Any remaining process still holding the device?
PIDS=$(lsof -t "${SERIAL_DEV}" 2>/dev/null || true)
if [[ -n "$PIDS" ]]; then
  echo "[serial] releasing device held by PID(s): $PIDS"
  kill -9 $PIDS 2>/dev/null || true
fi
sleep 1

# ── Configure serial port baud rate via stty ──────────────────────────────
# socat's FILE: address doesn't accept termios speed options on macOS;
# set the baud rate at the OS level first so socat just forwards raw bytes.
stty -f "${SERIAL_DEV}" "${SERIAL_BAUD}" cs8 -cstopb -parenb raw

# ── Start serial → TCP proxy ───────────────────────────────────────────────
echo "[proxy] forwarding $SERIAL_DEV → TCP :${PROXY_PORT}"
socat TCP-LISTEN:${PROXY_PORT},reuseaddr,fork \
      FILE:${SERIAL_DEV},raw,echo=0 &
SOCAT_PID=$!
echo "[proxy] PID $SOCAT_PID"

# Kill the proxy (parent + any forked children) when this script exits
trap 'echo "[proxy] stopping"; pkill -f "socat.*${SERIAL_DEV}" 2>/dev/null || true; kill $SOCAT_PID 2>/dev/null || true' EXIT INT TERM

# ── Start Docker services ─────────────────────────────────────────────────
echo "[docker] starting all services..."
docker compose up "$@"
