-- Instructor–AI conversation logs during case-question grading (per session + q_idx)

CREATE TABLE IF NOT EXISTS public.grading_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  q_idx integer NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grading_chats_q_idx_non_negative CHECK (q_idx >= 0)
);

CREATE INDEX IF NOT EXISTS idx_grading_chats_session_q_idx_created
  ON public.grading_chats(session_id, q_idx, created_at);

ALTER TABLE public.grading_chats ENABLE ROW LEVEL SECURITY;

-- Server routes use service_role; deny direct client access by default
DROP POLICY IF EXISTS "service_role_all" ON public.grading_chats;
CREATE POLICY "service_role_all" ON public.grading_chats
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.grading_chats TO service_role;
