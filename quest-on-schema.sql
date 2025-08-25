-- Quest-On Database Schema
-- Run this in your Supabase SQL Editor

-- Drop existing tables if they exist (BE CAREFUL - this will delete all data!)
-- DROP TABLE IF EXISTS submissions CASCADE;
-- DROP TABLE IF EXISTS messages CASCADE;
-- DROP TABLE IF EXISTS grades CASCADE;
-- DROP TABLE IF EXISTS questions CASCADE;
-- DROP TABLE IF EXISTS sessions CASCADE;
-- DROP TABLE IF EXISTS exams CASCADE;

-- Create exams table with all required fields
CREATE TABLE IF NOT EXISTS exams (
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

-- Create sessions table for exam sessions
CREATE TABLE IF NOT EXISTS sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  used_clarifications INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'completed', 'submitted'))
);

-- Create questions table (if you want to separate questions)
CREATE TABLE IF NOT EXISTS questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('essay', 'short-answer', 'multiple-choice')),
  prompt TEXT NOT NULL,
  ai_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create submissions table for student answers
CREATE TABLE IF NOT EXISTS submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  q_idx INTEGER NOT NULL,
  answer TEXT NOT NULL,
  ai_feedback JSONB,
  student_reply TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table for chat interactions
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  q_idx INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'ai')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create grades table for scoring
CREATE TABLE IF NOT EXISTS grades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  q_idx INTEGER NOT NULL,
  score INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exams_instructor_id ON exams(instructor_id);
CREATE INDEX IF NOT EXISTS idx_exams_code ON exams(code);
CREATE INDEX IF NOT EXISTS idx_sessions_exam_id ON sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_sessions_student_id ON sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_questions_exam_id ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_submissions_session_id ON submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_grades_session_id ON grades(session_id);

-- Enable Row Level Security (RLS)
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for exams table
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

-- Create RLS policies for sessions table
DROP POLICY IF EXISTS "Students can view their own sessions" ON sessions;
CREATE POLICY "Students can view their own sessions" ON sessions
  FOR SELECT USING (student_id::text = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Students can insert their own sessions" ON sessions;
CREATE POLICY "Students can insert their own sessions" ON sessions
  FOR INSERT WITH CHECK (student_id::text = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Instructors can view sessions for their exams" ON sessions;
CREATE POLICY "Instructors can view sessions for their exams" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exams 
      WHERE exams.id = sessions.exam_id 
      AND exams.instructor_id::text = auth.jwt() ->> 'sub'
    )
  );

-- Create RLS policies for questions table
DROP POLICY IF EXISTS "Instructors can manage questions for their exams" ON questions;
CREATE POLICY "Instructors can manage questions for their exams" ON questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM exams 
      WHERE exams.id = questions.exam_id 
      AND exams.instructor_id::text = auth.jwt() ->> 'sub'
    )
  );

-- Create RLS policies for submissions table
DROP POLICY IF EXISTS "Students can view their own submissions" ON submissions;
CREATE POLICY "Students can view their own submissions" ON submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = submissions.session_id 
      AND sessions.student_id::text = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "Students can insert their own submissions" ON submissions;
CREATE POLICY "Students can insert their own submissions" ON submissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = submissions.session_id 
      AND sessions.student_id::text = auth.jwt() ->> 'sub'
    )
  );

-- Create RLS policies for messages table
DROP POLICY IF EXISTS "Students can view their own messages" ON messages;
CREATE POLICY "Students can view their own messages" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = messages.session_id 
      AND sessions.student_id::text = auth.jwt() ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "Students can insert their own messages" ON messages;
CREATE POLICY "Students can insert their own messages" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = messages.session_id 
      AND sessions.student_id::text = auth.jwt() ->> 'sub'
    )
  );

-- Create RLS policies for grades table
DROP POLICY IF EXISTS "Instructors can view grades for their exams" ON grades;
CREATE POLICY "Instructors can view grades for their exams" ON grades
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      JOIN exams ON sessions.exam_id = exams.id
      WHERE sessions.id = grades.session_id 
      AND exams.instructor_id::text = auth.jwt() ->> 'sub'
    )
  );

-- Grant permissions
GRANT ALL ON exams TO service_role;
GRANT ALL ON sessions TO service_role;
GRANT ALL ON questions TO service_role;
GRANT ALL ON submissions TO service_role;
GRANT ALL ON messages TO service_role;
GRANT ALL ON grades TO service_role;

GRANT ALL ON exams TO authenticated;
GRANT ALL ON sessions TO authenticated;
GRANT ALL ON questions TO authenticated;
GRANT ALL ON submissions TO authenticated;
GRANT ALL ON messages TO authenticated;
GRANT ALL ON grades TO authenticated;

-- Verify the table structure
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('exams', 'sessions', 'questions', 'submissions', 'messages', 'grades')
ORDER BY table_name, ordinal_position;
