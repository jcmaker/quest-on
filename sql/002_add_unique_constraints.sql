-- 002: Unique constraints + atomic increment function for 40-student concurrency
-- Run this in Supabase SQL Editor BEFORE deploying the code changes.

-- ============================================================
-- 1. Clean up duplicate sessions (keep most recent per exam+student)
-- ============================================================
DELETE FROM sessions
WHERE id NOT IN (
  SELECT DISTINCT ON (exam_id, student_id) id
  FROM sessions
  ORDER BY exam_id, student_id, created_at DESC
);

-- 2. Add UNIQUE constraint on sessions(exam_id, student_id)
ALTER TABLE sessions
  ADD CONSTRAINT sessions_exam_student_unique UNIQUE (exam_id, student_id);

-- ============================================================
-- 3. Clean up duplicate submissions (keep most recent per session+q_idx)
-- ============================================================
DELETE FROM submissions
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, q_idx) id
  FROM submissions
  ORDER BY session_id, q_idx, created_at DESC
);

-- 4. Add UNIQUE constraint on submissions(session_id, q_idx)
ALTER TABLE submissions
  ADD CONSTRAINT submissions_session_qidx_unique UNIQUE (session_id, q_idx);

-- ============================================================
-- 5. Atomic student_count increment function (Fix 5a)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_student_count(p_exam_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE exams
  SET student_count = COALESCE(student_count, 0) + 1
  WHERE id = p_exam_id;
END;
$$ LANGUAGE plpgsql;
