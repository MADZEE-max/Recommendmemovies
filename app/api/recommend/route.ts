import { NextRequest, NextResponse } from 'next/server'
import { getSupabase, Movie } from '@/lib/supabase'
import { mapAnswersToTags, generateMatchReason, QuizAnswers } from '@/lib/quiz'

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  try {
    const answers: QuizAnswers = await request.json()
    const tags = mapAnswersToTags(answers)
    const excludeTags = tags.exclude_tags || []
    const preferenceTags = tags.preference_tags || []

    // Fetch all AI-tagged movies from Supabase.
    // We only recommend movies where ai_tagged=true so half-tagged movies are
    // never surfaced during the tagging pipeline run.
    const { data: movies, error } = await supabase
      .from('movies')
      .select('*')
      .eq('ai_tagged', true)

    if (error) throw error
    if (!movies || movies.length === 0) {
      return NextResponse.json(
        {
          error:
            'No tagged movies found. Run /api/seed first, then node scripts/ai-tag-movies.js.',
        },
        { status: 404 }
      )
    }

    // 1. Filter out excluded tags
    let filtered = (movies as Movie[]).filter((movie) => {
      if (excludeTags.length === 0) return true
      return !excludeTags.some((tag) => movie.exclude_tags.includes(tag))
    })

    // 2. Language filter — English only by default, unless "international" preference
    if (!preferenceTags.includes('international')) {
      const englishOnly = filtered.filter(
        (m) => !m.original_language || m.original_language === 'en'
      )
      // Only apply filter if it leaves enough movies to work with
      if (englishOnly.length >= 3) filtered = englishOnly
    }

    // 3. Hidden gems filter — vote_count < 5000
    if (preferenceTags.includes('hidden-gems')) {
      const gems = filtered.filter((m) => (m.vote_count ?? 0) < 5000)
      if (gems.length >= 3) filtered = gems
    }

    // 4. Score movies
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

      // Popular boost: extra weight for high-vote-count movies
      if (preferenceTags.includes('popular') && (movie.vote_count ?? 0) > 10000) {
        score += 2
      }

      return { movie, score }
    })

    // Sort by score desc, then vote_count desc for ties
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.movie.vote_count ?? 0) - (a.movie.vote_count ?? 0)
    })

    const top3 = scored.slice(0, 3).map(({ movie }) => movie)

    if (top3.length === 0) {
      // Fallback: return top-rated movies
      const fallback = (movies as Movie[])
        .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
        .slice(0, 3)

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

    // Save quiz session
    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert({
        answers,
        recommended_movie_ids: top3.map((m) => m.id),
      })
      .select('id')
      .single()

    if (sessionError) console.error('Session save error:', sessionError)

    // Fetch stored availability for top 3
    const movieIds = top3.map((m) => m.id)
    const { data: availability } = await supabase
      .from('availability')
      .select('*')
      .in('movie_id', movieIds)

    const withReasons = top3.map((movie, i) => ({
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
