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
URL="file://$(cd "$(dirname "$0")" && pwd)/dom-extractor-browser.html"
OUTPUT="$($BROWSER --headless --disable-gpu --no-sandbox --allow-file-access-from-files --dump-dom "$URL" 2>/dev/null)"
if ! grep -q 'id="svoc-test-result">PASS 5/5<' <<<"$OUTPUT"; then
  echo "$OUTPUT" | grep 'svoc-test-result' || true
  exit 1
fi
echo "DOM extractor: 5/5 checks passed (headless Chromium)"
