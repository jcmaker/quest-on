# Schema & Migrations — Conventions

## Scope
Applies to `prisma/schema.prisma`, `prisma/migrations/`, and `database/`. Note: the project uses **Supabase JS** (`getSupabaseServer()` from `@/lib/supabase-server`) for all runtime queries — `@prisma/client` is installed but not imported in app code. `schema.prisma` exists primarily as a typed introspection of the live Supabase schema.

## Schema Changes
- Any DDL change (new table, column, index, constraint) MUST land in **both** places in the same commit:
  1. A SQL migration file under `database/[NNN]_description.sql` (this is the source of truth applied to Supabase).
  2. The corresponding model edit in `prisma/schema.prisma`, kept in sync via `npx prisma db pull` or manual edit.
- Never edit `schema.prisma` alone — Supabase will not pick it up.

## Migration Naming
`database/NNN_description.sql` — three-digit zero-padded sequential prefix (`007_add_final_answer_to_sessions.sql`). Snake_case description, verb-first when possible (`add_`, `create_`, `migrate_`). Each file must be idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) so reruns are safe.

## Backfill Policy
For data backfills touching many rows: batch in chunks (e.g. 1000 rows with `LIMIT`/`OFFSET` or keyset pagination), avoid long-held table locks, and never run synchronously inside a request handler. Place one-off scripts in `scripts/` and document the operator runbook.

## Raw SQL Rule
No raw SQL inside `app/api/**` route handlers. All runtime queries go through `getSupabaseServer()` (`.from("table").select(...)`) or `getSupabaseRLS()` for user-scoped reads. DDL/backfill SQL belongs in `database/*.sql` only.
