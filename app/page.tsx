'use client'

import { useState } from 'react'
import ProgressBar from '@/components/ProgressBar'
import QuizButton from '@/components/QuizButton'
import { QUESTIONS, QuizAnswers } from '@/lib/quiz'
import { Movie, Availability } from '@/lib/supabase'

type MovieWithMeta = Movie & {
  matchReason: string
  availability?: Availability[]
}

type Screen = 'start' | 'quiz' | 'loading' | 'results'

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500'

const MOOD_ACCENT: Record<string, string> = {
  funny: '#EAB308',
  tense: '#EF4444',
  emotional: '#3B82F6',
  cerebral: '#A855F7',
  horror: '#7F1D1D',
  inspiring: '#22C55E',
}

const PLATFORM_COLORS: Record<string, string> = {
  Netflix: 'bg-red-700',
  'Amazon Prime Video': 'bg-blue-700',
  'Disney+': 'bg-blue-600',
  'HBO Max': 'bg-purple-700',
  Max: 'bg-purple-700',
  Hulu: 'bg-green-700',
  'Apple TV+': 'bg-gray-700',
  'Peacock Premium': 'bg-yellow-700',
  Tubi: 'bg-orange-700',
  Crunchyroll: 'bg-orange-600',
}

function platformColor(name: string) {
  return PLATFORM_COLORS[name] ?? 'bg-gray-700'
}

function getMoodAccent(movie: MovieWithMeta): string {
  const primary = movie.mood_tags[0]
  return MOOD_ACCENT[primary] ?? '#4B5563'
}

function StarIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-gray-800" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
      </div>
      <p className="text-gray-400 text-sm">Finding your perfect movies…</p>
    </div>
  )
}

function MovieCard({ movie, index }: { movie: MovieWithMeta; index: number }) {
  const poster = movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null
  const accentColor = getMoodAccent(movie)
  const flatrate = (movie.availability ?? []).filter(
    (a) => a.type === 'flatrate' || a.type === 'free' || a.type === 'ads'
  )
  const rent = (movie.availability ?? []).filter(
    (a) => a.type === 'rent' || a.type === 'buy'
  )

  const labels = ['Top Pick', 'Great Match', 'Also Consider']

  return (
    <div className="flex bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition-all duration-300">
      {/* Mood accent line */}
      <div
        className="w-1 flex-shrink-0"
        style={{ backgroundColor: accentColor }}
      />

      {/* Poster */}
      <div className="flex-shrink-0 w-36 relative self-stretch min-h-[200px]">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt={movie.title}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: 'drop-shadow(4px 0 12px rgba(0,0,0,0.7))' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-600">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </div>
        )}
        {/* Badge */}
        <div className="absolute top-2 left-0 z-10">
          <span className="text-xs font-bold text-white px-2 py-0.5 rounded-r-full shadow"
            style={{ backgroundColor: accentColor }}>
            {labels[index] ?? `#${index + 1}`}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 py-4 px-4 min-w-0 flex flex-col gap-2">
        <h3 className="font-extrabold text-white text-lg leading-tight">
          {movie.title}
        </h3>

        <div className="flex items-center gap-2">
          {movie.year && (
            <span className="text-xs text-gray-500">{movie.year}</span>
          )}
          {movie.rating && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <StarIcon />
              {movie.rating.toFixed(1)}
            </span>
          )}
        </div>

        <p className="text-xs text-indigo-300 italic leading-relaxed">
          {movie.matchReason}
        </p>

        {/* Streaming */}
        {flatrate.length > 0 && (
          <div>
            <p className="text-xs text-gray-600 mb-1">Stream free:</p>
            <div className="flex flex-wrap gap-1.5">
              {flatrate.slice(0, 4).map((a) => (
                <span
                  key={`${a.platform}-${a.type}`}
                  className={`text-xs text-white px-2 py-0.5 rounded-full font-medium ${platformColor(a.platform)}`}
                >
                  {a.platform}
                </span>
              ))}
            </div>
          </div>
        )}

        {flatrate.length === 0 && rent.length > 0 && (
          <div>
            <p className="text-xs text-gray-600 mb-1">Rent / Buy:</p>
            <div className="flex flex-wrap gap-1.5">
              {rent.slice(0, 3).map((a) => (
                <span
                  key={`${a.platform}-${a.type}`}
                  className={`text-xs text-white px-2 py-0.5 rounded-full font-medium ${platformColor(a.platform)}`}
                >
                  {a.platform}
                </span>
              ))}
            </div>
          </div>
        )}

        {flatrate.length === 0 && rent.length === 0 && (
          <p className="text-xs text-gray-700">No streaming info available</p>
        )}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="w-full flex items-center justify-center gap-3 py-6 text-xs text-gray-700">
      <span>
        Powered by{' '}
        <span className="font-semibold" style={{ color: '#01b4e4' }}>TMDB</span>
      </span>
      <span>·</span>
      <span>Built by RecommendMeMovies</span>
    </footer>
  )
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('start')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const [movies, setMovies] = useState<MovieWithMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const currentQuestion = QUESTIONS[questionIndex]
  const isMulti = currentQuestion?.multi ?? false

  function getAnswer(qid: string): string | string[] | undefined {
    return (answers as Record<string, string | string[]>)[qid]
  }

  function isOptionSelected(option: string): boolean {
    const val = getAnswer(currentQuestion.id)
    if (isMulti) return Array.isArray(val) && val.includes(option)
    return val === option
  }

  function toggleOption(option: string) {
    const qid = currentQuestion.id
    if (!isMulti) {
      setAnswers((prev) => ({ ...prev, [qid]: option }))
      return
    }

    const current = (getAnswer(qid) as string[]) ?? []

    if (option === "Nothing — I'm open") {
      setAnswers((prev) => ({
        ...prev,
        [qid]: current.includes(option) ? [] : [option],
      }))
      return
    }

    const withoutOpen = current.filter((o) => o !== "Nothing — I'm open")
    if (withoutOpen.includes(option)) {
      setAnswers((prev) => ({ ...prev, [qid]: withoutOpen.filter((o) => o !== option) }))
    } else {
      setAnswers((prev) => ({ ...prev, [qid]: [...withoutOpen, option] }))
    }
  }

  function canAdvance(): boolean {
    const val = getAnswer(currentQuestion.id)
    if (isMulti) return Array.isArray(val) && val.length > 0
    return val !== undefined && val !== ''
  }

  async function handleNext() {
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex((i) => i + 1)
      return
    }
    await submitQuiz()
  }

  async function submitQuiz() {
    setScreen('loading')
    setError(null)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')

      // Fetch live watch providers for each result
      const enriched: MovieWithMeta[] = await Promise.all(
        (data.movies as MovieWithMeta[]).map(async (movie) => {
          try {
            const provRes = await fetch(`/api/watch-providers/${movie.tmdb_id}`)
            if (provRes.ok) {
              const provData = await provRes.json()
              return {
                ...movie,
                availability: (provData.providers ?? []).map((p: { platform: string; type: string }) => ({
                  id: 0,
                  movie_id: movie.id,
                  platform: p.platform,
                  type: p.type,
                  price: null,
                  url: null,
                  last_checked_at: new Date().toISOString(),
                })),
              }
            }
          } catch {
            // ignore provider errors
          }
          return movie
        })
      )

      setMovies(enriched)
      setScreen('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setScreen('quiz')
    }
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  function restart() {
    setScreen('start')
    setQuestionIndex(0)
    setAnswers({})
    setMovies([])
    setError(null)
  }

  return (
    <div className="min-h-screen text-white flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex-1 flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-lg">

          {/* ── START ── */}
          {screen === 'start' && (
            <div className="flex flex-col items-center text-center gap-8 pt-12">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  RecommendMeMovies
                </h1>
                <p className="text-gray-400 mt-3 text-base leading-relaxed">
                  6 questions. 3 perfect movies.<br />
                  Zero scrolling through Netflix.
                </p>
              </div>

              <div className="relative w-full max-w-xs">
                <div className="absolute inset-0 rounded-2xl bg-indigo-600 opacity-25 animate-ping pointer-events-none" />
                <button
                  onClick={() => setScreen('quiz')}
                  className="btn-glow-pulse relative w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-4 px-8 rounded-2xl transition-colors duration-200 text-base"
                >
                  Find my movie →
                </button>
              </div>
            </div>
          )}

          {/* ── QUIZ ── */}
          {screen === 'quiz' && currentQuestion && (
            <div className="flex flex-col gap-6">
              <ProgressBar current={questionIndex + 1} total={QUESTIONS.length} />

              <div>
                <h2 className="text-xl font-bold text-white leading-snug">
                  {currentQuestion.text}
                </h2>
                {isMulti && (
                  <p className="text-xs text-gray-500 mt-1">Select all that apply.</p>
                )}
              </div>

              {error && (
                <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                {currentQuestion.options.map((option, i) => (
                  <QuizButton
                    key={option}
                    label={option}
                    selected={isOptionSelected(option)}
                    onClick={() => toggleOption(option)}
                    multi={isMulti}
                    emoji={currentQuestion.emojis?.[i]}
                  />
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                {questionIndex > 0 && (
                  <button
                    onClick={() => setQuestionIndex((i) => i - 1)}
                    className="flex-1 py-3 rounded-xl border border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300 transition-all text-sm font-medium"
                  >
                    ← Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={!canAdvance()}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-900 disabled:text-gray-700 disabled:border disabled:border-gray-800 text-white font-semibold transition-all text-sm"
                >
                  {questionIndex === QUESTIONS.length - 1 ? 'Find my movies →' : 'Next →'}
                </button>
              </div>
            </div>
          )}

          {/* ── LOADING ── */}
          {screen === 'loading' && (
            <div className="flex justify-center items-center min-h-[60vh]">
              <LoadingSpinner />
            </div>
          )}

          {/* ── RESULTS ── */}
          {screen === 'results' && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <h2 className="text-2xl font-extrabold text-white">Your picks for tonight</h2>
                <p className="text-gray-600 text-sm mt-1">Based on your answers</p>
              </div>

              <div className="flex flex-col gap-4">
                {movies.map((movie, i) => (
                  <MovieCard key={movie.id} movie={movie} index={i} />
                ))}
              </div>

              <div className="flex flex-col gap-3 mt-2">
                {/* Share button */}
                <button
                  onClick={handleShare}
                  className="w-full py-3.5 rounded-xl border border-gray-800 text-gray-400 hover:border-indigo-500/50 hover:text-indigo-400 transition-all text-sm font-medium flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-green-400">Link copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      Share your picks
                    </>
                  )}
                </button>

                {/* Restart button */}
                <button
                  onClick={restart}
                  className="w-full py-3.5 rounded-xl border border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-all text-sm font-medium"
                >
                  ↺ Start over
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      <Footer />
    </div>
  )
}
