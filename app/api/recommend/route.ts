import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, Movie } from '@/lib/supabase'
import { mapAnswersToTags, generateMatchReason, QuizAnswers } from '@/lib/quiz'

const ADULT_TITLE_KEYWORDS = [
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
  // Specific titles confirmed as adult/explicit content
  'cattle towards glow', 'forbidden fruits',
  // Korean erotic series
  'adultery alumni', 'descendants of adultery',
]

const ADULT_OVERVIEW_KEYWORDS = [
  'pornographic', 'xxx', 'erotic film', 'sex film', 'pink film', 'adult film',
]

const META_TITLE_KEYWORDS = [
  'making of', 'behind the scenes', 'the story of', 'untold story of', 'documentary about',
]

const INDIAN_LANGUAGES = ['hi', 'ta', 'te', 'pa', 'ml', 'kn', 'bn']

function isAdultContent(movie: Movie): boolean {
  const titleLower = (movie.title ?? '').toLowerCase()
  if (ADULT_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) return true
  // Reject Japanese pink films: low vote count OR TV Movie genre (almost exclusively pink films)
  if (movie.original_language === 'ja') {
    const vc = movie.vote_count ?? 0
    const genres = movie.genres ?? []
    if (vc < 500) return true
    if (genres.includes('TV Movie')) return true
    if (genres.includes('Drama') && vc < 500) return true
  }
  const overviewLower = (movie.overview ?? '').toLowerCase()
  if (ADULT_OVERVIEW_KEYWORDS.some((kw) => overviewLower.includes(kw))) return true
  return false
}

function isMetaContent(movie: Movie): boolean {
  const lower = (movie.title ?? '').toLowerCase()
  return META_TITLE_KEYWORDS.some((kw) => lower.includes(kw))
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const movieCache: { all: Movie[] | null; family: Movie[] | null; ts: number } = {
  all: null,
  family: null,
  ts: 0,
}

async function fetchAllTaggedMovies(supabase: ReturnType<typeof getSupabase>, familyOnly: boolean): Promise<Movie[]> {
  const now = Date.now()
  const cacheKey = familyOnly ? 'family' : 'all'
  if (movieCache[cacheKey] && now - movieCache.ts < CACHE_TTL_MS) {
    return movieCache[cacheKey]!
  }

  const pageSize = 1000
  const allMovies: Movie[] = []
  let page = 0
  while (true) {
    let q = supabase
      .from('movies')
      .select('*')
      .eq('ai_tagged', true)
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (familyOnly) q = q.eq('family_safe', true)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    allMovies.push(...(data as Movie[]))
    if (data.length < pageSize) break
    page++
  }

  movieCache[cacheKey] = allMovies
  movieCache.ts = now
  console.log(`[recommend] Cache refreshed (${cacheKey}): ${allMovies.length} movies`)
  return allMovies
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  try {
    const body = await request.json()
    const answers: QuizAnswers = body.answers ?? body
    const excludedIds: number[] = body.excludedIds ?? []
    const count: number = body.count ?? 3
    const tags = mapAnswersToTags(answers)
    const excludeTags = tags.exclude_tags || []
    const preferenceTags = tags.preference_tags || []

    const wantsFamily = (tags.context_tags ?? []).includes('family')
    const today = new Date().toISOString().split('T')[0] // "YYYY-MM-DD"
    const currentYear = new Date().getFullYear()

    const movies = await fetchAllTaggedMovies(supabase, wantsFamily)

    const error = null
    if (!movies || movies.length === 0) {
      return NextResponse.json(
        { error: 'No tagged movies found. Run /api/seed first, then node scripts/ai-tag-movies.js.' },
        { status: 404 }
      )
    }

    console.log(`[recommend] Total ai-tagged movies: ${movies.length}`)

    const wantsDocumentary = tags.world_tags?.includes('documentary') ?? false
    const wantsInternational = preferenceTags.includes('international')

    // 1. Content filter: remove adult/meta/documentary gating/exclude-tags/future movies
    let filtered = (movies as Movie[]).filter((movie) => {
      if (isAdultContent(movie)) return false
      if (isMetaContent(movie)) return false

      // Exclude unreleased/future movies.
      // Once the release_date column is populated (scripts/populate-release-dates.js),
      // the first branch does precise filtering. Until then, year >= currentYear is the
      // conservative fallback — it excludes all current-year movies rather than risk
      // showing ones that haven't released yet.
      if (movie.release_date) {
        if (movie.release_date > today) return false
      } else {
        if ((movie.year ?? 0) >= currentYear) return false
      }

      if (wantsDocumentary) {
        return movie.world_tags.includes('documentary')
      } else {
        if (movie.world_tags.includes('documentary')) return false
      }
      if (excludeTags.length === 0) return true
      // Family context: skip the 'violence' exclude tag for family_safe movies —
      // action-adventure violence (PG/PG-13) is fine for families; only graphic R-rated
      // violence should be blocked, and family_safe=true already guarantees that.
      const activeTags = (wantsFamily && movie.family_safe)
        ? excludeTags.filter((t) => t !== 'violence')
        : excludeTags
      return !activeTags.some((tag) => movie.exclude_tags.includes(tag))
    })
    console.log(`[recommend] After content filter: ${filtered.length}`)

    // 2. Language filter
    if (wantsInternational) {
      filtered = filtered.filter(
        (m) => m.original_language && m.original_language !== 'en'
      )
      console.log(`[recommend] Non-English pool: ${filtered.length}`)
    } else {
      const englishOnly = filtered.filter(
        (m) => !m.original_language || m.original_language === 'en'
      )
      if (englishOnly.length >= count) filtered = englishOnly
    }
    console.log(`[recommend] After language filter: ${filtered.length}`)

    // 3. Hidden gems filter
    if (preferenceTags.includes('hidden-gems')) {
      const gems = filtered.filter((m) => (m.vote_count ?? 0) < 5000)
      if (gems.length >= count) filtered = gems
    }

    // 4. Score all filtered movies (before seen exclusion so we can supplement later)
    const scored = filtered.map((movie) => {
      let score = 0

      if (tags.mood_tags) {
        score += tags.mood_tags.filter((t) => movie.mood_tags.includes(t)).length * 3
      }
      if (tags.energy_tags) {
        score += tags.energy_tags.filter((t) => movie.energy_tags.includes(t)).length * 2
      }
      if (tags.world_tags) {
        score += tags.world_tags.filter((t) => movie.world_tags.includes(t)).length * 2
      }
      if (tags.context_tags) {
        score += tags.context_tags.filter((t) => movie.context_tags.includes(t)).length * 2
      }

      if (preferenceTags.includes('popular') && (movie.vote_count ?? 0) > 10000) {
        score += 2
      }

      if (!wantsInternational) {
        score -= (movie.vote_count ?? 0) / 10000
      }

      if (excludedIds.includes(movie.id)) score -= 5
      score += (Math.random() - 0.5) * 6

      return { movie, score }
    })

    // Sort by score desc (jitter already applied; no vote_count tiebreak needed)
    scored.sort((a, b) => b.score - a.score)

    // 5. Split into unseen and seen pools
    const unseenScored = scored.filter(({ movie }) => !excludedIds.includes(movie.id))
    const seenScored = scored.filter(({ movie }) => excludedIds.includes(movie.id))

    // count=1 is a single swap → draw from deeper pool for variety
    const poolSize = count === 1 ? 80 : 200

    const randomPick = <T>(arr: T[], n: number): T[] =>
      [...arr].sort(() => Math.random() - 0.5).slice(0, n)

    const pickFromPool = (unseen: typeof unseenScored, seen: typeof seenScored, n: number): Movie[] => {
      if (unseen.length >= n) {
        return randomPick(unseen.slice(0, poolSize), n).map(({ movie }) => movie)
      } else if (unseen.length > 0) {
        return [
          ...unseen.map(({ movie }) => movie),
          ...randomPick(seen.slice(0, poolSize), n - unseen.length).map(({ movie }) => movie),
        ]
      } else if (seen.length > 0) {
        return randomPick(seen.slice(0, poolSize), n).map(({ movie }) => movie)
      }
      return []
    }

    // Prefer unseen; supplement with seen if fewer than count unseen available
    let topN: Movie[]
    let warningMessage: string | undefined

    if (wantsInternational) {
      // Hard filter 1: already non-English (done above in filtered)
      // Hard filter 2: exclude Indian languages
      const nonIndianPool = filtered.filter(
        (m) => !INDIAN_LANGUAGES.includes(m.original_language ?? '')
      )

      // Log per-language counts
      const langCounts: Record<string, number> = {}
      nonIndianPool.forEach((m) => {
        const l = m.original_language ?? 'unknown'
        langCounts[l] = (langCounts[l] ?? 0) + 1
      })
      const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1])
      console.log(
        `[recommend] Non-Indian foreign pool (${nonIndianPool.length}):`,
        sortedLangs.map(([l, c]) => `${l}: ${c}`).join(', ')
      )

      // For international films: only mood tag required — world/energy/context are bonus scoring.
      // Requiring world+mood created very narrow pools (e.g. only 7-8 Korean "emotional+realistic" films).
      const moodOnlyMatch = (movie: Movie): boolean => {
        if (tags.mood_tags?.length) {
          return tags.mood_tags.some((t) => (movie.mood_tags ?? []).includes(t))
        }
        return true
      }

      let matchPool = nonIndianPool.filter(moodOnlyMatch)
      console.log(`[recommend] After mood-only filter: ${matchPool.length}`)

      // Score by energy/context (preferred, not required), plus jitter
      const fScored = matchPool.map((movie) => {
        let score = 0
        if (tags.mood_tags) score += tags.mood_tags.filter((t) => (movie.mood_tags ?? []).includes(t)).length * 3
        if (tags.world_tags) score += tags.world_tags.filter((t) => (movie.world_tags ?? []).includes(t)).length * 2
        if (tags.energy_tags) score += tags.energy_tags.filter((t) => (movie.energy_tags ?? []).includes(t)).length * 2
        if (tags.context_tags) score += tags.context_tags.filter((t) => (movie.context_tags ?? []).includes(t)).length * 2
        if (excludedIds.includes(movie.id)) score -= 5
        score += (Math.random() - 0.5) * 4
        return { movie, score }
      })
      fScored.sort((a, b) => b.score - a.score)

      console.log(
        `[recommend] Top 10 foreign candidates:`,
        fScored.slice(0, 10).map(({ movie, score }) =>
          `${movie.title} (${movie.original_language}, ${movie.year}, score: ${score.toFixed(1)})`
        ).join(' | ')
      )

      // Shuffle full pool for variety, pick with language diversity
      const shuffled = [...fScored].sort(() => Math.random() - 0.5)
      const picked: Movie[] = []
      const usedLangs = new Set<string>()

      // First pass: one film per language
      for (const { movie } of shuffled) {
        if (picked.length >= count) break
        const lang = movie.original_language ?? 'unknown'
        if (!usedLangs.has(lang)) {
          picked.push(movie)
          usedLangs.add(lang)
        }
      }

      // Second pass: fill remaining slots (allows language repeats)
      if (picked.length < count) {
        const pickedIds = new Set(picked.map((m) => m.id))
        for (const { movie } of shuffled) {
          if (picked.length >= count) break
          if (!pickedIds.has(movie.id)) picked.push(movie)
        }
      }

      // Fall back to Indian films ONLY if non-Indian pool has 0 matches
      if (picked.length === 0) {
        const indianPool = filtered
          .filter((m) => INDIAN_LANGUAGES.includes(m.original_language ?? ''))
          .filter(moodOnlyMatch)
        const indianShuffled = [...indianPool].sort(() => Math.random() - 0.5)
        indianShuffled.slice(0, count).forEach((m) => picked.push(m))
        console.log(`[recommend] Fell back to Indian films (0 non-Indian matches): ${picked.length}`)
      }

      if (picked.length > 0 && picked.length < count) {
        warningMessage = `Only ${picked.length} foreign film${picked.length === 1 ? '' : 's'} matched your filters — try different answers for more variety`
      }

      topN = picked
      console.log(
        `[recommend] Final ${count} foreign picks:`,
        topN.map((m) => `${m.title} (${m.original_language}, ${m.year})`)
      )
    } else if (unseenScored.length >= count) {
      topN = randomPick(unseenScored.slice(0, poolSize), count).map(({ movie }) => movie)
    } else if (unseenScored.length > 0) {
      topN = [
        ...unseenScored.map(({ movie }) => movie),
        ...randomPick(seenScored.slice(0, poolSize), count - unseenScored.length).map(({ movie }) => movie),
      ]
    } else if (excludedIds.length > 0 && seenScored.length > 0) {
      // All unseen exhausted — recycle seen pool
      topN = randomPick(seenScored.slice(0, poolSize), count).map(({ movie }) => movie)
    } else {
      topN = []
    }

    // Animation cap: max 1 animated film per result set
    const isAnimation = (m: Movie) => (m.genres ?? []).includes('Animation')
    const animCount = topN.filter(isAnimation).length
    if (animCount >= 2) {
      const topIdSet = new Set(topN.map((m) => m.id))
      const nonAnimReserve = scored.filter(
        ({ movie }) =>
          !isAnimation(movie) &&
          !topIdSet.has(movie.id) &&
          !excludedIds.includes(movie.id)
      )
      let reserveIdx = 0
      let keptAnim = false
      topN = topN.map((m) => {
        if (!isAnimation(m)) return m
        if (!keptAnim) { keptAnim = true; return m }
        const sub = nonAnimReserve[reserveIdx++]
        return sub ? sub.movie : m
      })
    }

    // 6. Year diversity: ensure at least 2 of 3 are from year >= 2000
    if (topN.length >= 3) {
      const modernCount = topN.filter(m => (m.year ?? 0) >= 2000).length
      if (modernCount < 2) {
        const topIds = new Set(topN.map(m => m.id))
        const modernPool = scored.filter(({ movie }) => (movie.year ?? 0) >= 2000 && !topIds.has(movie.id))
        // Identify the pre-2000 slots (these are the ones to replace, not the modern ones)
        const preModernSlots = topN.map((m, i) => ((m.year ?? 0) < 2000 ? i : -1)).filter(i => i >= 0)
        const needed = 2 - modernCount
        for (let i = 0; i < needed && i < modernPool.length && i < preModernSlots.length; i++) {
          topN[preModernSlots[preModernSlots.length - 1 - i]] = modernPool[i].movie
        }
      }
    }

    console.log(`[recommend] Top ${count} language breakdown:`, topN.map(m => `${m.title} (${m.original_language}, ${m.year})`))

    if (topN.length === 0) {
      if (excludedIds.length > 0) {
        return NextResponse.json({ movies: [], sessionId: null })
      }
      const fallback = (movies as Movie[])
        .filter(m => !isAdultContent(m) && !isMetaContent(m))
        .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
        .slice(0, count)

      await supabase.from('quiz_sessions').insert({
        answers,
        recommended_movie_ids: fallback.map((m) => m.id),
      })

      return NextResponse.json({
        movies: fallback.map((movie, i) => ({
          ...movie,
          matchReason: generateMatchReason(movie, tags, i),
        })),
        sessionId: null,
      })
    }

    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert({
        answers,
        recommended_movie_ids: topN.map((m) => m.id),
      })
      .select('id')
      .single()

    if (sessionError) console.error('Session save error:', sessionError)

    const movieIds = topN.map((m) => m.id)
    const { data: availability } = await supabase
      .from('availability')
      .select('*')
      .in('movie_id', movieIds)

    const withReasons = topN.map((movie, i) => ({
      ...movie,
      matchReason: generateMatchReason(movie, tags, i),
      availability: (availability || []).filter((a) => a.movie_id === movie.id),
    }))

    return NextResponse.json({
      movies: withReasons,
      sessionId: session?.id ?? null,
      ...(warningMessage ? { warning: warningMessage } : {}),
    })
  } catch (err) {
    console.error('Recommend error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
