#!/usr/bin/env bash
# Run the Slap Notes QA sweep against a throwaway profile.
#
#   ./qa/run.sh [path-to-slap-notes-binary]
#
# Defaults to the installed app. Slap Notes must not already be running: the
# app binds a fixed port, so a running copy would be driven (and edited)
# instead of the throwaway one.
set -euo pipefail

APP="${1:-/opt/slap-notes/slap-notes}"
[ -x "$APP" ] || APP="/opt/Slap Notes/slap-notes"
CDP_PORT="${QA_CDP_PORT:-9223}"
APP_PORT=39741
QA_HOME="$(mktemp -d /tmp/slap-notes-qa.XXXXXX)"

if [ ! -x "$APP" ]; then
  echo "Slap Notes binary not found: $APP" >&2
  echo "Pass the path explicitly: ./qa/run.sh /path/to/slap-notes" >&2
  exit 2
fi

if ss -ltn 2>/dev/null | grep -q ":${APP_PORT}\b"; then
  echo "Port ${APP_PORT} is in use — quit Slap Notes first, then re-run." >&2
  echo "(The app uses a fixed port; otherwise these tests would edit your real notes.)" >&2
  exit 2
fi

VERSION="$(grep -ao '"version":"[0-9.]*"' "$(dirname "$APP")/resources/app.asar" 2>/dev/null | head -1 | cut -d'"' -f4 || true)"
echo "app:         $APP${VERSION:+  (version $VERSION)}"
echo "QA profile:  $QA_HOME"
SLAP_NOTES_DIR="$QA_HOME/data" "$APP" \
  --user-data-dir="$QA_HOME/profile" \
  --remote-debugging-port="$CDP_PORT" \
  --no-sandbox >"$QA_HOME/app.log" 2>&1 &
APP_PID=$!
trap 'kill $APP_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://127.0.0.1:${CDP_PORT}/json" && break
  sleep 1
done
sleep 3

cd "$(dirname "$0")"
SHOT_DIR="${SHOT_DIR:-./screenshots}"
mkdir -p "$SHOT_DIR"
SHOT_DIR="$SHOT_DIR" QA_CDP_PORT="$CDP_PORT" node run.js
STATUS=$?

echo "screenshots: $SHOT_DIR"
echo "app log:     $QA_HOME/app.log"
exit $STATUS
