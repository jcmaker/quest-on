-- Fix instructor_id column issue
-- Run this in your Supabase SQL Editor

-- 1. First, let's check the current table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;

-- 2. Check if instructor_id column exists
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'exams' 
AND column_name = 'instructor_id';

-- 3. If instructor_id doesn't exist, add it
-- (This will only add the column if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'exams' 
        AND column_name = 'instructor_id'
    ) THEN
        ALTER TABLE exams ADD COLUMN instructor_id UUID;
    END IF;
END $$;

-- 4. If you have existing data and want to set a default instructor_id
-- (Replace 'your-user-id' with an actual UUID)
-- UPDATE exams SET instructor_id = 'your-user-id' WHERE instructor_id IS NULL;

-- 5. Make instructor_id NOT NULL after setting default values
-- ALTER TABLE exams ALTER COLUMN instructor_id SET NOT NULL;

-- 6. Add index for instructor_id
CREATE INDEX IF NOT EXISTS idx_exams_instructor_id ON exams(instructor_id);

-- 7. Update RLS policies to use instructor_id
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

-- 8. Verify the final table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'exams'
ORDER BY ordinal_position;
