-- Adds grading_progress JSONB column to sessions for real-time progress visibility.
--
-- Shape:
-- {
--   "status": "queued" | "running" | "completed" | "failed",
--   "total": number,
--   "completed": number,
--   "failed": number,
--   "updated_at": ISO8601 string
-- }
--
-- Populated/updated by autoGradeSession as each question finishes.
-- Consumed by the student report page and instructor grading list
-- to show "n/m 채점 완료" progress bars and retry affordances.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS grading_progress JSONB;

-- Lightweight index to find sessions still being graded (admin / ops).
CREATE INDEX IF NOT EXISTS idx_sessions_grading_status
  ON sessions ((grading_progress->>'status'))
  WHERE grading_progress IS NOT NULL;
