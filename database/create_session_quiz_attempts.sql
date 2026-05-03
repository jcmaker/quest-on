CREATE TABLE IF NOT EXISTS session_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  questions jsonb NOT NULL,
  answers jsonb DEFAULT '{}'::jsonb,
  score integer,
  total_questions integer NOT NULL DEFAULT 0,
  time_limit_seconds integer NOT NULL DEFAULT 15,
  started_at timestamptz,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT session_quiz_attempts_session_id_key UNIQUE (session_id),
  CONSTRAINT session_quiz_attempts_status_check
    CHECK (status IN ('pending', 'in_progress', 'submitted')),
  CONSTRAINT session_quiz_attempts_score_check
    CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);

CREATE INDEX IF NOT EXISTS idx_session_quiz_attempts_exam_id
  ON session_quiz_attempts(exam_id);

CREATE INDEX IF NOT EXISTS idx_session_quiz_attempts_student_id
  ON session_quiz_attempts(student_id);

CREATE INDEX IF NOT EXISTS idx_session_quiz_attempts_status
  ON session_quiz_attempts(status);
