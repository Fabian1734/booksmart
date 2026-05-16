-- In Supabase SQL Editor ausführen (einmalig), falls Tabelle noch fehlt.

CREATE TABLE IF NOT EXISTS question_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

CREATE INDEX IF NOT EXISTS question_ratings_question_id_idx ON question_ratings(question_id);

ALTER TABLE question_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_ratings_select_own" ON question_ratings;
CREATE POLICY "question_ratings_select_own" ON question_ratings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_ratings_insert_own" ON question_ratings;
CREATE POLICY "question_ratings_insert_own" ON question_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_ratings_update_own" ON question_ratings;
CREATE POLICY "question_ratings_update_own" ON question_ratings
  FOR UPDATE USING (auth.uid() = user_id);
