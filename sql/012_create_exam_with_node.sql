-- Create exam + exam_node in a single atomic transaction.
-- Avoids race conditions for sort_order and ensures consistency.
CREATE OR REPLACE FUNCTION create_exam_with_node(
  p_title TEXT,
  p_code TEXT,
  p_description TEXT,
  p_duration INT,
  p_questions JSONB,
  p_materials JSONB,
  p_materials_text JSONB,
  p_rubric JSONB,
  p_rubric_public BOOLEAN,
  p_chat_weight INT,
  p_status TEXT,
  p_instructor_id TEXT,
  p_created_at TIMESTAMPTZ,
  p_updated_at TIMESTAMPTZ,
  p_parent_folder_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_exam_id UUID;
  v_node_id UUID;
  v_sort_order INT;
  v_exam JSONB;
  v_node JSONB;
BEGIN
  -- Insert exam
  INSERT INTO exams (title, code, description, duration, questions, materials, materials_text, rubric, rubric_public, chat_weight, status, instructor_id, created_at, updated_at)
  VALUES (p_title, p_code, p_description, p_duration, p_questions, p_materials, p_materials_text, p_rubric, p_rubric_public, p_chat_weight, p_status, p_instructor_id, p_created_at, p_updated_at)
  RETURNING id INTO v_exam_id;

  -- Calculate next sort_order atomically
  IF p_parent_folder_id IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_sort_order
    FROM exam_nodes
    WHERE instructor_id = p_instructor_id AND parent_id IS NULL;
  ELSE
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_sort_order
    FROM exam_nodes
    WHERE instructor_id = p_instructor_id AND parent_id = p_parent_folder_id;
  END IF;

  -- Insert exam node
  INSERT INTO exam_nodes (instructor_id, parent_id, kind, name, exam_id, sort_order)
  VALUES (p_instructor_id, p_parent_folder_id, 'exam', p_title, v_exam_id, v_sort_order)
  RETURNING id INTO v_node_id;

  -- Build return JSON
  SELECT to_jsonb(e.*) INTO v_exam FROM exams e WHERE e.id = v_exam_id;
  SELECT to_jsonb(n.*) INTO v_node FROM exam_nodes n WHERE n.id = v_node_id;

  RETURN jsonb_build_object('exam', v_exam, 'exam_node', v_node);
END;
$$ LANGUAGE plpgsql;
