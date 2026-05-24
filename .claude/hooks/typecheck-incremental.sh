#!/usr/bin/env bash
# PostToolUse hook: run `tsc --noEmit` after .ts/.tsx edits.
# Exit codes:
#   0 — no-op or success (Claude sees nothing)
#   2 — typecheck failed; stderr is fed back to Claude as context
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

# Only react to TS/TSX edits
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Skip if file no longer exists (deletion)
[ -f "$FILE_PATH" ] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
fi

cd "$PROJECT_DIR" || exit 0

# Skip if tsconfig is missing (not a TS project root)
[ -f "tsconfig.json" ] || exit 0

OUTPUT=$(npx --no-install tsc --noEmit 2>&1)
EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  {
    echo "typecheck failed after editing $FILE_PATH:"
    printf '%s\n' "$OUTPUT" | head -50
  } >&2
  exit 2
fi

exit 0
