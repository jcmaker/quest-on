-- Allow an intermediate recoverable state while bulk grade commits are being written.

ALTER TABLE public.exam_grading_sessions
  DROP CONSTRAINT IF EXISTS exam_grading_sessions_status_check;

ALTER TABLE public.exam_grading_sessions
  ADD CONSTRAINT exam_grading_sessions_status_check
  CHECK (status IN ('draft', 'committing', 'committed'));
