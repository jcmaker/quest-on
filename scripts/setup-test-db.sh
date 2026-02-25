#!/usr/bin/env bash
set -euo pipefail

echo "=== Quest-On Test DB Setup ==="

# 1. Start local Supabase (idempotent — skips if already running)
echo "[1/3] Starting local Supabase..."
supabase start || echo "Supabase already running"

# 2. Push Prisma schema to local DB
echo "[2/3] Pushing Prisma schema to local DB..."
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  npx prisma db push --force-reset --accept-data-loss

# 3. Apply SQL migrations (audit_logs, etc.)
echo "[3/3] Applying SQL migrations..."
for sql_file in sql/*.sql; do
  if [ -f "$sql_file" ]; then
    echo "  Applying: $sql_file"
    PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f "$sql_file" 2>/dev/null || true
  fi
done

echo ""
echo "=== Test DB ready ==="
echo "  Supabase URL: http://127.0.0.1:54321"
echo "  Postgres:     postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "  Studio:       http://127.0.0.1:54323"
