---
name: data-flow-audit
description: Use when investigating a suspected bug, data corruption, or auditing a domain for hidden logic flaws. Walks Phase 0 (data map) → Phase 1 (sibling code comparison) → Phase 2 (invariant check). Useful when "tests pass but something feels off" or before a high-risk migration.
---

# Data Flow Audit

## When to use
- A user-reported bug where tests pass but the symptom persists.
- Before a `database/NNN_*.sql` migration that backfills or rewrites existing rows.
- Auditing a domain (grading, sessions, ai_events, agent_runs) where multiple writers exist and you suspect drift.
- Two sibling routes / workers look similar but you can't tell if differences are intentional.

Do **not** use for greenfield code with no production data.

## Phase 0 — Build the data map
Goal: enumerate every place this data is written, read, or invalidated.

1. **Schema source.** Open `database/NNN_*.sql` for the table (or `prisma/schema.prisma` as a quick reference — but DDL is the source of truth). Note: PK, FKs, unique constraints, RLS policies, defaults, triggers, indexes.
2. **All writers.** `grep -rn "from(\"<table>\").insert\|.update\|.upsert\|.delete\|.rpc(\"" app/ lib/ scripts/`. List every route, worker, and sweeper that mutates the table. Note service-role vs RLS (`getSupabaseServer` vs `getSupabaseRLS`).
3. **All readers.** `grep -rn "from(\"<table>\").select\|.rpc(" app/ lib/ components/ hooks/`. Distinguish server (route) vs client (hook).
4. **External systems.** Does Supabase Auth / OpenAI / QStash / Upstash Redis touch this data? E.g. `ai_events` is written by `lib/ai-tracking.ts` from every OpenAI call site.
5. **Migrations + backfills.** Search `database/` for any prior alter on this table. Note column adds with defaults — old rows may have NULLs.

Output: a list like `exams: 12 writers (8 instructor routes, 2 internal workers, 2 admin tools), 31 readers`.

## Phase 1 — Sibling comparison
Goal: find unintended divergence between code that should behave the same.

1. **Same-domain siblings.** If auditing `app/api/exam/[examId]/start/route.ts`, also read `.../end/route.ts`, `.../pause/route.ts`. Look for: differing auth checks, differing rate-limit buckets, differing ownership column names, differing error codes for the same condition.
2. **Same-pattern, different domain.** E.g. all bulk-grade triggers. If `bulk-grade` and `bulk-case-grade` use different QStash retry policies, ask why.
3. **Migrations of the same shape.** Compare two recent `database/NNN_*.sql` files that add similar columns. Are RLS policies updated consistently? Are indexes added?
4. **Decide per difference.** Intentional (record why) or accident (file as P1+).

## Phase 2 — Invariant check
Goal: name the properties this data must satisfy and test each one.

1. **Uniqueness / referential integrity.** What enforces it? DB constraint? App-level check? If app-level, what races could violate it (two writers in same second)?
2. **Lifecycle invariants.** E.g. `sessions.submitted_at` must be set before grading kicks off. Who can clear it? Any code path that does `update({ submitted_at: null })`?
3. **Concurrency.** Two QStash workers picking the same `agent_runs` row → use `cancel_requested` + atomic update with `eq("status", "pending")`. Look for upserts without unique constraints.
4. **Counters / aggregates.** `used_clarifications`, token totals — incremented via RPC (`increment_used_clarifications`) to avoid lost-update? Or by app-level read-modify-write?
5. **Backfill safety.** If a future migration adds NOT NULL with a default, will the default be correct for legacy rows?

## Output format
Triage findings into:

- **P0 — data corruption in progress.** Wrong rows being written now. Stop ship. Example: ownership check missing on a mutating route.
- **P1 — latent bug.** Wrong under specific conditions (race, large data, migration). File issue with reproduction.
- **P2 — code smell / consistency.** Sibling routes diverge without reason. Refactor when convenient.

Always include: table, writer/reader path, observed vs expected, repro hint.
