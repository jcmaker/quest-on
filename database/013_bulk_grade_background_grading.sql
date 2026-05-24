-- ============================================================
-- 013: Bulk Grade Background Grading (QStash-based)
-- ============================================================
-- status 상태 확장 + 진행률 컬럼 추가 + merge_bulk_grading_result RPC

-- Step 1: status CHECK 제약 확장
ALTER TABLE public.exam_grading_sessions
  DROP CONSTRAINT IF EXISTS exam_grading_sessions_status_check;

ALTER TABLE public.exam_grading_sessions
  ADD CONSTRAINT exam_grading_sessions_status_check
  CHECK (status IN (
    'draft',
    'grading',          -- QStash 잡 발행 후 진행 중
    'grading_done',     -- 모든 잡 완료 (검토 대기)
    'grading_failed',   -- 전부 실패 (재시도 가능)
    'committing',
    'committed'
  ));

-- Step 2: 진행률 + 기준 컬럼
ALTER TABLE public.exam_grading_sessions
  ADD COLUMN IF NOT EXISTS grading_criteria       text,
  ADD COLUMN IF NOT EXISTS grading_total          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grading_completed      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grading_failed_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_session_ids   jsonb   NOT NULL DEFAULT '[]'::jsonb;

-- Step 3: merge_bulk_grading_result — 원자적 JSONB merge + 카운터 증가
-- SELECT FOR UPDATE로 row lock, 멱등성 체크 포함
-- 항상 200 ack (failure도 카운터 증가로 처리)

CREATE OR REPLACE FUNCTION public.merge_bulk_grading_result(
  p_session_id    uuid,
  p_student_sid   text,
  p_grades_json   jsonb,
  p_success       boolean
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_total     integer;
  v_completed integer;
  v_failed    integer;
  v_done      boolean;
BEGIN
  -- row-level exclusive lock
  SELECT grading_total, grading_completed, grading_failed_count
    INTO v_total, v_completed, v_failed
    FROM public.exam_grading_sessions
   WHERE id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  -- 멱등성: 이미 이 학생이 proposed_grades에 있으면 skip
  IF (
    SELECT proposed_grades ? p_student_sid
      FROM public.exam_grading_sessions
     WHERE id = p_session_id
  ) THEN
    RETURN;
  END IF;

  -- 완료 판정 (이번 업데이트 후)
  v_done := false;

  IF p_success THEN
    v_done := (v_completed + 1) + v_failed >= v_total;
    UPDATE public.exam_grading_sessions
       SET proposed_grades    = proposed_grades || jsonb_build_object(p_student_sid, p_grades_json),
           grading_completed  = grading_completed + 1,
           status = CASE
             WHEN v_done THEN 'grading_done'
             ELSE status
           END,
           updated_at = now()
     WHERE id = p_session_id;
  ELSE
    v_done := v_completed + (v_failed + 1) >= v_total;
    UPDATE public.exam_grading_sessions
       SET grading_failed_count = grading_failed_count + 1,
           status = CASE
             WHEN v_done THEN
               CASE WHEN v_completed = 0 THEN 'grading_failed' ELSE 'grading_done' END
             ELSE status
           END,
           updated_at = now()
     WHERE id = p_session_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_bulk_grading_result TO service_role;
