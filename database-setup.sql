-- Quest-On Database Setup Script
-- Run this in your Supabase SQL Editor

-- Create exams table with all necessary columns
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

-- Create exam_submissions table
CREATE TABLE IF NOT EXISTS exam_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  answers JSONB NOT NULL,
  feedback TEXT,
  score INTEGER,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'completed')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create chat_interactions table
CREATE TABLE IF NOT EXISTS chat_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  question_id TEXT,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exams_instructor_id ON exams(instructor_id);
CREATE INDEX IF NOT EXISTS idx_exams_code ON exams(code);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_id ON exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student_id ON exam_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_chat_interactions_exam_id ON chat_interactions(exam_id);

-- Enable Row Level Security (RLS)
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_interactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for exams table
CREATE POLICY "Instructors can view their own exams" ON exams
  FOR SELECT USING (instructor_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can insert their own exams" ON exams
  FOR INSERT WITH CHECK (instructor_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can update their own exams" ON exams
  FOR UPDATE USING (instructor_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can delete their own exams" ON exams
  FOR DELETE USING (instructor_id::text = auth.jwt() ->> 'sub');

-- Create RLS policies for exam_submissions table
CREATE POLICY "Students can view their own submissions" ON exam_submissions
  FOR SELECT USING (student_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Students can insert their own submissions" ON exam_submissions
  FOR INSERT WITH CHECK (student_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can view submissions for their exams" ON exam_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exams 
      WHERE exams.id = exam_submissions.exam_id 
      AND exams.instructor_id::text = auth.jwt() ->> 'sub'
    )
  );

-- Create RLS policies for chat_interactions table
CREATE POLICY "Students can view their own chat interactions" ON chat_interactions
  FOR SELECT USING (student_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Students can insert their own chat interactions" ON chat_interactions
  FOR INSERT WITH CHECK (student_id::text = auth.jwt() ->> 'sub');

CREATE POLICY "Instructors can view chat interactions for their exams" ON chat_interactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exams 
      WHERE exams.id = chat_interactions.exam_id 
      AND exams.instructor_id::text = auth.jwt() ->> 'sub'
    )
  );

-- If you need to add description column to existing table:
-- ALTER TABLE exams ADD COLUMN IF NOT EXISTS description TEXT;
