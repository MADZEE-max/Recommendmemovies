'use strict'

// Automated recommendation quality tester.
// Runs 50 quiz combos × 5 calls each, flags suspicious results.
//
// Usage:  node scripts/test-recommendations.js
// Requires the dev server running at http://localhost:3000 (or set PORT env var).

const BASE_URL = process.env.PORT
  ? `http://localhost:${process.env.PORT}`
  : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')

const ADULT_TITLE_SIGNALS = [
  'erotic', 'sensual', 'molester', 'stepmother', 'stepdaughter',
  'stepsister', 'stepbrother', ' lust', 'naked', 'seduction', 'xxx', 'porn',
  'hooker', 'escort', 'stripper', 'fetish', 'bondage', 'nympho', 'milf',
  'affair diary', 'housewife', 'cheating wife', 'bath scene', 'shower scene',
  'lingerie diary', 'sex diary', 'orgy', 'incest', 'prostitute', 'massage parlor', 'horny',
  'stay date', 'soft core', 'hardcore', 'adult video', 'bathhouse',
  'intimate diary', 'cattle towards', 'forbidden fruits',
]

// All possible answer values from quiz.ts
const Q1 = ['Solo couch night', 'Date night', 'Friends over', 'Family time']
const Q2 = ['Make me laugh', 'Keep me on edge', 'Make me feel something', 'Blow my mind', 'Scare me', 'Inspire me']
const Q3 = ['Zero — just entertain me', 'Some — I like a good story', 'Full — challenge me']
const Q4_OPTIONS = ['Violence', 'Jump scares', 'Heavy themes', 'Sad endings', "Nothing — I'm open"]
const Q5 = ['Real and grounded', 'Slightly weird', 'Full fantasy/sci-fi', 'Based on true events', 'Documentary']
const Q6 = ['Show me popular hits', 'Hidden gems only', 'Non-English films', 'No preference']

// 50 handpicked combos covering all contexts, vibes, worlds, preferences
const COMBOS = [
  // Solo — all vibes
  { q1: 'Solo couch night', q2: 'Make me laugh',        q3: 'Zero — just entertain me',    q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'No preference' },
  { q1: 'Solo couch night', q2: 'Keep me on edge',      q3: 'Some — I like a good story',  q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'Show me popular hits' },
  { q1: 'Solo couch night', q2: 'Make me feel something',q3: 'Full — challenge me',         q4: ['Sad endings'],         q5: 'Real and grounded',   q6: 'Hidden gems only' },
  { q1: 'Solo couch night', q2: 'Blow my mind',         q3: 'Full — challenge me',          q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi', q6: 'No preference' },
  { q1: 'Solo couch night', q2: 'Scare me',             q3: 'Zero — just entertain me',    q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'No preference' },
  { q1: 'Solo couch night', q2: 'Inspire me',           q3: 'Some — I like a good story',  q4: ['Heavy themes'],        q5: 'Based on true events', q6: 'Show me popular hits' },
  { q1: 'Solo couch night', q2: 'Blow my mind',         q3: 'Full — challenge me',          q4: ["Nothing — I'm open"], q5: 'Real and grounded',   q6: 'Non-English films' },
  { q1: 'Solo couch night', q2: 'Keep me on edge',      q3: 'Full — challenge me',          q4: ['Violence'],            q5: 'Based on true events', q6: 'No preference' },
  // Date night — all vibes
  { q1: 'Date night', q2: 'Make me laugh',        q3: 'Zero — just entertain me',    q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'Show me popular hits' },
  { q1: 'Date night', q2: 'Make me feel something',q3: 'Some — I like a good story', q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'No preference' },
  { q1: 'Date night', q2: 'Inspire me',           q3: 'Some — I like a good story',  q4: ['Sad endings'],         q5: 'Based on true events', q6: 'No preference' },
  { q1: 'Date night', q2: 'Blow my mind',         q3: 'Full — challenge me',          q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'Non-English films' },
  { q1: 'Date night', q2: 'Keep me on edge',      q3: 'Some — I like a good story',  q4: ['Jump scares'],         q5: 'Real and grounded',   q6: 'No preference' },
  { q1: 'Date night', q2: 'Scare me',             q3: 'Zero — just entertain me',    q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'No preference' },
  // Friends — all vibes
  { q1: 'Friends over', q2: 'Make me laugh',       q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'Show me popular hits' },
  { q1: 'Friends over', q2: 'Keep me on edge',     q3: 'Some — I like a good story', q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'No preference' },
  { q1: 'Friends over', q2: 'Scare me',            q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'No preference' },
  { q1: 'Friends over', q2: 'Blow my mind',        q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'Show me popular hits' },
  { q1: 'Friends over', q2: 'Make me feel something',q3: 'Some — I like a good story', q4: ['Heavy themes'],     q5: 'Based on true events', q6: 'No preference' },
  { q1: 'Friends over', q2: 'Inspire me',          q3: 'Some — I like a good story', q4: ["Nothing — I'm open"], q5: 'Based on true events', q6: 'No preference' },
  // Family — all vibes
  { q1: 'Family time', q2: 'Make me laugh',        q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'Show me popular hits' },
  { q1: 'Family time', q2: 'Inspire me',           q3: 'Some — I like a good story', q4: ["Nothing — I'm open"], q5: 'Based on true events', q6: 'No preference' },
  { q1: 'Family time', q2: 'Make me feel something',q3: 'Some — I like a good story',q4: ['Sad endings'],        q5: 'Real and grounded',    q6: 'No preference' },
  { q1: 'Family time', q2: 'Blow my mind',         q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'Show me popular hits' },
  { q1: 'Family time', q2: 'Make me laugh',        q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'No preference' },
  // Documentary combos
  { q1: 'Solo couch night', q2: 'Inspire me',      q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Documentary',          q6: 'No preference' },
  { q1: 'Date night',       q2: 'Blow my mind',    q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Documentary',          q6: 'No preference' },
  // Non-English combos
  { q1: 'Solo couch night', q2: 'Keep me on edge', q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'Non-English films' },
  { q1: 'Solo couch night', q2: 'Make me feel something',q3:'Some — I like a good story', q4: ["Nothing — I'm open"], q5: 'Real and grounded', q6: 'Non-English films' },
  { q1: 'Date night',       q2: 'Make me feel something',q3:'Some — I like a good story', q4: ['Sad endings'],     q5: 'Real and grounded',    q6: 'Non-English films' },
  // Hidden gems combos
  { q1: 'Solo couch night', q2: 'Blow my mind',    q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'Hidden gems only' },
  { q1: 'Solo couch night', q2: 'Inspire me',      q3: 'Some — I like a good story',  q4: ["Nothing — I'm open"], q5: 'Based on true events', q6: 'Hidden gems only' },
  // Exclusion combos
  { q1: 'Solo couch night', q2: 'Make me laugh',   q3: 'Zero — just entertain me',   q4: ['Violence', 'Jump scares'], q5: 'Real and grounded', q6: 'No preference' },
  { q1: 'Date night',       q2: 'Make me feel something',q3:'Some — I like a good story', q4: ['Violence', 'Heavy themes'], q5: 'Real and grounded', q6: 'No preference' },
  { q1: 'Family time',      q2: 'Make me laugh',   q3: 'Zero — just entertain me',   q4: ['Violence', 'Jump scares', 'Heavy themes', 'Sad endings'], q5: 'Real and grounded', q6: 'No preference' },
  // True story combos
  { q1: 'Solo couch night', q2: 'Inspire me',      q3: 'Some — I like a good story',  q4: ["Nothing — I'm open"], q5: 'Based on true events', q6: 'No preference' },
  { q1: 'Date night',       q2: 'Make me feel something',q3:'Full — challenge me',    q4: ["Nothing — I'm open"], q5: 'Based on true events', q6: 'Show me popular hits' },
  // Fantasy/sci-fi combos
  { q1: 'Solo couch night', q2: 'Blow my mind',    q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'Show me popular hits' },
  { q1: 'Friends over',     q2: 'Scare me',        q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'No preference' },
  // Horror combos
  { q1: 'Solo couch night', q2: 'Scare me',        q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'No preference' },
  { q1: 'Solo couch night', q2: 'Scare me',        q3: 'Some — I like a good story',  q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'No preference' },
  { q1: 'Friends over',     q2: 'Scare me',        q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Real and grounded',    q6: 'No preference' },
  // Edge cases
  { q1: 'Solo couch night', q2: 'Keep me on edge', q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'Non-English films' },
  { q1: 'Date night',       q2: 'Scare me',        q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'Non-English films' },
  { q1: 'Friends over',     q2: 'Blow my mind',    q3: 'Some — I like a good story',  q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'Hidden gems only' },
  { q1: 'Solo couch night', q2: 'Make me feel something',q3:'Full — challenge me',    q4: ['Violence'],            q5: 'Based on true events', q6: 'Non-English films' },
  { q1: 'Family time',      q2: 'Inspire me',      q3: 'Some — I like a good story',  q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'Show me popular hits' },
  { q1: 'Family time',      q2: 'Make me laugh',   q3: 'Zero — just entertain me',   q4: ["Nothing — I'm open"], q5: 'Slightly weird',       q6: 'No preference' },
  { q1: 'Solo couch night', q2: 'Inspire me',      q3: 'Full — challenge me',         q4: ["Nothing — I'm open"], q5: 'Full fantasy/sci-fi',  q6: 'Non-English films' },
]

async function callRecommend(answers) {
  const res = await fetch(`${BASE_URL}/api/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, excludedIds: [], count: 3 }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HTTP ${res.status}: ${err}`)
  }
  return res.json()
}

function hasAdultSignal(title) {
  const lower = title.toLowerCase()
  return ADULT_TITLE_SIGNALS.some(s => lower.includes(s))
}

function comboLabel(answers) {
  return `[${answers.q1}|${answers.q2}|${answers.q5}|${answers.q6}]`
}

async function main() {
  console.log('====================================================')
  console.log(`Recommendation tester — ${COMBOS.length} combos × 5 calls`)
  console.log(`Server: ${BASE_URL}`)
  console.log('====================================================\n')

  // --- Debug probe: one test fetch before running the full suite ---
  console.log('Running debug probe...')
  try {
    const probeRes = await fetch(`${BASE_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: COMBOS[0], excludedIds: [], count: 3 }),
    })
    const rawText = await probeRes.text()
    console.log(`Probe status: ${probeRes.status}`)
    console.log(`Probe response (first 500 chars): ${rawText.slice(0, 500)}`)
    if (!probeRes.ok) {
      console.error('Probe failed — aborting test suite.')
      process.exit(1)
    }
  } catch (err) {
    console.error(`Probe fetch failed: ${err.message}`)
    console.error('Make sure the dev server is running on ' + BASE_URL)
    process.exit(1)
  }
  console.log('Probe OK — starting full suite.\n')

  // movieId → count across all results
  const movieAppearances = {}
  // comboLabel → Set of movie titles seen
  const comboMovies = {}
  const issues = []

  let totalCalls = 0
  let totalMovies = 0
  let callErrors = 0

  for (let ci = 0; ci < COMBOS.length; ci++) {
    const answers = COMBOS[ci]
    const label = comboLabel(answers)
    const isFamily = answers.q1 === 'Family time'
    comboMovies[label] = comboMovies[label] || new Set()

    process.stdout.write(`[${ci + 1}/${COMBOS.length}] ${label} `)

    for (let run = 0; run < 5; run++) {
      try {
        const data = await callRecommend(answers)
        totalCalls++

        const movies = data.movies || []
        if (movies.length === 0) {
          issues.push({ severity: 'WARN', combo: label, run: run + 1, msg: 'Returned 0 movies' })
          process.stdout.write('0')
          continue
        }

        process.stdout.write('.')
        totalMovies += movies.length

        const today = new Date().toISOString().split('T')[0]
        const currentYear = new Date().getFullYear()

        for (const m of movies) {
          const title = m.title || '(unknown)'
          movieAppearances[title] = (movieAppearances[title] || 0) + 1
          comboMovies[label].add(title)

          // Check: adult-sounding title
          if (hasAdultSignal(title)) {
            issues.push({ severity: 'ADULT', combo: label, run: run + 1, msg: `Adult-sounding title: "${title}"` })
          }

          // Check: future/unreleased movie
          const isFuture = m.release_date
            ? m.release_date > today
            : (m.year != null && m.year > currentYear)
          if (isFuture) {
            issues.push({ severity: 'FUTURE', combo: label, run: run + 1, msg: `Unreleased movie: "${title}" (${m.release_date || m.year})` })
          }

          // Check: family results should have family_safe=true — we can't verify from client,
          // but flag any animation appearing in non-animation context as a proxy
          // Flag violence in family results only if the movie is NOT family_safe —
          // family_safe=true means PG/PG-13 action violence which is acceptable for families.
          if (isFamily && (m.exclude_tags || []).includes('violence') && !m.family_safe) {
            issues.push({ severity: 'FAMILY', combo: label, run: run + 1, msg: `Family result has violence tag and not family_safe: "${title}"` })
          }
        }

        // Check: Non-English combos should only return non-English films
        if (answers.q6 === 'Non-English films') {
          const englishMovies = movies.filter(m => !m.original_language || m.original_language === 'en')
          if (englishMovies.length > 0) {
            issues.push({
              severity: 'LANG',
              combo: label,
              run: run + 1,
              msg: `Non-English request returned English film(s): ${englishMovies.map(m => `"${m.title}"(${m.original_language})`).join(', ')}`,
            })
          }
        }

        // Check: all 3 results pre-2000 for non-classics request
        const years = movies.map(m => m.year ?? 0)
        const modernCount = years.filter(y => y >= 2000).length
        if (movies.length >= 3 && modernCount < 2) {
          issues.push({
            severity: 'YEAR',
            combo: label,
            run: run + 1,
            msg: `Only ${modernCount}/3 movies from year≥2000: ${movies.map(m => `${m.title}(${m.year})`).join(', ')}`,
          })
        }

        // Check: more than 1 animation in non-fantasy/non-family result set
        const wantsFantasy = answers.q5 === 'Full fantasy/sci-fi'
        if (!wantsFantasy && !isFamily) {
          const animMovies = movies.filter(m => (m.genres || []).includes('Animation'))
          if (animMovies.length > 1) {
            issues.push({
              severity: 'ANIM',
              combo: label,
              run: run + 1,
              msg: `${animMovies.length} animations in non-fantasy result: ${animMovies.map(m => `"${m.title}"`).join(', ')}`,
            })
          }
        }

      } catch (err) {
        callErrors++
        issues.push({ severity: 'ERROR', combo: label, run: run + 1, msg: err.message })
        process.stdout.write('E')
      }

      // Small delay between calls to avoid hammering the server
      await new Promise(r => setTimeout(r, 300))
    }
    console.log()
  }

  // Check for dominant movies appearing too many times across different combos
  const dominant = Object.entries(movieAppearances)
    .filter(([, count]) => count > 5)  // appears in 5+ of the 250 result slots
    .sort(([, a], [, b]) => b - a)

  console.log('\n====================================================')
  console.log('RESULTS SUMMARY')
  console.log('====================================================')
  console.log(`Total API calls: ${totalCalls} | Errors: ${callErrors} | Total movies returned: ${totalMovies}`)

  // Variety check: how many unique movies did each combo get across 5 runs?
  const comboVariety = Object.entries(comboMovies).map(([label, titles]) => ({
    label,
    unique: titles.size,
  })).sort((a, b) => a.unique - b.unique)

  const lowVarietyCombos = comboVariety.filter(c => c.unique < 4) // fewer than 4 unique titles across 5 runs
  if (lowVarietyCombos.length > 0) {
    console.log(`\n⚠  LOW VARIETY (fewer than 4 unique movies across 5 runs):`)
    for (const c of lowVarietyCombos) {
      console.log(`   ${c.label} — only ${c.unique} unique titles`)
    }
  } else {
    console.log(`\n✓  Variety check passed — all combos returned ≥4 unique titles across 5 runs`)
  }

  if (dominant.length > 0) {
    console.log(`\n⚠  DOMINANT MOVIES (appearing 5+ times across all results):`)
    for (const [title, count] of dominant.slice(0, 20)) {
      console.log(`   ${count}x  ${title}`)
    }
  } else {
    console.log(`\n✓  No dominant movies detected`)
  }

  // Issues grouped by severity
  const bySeverity = {}
  for (const issue of issues) {
    bySeverity[issue.severity] = bySeverity[issue.severity] || []
    bySeverity[issue.severity].push(issue)
  }

  const severityOrder = ['ADULT', 'FAMILY', 'LANG', 'FUTURE', 'ERROR', 'YEAR', 'ANIM', 'WARN']
  for (const sev of severityOrder) {
    const list = bySeverity[sev]
    if (!list || list.length === 0) continue
    console.log(`\n[${sev}] ${list.length} issue(s):`)
    for (const issue of list.slice(0, 30)) {
      console.log(`  run${issue.run} ${issue.combo}: ${issue.msg}`)
    }
    if (list.length > 30) console.log(`  ... and ${list.length - 30} more`)
  }

  if (issues.length === 0) {
    console.log('\n✓  No issues detected across all combos!')
  }

  console.log('\n====================================================')
  console.log(`Total issues flagged: ${issues.length}`)
  console.log('====================================================\n')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
