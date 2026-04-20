-- AI 이벤트 추적 테이블
-- 모든 OpenAI API 호출의 토큰 사용량, 비용, 레이턴시를 기록

CREATE TABLE IF NOT EXISTS public.ai_events (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                  TEXT        NOT NULL,
  endpoint                  TEXT        NOT NULL,
  feature                   TEXT        NOT NULL,
  route                     TEXT        NOT NULL,
  model                     TEXT        NOT NULL,
  user_id                   TEXT,
  exam_id                   UUID        REFERENCES public.exams(id) ON DELETE SET NULL,
  session_id                UUID        REFERENCES public.sessions(id) ON DELETE SET NULL,
  q_idx                     INT,
  status                    TEXT        NOT NULL,
  attempt_count             INT         NOT NULL DEFAULT 1,
  latency_ms                INT,
  input_tokens              INT,
  output_tokens             INT,
  cached_input_tokens       INT,
  reasoning_tokens          INT,
  total_tokens              INT,
  estimated_cost_usd_micros BIGINT      NOT NULL DEFAULT 0,
  pricing_version           TEXT        NOT NULL,
  request_id                TEXT,
  response_id               TEXT,
  error_code                TEXT,
  metadata                  JSONB       NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_events_created_at        ON public.ai_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_feature_created_at ON public.ai_events (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_model_created_at  ON public.ai_events (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_exam_created_at   ON public.ai_events (exam_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_session_id        ON public.ai_events (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_events_user_created_at   ON public.ai_events (user_id, created_at DESC);

-- RLS: service role만 write, 인증된 사용자는 자신의 exam/session 이벤트 read
ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;

-- service_role은 모든 작업 허용 (백엔드 API 전용)
CREATE POLICY "service_role_all" ON public.ai_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
