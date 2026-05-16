-- In Supabase: SQL Editor → New query → Run (einmalig)

CREATE TABLE IF NOT EXISTS user_book_answer_stats (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  correct_count INT NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count INT NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS user_book_answer_stats_user_idx ON user_book_answer_stats (user_id);
CREATE INDEX IF NOT EXISTS user_book_answer_stats_wrong_idx ON user_book_answer_stats (user_id, wrong_count DESC);

ALTER TABLE user_book_answer_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_book_answer_stats_select_own" ON user_book_answer_stats;
CREATE POLICY "user_book_answer_stats_select_own" ON user_book_answer_stats
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_book_answer_stats_write_own" ON user_book_answer_stats;
CREATE POLICY "user_book_answer_stats_write_own" ON user_book_answer_stats
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION record_user_book_answer(p_book_id UUID, p_is_correct BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO user_book_answer_stats (user_id, book_id, correct_count, wrong_count)
  VALUES (
    v_user_id,
    p_book_id,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    CASE WHEN p_is_correct THEN 0 ELSE 1 END
  )
  ON CONFLICT (user_id, book_id) DO UPDATE SET
    correct_count = user_book_answer_stats.correct_count + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    wrong_count = user_book_answer_stats.wrong_count + CASE WHEN p_is_correct THEN 0 ELSE 1 END,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION record_user_book_answer(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_user_book_answer(UUID, BOOLEAN) TO authenticated;
