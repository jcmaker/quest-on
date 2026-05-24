#!/usr/bin/env bash
# PostToolUse hook: warn if an app/api/**/route.ts handler doesn't reference rate-limit.
# Exit 2 → stderr surfaces to Claude as PostToolUse feedback (non-blocking).
set -u

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    sys.exit(0)
ti = data.get('tool_input', {}) or {}
print(ti.get('file_path', '') or '')
" 2>/dev/null)

# Only react to API route handlers
case "$FILE_PATH" in
  */app/api/*/route.ts|*/app/api/*/route.tsx) ;;
  *) exit 0 ;;
esac

# Skip internal/webhook/cron routes — these use signature verification instead
case "$FILE_PATH" in
  */app/api/internal/*) exit 0 ;;
  */app/api/webhooks/*) exit 0 ;;
  */app/api/cron/*) exit 0 ;;
  */app/api/health/*) exit 0 ;;
esac

[ -f "$FILE_PATH" ] || exit 0

if ! grep -qE "(rate[-_]?limit|rateLimit|checkRateLimit)" "$FILE_PATH"; then
  {
    echo "warn: rate-limit not detected in $FILE_PATH"
    echo "Public API routes should call checkRateLimitAsync(...) from lib/rate-limit.ts."
    echo "See app/api/CLAUDE.md (7-step checklist, step 2)."
  } >&2
  exit 2
fi

exit 0
