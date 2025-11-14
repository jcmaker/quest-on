-- Create exam_nodes table for folder/exam tree structure
-- This table manages the folder hierarchy and exam organization

CREATE TABLE IF NOT EXISTS exam_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 이 노드를 소유한 교수 (Clerk instructor_id 사용 - TEXT 타입)
  instructor_id TEXT NOT NULL,
  
  -- 부모 폴더 (루트면 null)
  parent_id UUID REFERENCES exam_nodes(id) ON DELETE CASCADE,
  
  -- 폴더냐 시험이냐
  kind TEXT NOT NULL CHECK (kind IN ('folder', 'exam')),
  
  -- 폴더/시험 이름 (리스트에 보여줄 이름)
  name TEXT NOT NULL,
  
  -- 정렬용
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- kind = 'exam'일 때만 사용 (실제 exams 테이블의 id)
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_exam_nodes_instructor_id ON exam_nodes(instructor_id);
CREATE INDEX IF NOT EXISTS idx_exam_nodes_parent_id ON exam_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_exam_nodes_kind ON exam_nodes(kind);
CREATE INDEX IF NOT EXISTS idx_exam_nodes_exam_id ON exam_nodes(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_nodes_sort_order ON exam_nodes(parent_id, sort_order);

-- RLS 활성화
ALTER TABLE exam_nodes ENABLE ROW LEVEL SECURITY;

-- RLS 정책 생성 (Clerk 사용자용)
-- Instructors can view their own nodes
DROP POLICY IF EXISTS "Instructors can view their own nodes" ON exam_nodes;
CREATE POLICY "Instructors can view their own nodes" ON exam_nodes
  FOR SELECT USING (instructor_id IS NOT NULL);

-- Instructors can insert their own nodes
DROP POLICY IF EXISTS "Instructors can insert their own nodes" ON exam_nodes;
CREATE POLICY "Instructors can insert their own nodes" ON exam_nodes
  FOR INSERT WITH CHECK (instructor_id IS NOT NULL);

-- Instructors can update their own nodes
DROP POLICY IF EXISTS "Instructors can update their own nodes" ON exam_nodes;
CREATE POLICY "Instructors can update their own nodes" ON exam_nodes
  FOR UPDATE USING (instructor_id IS NOT NULL);

-- Instructors can delete their own nodes
DROP POLICY IF EXISTS "Instructors can delete their own nodes" ON exam_nodes;
CREATE POLICY "Instructors can delete their own nodes" ON exam_nodes
  FOR DELETE USING (instructor_id IS NOT NULL);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_exam_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_nodes_updated_at
  BEFORE UPDATE ON exam_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_exam_nodes_updated_at();

-- 권한 부여
GRANT ALL ON exam_nodes TO service_role;
GRANT ALL ON exam_nodes TO authenticated;

