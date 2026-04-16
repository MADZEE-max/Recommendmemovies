-- RecommendMeMovies Database Schema

CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  poster_path TEXT,
  rating NUMERIC(3, 1),
  vote_count INTEGER,
  overview TEXT,
  original_language TEXT,
  genres TEXT[] DEFAULT '{}',
  ai_tagged BOOLEAN DEFAULT false,
  mood_tags TEXT[] DEFAULT '{}',
  energy_tags TEXT[] DEFAULT '{}',
  world_tags TEXT[] DEFAULT '{}',
  context_tags TEXT[] DEFAULT '{}',
  exclude_tags TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS availability (
  id SERIAL PRIMARY KEY,
  movie_id INTEGER REFERENCES movies(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,        -- 'flatrate', 'rent', 'buy', 'free', 'ads'
  price INTEGER,             -- in cents, nullable for subscription/free
  url TEXT,
  last_checked_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id SERIAL PRIMARY KEY,
  answers JSONB NOT NULL,
  recommended_movie_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_ai_tagged ON movies(ai_tagged);
CREATE INDEX IF NOT EXISTS idx_availability_movie_id ON availability(movie_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created_at ON quiz_sessions(created_at);

-- ============================================================
-- MIGRATION SQL (run if table already exists from old schema)
-- ============================================================
ALTER TABLE movies ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS ai_tagged BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_movies_ai_tagged ON movies(ai_tagged);
