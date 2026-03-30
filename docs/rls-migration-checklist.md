# RLS Migration Checklist

Routes that currently call `getSupabaseServer()`. Identifies which can migrate
to `getSupabaseRLS()` (RLS-enforced, user-scoped) and which must stay on the
service role client.

**Migration criteria:**
- Student routes reading/writing own data → **Migrate**
- Instructor routes querying only their own exams/nodes → **Migrate**
- Instructor routes reading any student data → **Keep service role**
- Chat/AI/grading/RAG routes → **Keep service role**
- Admin routes → **Keep service role**

---

## Routes Eligible for Migration (5)

| File | Tables Queried | Reason to Migrate |
|------|---------------|-------------------|
| `app/api/student/profile/route.ts` | `student_profiles` | Student reads/writes only their own profile row |
| `app/api/student/sessions/route.ts` | `sessions`, `exams`, `submissions`, `grades` | Student reads only their own sessions and related data |
| `app/api/student/sessions/stats/route.ts` | `sessions`, `exams`, `grades` | Student reads only their own session stats |
| `app/api/student/session/[sessionId]/report/route.ts` | `sessions`, `exams`, `submissions`, `messages`, `grades` | Student reads own session report; explicit ownership check already present |
| `app/api/session/[sessionId]/preflight/route.ts` | `sessions`, `exams` | Student reads own session + enrolled exam only |

---

## Routes to Keep on Service Role (26)

| File | Tables Queried | Reason to Keep |
|------|---------------|----------------|
| `app/api/session/[sessionId]/route.ts` | `sessions`, `exams`, `submissions`, `messages` | Dual-role: instructor and student paths; complex authorization logic |
| `app/api/session/[sessionId]/grade/route.ts` | `sessions`, `exams`, `submissions`, `messages`, `grades`, `paste_logs`, `student_profiles` | Instructor cross-user access; AI auto-grading system writes grades |
| `app/api/session/[sessionId]/live-messages/route.ts` | `sessions`, `exams`, `messages`, `student_profiles` | Instructor reading student messages across users |
| `app/api/exam/[examId]/start/route.ts` | `exams`, `sessions` | Instructor bulk-modifying all waiting student sessions |
| `app/api/exam/[examId]/end/route.ts` | `exams`, `sessions`, `submissions`, `messages` | Instructor force-submitting all sessions; data compression |
| `app/api/exam/[examId]/late-entry/route.ts` | `exams`, `sessions` | Instructor approving individual student late access |
| `app/api/exam/[examId]/sessions/route.ts` | `exams`, `sessions`, `student_profiles` | Instructor listing all student sessions for exam |
| `app/api/exam/[examId]/live-messages/route.ts` | `exams`, `sessions`, `messages`, `student_profiles` | Instructor monitoring all student messages in real time |
| `app/api/exam/[examId]/bulk-approve/route.ts` | `exams`, `sessions`, `grades` | Instructor bulk-approving auto grades across all students |
| `app/api/exam/[examId]/final-grades/route.ts` | `exams`, `sessions`, `grades` | Instructor viewing aggregated final grades across all students |
| `app/api/analytics/exam/[examId]/overview/route.ts` | `exams`, `sessions`, `grades`, `messages`, `submissions`, `student_profiles` | Instructor cross-user analytics aggregation |
| `app/api/instructor/generate-summary/route.ts` | `sessions`, `exams`, `submissions` | Instructor reads student submission data for AI summary |
| `app/api/feedback/route.ts` | `exams`, `sessions`, `submissions`, `messages` | Race-safe submission pipeline; session creation; grading trigger |
| `app/api/chat/route.ts` | `exams`, `sessions`, `messages` | Complex: temp session resolution, RAG lookup, AI message insert |
| `app/api/assignment-chat/route.ts` | `exams`, `messages` | Streaming AI chat; assignment-specific session logic |
| `app/api/feedback-chat/route.ts` | `exams`, `sessions`, `messages` | AI feedback pipeline; cross-table writes |
| `app/api/upload/route.ts` | Storage only | File upload pipeline |
| `app/api/upload/signed-url/route.ts` | Storage only | Signed URL generation |
| `app/api/extract-text/route.ts` | `exams` (rag_status) | Text extraction + RAG + embedding pipeline |
| `app/api/log/paste/route.ts` | `sessions`, `paste_logs` | Cheating detection log; error_log fallback |
| `app/api/internal/process-rag/route.ts` | `exams` | Background RAG processing; internal-secret auth |
| `app/api/admin/logs/route.ts` | `error_logs` | Admin-only; requires admin JWT |
| `app/api/supa/handlers/exam-handlers.ts` | `exams`, `exam_nodes` | Utility handler: complex exam creation, code deduplication |
| `app/api/supa/handlers/session-handlers.ts` | `sessions`, `exams` | Utility handler: session state, timer, gate logic |
| `app/api/supa/handlers/submission-handlers.ts` | `submissions`, `exams` | Utility handler: draft save, answer history tracking |
| `app/api/supa/handlers/drive-handlers.ts` | `exam_nodes`, `exams` | Utility handler: folder hierarchy management |

---

## Lib Files Using Service Role (keep as-is)

| File | Purpose |
|------|---------|
| `lib/grading.ts` | AI auto-grading; reads all sessions/submissions/messages for an exam |
| `lib/grading-trigger.ts` | Triggers grading pipeline |
| `lib/ai-tracking.ts` | Inserts ai_events rows for cost tracking |
| `lib/ai-events-store.ts` | AI event persistence |
| `lib/search-chunks.ts` | Vector similarity search across exam chunks |
| `lib/save-chunks.ts` | Writes RAG chunks to exam_material_chunks |

---

## Migration Execution Order

When ready to migrate the 5 eligible routes (future phase):

1. Apply `database/clerk_jwt_hook.sql` in Supabase SQL editor
2. Apply `database/enable_rls_clerk.sql` in Supabase SQL editor
3. Verify Supabase accepts Clerk JWTs (test with a known user token)
4. Migrate routes one at a time, verify in staging before prod:
   - `student/profile` (simplest — single table, direct ownership)
   - `student/sessions` (multi-table but all own-data)
   - `student/sessions/stats` (read-only aggregation)
   - `session/preflight` (read-only, two tables)
   - `student/session/report` (most complex — 5 tables)

---

## Notes & Ambiguities

**Student read access on `exams`:** The RLS file includes a `students_select_enrolled_exams`
policy not in the original spec. It is required for student routes (e.g. preflight) that
read exam status. Without it, migrated student routes would fail to fetch exam data.

**`paste_logs` and `error_logs` tables:** Not in the Prisma schema; raw SQL tables.
No RLS policies written — both are only accessed via service role routes.

**`ai_events` INSERT:** No INSERT policy is defined. All inserts go through
`lib/ai-tracking.ts` using the service role. An RLS client cannot insert ai_events rows.
