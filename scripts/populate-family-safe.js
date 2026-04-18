'use strict'

// Fetches TMDB release_dates (certifications) for every movie in the DB and sets
// family_safe=true for G / PG / PG-13 US certifications.
//
// Prerequisites:
//   1. Run scripts/migrations/add-family-safe.sql in Supabase SQL Editor first.
//   2. node --env-file=.env.local scripts/populate-family-safe.js

const fs = require('fs')
const path = require('path')

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvFile()

const TMDB_API_KEY = process.env.TMDB_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!TMDB_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing TMDB_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TMDB_BASE = 'https://api.themoviedb.org/3'
const FAMILY_SAFE_CERTS = new Set(['G', 'PG', 'PG-13'])
const DELAY_MS = 150

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getCertification(tmdbId) {
  try {
    const url = `${TMDB_BASE}/movie/${tmdbId}/release_dates?api_key=${TMDB_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    // Prefer US cert, then GB, then any English-speaking country
    const priority = ['US', 'GB', 'AU', 'CA']
    for (const country of priority) {
      const entry = (data.results || []).find(r => r.iso_3166_1 === country)
      if (entry) {
        const cert = (entry.release_dates || [])
          .map(rd => rd.certification)
          .find(c => c && c.trim() !== '')
        if (cert) return cert.trim()
      }
    }
    return null
  } catch {
    return null
  }
}

async function main() {
  console.log('====================================================')
  console.log('populate-family-safe.js — fetching TMDB certifications')
  console.log('====================================================')

  // Load all movies (id + tmdb_id + original_language + title)
  let allMovies = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('id, tmdb_id, title, original_language')
      .range(offset, offset + PAGE - 1)
    if (error) { console.error('Load error:', error.message); process.exit(1) }
    if (!data || data.length === 0) break
    allMovies = allMovies.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  console.log(`Loaded ${allMovies.length} movies from DB.\n`)

  let certified = 0, familySafe = 0, notSafe = 0, noCert = 0, errors = 0
  const BATCH = 100

  for (let i = 0; i < allMovies.length; i++) {
    const movie = allMovies[i]
    await sleep(DELAY_MS)

    const cert = await getCertification(movie.tmdb_id)
    certified++

    let isSafe
    if (cert === null) {
      // No cert found — only flag English-language films without a cert as unsafe
      // Foreign films get a pass if they have no US cert (they're evaluated on language alone)
      isSafe = false
      noCert++
    } else {
      isSafe = FAMILY_SAFE_CERTS.has(cert)
      if (isSafe) familySafe++
      else notSafe++
    }

    const { error: updateErr } = await supabase
      .from('movies')
      .update({ family_safe: isSafe })
      .eq('id', movie.id)

    if (updateErr) {
      errors++
      if (errors <= 5) console.error(`  DB error for "${movie.title}": ${updateErr.message}`)
    }

    if ((i + 1) % BATCH === 0 || i === allMovies.length - 1) {
      console.log(`[${i + 1}/${allMovies.length}] family_safe=${familySafe} | not_safe=${notSafe} | no_cert=${noCert} | errors=${errors}`)
    }
  }

  console.log('\n====================================================')
  console.log(`Done!  ${allMovies.length} movies processed`)
  console.log(`  Family-safe (G/PG/PG-13): ${familySafe}`)
  console.log(`  Not family-safe:           ${notSafe}`)
  console.log(`  No certification found:    ${noCert}`)
  console.log(`  DB update errors:          ${errors}`)
  console.log('====================================================')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
