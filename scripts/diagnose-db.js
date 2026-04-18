'use strict'

const fs = require('fs'), path = require('path')
function loadEnv() {
  const lines = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')
  for (const line of lines) {
    const eq = line.indexOf('='); if (eq < 0) continue
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim()
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  // 1. Check if release_date column exists by fetching one row and inspecting keys
  console.log('=== Checking release_date column ===')
  const { data: oneRow, error: oneErr } = await supabase.from('movies').select('id,title,year,release_date').limit(1)
  if (oneErr) {
    if (oneErr.message.includes('release_date')) {
      console.log('RESULT: release_date column does NOT exist in movies table')
    } else {
      console.log('Error fetching row:', oneErr.message)
    }
  } else {
    const cols = Object.keys(oneRow[0] || {})
    console.log('Columns returned:', cols.join(', '))
    console.log('release_date column EXISTS:', cols.includes('release_date'))
    if (cols.includes('release_date')) {
      console.log('Sample value:', oneRow[0].release_date)
    }
  }

  // 2. Count movies with future/null release_date
  console.log('\n=== Movies with release_date > today or NULL ===')
  const today = new Date().toISOString().split('T')[0]

  // Try fetching future release_date rows
  const { data: futureRows, error: futureErr } = await supabase
    .from('movies')
    .select('tmdb_id,title,year,release_date')
    .gt('release_date', today)
    .limit(50)
  if (futureErr) {
    console.log('Future query error (column likely missing):', futureErr.message)
  } else {
    console.log(`Movies with release_date > ${today}: ${futureRows.length}`)
    for (const r of futureRows.slice(0, 10)) {
      console.log(`  [${r.release_date}] ${r.title} (year=${r.year})`)
    }
  }

  // Count null release_date
  const { data: nullRows, error: nullErr } = await supabase
    .from('movies')
    .select('id', { count: 'exact', head: true })
    .is('release_date', null)
  if (nullErr) {
    console.log('Null release_date query error:', nullErr.message)
  } else {
    console.log(`Movies with release_date IS NULL: ${nullRows === null ? '(count not returned)' : nullRows.length}`)
  }

  // Also check total count
  const { count: totalCount } = await supabase.from('movies').select('id', { count: 'exact', head: true })
  console.log(`Total movies in DB: ${totalCount}`)

  // 3. Movies that appear unreleased (year > 2025)
  console.log('\n=== Movies with year > 2025 (future by year) ===')
  const { data: futureYear, error: fyErr } = await supabase
    .from('movies')
    .select('tmdb_id,title,year,release_date')
    .gt('year', 2025)
    .order('year', { ascending: true })
    .limit(50)
  if (fyErr) {
    console.log('Error:', fyErr.message)
  } else {
    console.log(`Movies with year > 2025: ${futureYear.length}`)
    for (const r of futureYear) {
      console.log(`  year=${r.year} release_date=${r.release_date ?? 'null'} | ${r.title}`)
    }
  }

  // 4. Foreign language tag breakdown
  console.log('\n=== Foreign language tag breakdown ===')
  // Fetch all non-English movies (paginated)
  let offset = 0, allForeign = []
  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('original_language,ai_tagged')
      .neq('original_language', 'en')
      .not('original_language', 'is', null)
      .range(offset, offset + 999)
    if (error || !data || data.length === 0) break
    allForeign.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  // Aggregate
  const langMap = {}
  for (const m of allForeign) {
    const l = m.original_language
    if (!langMap[l]) langMap[l] = { total: 0, tagged: 0 }
    langMap[l].total++
    if (m.ai_tagged) langMap[l].tagged++
  }
  const sorted = Object.entries(langMap).sort(([,a],[,b]) => b.total - a.total)
  console.log(`Total non-English movies: ${allForeign.length}`)
  console.log(`Total non-English tagged: ${allForeign.filter(m => m.ai_tagged).length}`)
  console.log('\nBreakdown:')
  console.log('language | total | tagged')
  for (const [lang, { total, tagged }] of sorted) {
    console.log(`  ${lang.padEnd(6)} | ${String(total).padStart(5)} | ${String(tagged).padStart(5)}`)
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
