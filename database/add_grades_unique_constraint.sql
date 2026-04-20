-- grades 테이블 (session_id, q_idx) 유니크 제약 추가
-- ON CONFLICT upsert가 정상 동작하도록 필요
-- 기존 중복 row를 정리한 뒤 실행해야 함

ALTER TABLE public.grades
  DROP CONSTRAINT IF EXISTS grades_session_id_q_idx_key;

ALTER TABLE public.grades
  ADD CONSTRAINT grades_session_id_q_idx_key UNIQUE (session_id, q_idx);
