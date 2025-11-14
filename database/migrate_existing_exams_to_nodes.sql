-- Migrate existing exams to exam_nodes
-- This script creates exam_nodes entries for all existing exams
-- Each exam will be placed at the root level (parent_id = null)

-- 기존 exams의 모든 시험을 exam_nodes로 마이그레이션
-- instructor_id는 TEXT 타입이므로 그대로 사용
INSERT INTO exam_nodes (instructor_id, parent_id, kind, name, exam_id, sort_order, created_at, updated_at)
SELECT 
  instructor_id::TEXT,  -- 명시적으로 TEXT로 캐스팅
  NULL as parent_id,  -- 루트에 배치
  'exam' as kind,
  title as name,  -- exams.title을 name으로 사용
  id as exam_id,
  ROW_NUMBER() OVER (PARTITION BY instructor_id ORDER BY created_at ASC) - 1 as sort_order,
  created_at,
  updated_at
FROM exams
WHERE NOT EXISTS (
  -- 이미 exam_nodes에 존재하는 exam은 제외
  SELECT 1 FROM exam_nodes 
  WHERE exam_nodes.exam_id = exams.id
);

-- 마이그레이션 결과 확인
SELECT 
  COUNT(*) as total_exams,
  COUNT(DISTINCT instructor_id) as total_instructors,
  COUNT(CASE WHEN kind = 'exam' THEN 1 END) as exam_nodes,
  COUNT(CASE WHEN kind = 'folder' THEN 1 END) as folder_nodes
FROM exam_nodes;

