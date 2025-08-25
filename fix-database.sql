-- Quest-On Database Fix Script
-- Run this in your Supabase SQL Editor to fix the exams table

-- 1. Check current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;

-- 2. Drop existing table if it has wrong structure (BE CAREFUL - this will delete all data!)
-- DROP TABLE IF EXISTS exams CASCADE;

-- 3. Create the correct exams table
CREATE TABLE IF NOT EXISTS exams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  duration INTEGER NOT NULL,
  questions JSONB NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  instructor_id UUID NOT NULL,
  student_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Add description column if needed (optional)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS description TEXT;

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_exams_instructor_id ON exams(instructor_id);
CREATE INDEX IF NOT EXISTS idx_exams_code ON exams(code);

-- 6. Enable RLS
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
DROP POLICY IF EXISTS "Instructors can view their own exams" ON exams;
CREATE POLICY "Instructors can view their own exams" ON exams
  FOR SELECT USING (instructor_id::text = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Instructors can insert their own exams" ON exams;
CREATE POLICY "Instructors can insert their own exams" ON exams
  FOR INSERT WITH CHECK (instructor_id::text = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Instructors can update their own exams" ON exams;
CREATE POLICY "Instructors can update their own exams" ON exams
  FOR UPDATE USING (instructor_id::text = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Instructors can delete their own exams" ON exams;
CREATE POLICY "Instructors can delete their own exams" ON exams
  FOR DELETE USING (instructor_id::text = auth.jwt() ->> 'sub');

-- 8. Grant permissions (if using service role)
GRANT ALL ON exams TO service_role;
GRANT ALL ON exams TO authenticated;
GRANT ALL ON exams TO anon;

-- 9. Verify the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;
