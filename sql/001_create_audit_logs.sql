-- audit_logs 테이블 생성
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action      text NOT NULL,
  user_id     text NOT NULL,
  target_id   text NOT NULL,
  details     jsonb,
  created_at  timestamptz DEFAULT now() NOT NULL
);

-- 인덱스: action별 조회
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

-- 인덱스: user_id별 조회
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);

-- 인덱스: 시간순 조회
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- RLS 활성화 (Service Role Key로만 insert 허용)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service Role은 RLS를 우회하므로 별도 정책 불필요
-- 읽기 전용 정책 (admin 조회용)
CREATE POLICY "Allow read for service role" ON audit_logs
  FOR SELECT USING (true);
