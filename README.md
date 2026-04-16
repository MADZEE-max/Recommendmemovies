# RecommendMeMovies

A movie recommendation app powered by a mood-based quiz. Movies are pulled from TMDB and AI-tagged by Claude for high-accuracy recommendations.

---

## Setup

### 1. Configure `.env.local`

Fill in all values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=<your Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your Supabase anon key>
TMDB_API_KEY=<your TMDB API key — free at themoviedb.org>
ANTHROPIC_API_KEY=<your Anthropic API key — console.anthropic.com>
```

### 2. Run schema migrations in Supabase

Open the **SQL Editor** in your Supabase dashboard and run `supabase-schema.sql`.

If your `movies` table already exists from a previous version, run only the migration block at the bottom of the file:

```sql
ALTER TABLE movies ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS ai_tagged BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_movies_ai_tagged ON movies(ai_tagged);
```

### 3. Seed the movie database

Start the dev server, then open this URL in a browser (or curl it in a terminal to watch progress):

```
http://localhost:3000/api/seed
```

The seed streams plain-text progress as it runs. It pulls ~5 000 movies across multiple languages and genres from TMDB. **This takes several minutes** due to TMDB rate limiting (250 ms between requests).

Movie breakdown:
| Category | Target |
|---|---|
| Popular English | 3 000 |
| English hidden gems (7.0+, 500–5 000 votes) | 500 |
| Korean | 400 |
| Spanish | 300 |
| Japanese | 300 |
| French | 250 |
| Italian | 150 |
| Documentaries | 150 |
| Hindi | 100 |
| Other international (de, fa, zh, sv, da, no) | ~100 |

### 4. AI-tag the movies

This step uses Claude (claude-sonnet-4-5) to assign mood, energy, world, context and exclude tags to every movie via a two-pass verification pipeline.

```bash
node scripts/ai-tag-movies.js
```

Or if your shell doesn't automatically load `.env.local`:

```bash
node --env-file=.env.local scripts/ai-tag-movies.js
```

The script is **resumable** — it filters on `ai_tagged = false`, so if it's interrupted you can safely re-run it and it picks up where it left off.

Progress is logged per batch:
```
Tagged 50/5000 (1%) — 49 saved, 1 skipped
Tagged 100/5000 (2%) — 98 saved, 2 skipped
...
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

> **Note:** The recommendation endpoint only returns movies with `ai_tagged = true`, so you'll start seeing results as soon as the first batch finishes — you don't need to wait for all 5 000 to be tagged.

---

## Architecture

| File | Purpose |
|---|---|
| `app/api/seed/route.ts` | Streams TMDB movie data into Supabase. No tags are assigned here. |
| `scripts/ai-tag-movies.js` | Two-pass Claude pipeline that tags all untagged movies. |
| `app/api/recommend/route.ts` | Quiz → tag mapping → scored movie recommendations. |
| `lib/supabase.ts` | Supabase client + shared `Movie` type. |
| `lib/quiz.ts` | Quiz answer → tag mapping + match reason generation. |
