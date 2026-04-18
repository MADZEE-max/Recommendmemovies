-- Run this in the Supabase SQL Editor BEFORE running scripts/populate-release-dates.js
-- Dashboard → SQL Editor → New query → paste → Run

-- Add release_date column (TEXT stores "YYYY-MM-DD" from TMDB)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS release_date TEXT;

-- After this migration, run:
--   node --env-file=.env.local scripts/populate-release-dates.js
--
-- That script will:
--   1. Fetch release_date from TMDB for every movie that doesn't have one
--   2. Delete all movies where release_date > today
