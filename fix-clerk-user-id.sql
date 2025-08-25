-- Fix instructor_id column to accept Clerk user IDs
-- Run this in your Supabase SQL Editor

-- 1. Check current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;

-- 2. Drop existing RLS policies first
DROP POLICY IF EXISTS "Instructors can view their own exams" ON exams;
DROP POLICY IF EXISTS "Instructors can insert their own exams" ON exams;
DROP POLICY IF EXISTS "Instructors can update their own exams" ON exams;
DROP POLICY IF EXISTS "Instructors can delete their own exams" ON exams;

-- 3. Change instructor_id column type from UUID to TEXT
ALTER TABLE exams ALTER COLUMN instructor_id TYPE TEXT;

-- 4. Recreate indexes
DROP INDEX IF EXISTS idx_exams_instructor_id;
CREATE INDEX idx_exams_instructor_id ON exams(instructor_id);

-- 5. Recreate RLS policies with TEXT comparison
CREATE POLICY "Instructors can view their own exams" ON exams
  FOR SELECT USING (instructor_id = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can insert their own exams" ON exams
  FOR INSERT WITH CHECK (instructor_id = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can update their own exams" ON exams
  FOR UPDATE USING (instructor_id = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can delete their own exams" ON exams
  FOR DELETE USING (instructor_id = auth.jwt() ->> 'sub');

-- 6. Verify the changes
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;
