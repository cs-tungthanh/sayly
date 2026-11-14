#!/usr/bin/env bash
# Regenerate the 1280x800 store screenshots in screenshots/ from the current build.
# The scenes (scripts/screenshots/scene.html) run the built content script and toolbar popup on a
# mock page, with stub.js answering for the extension APIs; capture.mjs drives headless Chrome.
# Usage: scripts/capture-screenshots.sh   (set CHROME to use another Chrome or Edge binary)
set -euo pipefail

cd "$(dirname "$0")/.."

CHROME="${CHROME:-}"
if [[ -z "$CHROME" ]]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      CHROME="$candidate"
      break
    fi
  done
fi
if [[ -z "$CHROME" ]]; then
  echo "Chrome not found; set CHROME to its binary." >&2
  exit 1
fi

pnpm run --silent build

WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# The scene loads the build from ext/. The toolbar popup gets the stub before its own script, and
# no transitions, so its switches aren't caught mid-slide
cp scripts/screenshots/scene.html scripts/screenshots/stub.js "$WORK/"
cp -R dist "$WORK/ext"
cp src/icons/icon128.png "$WORK/ext/icons/icon48.png"
sed 's#<link rel="stylesheet" href="popup.css">#&<script src="../stub.js"></script><style>*,*::before,*::after{transition:none!important}</style>#' \
  dist/popup.html > "$WORK/ext/toolbar.html"

# Module scripts don't load from file://, so serve the folder
PORT="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK" >/dev/null 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID"
for _ in $(seq 50); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/scene.html" && break
  sleep 0.1
done

node scripts/screenshots/capture.mjs "http://127.0.0.1:$PORT" "$CHROME" screenshots
