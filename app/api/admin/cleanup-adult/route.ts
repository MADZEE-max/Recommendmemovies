import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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
]

const ADULT_OVERVIEW_KEYWORDS = [
  'pornographic', 'xxx', 'erotic film', 'sex film', 'pink film', 'adult film',
]

// Specific titles to always remove regardless of keyword match
const SPECIFIC_TITLES = [
  'first stay date rena miyashita',
  'recently my sister is unusual',
]

function isAdultRow(row: { title: string; original_language: string | null; vote_count: number | null; overview: string | null; genres: string[] | null }): boolean {
  const titleLower = (row.title ?? '').toLowerCase()
  if (ADULT_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) return true
  if (SPECIFIC_TITLES.includes(titleLower)) return true
  const overviewLower = (row.overview ?? '').toLowerCase()
  if (ADULT_OVERVIEW_KEYWORDS.some((kw) => overviewLower.includes(kw))) return true
  // Japanese TV Movies (pink films)
  if (row.original_language === 'ja' && (row.genres ?? []).includes('TV Movie')) return true
  // Japanese films with low vote counts or Drama genre with low votes
  if (row.original_language === 'ja' && (row.vote_count ?? 0) < 500) return true
  if (row.original_language === 'ja' && (row.genres ?? []).includes('Drama') && (row.vote_count ?? 0) < 500) return true
  return false
}

export async function GET() {
  const supabase = getSupabase()
  const deleted: string[] = []
  let totalDeleted = 0

  try {
    let offset = 0
    const PAGE_SIZE = 1000
    const toDelete: { id: number; title: string; reason: string }[] = []

    while (true) {
      const { data, error } = await supabase
        .from('movies')
        .select('id, title, original_language, overview, vote_count, genres')
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return Response.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break

      for (const row of data) {
        const titleLower = (row.title ?? '').toLowerCase()
        let reason = ''
        if (SPECIFIC_TITLES.includes(titleLower)) reason = 'specific-title'
        else if (ADULT_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) reason = 'title-keyword'
        else if (ADULT_OVERVIEW_KEYWORDS.some((kw) => (row.overview ?? '').toLowerCase().includes(kw))) reason = 'overview-keyword'
        else if (row.original_language === 'ja' && (row.genres ?? []).includes('TV Movie')) reason = 'ja-tv-movie'
        else if (row.original_language === 'ja' && (row.vote_count ?? 0) < 500) reason = 'ja-low-vote'
        else if (row.original_language === 'ja' && (row.genres ?? []).includes('Drama') && (row.vote_count ?? 0) < 500) reason = 'ja-drama-low-vote'
        if (reason) toDelete.push({ id: row.id, title: row.title, reason })
      }

      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    if (toDelete.length === 0) {
      return Response.json({ message: 'No adult content found — database is clean.', deleted: [] })
    }

    const idsToDelete = toDelete.map((m) => m.id)

    // Delete from availability first (FK constraint)
    await supabase.from('availability').delete().in('movie_id', idsToDelete)

    const { error: delError } = await supabase
      .from('movies')
      .delete()
      .in('id', idsToDelete)

    if (delError) return Response.json({ error: delError.message }, { status: 500 })

    totalDeleted = toDelete.length
    deleted.push(...toDelete.map((m) => `[${m.id}] ${m.title} (${m.reason})`))

    return Response.json({
      message: `Deleted ${totalDeleted} adult-content movies.`,
      deleted,
    })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
