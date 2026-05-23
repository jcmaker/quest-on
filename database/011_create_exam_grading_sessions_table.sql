-- AI 일괄 채점 세션 (exam_id + instructor_id 당 하나, upsert로 관리)
-- proposed_grades: {session_id: {q_idx: {score, comment}}} — AI 제안 점수 임시 저장
-- status: "draft" 진행 중 | "committed" 확정 완료

CREATE TABLE IF NOT EXISTS public.exam_grading_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         uuid        NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  instructor_id   text        NOT NULL,
  proposed_grades jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'committed')),
  committed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT exam_grading_sessions_exam_instructor_key
    UNIQUE (exam_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_grading_sessions_exam_id
  ON public.exam_grading_sessions(exam_id);

ALTER TABLE public.exam_grading_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_exam_grading_sessions" ON public.exam_grading_sessions;
CREATE POLICY "service_role_all_exam_grading_sessions" ON public.exam_grading_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.exam_grading_sessions TO service_role;

-- AI 일괄 채점 대화 메시지 (row-per-message, grading_chats 패턴 동일)
-- race condition 방지: JSONB 배열 대신 개별 row INSERT

CREATE TABLE IF NOT EXISTS public.bulk_grading_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES public.exam_grading_sessions(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_grading_messages_session_created
  ON public.bulk_grading_messages(session_id, created_at);

ALTER TABLE public.bulk_grading_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_bulk_grading_messages" ON public.bulk_grading_messages;
CREATE POLICY "service_role_all_bulk_grading_messages" ON public.bulk_grading_messages
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.bulk_grading_messages TO service_role;
