-- 강사용 AI 에이전트 런 영속화 테이블
-- 에이전트 런(예: exam_creation)의 입력/스텝/산출물을 단일 테이블에 보관한다.
-- steps/input/output 은 JSON 컬럼. last_response_id/pending_tool_calls 는 러너 내부용.

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type               TEXT        NOT NULL,
  actor_id           TEXT        NOT NULL,
  actor_role         TEXT        NOT NULL,
  status             TEXT        NOT NULL,
  title              TEXT,
  input              JSONB       NOT NULL,
  steps              JSONB       NOT NULL DEFAULT '[]',
  output             JSONB,
  exam_id            UUID,
  last_response_id   TEXT,        -- 러너 내부용 — OpenAI Responses API 체이닝
  pending_tool_calls JSONB,       -- 러너 내부용 — 실행 대기 중인 function call
  error              TEXT,
  tokens_used        INT         NOT NULL DEFAULT 0,
  cost_usd_micros    BIGINT      NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_agent_runs_actor_id   ON public.agent_runs (actor_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status     ON public.agent_runs (status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON public.agent_runs (created_at);

-- RLS — agent_runs 는 백엔드 API(service_role)만 접근. anon/authenticated 차단.
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- service_role은 모든 작업 허용 (백엔드 API 전용)
CREATE POLICY "service_role_all" ON public.agent_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
