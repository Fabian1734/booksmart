-- In Supabase: SQL Editor → New query → Run (einmalig)

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
CREATE INDEX IF NOT EXISTS question_ratings_created_at_idx ON question_ratings(created_at DESC);

ALTER TABLE question_ratings ENABLE ROW LEVEL SECURITY;

-- Spieler: eigene Bewertung lesen / anlegen / ändern
DROP POLICY IF EXISTS "question_ratings_select_own" ON question_ratings;
CREATE POLICY "question_ratings_select_own" ON question_ratings
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_ratings_insert_own" ON question_ratings;
CREATE POLICY "question_ratings_insert_own" ON question_ratings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_ratings_update_own" ON question_ratings;
CREATE POLICY "question_ratings_update_own" ON question_ratings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admin: alle Bewertungen einsehen (profiles.is_admin = true)
DROP POLICY IF EXISTS "question_ratings_admin_select" ON question_ratings;
CREATE POLICY "question_ratings_admin_select" ON question_ratings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
