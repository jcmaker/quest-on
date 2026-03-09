CREATE TABLE IF NOT EXISTS ai_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  feature TEXT NOT NULL,
  route TEXT NOT NULL,
  model TEXT NOT NULL,
  user_id TEXT,
  exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  q_idx INTEGER,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_input_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd_micros BIGINT NOT NULL DEFAULT 0,
  pricing_version TEXT NOT NULL,
  request_id TEXT,
  response_id TEXT,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_events_created_at
  ON ai_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_events_feature_created_at
  ON ai_events (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_events_model_created_at
  ON ai_events (model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_events_exam_created_at
  ON ai_events (exam_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_events_session_id
  ON ai_events (session_id);

CREATE INDEX IF NOT EXISTS idx_ai_events_user_created_at
  ON ai_events (user_id, created_at DESC);
