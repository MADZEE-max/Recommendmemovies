import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // hint for Vercel — local dev has no timeout

const TMDB_BASE = 'https://api.themoviedb.org/3'

const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
}

type TmdbMovie = {
  id: number
  title: string
  adult?: boolean
  release_date?: string
  poster_path?: string
  vote_average?: number
  vote_count?: number
  overview?: string
  genre_ids: number[]
  original_language?: string
}

interface PullConfig {
  name: string
  group: string
  maxPages: number // explicit page depth — no more deriving from a fake "target"
  params: Record<string, string | number>
}

// Baseline quality filters applied to every pull
const BASE_FILTERS: Record<string, string | number> = {
  'vote_count.gte': 100,
  'with_runtime.gte': 60,
  include_adult: 'false',
}

// The 8 genres we diversify across
const DIVERSE_GENRES = [
  { name: 'Action',    id: '28' },
  { name: 'Comedy',    id: '35' },
  { name: 'Drama',     id: '18' },
  { name: 'Thriller',  id: '53' },
  { name: 'Horror',    id: '27' },
  { name: 'Romance',   id: '10749' },
  { name: 'Sci-Fi',    id: '878' },
  { name: 'Animation', id: '16' },
]

// Each English 2000+ genre gets 4 sort methods × 50 pages = up to 4000 candidates before dedup
function makeEnglishConfigs(): PullConfig[] {
  const configs: PullConfig[] = []
  for (const genre of DIVERSE_GENRES) {
    const base: Record<string, string | number> = {
      ...BASE_FILTERS,
      with_original_language: 'en',
      with_genres: genre.id,
      'primary_release_date.gte': '2000-01-01',
    }
    configs.push(
      {
        name: `en/${genre.name}/popularity`,
        group: 'English 2000+',
        maxPages: 50,
        params: { ...base, sort_by: 'popularity.desc' },
      },
      {
        name: `en/${genre.name}/rating`,
        group: 'English 2000+',
        maxPages: 50,
        // raise vote floor so rating sort surfaces quality, not obscure films
        params: { ...base, sort_by: 'vote_average.desc', 'vote_count.gte': 200 },
      },
      {
        name: `en/${genre.name}/revenue`,
        group: 'English 2000+',
        maxPages: 50,
        params: { ...base, sort_by: 'revenue.desc' },
      },
      {
        name: `en/${genre.name}/recent-quality`,
        group: 'English 2000+',
        maxPages: 50,
        // 2010+ with minimum rating catches newer films that aren't chart-toppers yet
        params: {
          ...base,
          'primary_release_date.gte': '2010-01-01',
          'vote_average.gte': 6.5,
          sort_by: 'primary_release_date.desc',
        },
      }
    )
  }
  return configs
}

// English classics get popularity sort + 20 pages (enough depth for 1970-1999 era)
function makeClassicConfigs(): PullConfig[] {
  return DIVERSE_GENRES.map((genre) => ({
    name: `en-classic/${genre.name}`,
    group: 'English Classic',
    maxPages: 20,
    params: {
      ...BASE_FILTERS,
      with_original_language: 'en',
      with_genres: genre.id,
      'primary_release_date.gte': '1970-01-01',
      'primary_release_date.lte': '1999-12-31',
      sort_by: 'popularity.desc',
    },
  }))
}

const PULL_CONFIGS: PullConfig[] = [
  // English 2000-2026: 8 genres × 4 sort methods × 50 pages = deep coverage
  ...makeEnglishConfigs(),

  // English classics 1970-1999: 8 genres × 20 pages
  ...makeClassicConfigs(),

  // Foreign — Korean and Japanese go 50 pages deep; Spanish/Italian bumped to 30
  { name: 'Korean',   group: 'Foreign', maxPages: 50, params: { ...BASE_FILTERS, with_original_language: 'ko', sort_by: 'popularity.desc' } },
  { name: 'Japanese', group: 'Foreign', maxPages: 50, params: { ...BASE_FILTERS, with_original_language: 'ja', sort_by: 'popularity.desc' } },
  { name: 'French',   group: 'Foreign', maxPages: 20, params: { ...BASE_FILTERS, with_original_language: 'fr', sort_by: 'popularity.desc' } },
  { name: 'Spanish',  group: 'Foreign', maxPages: 30, params: { ...BASE_FILTERS, with_original_language: 'es', sort_by: 'popularity.desc' } },
  { name: 'Italian',  group: 'Foreign', maxPages: 30, params: { ...BASE_FILTERS, with_original_language: 'it', sort_by: 'popularity.desc' } },
]

// Title substrings that indicate behind-the-scenes / meta or adult content (case-insensitive)
const EXCLUDED_TITLE_KEYWORDS = [
  'making of', 'behind the scenes', 'the story of', 'untold story of',
  'molester', 'pink film', 'erotic', 'sensual', ' lust', 'naked',
  'seduction', ' uncut', 'xxx', 'porn', 'adult video', 'bathhouse',
  'soft core', 'hardcore', 'milf', 'affair diary', 'pervert', 'sex diary',
  'lingerie', 'diary of', 'stay date', 'unusual sister', 'my sister is',
  'incest', 'orgy', "lover's", 'nympho', 'prostitute', 'hooker', 'escort',
  'stripper', 'massage parlor', 'intimate diary', 'horny', 'stepmother',
  'stepdaughter', 'stepsister', 'stepbrother', "sister's secret", 'housewife',
  "widow's", 'cheating wife', 'virgin', 'bath scene', 'shower scene',
  'fetish', 'bondage',
  // Additional pink film / softcore titles
  'hole in law', 'lolita', 'nurse diary', 'office lady', "wife's secret",
  'school girl', 'female teacher', 'swimsuit', 'bikini', 'beach patrol',
  'panty', 'underwear', ' bed ', 'kiss me',
]

const EXCLUDED_OVERVIEW_KEYWORDS = [
  'pornographic', 'xxx', 'erotic film', 'sex film', 'pink film', 'adult film',
]

// TMDB genre ID 10770 = TV Movie
const TV_MOVIE_GENRE_ID = 10770

const TODAY_DATE = new Date().toISOString().split('T')[0]

function isMovieExcluded(m: TmdbMovie): boolean {
  if (m.adult === true) return true
  // Skip unreleased/future movies
  if (m.release_date && m.release_date > TODAY_DATE) return true
  const titleLower = (m.title ?? '').toLowerCase()
  if (EXCLUDED_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) return true
  const overviewLower = (m.overview ?? '').toLowerCase()
  if (EXCLUDED_OVERVIEW_KEYWORDS.some((kw) => overviewLower.includes(kw))) return true
  // Japanese TV movies are almost exclusively pink films
  if (m.original_language === 'ja' && (m.genre_ids ?? []).includes(TV_MOVIE_GENRE_ID)) return true
  // Japanese films with low vote counts or Drama+low-votes are typically pink films
  if (m.original_language === 'ja' && (m.vote_count ?? 0) < 500) return true
  if (m.original_language === 'ja' && (m.genre_ids ?? []).includes(18) && (m.vote_count ?? 0) < 500) return true
  return false
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchTmdbPage(
  apiKey: string,
  params: Record<string, string | number>,
  page: number
): Promise<TmdbMovie[]> {
  const url = new URL(`${TMDB_BASE}/discover/movie`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('page', String(page))
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TMDB API error ${res.status}: ${text}`)
  }
  const data = await res.json()
  return (data.results as TmdbMovie[]) || []
}

function toDbRecord(movie: TmdbMovie) {
  return {
    tmdb_id: movie.id,
    title: movie.title,
    year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null,
    release_date: movie.release_date ?? null,
    poster_path: movie.poster_path ?? null,
    rating: movie.vote_average != null ? Math.round(movie.vote_average * 10) / 10 : null,
    vote_count: movie.vote_count ?? 0,
    overview: movie.overview ?? null,
    original_language: movie.original_language ?? null,
    genres: (movie.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean),
  }
}

export async function GET() {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'TMDB_API_KEY not configured' }, { status: 500 })
  }

  const supabase = getSupabase()
  const encoder = new TextEncoder()
  const seenIds = new Set<number>()
  let totalInserted = 0
  let totalErrors = 0

  const stream = new ReadableStream({
    async start(controller) {
      const log = (msg: string) => {
        console.log(msg)
        controller.enqueue(encoder.encode(msg + '\n'))
      }

      try {
        const totalConfigs = PULL_CONFIGS.length
        log(`Starting seed — ${totalConfigs} pull configs (${PULL_CONFIGS.filter(c => c.group === 'English 2000+').length} English 2000+, ${PULL_CONFIGS.filter(c => c.group === 'English Classic').length} English Classic, ${PULL_CONFIGS.filter(c => c.group === 'Foreign').length} Foreign)\n`)

        // Load existing tmdb_ids so re-runs skip already-seeded movies
        log('Loading existing movie IDs from database...')
        let offset = 0
        const PAGE_SIZE = 1000
        while (true) {
          const { data, error: fetchErr } = await supabase
            .from('movies')
            .select('tmdb_id')
            .range(offset, offset + PAGE_SIZE - 1)
          if (fetchErr) {
            log(`WARN: could not load existing IDs: ${fetchErr.message}`)
            break
          }
          if (!data || data.length === 0) break
          for (const row of data) seenIds.add(row.tmdb_id)
          if (data.length < PAGE_SIZE) break
          offset += PAGE_SIZE
        }
        log(`Found ${seenIds.size} existing movies — will skip these.\n`)

        const groupCounts: Record<string, number> = {}

        for (let ci = 0; ci < PULL_CONFIGS.length; ci++) {
          const config = PULL_CONFIGS[ci]
          const collected: TmdbMovie[] = []

          for (let page = 1; page <= config.maxPages; page++) {
            await sleep(250)
            try {
              const results = await fetchTmdbPage(apiKey, config.params, page)
              // If TMDB returns an empty page we've exhausted this sort's results
              if (results.length === 0) break
              collected.push(...results)
            } catch (err) {
              log(`  WARN: failed to fetch ${config.name} page ${page}: ${String(err)}`)
              continue
            }

            if (page % 25 === 0) {
              log(`  [${ci + 1}/${totalConfigs}] ${config.name}: page ${page}/${config.maxPages} (${collected.length} raw so far)`)
            }
          }

          // Deduplicate: skip existing DB movies, skip seen across pulls, skip excluded titles
          const uniqueMap = new Map<number, TmdbMovie>()
          for (const m of collected) {
            if (!seenIds.has(m.id) && !uniqueMap.has(m.id) && !isMovieExcluded(m)) {
              uniqueMap.set(m.id, m)
            }
          }
          const newMovies = Array.from(uniqueMap.values())
          newMovies.forEach((m) => seenIds.add(m.id))

          // Upsert in batches of 100; ignoreDuplicates skips existing tmdb_ids without error
          for (let i = 0; i < newMovies.length; i += 100) {
            const batch = newMovies.slice(i, i + 100).map(toDbRecord)
            const { error, count } = await supabase
              .from('movies')
              .upsert(batch, { onConflict: 'tmdb_id', ignoreDuplicates: true })
              .select('id', { count: 'exact', head: true })
            if (error) {
              totalErrors += batch.length
              log(`  DB error (batch ${i / 100 + 1}): ${error.message}`)
            } else {
              totalInserted += count ?? batch.length
            }
          }

          groupCounts[config.group] = (groupCounts[config.group] ?? 0) + newMovies.length
          log(
            `✓ [${ci + 1}/${totalConfigs}] ${config.name}: ${newMovies.length} new | ` +
            `${config.group}: ${groupCounts[config.group]} total | ` +
            `DB total: ${totalInserted}`
          )
        }

        log(`\n${'='.repeat(60)}`)
        log(`Seed complete!`)
        log(`  New movies inserted this run: ${totalInserted}`)
        log(`  Errors: ${totalErrors}`)
        log(`\n  Group breakdown:`)
        for (const [group, count] of Object.entries(groupCounts)) {
          log(`    ${group}: ${count} new movies`)
        }
        log(`\nNext step: run  node scripts/ai-tag-movies.js  to AI-tag all new movies.`)
        log(`${'='.repeat(60)}`)
      } catch (err) {
        log(`\nFATAL ERROR: ${String(err)}`)
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
