import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | undefined

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

export type Movie = {
  id: number
  tmdb_id: number
  title: string
  year: number | null
  release_date: string | null
  poster_path: string | null
  rating: number | null
  vote_count: number | null
  overview: string | null
  original_language: string | null
  genres: string[]
  ai_tagged: boolean
  family_safe: boolean | null
  mood_tags: string[]
  energy_tags: string[]
  world_tags: string[]
  context_tags: string[]
  exclude_tags: string[]
}

export type Availability = {
  id: number
  movie_id: number
  platform: string
  type: string
  price: number | null
  url: string | null
  last_checked_at: string
}

export type QuizSession = {
  id: number
  answers: Record<string, string | string[]>
  recommended_movie_ids: number[]
  created_at: string
}
