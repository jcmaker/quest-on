-- Fix: autoGradeSession()이 grade_type 없이 저장한 기존 데이터 보정
-- comment 패턴으로 자동 채점 데이터를 식별하여 grade_type = 'auto'로 수정
UPDATE grades
SET grade_type = 'auto'
WHERE grade_type = 'manual'
  AND comment IS NOT NULL
  AND (comment LIKE '%채팅 단계:%' AND comment LIKE '%답안 단계:%');
