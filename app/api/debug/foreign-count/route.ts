import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const INDIAN_LANGUAGES = ['hi', 'ta', 'te', 'pa', 'ml', 'kn', 'bn']

export async function GET() {
  const supabase = getSupabase()

  // Paginate all non-English films (Supabase default row limit is 1000)
  const allMovies: Record<string, unknown>[] = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('id, title, original_language, mood_tags, world_tags, energy_tags, ai_tagged, vote_count, year, genres')
      .neq('original_language', 'en')
      .not('original_language', 'is', null)
      .range(offset, offset + PAGE - 1)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allMovies.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  const nonIndian = allMovies.filter(
    (m) => !INDIAN_LANGUAGES.includes(m.original_language ?? '')
  )
  const indian = allMovies.filter(
    (m) => INDIAN_LANGUAGES.includes(m.original_language ?? '')
  )

  // Count by language
  const byLanguage: Record<string, number> = {}
  for (const m of nonIndian) {
    const l = m.original_language ?? 'unknown'
    byLanguage[l] = (byLanguage[l] ?? 0) + 1
  }

  // Count ai_tagged
  const tagged = nonIndian.filter((m) => m.ai_tagged).length
  const untagged = nonIndian.length - tagged

  // Count by mood_tag
  const byMood: Record<string, number> = {}
  for (const m of nonIndian) {
    if (!m.ai_tagged) continue
    for (const tag of (m.mood_tags ?? [])) {
      byMood[tag] = (byMood[tag] ?? 0) + 1
    }
  }

  // Count by world_tag
  const byWorld: Record<string, number> = {}
  for (const m of nonIndian) {
    if (!m.ai_tagged) continue
    for (const tag of (m.world_tags ?? [])) {
      byWorld[tag] = (byWorld[tag] ?? 0) + 1
    }
  }

  // Cross-tab: language × mood (how many Korean emotional, Korean funny, etc.)
  const crossTab: Record<string, Record<string, number>> = {}
  for (const m of nonIndian) {
    if (!m.ai_tagged) continue
    const lang = m.original_language ?? 'unknown'
    if (!crossTab[lang]) crossTab[lang] = {}
    for (const tag of (m.mood_tags ?? [])) {
      crossTab[lang][tag] = (crossTab[lang][tag] ?? 0) + 1
    }
  }

  // Cross-tab: language × world
  const crossWorld: Record<string, Record<string, number>> = {}
  for (const m of nonIndian) {
    if (!m.ai_tagged) continue
    const lang = m.original_language ?? 'unknown'
    if (!crossWorld[lang]) crossWorld[lang] = {}
    for (const tag of (m.world_tags ?? [])) {
      crossWorld[lang][tag] = (crossWorld[lang][tag] ?? 0) + 1
    }
  }

  // Sample 20 from each language (tagged only)
  const samplesByLang: Record<string, { id: number; title: string; year: number | null; mood_tags: string[]; world_tags: string[] }[]> = {}
  const taggedNonIndian = nonIndian.filter((m) => m.ai_tagged)
  for (const lang of Object.keys(byLanguage)) {
    const pool = taggedNonIndian.filter((m) => m.original_language === lang)
    samplesByLang[lang] = pool.slice(0, 20).map((m) => ({
      id: m.id,
      title: m.title,
      year: m.year,
      mood_tags: m.mood_tags ?? [],
      world_tags: m.world_tags ?? [],
    }))
  }

  // Specific narrow pools the user cares about (Korean emotional realistic, Japanese tense fantastical)
  const koreanEmotionalRealistic = taggedNonIndian.filter(
    (m) =>
      m.original_language === 'ko' &&
      (m.mood_tags ?? []).includes('emotional') &&
      (m.world_tags ?? []).includes('realistic')
  )
  const japaneseTenseFantastical = taggedNonIndian.filter(
    (m) =>
      m.original_language === 'ja' &&
      (m.mood_tags ?? []).includes('tense') &&
      (m.world_tags ?? []).includes('fantastical')
  )
  const koreanEmotional = taggedNonIndian.filter(
    (m) => m.original_language === 'ko' && (m.mood_tags ?? []).includes('emotional')
  )
  const koreanFunny = taggedNonIndian.filter(
    (m) => m.original_language === 'ko' && (m.mood_tags ?? []).includes('funny')
  )
  const koreanTense = taggedNonIndian.filter(
    (m) => m.original_language === 'ko' && (m.mood_tags ?? []).includes('tense')
  )
  const frenchEmotional = taggedNonIndian.filter(
    (m) => m.original_language === 'fr' && (m.mood_tags ?? []).includes('emotional')
  )

  const result = {
    summary: {
      totalForeign: allMovies.length,
      nonIndianForeign: nonIndian.length,
      indianForeign: indian.length,
      aiTagged: tagged,
      notTagged: untagged,
    },
    byLanguage: Object.entries(byLanguage).sort((a, b) => b[1] - a[1]),
    byMoodTag: Object.entries(byMood).sort((a, b) => b[1] - a[1]),
    byWorldTag: Object.entries(byWorld).sort((a, b) => b[1] - a[1]),
    crossTabMoodByLanguage: crossTab,
    crossTabWorldByLanguage: crossWorld,
    narrowPoolDiagnostics: {
      'Korean emotional (mood-only)': koreanEmotional.length,
      'Korean emotional+realistic (mood+world)': koreanEmotionalRealistic.length,
      'Korean funny (mood-only)': koreanFunny.length,
      'Korean tense (mood-only)': koreanTense.length,
      'Japanese tense+fantastical (mood+world)': japaneseTenseFantastical.length,
      'French emotional (mood-only)': frenchEmotional.length,
    },
    samplesPerLanguage: samplesByLang,
  }

  console.log('[debug/foreign-count] Summary:', JSON.stringify(result.summary))
  console.log('[debug/foreign-count] By language:', result.byLanguage)
  console.log('[debug/foreign-count] Mood tags:', result.byMoodTag)
  console.log('[debug/foreign-count] World tags:', result.byWorldTag)
  console.log('[debug/foreign-count] Narrow pool diagnostics:', result.narrowPoolDiagnostics)

  return Response.json(result, {
    headers: { 'Content-Type': 'application/json' },
  })
}
