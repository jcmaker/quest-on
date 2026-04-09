-- Atomically submits an exam session and upserts all answer submissions.
-- Guards against double-submit by checking submitted_at with a row lock.
CREATE OR REPLACE FUNCTION submit_exam_atomic(
  p_session_id          UUID,
  p_student_id          TEXT,
  p_exam_id             UUID,
  p_submitted_at        TIMESTAMPTZ,
  p_compressed_data     TEXT,
  p_compression_metadata JSONB,
  p_submissions         JSONB
) RETURNS JSONB AS $$
DECLARE
  v_submitted_at TIMESTAMPTZ;
BEGIN
  -- Lock the session row to prevent concurrent submits
  SELECT submitted_at INTO v_submitted_at
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_submitted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_submitted');
  END IF;

  -- Mark session as submitted
  UPDATE sessions SET
    status                  = 'submitted',
    submitted_at            = p_submitted_at,
    compressed_session_data = p_compressed_data,
    compression_metadata    = p_compression_metadata
  WHERE id = p_session_id;

  -- Upsert all answer submissions
  INSERT INTO submissions (session_id, q_idx, answer, compressed_answer_data, compression_metadata)
  SELECT
    p_session_id,
    (sub->>'q_idx')::INT,
    COALESCE(sub->>'answer', ''),
    sub->>'compressed_answer_data',
    COALESCE((sub->'compression_metadata'), '{}'::JSONB)
  FROM jsonb_array_elements(p_submissions) AS sub
  ON CONFLICT (session_id, q_idx) DO UPDATE SET
    answer                 = EXCLUDED.answer,
    compressed_answer_data = EXCLUDED.compressed_answer_data,
    compression_metadata   = EXCLUDED.compression_metadata,
    updated_at             = NOW();

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
