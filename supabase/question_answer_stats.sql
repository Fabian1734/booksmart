-- In Supabase: SQL Editor → New query → Run (einmalig)

CREATE TABLE IF NOT EXISTS question_answer_stats (
  question_id UUID PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  correct_count INT NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count INT NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_answer_stats_wrong_idx ON question_answer_stats (wrong_count DESC);
CREATE INDEX IF NOT EXISTS question_answer_stats_updated_idx ON question_answer_stats (updated_at DESC);

ALTER TABLE question_answer_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_answer_stats_admin_select" ON question_answer_stats;
CREATE POLICY "question_answer_stats_admin_select" ON question_answer_stats
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "question_answer_stats_admin_write" ON question_answer_stats;
CREATE POLICY "question_answer_stats_admin_write" ON question_answer_stats
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE OR REPLACE FUNCTION record_question_answer(p_question_id UUID, p_is_correct BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO question_answer_stats (question_id, correct_count, wrong_count)
  VALUES (
    p_question_id,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    CASE WHEN p_is_correct THEN 0 ELSE 1 END
  )
  ON CONFLICT (question_id) DO UPDATE SET
    correct_count = question_answer_stats.correct_count + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    wrong_count = question_answer_stats.wrong_count + CASE WHEN p_is_correct THEN 0 ELSE 1 END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION record_question_answer(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_question_answer(UUID, BOOLEAN) TO authenticated;
