# Grading Pipeline Runbook

Read this before touching any grading, QStash, sweeper, or `ai_summary` related code.

---

## Overview

After a student submits an exam session:

1. **Objective questions** (`multiple-choice`, `true-false`) are auto-graded via a QStash `grade_question` chain.
2. **Chat/answer summaries** are generated on submit (no system prompt changes — existing summary generators):
   - **0 case questions** → pipeline ends at `objective_only_done` (no session summary).
   - **1 case question** → `session_summary` only (`sessions.ai_summary`).
   - **≥2 case questions** → `question_summary` per case (`grades.ai_summary`, `grade_type: ai_summary`) then `session_summary`.

Essay/case **scores** are not auto-graded on submit. Instructors set scores later via `/api/session/[sessionId]/case-grade/chat` and `/api/session/[sessionId]/case-grade/commit`. Commit does **not** re-run summary generation.

When an exam has zero objective and zero case submissions, `grading_progress` is set to `{ status: "completed", phase: "objective_only_done" }`.

In local dev without QStash configured, objective grading runs in-process inline. On Vercel without QStash, the trigger fails loudly with `reason: "qstash_not_configured"` — it never silently drops.

Legacy `exams.rubric` columns remain in the database but are no longer read by the grading pipeline.

---

## Required Env Vars

| Variable                      | Purpose                                              |
|-------------------------------|------------------------------------------------------|
| `QSTASH_TOKEN`                | QStash publish credential                            |
| `QSTASH_CURRENT_SIGNING_KEY`  | QStash signature verification                        |
| `QSTASH_NEXT_SIGNING_KEY`     | QStash signing key rotation                          |
| `CRON_SECRET`                 | Bearer token for `/api/cron/grading-sweep`           |
| `QSTASH_WORKER_BASE_URL` (preferred) or `NEXT_PUBLIC_APP_URL` | Stable domain QStash POSTs back to |

**Worker URL priority:** `QSTASH_WORKER_BASE_URL` > `NEXT_PUBLIC_APP_URL` > `VERCEL_URL`

`VERCEL_URL` is a last-resort fallback and logs a warning — it changes on every deploy and should not be used in production. For Vercel, set `NEXT_PUBLIC_APP_URL=https://quest-on.app`. For local dev via tunnel, set `QSTASH_WORKER_BASE_URL=https://<tunnel>.ngrok-free.app`.

---

## Sweeper Safeguards

The `/api/cron/grading-sweep` endpoint has built-in protections:

- Per-session 60-min cooldown (`last_swept_at`)
- 3-attempt cap (`sweep_attempts`)
- 10-session-per-run limit
- Auto-heal: sessions with a complete `ai_summary` are resolved automatically

After 3 failed attempts, a session is force-marked `failed`. Manual retry via:
```
PUT /api/session/[sessionId]/grade
```

---

## Emergency Switches

**`GRADING_SWEEP_DISABLED=1`**
Flips `/api/cron/grading-sweep` into a no-op — returns `200 { disabled: true }`. Use when a stuck session is causing the sweeper to burn invocations. Unset once the root cause is fixed.

---

## Auth Model for Grading Routes

QStash worker routes and cron routes do NOT use `currentUser()`. They verify:
- QStash routes: QStash signing key
- Cron routes: `CRON_SECRET` bearer token

See `docs/SECURITY.md` for the full exception list.
