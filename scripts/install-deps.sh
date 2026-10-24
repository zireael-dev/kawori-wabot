#!/usr/bin/env bash
# Installs everything the bot needs besides npm packages (Debian/Ubuntu).
# Usage: bash scripts/install-deps.sh
set -e

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

echo "==> System packages (ffmpeg, tesseract + Indonesian/English, python, pip)"
$SUDO apt-get update
$SUDO apt-get install -y ffmpeg tesseract-ocr tesseract-ocr-ind tesseract-ocr-eng python3 python3-pip curl git

echo "==> yt-dlp (standalone binary, so /updatedl can update it)"
$SUDO curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
$SUDO chmod a+rx /usr/local/bin/yt-dlp
[ -n "$SUDO" ] && $SUDO chown "$USER" /usr/local/bin/yt-dlp

echo "==> gallery-dl (only used for Instagram photo posts)"
pip install -U gallery-dl --break-system-packages 2>/dev/null || pip install -U gallery-dl

echo
echo "==> Installed versions"
ffmpeg -version | head -1
tesseract --version | head -1
yt-dlp --version
gallery-dl --version
echo
echo "Done. Next: npm install, then pm2 start ecosystem.config.js"
