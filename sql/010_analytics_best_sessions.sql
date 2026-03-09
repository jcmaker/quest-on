-- Phase 3C: 분석 라우트 세션 중복 제거 최적화
-- DISTINCT ON (student_id)를 사용하여 학생별 최적 세션을 DB 레벨에서 선택

CREATE OR REPLACE FUNCTION get_best_sessions_for_exam(p_exam_id UUID)
RETURNS TABLE (
  id UUID,
  student_id TEXT,
  used_clarifications INT,
  created_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ
) AS $$
  SELECT DISTINCT ON (s.student_id)
    s.id,
    s.student_id,
    s.used_clarifications,
    s.created_at,
    s.submitted_at
  FROM sessions s
  WHERE s.exam_id = p_exam_id
  ORDER BY
    s.student_id,
    -- 제출된 세션 우선
    CASE WHEN s.submitted_at IS NOT NULL THEN 0 ELSE 1 END,
    -- 같은 상태 내에서 가장 최근
    s.submitted_at DESC NULLS LAST,
    s.created_at DESC
$$ LANGUAGE sql STABLE;
