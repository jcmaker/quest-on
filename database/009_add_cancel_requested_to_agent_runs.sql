-- agent_runs 에 협조적 취소(cooperative cancellation) 플래그 추가
-- 강사가 진행 중인 런의 중단을 요청하면 cancel_requested=true 로 세팅하고,
-- 러너가 툴콜 루프 각 반복 시작 시 이 값을 다시 읽어 취소 여부를 확인한다.
-- 러너는 취소를 처리한 뒤 이 플래그를 다시 false 로 리셋한다.

ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;
