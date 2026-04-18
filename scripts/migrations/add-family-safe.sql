-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Adds family_safe column to movies table. Default false = excluded from Family results.

ALTER TABLE movies ADD COLUMN IF NOT EXISTS family_safe BOOLEAN NOT NULL DEFAULT false;

-- After running this, execute: node scripts/populate-family-safe.js
-- That script will fetch TMDB certifications and mark G/PG/PG-13 films as family_safe=true.
