#!/usr/bin/env bash
set -euo pipefail
BROWSER="${CHROME_BIN:-}"
if [[ -z "$BROWSER" ]]; then
  for candidate in chromium google-chrome google-chrome-stable chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then BROWSER="$(command -v "$candidate")"; break; fi
  done
fi
if [[ -z "$BROWSER" ]]; then
  echo "No Chromium/Chrome executable found" >&2; exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$(mktemp)"
trap 'rm -f "$OUTPUT"' EXIT
URL="file://$ROOT/benchmark/harness.html?file=$ROOT/tests/fixtures/dom-basic.html&host=docs.example.test"
"$BROWSER" --headless --disable-gpu --no-sandbox --allow-file-access-from-files --dump-dom --virtual-time-budget=10000 "$URL" >"$OUTPUT" 2>/dev/null
node "$ROOT/tests/benchmark-harness.test.mjs" "$OUTPUT"
