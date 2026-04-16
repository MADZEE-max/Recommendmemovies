export type QuizAnswers = {
  q1?: string
  q2?: string
  q3?: string
  q4?: string[]
  q5?: string
  q6?: string
}

export type TagMapping = {
  context_tags?: string[]
  mood_tags?: string[]
  energy_tags?: string[]
  exclude_tags?: string[]
  world_tags?: string[]
  preference_tags?: string[]
}

export function mapAnswersToTags(answers: QuizAnswers): TagMapping {
  const mapping: TagMapping = {}

  // Q1: context
  if (answers.q1) {
    const q1Map: Record<string, string> = {
      'Solo couch night': 'solo',
      'Date night': 'date',
      'Friends over': 'friends',
      'Family time': 'family',
    }
    const tag = q1Map[answers.q1]
    if (tag) mapping.context_tags = [tag]
  }

  // Q2: mood (6 options)
  if (answers.q2) {
    const q2Map: Record<string, string> = {
      'Make me laugh': 'funny',
      'Keep me on edge': 'tense',
      'Make me feel something': 'emotional',
      'Blow my mind': 'cerebral',
      'Scare me': 'horror',
      'Inspire me': 'inspiring',
    }
    const tag = q2Map[answers.q2]
    if (tag) mapping.mood_tags = [tag]
  }

  // Q3: energy
  if (answers.q3) {
    const q3Map: Record<string, string> = {
      'Zero — just entertain me': 'light',
      'Some — I like a good story': 'medium',
      'Full — challenge me': 'intense',
    }
    const tag = q3Map[answers.q3]
    if (tag) mapping.energy_tags = [tag]
  }

  // Q4: exclude (multi-select) — no Subtitles, added Sad endings
  if (answers.q4 && answers.q4.length > 0) {
    const q4Map: Record<string, string> = {
      Violence: 'violence',
      'Jump scares': 'scares',
      'Heavy themes': 'heavy',
      'Sad endings': 'sad-endings',
    }
    const excludes = answers.q4
      .filter((a) => a !== "Nothing — I'm open")
      .map((a) => q4Map[a])
      .filter(Boolean)
    if (excludes.length > 0) mapping.exclude_tags = excludes
  }

  // Q5: world (5 options including Documentary)
  if (answers.q5) {
    const q5Map: Record<string, string> = {
      'Real and grounded': 'realistic',
      'Slightly weird': 'quirky',
      'Full fantasy/sci-fi': 'fantastical',
      'Based on true events': 'true-story',
      'Documentary': 'documentary',
    }
    const tag = q5Map[answers.q5]
    if (tag) mapping.world_tags = [tag]
  }

  // Q6: preference
  if (answers.q6) {
    const q6Map: Record<string, string> = {
      'Show me popular hits': 'popular',
      'Hidden gems only': 'hidden-gems',
      'Non-English films welcome': 'international',
      'No preference': 'none',
    }
    const tag = q6Map[answers.q6]
    if (tag && tag !== 'none') mapping.preference_tags = [tag]
  }

  return mapping
}

export function generateMatchReason(
  movie: { mood_tags: string[]; energy_tags: string[]; world_tags: string[]; context_tags: string[] },
  tags: TagMapping,
  variant: number = 0
): string {
  const mm = tags.mood_tags?.find((t) => movie.mood_tags.includes(t))
  const me = tags.energy_tags?.find((t) => movie.energy_tags.includes(t))
  const mw = tags.world_tags?.find((t) => movie.world_tags.includes(t))
  const mc = tags.context_tags?.find((t) => movie.context_tags.includes(t))

  const moodAdj: Record<string, string> = {
    funny: 'funny',
    tense: 'tense',
    emotional: 'emotionally rich',
    cerebral: 'mind-bending',
    horror: 'genuinely chilling',
    inspiring: 'deeply inspiring',
  }

  const energyAdj: Record<string, string> = {
    light: 'easy to watch',
    medium: 'satisfying to follow',
    intense: 'deeply engaging',
  }

  // Short world adjective for use inside phrases like "a [world] film" or "set in a [world] world"
  const worldShort: Record<string, string> = {
    realistic: 'grounded',
    quirky: 'quirky',
    fantastical: 'fantastical',
    'true-story': 'true-story',
    documentary: 'documentary',
  }

  // Noun-style world for "[Mood] meets [world]" template
  const worldNoun: Record<string, string> = {
    realistic: 'reality',
    quirky: 'the offbeat',
    fantastical: 'fantasy',
    'true-story': 'true-life drama',
    documentary: 'the real world',
  }

  const contextPhrase: Record<string, string> = {
    solo: 'a solo night in',
    date: 'date night',
    friends: 'watching with friends',
    family: 'the whole family',
  }

  const mood = mm ? moodAdj[mm] : 'compelling'
  const energy = me ? energyAdj[me] : 'engaging'
  const world = mw ? worldShort[mw] : 'grounded'
  const worldN = mw ? worldNoun[mw] : 'great cinema'
  const context = mc ? contextPhrase[mc] : 'tonight'

  function cap(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  // Each slot uses a structurally distinct template — index 0, 1, 2 never share a pattern
  const slot = variant % 3
  if (slot === 0) {
    return `A ${mood} ${world} film — ${energy} and perfect for ${context}.`
  } else if (slot === 1) {
    return `Great for ${context}: ${mood}, ${energy}, set in a ${world} world.`
  } else {
    return `${cap(mood)} meets ${worldN} — ${energy} viewing that fits your ${context} perfectly.`
  }
}

export const QUESTIONS = [
  {
    id: 'q1',
    text: 'What kind of evening is it?',
    options: ['Solo couch night', 'Date night', 'Friends over', 'Family time'],
    emojis: ['🛋️', '❤️', '👥', '🏠'],
    multi: false,
  },
  {
    id: 'q2',
    text: 'Pick a vibe.',
    options: [
      'Make me laugh',
      'Keep me on edge',
      'Make me feel something',
      'Blow my mind',
      'Scare me',
      'Inspire me',
    ],
    emojis: ['😂', '😬', '🥺', '🤯', '😱', '✨'],
    multi: false,
  },
  {
    id: 'q3',
    text: 'How much brain do you want to use?',
    options: ['Zero — just entertain me', 'Some — I like a good story', 'Full — challenge me'],
    emojis: ['🍿', '📖', '🧠'],
    multi: false,
  },
  {
    id: 'q4',
    text: 'Anything you want to avoid?',
    options: ['Violence', 'Jump scares', 'Heavy themes', 'Sad endings', "Nothing — I'm open"],
    emojis: ['🩸', '👻', '💔', '😢', '🎯'],
    multi: true,
  },
  {
    id: 'q5',
    text: 'Pick a world.',
    options: [
      'Real and grounded',
      'Slightly weird',
      'Full fantasy/sci-fi',
      'Based on true events',
      'Documentary',
    ],
    emojis: ['🌍', '🌀', '🚀', '📰', '🎥'],
    multi: false,
  },
  {
    id: 'q6',
    text: 'Any preferences?',
    options: [
      'Show me popular hits',
      'Hidden gems only',
      'Non-English films welcome',
      'No preference',
    ],
    emojis: ['🔥', '💎', '🌐', '🎲'],
    multi: false,
  },
]
