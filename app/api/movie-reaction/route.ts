import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { movie_id, reaction, session_id } = await request.json()
    if (!movie_id || !session_id) {
      return NextResponse.json({ error: 'movie_id and session_id are required' }, { status: 400 })
    }
    if (reaction !== 'like' && reaction !== 'dislike' && reaction !== null) {
      return NextResponse.json({ error: 'reaction must be like, dislike, or null' }, { status: 400 })
    }

    const supabase = getSupabase()

    if (reaction === null) {
      // Undo: remove the row entirely
      const { error } = await supabase
        .from('movie_reactions')
        .delete()
        .eq('movie_id', movie_id)
        .eq('session_id', session_id)
      if (error) throw error
    } else {
      // Insert or switch reaction
      const { error } = await supabase.from('movie_reactions').upsert(
        { movie_id, reaction, session_id },
        { onConflict: 'movie_id,session_id' }
      )
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Movie reaction error:', err)
    return NextResponse.json({ error: 'Failed to save reaction' }, { status: 500 })
  }
}
