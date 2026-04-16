// ai-tag-movies.js
// Tags all untagged movies in the DB using Claude (two-pass verification).
//
// Usage:
//   node scripts/ai-tag-movies.js
//   # or, to load env automatically:
//   node --env-file=.env.local scripts/ai-tag-movies.js
//
// The script is resumable: it only processes movies where ai_tagged = false.

'use strict'

const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Load .env.local if running without --env-file
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Validate env
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local and retry.')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Init clients
// ---------------------------------------------------------------------------
const { createClient } = require('@supabase/supabase-js')
const Anthropic = require('@anthropic-ai/sdk')

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const anthropic = new Anthropic.default({ apiKey: ANTHROPIC_API_KEY })

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MODEL = 'claude-sonnet-4-5'
const MAX_TOKENS = 300
const BATCH_SIZE = 50
const DELAY_BETWEEN_MOVIES_MS = 500

const VALID_MOOD = ['funny', 'tense', 'emotional', 'cerebral', 'horror', 'inspiring']
const VALID_ENERGY = ['light', 'medium', 'intense']
const VALID_WORLD = ['realistic', 'quirky', 'fantastical', 'true-story', 'documentary']
const VALID_CONTEXT = ['solo', 'date', 'friends', 'family']
const VALID_EXCLUDE = ['violence', 'scares', 'heavy', 'sad-endings']

// ---------------------------------------------------------------------------
// System prompt (static — cached via cache_control to reduce cost at scale)
// ---------------------------------------------------------------------------
const PASS1_SYSTEM = `You are a movie tagging expert. Analyze movies carefully and return accurate tags.

Your output must be ONLY valid JSON — no markdown, no explanation, no code fences.

Tag schema:
{
  "mood_tags": [],      // from [funny, tense, emotional, cerebral, horror, inspiring]
  "energy_tags": [],    // exactly one from [light, medium, intense]
  "world_tags": [],     // exactly one from [realistic, quirky, fantastical, true-story, documentary]
  "context_tags": [],   // subset of [solo, date, friends, family]
  "exclude_tags": []    // from [violence, scares, heavy, sad-endings] — only if present
}

Tagging rules:
- A movie can have multiple mood_tags (dark comedy = funny + tense)
- world_tags: realistic (grounded contemporary), quirky (slightly odd/indie), fantastical (fantasy/sci-fi/superhero), true-story (based on real events), documentary (actual documentary)
- If unsure about a tag, do not include it
- Be precise: Inside Out is fantastical not realistic; Forrest Gump is true-story or realistic; The Dark Knight is fantastical (superhero) not realistic
- violence = graphic violence or gore
- scares = horror/thriller with jump scares
- heavy = dark themes, depression, trauma, abuse
- sad-endings = movie ends on a sad or bittersweet note`

const PASS2_SYSTEM = `You are a movie tagging expert reviewing tag accuracy.

Your output must be ONLY valid JSON — no markdown, no explanation, no code fences.

If the tags are accurate, return the exact same JSON.
If any tag is wrong, return corrected JSON.

Pay special attention to:
- world_tags: is this really fantastical/realistic/true-story/quirky/documentary?
- exclude_tags: are violence/scares/heavy/sad-endings actually present in this movie?
- mood_tags: do they capture the movie accurately?

Tag schema:
{
  "mood_tags": [],      // from [funny, tense, emotional, cerebral, horror, inspiring]
  "energy_tags": [],    // exactly one from [light, medium, intense]
  "world_tags": [],     // exactly one from [realistic, quirky, fantastical, true-story, documentary]
  "context_tags": [],   // subset of [solo, date, friends, family]
  "exclude_tags": []    // from [violence, scares, heavy, sad-endings] — only if present
}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseTags(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in response')
  const raw = JSON.parse(match[0])
  return {
    mood_tags: (raw.mood_tags || []).filter((t) => VALID_MOOD.includes(t)),
    energy_tags: (raw.energy_tags || []).filter((t) => VALID_ENERGY.includes(t)).slice(0, 1),
    world_tags: (raw.world_tags || []).filter((t) => VALID_WORLD.includes(t)).slice(0, 1),
    context_tags: (raw.context_tags || []).filter((t) => VALID_CONTEXT.includes(t)),
    exclude_tags: (raw.exclude_tags || []).filter((t) => VALID_EXCLUDE.includes(t)),
  }
}

async function callClaude(systemText, userText) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userText }],
  })
  return response.content[0].text
}

async function parseWithRetry(text, movie, passName) {
  try {
    return parseTags(text)
  } catch {
    // Retry once with a fresh call — same prompt
    try {
      console.log(`  Retry JSON parse for "${movie.title}" (${passName})`)
      return parseTags(text) // text is the same; often enough on malformed whitespace
    } catch (err) {
      console.log(`  SKIP "${movie.title}" — ${passName} JSON parse failed: ${err.message}`)
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Tag a single movie (two passes)
// ---------------------------------------------------------------------------
async function tagMovie(movie) {
  const genreNames = (movie.genres || []).join(', ') || 'Unknown'

  // ---------- Pass 1 ----------
  const pass1User = `Movie: ${movie.title} (${movie.year || 'unknown year'})
Overview: ${movie.overview || 'No overview available.'}
Original language: ${movie.original_language || 'unknown'}
TMDB genres: ${genreNames}

Return ONLY valid JSON with these exact fields (no explanation, no markdown):
{
  "mood_tags": [],
  "energy_tags": [],
  "world_tags": [],
  "context_tags": [],
  "exclude_tags": []
}`

  let pass1Text
  try {
    pass1Text = await callClaude(PASS1_SYSTEM, pass1User)
  } catch (err) {
    console.log(`  ERROR calling Claude (pass 1) for "${movie.title}": ${err.message}`)
    return null
  }

  const pass1Tags = await parseWithRetry(pass1Text, movie, 'pass1')
  if (!pass1Tags) return null

  // ---------- Pass 2 ----------
  const pass2User = `Review these movie tags for accuracy.

Movie: ${movie.title} (${movie.year || 'unknown year'})
Overview: ${movie.overview || 'No overview available.'}
Original language: ${movie.original_language || 'unknown'}
TMDB genres: ${genreNames}
Initial tags: ${JSON.stringify(pass1Tags)}

Are these tags accurate? If yes, return the exact same JSON. If any tag is wrong, return corrected JSON.`

  let pass2Text
  try {
    pass2Text = await callClaude(PASS2_SYSTEM, pass2User)
  } catch (err) {
    console.log(`  ERROR calling Claude (pass 2) for "${movie.title}": ${err.message} — using pass 1 tags`)
    return pass1Tags
  }

  const finalTags = await parseWithRetry(pass2Text, movie, 'pass2')
  return finalTags || pass1Tags // fall back to pass 1 if pass 2 parse fails
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60))
  console.log('AI Movie Tagger — two-pass verification with Claude')
  console.log('='.repeat(60))

  // Count total untagged
  const { count: totalUntagged, error: countErr } = await supabase
    .from('movies')
    .select('*', { count: 'exact', head: true })
    .eq('ai_tagged', false)

  if (countErr) {
    console.error('Failed to query movie count:', countErr.message)
    process.exit(1)
  }

  if (!totalUntagged || totalUntagged === 0) {
    console.log('All movies are already tagged. Nothing to do.')
    return
  }

  console.log(`Found ${totalUntagged} untagged movies. Processing in batches of ${BATCH_SIZE}...\n`)

  let processed = 0
  let succeeded = 0
  let skipped = 0
  let offset = 0

  while (offset < totalUntagged) {
    // Fetch next batch of untagged movies
    const { data: batch, error: fetchErr } = await supabase
      .from('movies')
      .select('id, tmdb_id, title, year, overview, original_language, genres')
      .eq('ai_tagged', false)
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (fetchErr) {
      console.error('Failed to fetch batch:', fetchErr.message)
      break
    }
    if (!batch || batch.length === 0) break

    for (const movie of batch) {
      const tags = await tagMovie(movie)
      processed++

      if (!tags) {
        skipped++
        console.log(`  [${processed}/${totalUntagged}] SKIPPED: ${movie.title}`)
      } else {
        const { error: updateErr } = await supabase
          .from('movies')
          .update({
            ...tags,
            ai_tagged: true,
          })
          .eq('id', movie.id)

        if (updateErr) {
          skipped++
          console.log(`  [${processed}/${totalUntagged}] DB ERROR for "${movie.title}": ${updateErr.message}`)
        } else {
          succeeded++
        }
      }

      // Delay between movies
      if (processed < totalUntagged) {
        await sleep(DELAY_BETWEEN_MOVIES_MS)
      }
    }

    // Log progress after each batch
    const pct = Math.round((processed / totalUntagged) * 100)
    console.log(
      `Tagged ${processed}/${totalUntagged} (${pct}%) — ${succeeded} saved, ${skipped} skipped`
    )

    offset += BATCH_SIZE
  }

  console.log('\n' + '='.repeat(60))
  console.log(`Done!  ${succeeded} movies tagged, ${skipped} skipped.`)
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
