import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

const TMDB_BASE = 'https://api.themoviedb.org/3'

export async function GET(
  _request: NextRequest,
  { params }: { params: { tmdb_id: string } }
) {
  const apiKey = process.env.TMDB_API_KEY
  const tmdbId = parseInt(params.tmdb_id)

  if (!apiKey) {
    return NextResponse.json({ error: 'TMDB_API_KEY not configured' }, { status: 500 })
  }

  if (isNaN(tmdbId)) {
    return NextResponse.json({ error: 'Invalid tmdb_id' }, { status: 400 })
  }

  const supabase = getSupabase()

  try {
    const res = await fetch(
      `${TMDB_BASE}/movie/${tmdbId}/watch/providers?api_key=${apiKey}`
    )
    if (!res.ok) throw new Error(`TMDB error: ${res.status}`)

    const data = await res.json()
    const us = data.results?.US

    if (!us) {
      return NextResponse.json({ providers: [] })
    }

    // Find the movie in our DB
    const { data: movie } = await supabase
      .from('movies')
      .select('id')
      .eq('tmdb_id', tmdbId)
      .single()

    const providers: { platform: string; type: string; logo: string }[] = []

    const processProviders = (list: { provider_name: string; logo_path: string }[], type: string) => {
      if (!list) return
      for (const p of list) {
        providers.push({
          platform: p.provider_name,
          type,
          logo: `https://image.tmdb.org/t/p/original${p.logo_path}`,
        })
      }
    }

    processProviders(us.flatrate, 'flatrate')
    processProviders(us.free, 'free')
    processProviders(us.ads, 'ads')
    processProviders(us.rent, 'rent')
    processProviders(us.buy, 'buy')

    // Save to availability table if we have a movie record
    if (movie?.id) {
      // Delete old records first
      await supabase.from('availability').delete().eq('movie_id', movie.id)

      if (providers.length > 0) {
        await supabase.from('availability').insert(
          providers.map((p) => ({
            movie_id: movie.id,
            platform: p.platform,
            type: p.type,
            url: us.link || null,
            last_checked_at: new Date().toISOString(),
          }))
        )
      }
    }

    return NextResponse.json({ providers, tmdbLink: us.link || null })
  } catch (err) {
    console.error('Watch providers error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
