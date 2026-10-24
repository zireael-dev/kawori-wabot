#!/usr/bin/env bash
# Keeps the bot running: starts it again whenever it exits (needed for /restart and /update
# when you don't use pm2 or systemd). Usage: bash scripts/loop.sh
cd "$(dirname "$0")/.." || exit 1
export KAWORI_SUPERVISED=1
while true; do
    node src/index.js
    echo "[loop] bot exited with code $?, starting again in 3s (Ctrl+C to stop)"
    sleep 3
done
