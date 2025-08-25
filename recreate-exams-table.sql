-- Recreate exams table with correct structure
-- Run this in your Supabase SQL Editor

-- 1. Drop existing exams table (WARNING: This will delete all existing data!)
DROP TABLE IF EXISTS exams CASCADE;

-- 2. Create new exams table with all required columns
CREATE TABLE exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL,
  questions JSONB NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  instructor_id UUID NOT NULL,
  student_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes
CREATE INDEX idx_exams_instructor_id ON exams(instructor_id);
CREATE INDEX idx_exams_code ON exams(code);

-- 4. Enable RLS
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies
CREATE POLICY "Instructors can view their own exams" ON exams
  FOR SELECT USING (instructor_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can insert their own exams" ON exams
  FOR INSERT WITH CHECK (instructor_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can update their own exams" ON exams
  FOR UPDATE USING (instructor_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can delete their own exams" ON exams
  FOR DELETE USING (instructor_id::text = auth.jwt() ->> 'sub');

-- 6. Grant permissions
GRANT ALL ON exams TO service_role;
GRANT ALL ON exams TO authenticated;
GRANT ALL ON exams TO anon;

-- 7. Verify the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;
