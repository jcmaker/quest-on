-- 과제(assignment) 최종답안 저장용 컬럼 추가
-- 학생이 채팅 기반 리서치 후 제출 직전 작성하는 "정리된 최종답안"을 세션 단위로 저장한다.
-- timed-quiz의 per-question submissions 테이블과는 별개 — quiz finalize 경로의 q_idx=0 채팅 스냅샷과 충돌 회피.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS final_answer TEXT,
  ADD COLUMN IF NOT EXISTS final_answer_updated_at TIMESTAMPTZ;
