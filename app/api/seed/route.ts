import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5-minute max for Vercel deployments

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
  target: number
  params: Record<string, string | number>
}

const PULL_CONFIGS: PullConfig[] = [
  {
    name: 'popular English',
    target: 3000,
    params: { sort_by: 'popularity.desc', with_original_language: 'en' },
  },
  {
    name: 'English hidden gems',
    target: 500,
    params: {
      with_original_language: 'en',
      'vote_count.gte': 500,
      'vote_count.lte': 5000,
      'vote_average.gte': 7.0,
      sort_by: 'vote_average.desc',
    },
  },
  {
    name: 'Korean',
    target: 400,
    params: { sort_by: 'popularity.desc', with_original_language: 'ko' },
  },
  {
    name: 'Spanish',
    target: 300,
    params: { sort_by: 'popularity.desc', with_original_language: 'es' },
  },
  {
    name: 'Japanese',
    target: 300,
    params: { sort_by: 'popularity.desc', with_original_language: 'ja' },
  },
  {
    name: 'French',
    target: 250,
    params: { sort_by: 'popularity.desc', with_original_language: 'fr' },
  },
  {
    name: 'Italian',
    target: 150,
    params: { sort_by: 'popularity.desc', with_original_language: 'it' },
  },
  {
    name: 'German',
    target: 17,
    params: { sort_by: 'popularity.desc', with_original_language: 'de' },
  },
  {
    name: 'Persian',
    target: 17,
    params: { sort_by: 'popularity.desc', with_original_language: 'fa' },
  },
  {
    name: 'Chinese',
    target: 17,
    params: { sort_by: 'popularity.desc', with_original_language: 'zh' },
  },
  {
    name: 'Swedish',
    target: 17,
    params: { sort_by: 'popularity.desc', with_original_language: 'sv' },
  },
  {
    name: 'Danish',
    target: 16,
    params: { sort_by: 'popularity.desc', with_original_language: 'da' },
  },
  {
    name: 'Norwegian',
    target: 16,
    params: { sort_by: 'popularity.desc', with_original_language: 'no' },
  },
  {
    name: 'Hindi',
    target: 100,
    params: { sort_by: 'popularity.desc', with_original_language: 'hi' },
  },
  {
    name: 'documentaries',
    target: 150,
    params: { sort_by: 'popularity.desc', with_genres: '99' },
  },
]

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
    poster_path: movie.poster_path ?? null,
    rating: movie.vote_average != null ? Math.round(movie.vote_average * 10) / 10 : null,
    vote_count: movie.vote_count ?? 0,
    overview: movie.overview ?? null,
    original_language: movie.original_language ?? null,
    genres: (movie.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean),
    // ai_tagged, mood_tags etc. intentionally omitted — DB defaults apply on insert,
    // and existing tagged rows are not overwritten on conflict.
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
        log('Starting seed — this will take several minutes due to TMDB rate limiting...\n')

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

        for (const config of PULL_CONFIGS) {
          const pages = Math.ceil(config.target / 20)
          const collected: TmdbMovie[] = []

          for (let page = 1; page <= pages; page++) {
            await sleep(250)
            try {
              const results = await fetchTmdbPage(apiKey, config.params, page)
              collected.push(...results)
            } catch (err) {
              log(`  WARN: failed to fetch ${config.name} page ${page}: ${String(err)}`)
              continue
            }

            if (page % 25 === 0) {
              log(
                `  Fetching ${config.name}: page ${page}/${pages} (${collected.length} collected so far)`
              )
            }
          }

          // Deduplicate within this pull AND against already-seen movies across all pulls.
          // Using a Map ensures each tmdb_id appears only once in the batch, preventing
          // the "ON CONFLICT DO UPDATE command cannot affect row a second time" error.
          const uniqueMap = new Map<number, TmdbMovie>()
          for (const m of collected) {
            if (!seenIds.has(m.id) && !uniqueMap.has(m.id)) {
              uniqueMap.set(m.id, m)
            }
          }
          const newMovies = Array.from(uniqueMap.values())
          newMovies.forEach((m) => seenIds.add(m.id))

          // Insert in batches of 100 (skip existing rows — already filtered above)
          for (let i = 0; i < newMovies.length; i += 100) {
            const batch = newMovies.slice(i, i + 100).map(toDbRecord)
            const { error } = await supabase
              .from('movies')
              .insert(batch)

            if (error) {
              totalErrors += batch.length
              log(`  DB error (batch ${i / 100 + 1}): ${error.message}`)
            } else {
              totalInserted += batch.length
            }
          }

          log(
            `✓ ${config.name}: ${newMovies.length} new movies saved. Running total: ${totalInserted} in DB`
          )
        }

        log(`\n${'='.repeat(60)}`)
        log(`Seed complete!`)
        log(`  Total unique movies pulled: ${seenIds.size}`)
        log(`  Successfully inserted/updated: ${totalInserted}`)
        log(`  Errors: ${totalErrors}`)
        log(`\nNext step: run  node scripts/ai-tag-movies.js  to AI-tag all movies.`)
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
