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

type LanguageFilter = 'en' | 'non-en-non-indian' | 'non-en-indian' | null

async function fetchFilteredMovies(
  supabase: ReturnType<typeof getSupabase>,
  opts: {
    moodTags: string[]
    excludeTags: string[]
    wantsFamily: boolean
    wantsDocumentary: boolean
    languageFilter: LanguageFilter
    today: string
  }
): Promise<Movie[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('movies')
    .select('*')
    .eq('ai_tagged', true)

  if (opts.moodTags.length > 0) {
    q = q.overlaps('mood_tags', opts.moodTags)
  }

  if (opts.wantsFamily) {
    q = q.eq('family_safe', true)
  }

  if (opts.wantsDocumentary) {
    q = q.contains('world_tags', ['documentary'])
  } else {
    q = q.not('world_tags', 'cs', '{documentary}')
  }

  switch (opts.languageFilter) {
    case 'en':
      q = q.eq('original_language', 'en')
      break
    case 'non-en-non-indian':
      q = q.neq('original_language', 'en')
        .not('original_language', 'in', `(${INDIAN_LANGUAGES.join(',')})`)
      break
    case 'non-en-indian':
      q = q.in('original_language', INDIAN_LANGUAGES)
      break
  }

  // Movies with release_date <= today, OR no release_date (JS will apply year fallback)
  q = q.or(`release_date.lte.${opts.today},release_date.is.null`)

  // Exclude tags: movie must not overlap with user's excluded tags
  const activeTags = opts.wantsFamily
    ? opts.excludeTags.filter((t) => t !== 'violence')
    : opts.excludeTags
  if (activeTags.length > 0) {
    const tagList = activeTags.map((t) => `"${t}"`).join(',')
    q = q.not('exclude_tags', 'ov', `{${tagList}}`)
  }

  const BATCH = 1000
  const all: Movie[] = []
  let offset = 0
  while (true) {
    const { data, error } = await q.range(offset, offset + BATCH - 1)
    if (error) throw error
    const batch = (data ?? []) as Movie[]
    all.push(...batch)
    if (batch.length < BATCH) break
    offset += BATCH
  }
  return all
}

function jsContentFilter(movies: Movie[], currentYear: number): Movie[] {
  return movies.filter((m) => {
    if (isAdultContent(m)) return false
    if (isMetaContent(m)) return false
    // Year fallback for movies without release_date (DB returned them for JS to decide)
    if (!m.release_date && (m.year ?? 0) >= currentYear) return false
    return true
  })
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
    const wantsDocumentary = tags.world_tags?.includes('documentary') ?? false
    const wantsInternational = preferenceTags.includes('international')

    const t0 = Date.now()

    const baseOpts = {
      excludeTags,
      wantsFamily,
      wantsDocumentary,
      today,
    }

    // ── International path ─────────────────────────────────────────────────────
    if (wantsInternational) {
      let raw = await fetchFilteredMovies(supabase, {
        ...baseOpts,
        moodTags: tags.mood_tags ?? [],
        languageFilter: 'non-en-non-indian',
      })
      let filtered = jsContentFilter(raw, currentYear)

      console.log(`[recommend] DB query (non-Indian foreign): ${raw.length} raw → ${filtered.length} after JS filter (${Date.now() - t0}ms)`)

      // Fallback to Indian languages if no non-Indian matches
      if (filtered.length === 0) {
        raw = await fetchFilteredMovies(supabase, {
          ...baseOpts,
          moodTags: tags.mood_tags ?? [],
          languageFilter: 'non-en-indian',
        })
        filtered = jsContentFilter(raw, currentYear)
        console.log(`[recommend] Fell back to Indian films: ${filtered.length}`)
      }

      // Language distribution log
      const langCounts: Record<string, number> = {}
      filtered.forEach((m) => {
        const l = m.original_language ?? 'unknown'
        langCounts[l] = (langCounts[l] ?? 0) + 1
      })
      const sortedLangs = Object.entries(langCounts).sort((a, b) => b[1] - a[1])
      console.log(
        `[recommend] Foreign pool (${filtered.length}):`,
        sortedLangs.map(([l, c]) => `${l}: ${c}`).join(', ')
      )

      // Score: mood already filtered server-side; world/energy/context are bonus
      const fScored = filtered.map((movie) => {
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

      // Pick with language diversity
      const shuffled = [...fScored].sort(() => Math.random() - 0.5)
      const picked: Movie[] = []
      const usedLangs = new Set<string>()

      for (const { movie } of shuffled) {
        if (picked.length >= count) break
        const lang = movie.original_language ?? 'unknown'
        if (!usedLangs.has(lang)) {
          picked.push(movie)
          usedLangs.add(lang)
        }
      }

      if (picked.length < count) {
        const pickedIds = new Set(picked.map((m) => m.id))
        for (const { movie } of shuffled) {
          if (picked.length >= count) break
          if (!pickedIds.has(movie.id)) picked.push(movie)
        }
      }

      let warningMessage: string | undefined
      if (picked.length > 0 && picked.length < count) {
        warningMessage = `Only ${picked.length} foreign film${picked.length === 1 ? '' : 's'} matched your filters — try different answers for more variety`
      }

      console.log(
        `[recommend] Final ${count} foreign picks:`,
        picked.map((m) => `${m.title} (${m.original_language}, ${m.year})`)
      )

      if (picked.length === 0 && excludedIds.length > 0) {
        return NextResponse.json({ movies: [], sessionId: null })
      }

      const { data: session, error: sessionError } = await supabase
        .from('quiz_sessions')
        .insert({ answers, recommended_movie_ids: picked.map((m) => m.id) })
        .select('id')
        .single()
      if (sessionError) console.error('Session save error:', sessionError)

      const movieIds = picked.map((m) => m.id)
      const { data: availability } = await supabase
        .from('availability')
        .select('*')
        .in('movie_id', movieIds)

      return NextResponse.json({
        movies: picked.map((movie, i) => ({
          ...movie,
          matchReason: generateMatchReason(movie, tags, i),
          availability: (availability || []).filter((a) => a.movie_id === movie.id),
        })),
        sessionId: session?.id ?? null,
        ...(warningMessage ? { warning: warningMessage } : {}),
      })
    }

    // ── Non-international path ─────────────────────────────────────────────────
    const raw = await fetchFilteredMovies(supabase, {
      ...baseOpts,
      moodTags: tags.mood_tags ?? [],
      languageFilter: 'en',
    })

    let filtered = jsContentFilter(raw, currentYear)

    console.log(`[recommend] DB query (English): ${raw.length} raw → ${filtered.length} after JS filter (${Date.now() - t0}ms)`)

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: 'No tagged movies found. Run /api/seed first, then node scripts/ai-tag-movies.js.' },
        { status: 404 }
      )
    }

    // Hidden gems filter
    if (preferenceTags.includes('hidden-gems')) {
      const gems = filtered.filter((m) => (m.vote_count ?? 0) < 5000)
      if (gems.length >= count) filtered = gems
    }

    // Score all filtered movies
    const scored = filtered.map((movie) => {
      let score = 0
      if (tags.mood_tags) score += tags.mood_tags.filter((t) => movie.mood_tags.includes(t)).length * 3
      if (tags.energy_tags) score += tags.energy_tags.filter((t) => movie.energy_tags.includes(t)).length * 2
      if (tags.world_tags) score += tags.world_tags.filter((t) => movie.world_tags.includes(t)).length * 2
      if (tags.context_tags) score += tags.context_tags.filter((t) => movie.context_tags.includes(t)).length * 2
      if (preferenceTags.includes('popular') && (movie.vote_count ?? 0) > 10000) score += 2
      score -= (movie.vote_count ?? 0) / 10000
      if (excludedIds.includes(movie.id)) score -= 5
      score += (Math.random() - 0.5) * 6
      return { movie, score }
    })

    scored.sort((a, b) => b.score - a.score)

    const poolSize = count === 1 ? 80 : 200
    const randomPick = <T>(arr: T[], n: number): T[] =>
      [...arr].sort(() => Math.random() - 0.5).slice(0, n)

    const unseenScored = scored.filter(({ movie }) => !excludedIds.includes(movie.id))
    const seenScored = scored.filter(({ movie }) => excludedIds.includes(movie.id))

    let topN: Movie[]

    if (unseenScored.length >= count) {
      topN = randomPick(unseenScored.slice(0, poolSize), count).map(({ movie }) => movie)
    } else if (unseenScored.length > 0) {
      topN = [
        ...unseenScored.map(({ movie }) => movie),
        ...randomPick(seenScored.slice(0, poolSize), count - unseenScored.length).map(({ movie }) => movie),
      ]
    } else if (excludedIds.length > 0 && seenScored.length > 0) {
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

    // Year diversity: ensure at least 2 of 3 are from year >= 2000
    if (topN.length >= 3) {
      const modernCount = topN.filter((m) => (m.year ?? 0) >= 2000).length
      if (modernCount < 2) {
        const topIds = new Set(topN.map((m) => m.id))
        const modernPool = scored.filter(({ movie }) => (movie.year ?? 0) >= 2000 && !topIds.has(movie.id))
        const preModernSlots = topN.map((m, i) => ((m.year ?? 0) < 2000 ? i : -1)).filter((i) => i >= 0)
        const needed = 2 - modernCount
        for (let i = 0; i < needed && i < modernPool.length && i < preModernSlots.length; i++) {
          topN[preModernSlots[preModernSlots.length - 1 - i]] = modernPool[i].movie
        }
      }
    }

    console.log(`[recommend] Top ${count} picks:`, topN.map((m) => `${m.title} (${m.original_language}, ${m.year})`))

    if (topN.length === 0) {
      if (excludedIds.length > 0) {
        return NextResponse.json({ movies: [], sessionId: null })
      }

      // Fallback: top movies by vote_count
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fbQ: any = supabase.from('movies').select('*').eq('ai_tagged', true)
      if (wantsFamily) fbQ = fbQ.eq('family_safe', true)
      fbQ = fbQ.order('vote_count', { ascending: false }).limit(20)
      const { data: fbData } = await fbQ
      const fallback = (fbData as Movie[] ?? [])
        .filter((m) => !isAdultContent(m) && !isMetaContent(m))
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
      .insert({ answers, recommended_movie_ids: topN.map((m) => m.id) })
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
    })
  } catch (err) {
    console.error('Recommend error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
