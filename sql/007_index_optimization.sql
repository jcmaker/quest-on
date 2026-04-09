-- Migration: Index optimization
-- Removes redundant indexes and adds missing ones for query patterns.
-- RLS policy changes are intentionally excluded pending Clerk JWT hook setup.

-- ── 1. Drop redundant indexes ─────────────────────────────────────────────

-- exams.code already has a unique constraint (code_key) that serves as an index
DROP INDEX IF EXISTS idx_exams_code;

-- sessions: sessions_exam_student_unique covers the access pattern;
-- a separate index on compressed_session_data is not useful for queries
DROP INDEX IF EXISTS idx_sessions_compressed_data;

-- ── 2. Add missing indexes ────────────────────────────────────────────────

-- Exam list sorted by creation date (instructor dashboard, admin views)
CREATE INDEX IF NOT EXISTS idx_exams_created_at
  ON public.exams USING btree (created_at DESC);

-- final-grades query: filters grades by session_id then grade_type
-- Composite covers both the lookup and the type filter in one scan
CREATE INDEX IF NOT EXISTS idx_grades_session_grade_type
  ON public.grades USING btree (session_id, grade_type);

-- Heartbeat updates only touch active (unsubmitted) sessions.
-- Partial index keeps it small and avoids scanning historical rows.
CREATE INDEX IF NOT EXISTS idx_sessions_id_submitted
  ON public.sessions USING btree (id)
  WHERE submitted_at IS NULL;
