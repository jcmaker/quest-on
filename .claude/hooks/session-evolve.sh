#!/usr/bin/env bash
# Stop hook: auto-commit changes to a small whitelist of memory/changelog files.
# Never commits source code. Never pushes. Failures are silent (exit 0).
#
# Safety model (two layers):
#   1. Guard:  if any non-whitelist file is already staged, abort entirely —
#              this prevents capturing unrelated staged work into the auto-commit.
#   2. Action: use `git commit -- <whitelist paths>` (path-limited commit),
#              which commits ONLY those paths regardless of what else is staged.
#              `git diff --quiet -- <path>` checks for unstaged changes;
#              the path-limited commit then stages + commits in one step.
set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
fi

cd "$PROJECT_DIR" || exit 0

# Whitelist — must be relative paths from project root
WHITELIST=("tasks/lessons.md" ".claude/CHANGELOG.md")

# Bail if not inside a git work tree
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Build a regex of whitelist paths for staged-area filtering
WL_REGEX="^($(printf '%s|' "${WHITELIST[@]}" | sed 's/[.]/\\./g; s/|$//'))$"

# Layer 1 — abort if other files are already staged.
# Auto-commit must never mix in unrelated work.
OTHER_STAGED=$(git diff --cached --name-only 2>/dev/null | grep -vE "$WL_REGEX" || true)
if [ -n "$OTHER_STAGED" ]; then
  exit 0
fi

# Determine which whitelist files have any change (unstaged or staged)
CHANGED_PATHS=()
for f in "${WHITELIST[@]}"; do
  [ -f "$f" ] || continue
  if ! git diff --quiet -- "$f" 2>/dev/null || ! git diff --cached --quiet -- "$f" 2>/dev/null; then
    CHANGED_PATHS+=("$f")
  fi
done

if [ ${#CHANGED_PATHS[@]} -eq 0 ]; then
  exit 0
fi

# Layer 2 — path-limited commit: only the whitelist files are committed,
# regardless of working-tree state of other files.
DATE=$(date +%Y-%m-%d)
git commit -m "chore(claude): auto-evolve $DATE" --no-verify -- "${CHANGED_PATHS[@]}" >/dev/null 2>&1 || true

exit 0
