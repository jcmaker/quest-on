-- Phase 3A: 추가 성능 인덱스
-- grades.grade_type 인덱스 (auto/manual 필터링 가속)
CREATE INDEX IF NOT EXISTS idx_grades_grade_type ON grades (grade_type);

-- messages (session_id, q_idx, created_at DESC) 인덱스 (채팅 이력 조회 가속)
CREATE INDEX IF NOT EXISTS idx_messages_session_qidx_created ON messages (session_id, q_idx, created_at DESC);
