-- 성능 인덱스 추가 (2026-03-15)
-- exam_nodes, sessions 테이블 쿼리 최적화용
-- 기존 데이터/테이블 구조 변경 없음

-- 드라이브 폴더 조회: instructor_id + kind 필터 (getFolderContents)
CREATE INDEX IF NOT EXISTS idx_exam_nodes_instructor_kind
  ON exam_nodes(instructor_id, kind);

-- 드라이브 폴더 조회: parent_id + instructor_id 필터 (getFolderContents)
CREATE INDEX IF NOT EXISTS idx_exam_nodes_parent_instructor
  ON exam_nodes(parent_id, instructor_id);

-- 세션 상태별 조회 (exam_id + status 필터)
CREATE INDEX IF NOT EXISTS idx_sessions_exam_status
  ON sessions(exam_id, status);

-- 학생 수 집계: exam_id + student_id (drive-handlers student count)
CREATE INDEX IF NOT EXISTS idx_sessions_exam_student
  ON sessions(exam_id, student_id);
