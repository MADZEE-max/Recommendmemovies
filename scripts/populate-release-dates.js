'use strict'

// Fetches release_date from TMDB for every movie in the DB and updates the column.
// Also deletes movies whose release_date is in the future.
//
// Prerequisites:
//   1. Run scripts/migrations/add-release-date.sql in Supabase SQL Editor first.
//   2. node --env-file=.env.local scripts/populate-release-dates.js
//
// Safe to re-run: already-populated rows are skipped.

const fs = require('fs'), path = require('path')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('='); if (eq < 0) continue
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const TMDB_API_KEY = process.env.TMDB_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!TMDB_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars: TMDB_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TMDB_BASE = 'https://api.themoviedb.org/3'
const DELAY_MS = 200
const BATCH_SIZE = 100

const today = new Date().toISOString().split('T')[0]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchReleaseDateFromTmdb(tmdbId) {
  const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data.release_date || null  // "YYYY-MM-DD" or ""
}

async function loadAllMovies() {
  const all = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('id,tmdb_id,title,year,release_date')
      .range(offset, offset + 999)
    if (error) { console.error('Load error:', error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function main() {
  console.log('=== populate-release-dates.js ===')
  console.log(`Today: ${today}`)
  console.log()

  // Check column exists
  const { error: colCheck } = await supabase
    .from('movies')
    .select('release_date')
    .limit(1)
  if (colCheck && colCheck.message.includes('release_date')) {
    console.error('ERROR: release_date column does not exist.')
    console.error('Run scripts/migrations/add-release-date.sql in Supabase SQL Editor first.')
    process.exit(1)
  }

  console.log('Loading all movies from DB...')
  const movies = await loadAllMovies()
  console.log(`Loaded ${movies.length} total movies.`)

  const needsUpdate = movies.filter(m => !m.release_date)
  const alreadyDone = movies.length - needsUpdate.length
  console.log(`Already have release_date: ${alreadyDone}`)
  console.log(`Need to fetch from TMDB: ${needsUpdate.length}`)
  console.log()

  if (needsUpdate.length === 0) {
    console.log('All movies already have release_date. Running cleanup...')
  } else {
    let fetched = 0, updated = 0, failed = 0, nullDate = 0

    for (let i = 0; i < needsUpdate.length; i++) {
      const movie = needsUpdate[i]
      await sleep(DELAY_MS)

      let releaseDate = null
      try {
        releaseDate = await fetchReleaseDateFromTmdb(movie.tmdb_id)
      } catch (err) {
        failed++
        if (failed <= 5) console.warn(`  WARN: TMDB fetch failed for ${movie.title}: ${err.message}`)
        continue
      }
      fetched++

      if (!releaseDate) {
        nullDate++
        // Store a sentinel so we don't re-fetch: use year-01-01 as best guess
        releaseDate = movie.year ? `${movie.year}-01-01` : null
      }

      const { error } = await supabase
        .from('movies')
        .update({ release_date: releaseDate })
        .eq('id', movie.id)
      if (error) {
        failed++
        if (failed <= 5) console.warn(`  WARN: DB update failed for ${movie.title}: ${error.message}`)
      } else {
        updated++
      }

      if ((i + 1) % 500 === 0) {
        const pct = Math.round((i + 1) / needsUpdate.length * 100)
        console.log(`  Progress: ${i + 1}/${needsUpdate.length} (${pct}%) — updated ${updated}, failed ${failed}`)
      }
    }

    console.log()
    console.log(`Done fetching: ${fetched} fetched, ${updated} updated, ${failed} failed, ${nullDate} had no date (used year-01-01 fallback)`)
  }

  // Cleanup: delete future movies
  console.log()
  console.log(`=== Cleanup: deleting movies with release_date > ${today} ===`)
  const { data: futureMovies, error: fetchFutureErr } = await supabase
    .from('movies')
    .select('id,tmdb_id,title,year,release_date')
    .gt('release_date', today)

  if (fetchFutureErr) {
    console.error('Error fetching future movies:', fetchFutureErr.message)
    return
  }

  console.log(`Found ${futureMovies.length} future/unreleased movies to delete:`)
  for (const m of futureMovies.slice(0, 30)) {
    console.log(`  [${m.release_date}] ${m.title}`)
  }
  if (futureMovies.length > 30) {
    console.log(`  ... and ${futureMovies.length - 30} more`)
  }

  if (futureMovies.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  // Delete in batches
  const ids = futureMovies.map(m => m.id)
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE)
    const { error: delErr } = await supabase.from('movies').delete().in('id', batch)
    if (delErr) {
      console.error(`Delete batch error: ${delErr.message}`)
    }
  }
  console.log(`Deleted ${futureMovies.length} unreleased movies.`)
  console.log()
  console.log('Done! The recommend API will now only serve released movies.')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
