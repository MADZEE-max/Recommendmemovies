'use client'

type Props = {
  label: string
  selected: boolean
  onClick: () => void
  multi?: boolean
  emoji?: string
}

export default function QuizButton({ label, selected, onClick, multi = false, emoji }: Props) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 text-sm font-medium
        flex items-center gap-3
        ${selected
          ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-lg shadow-indigo-900/20'
          : 'bg-gray-900/60 border-gray-800 text-gray-300 hover:border-gray-600 hover:bg-gray-800/60 hover:text-white'
        }
      `}
    >
      {multi && (
        <span className={`
          flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all
          ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600'}
        `}>
          {selected && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4.5" />
            </svg>
          )}
        </span>
      )}
      {emoji && (
        <span className="text-lg leading-none flex-shrink-0">{emoji}</span>
      )}
      <span className="flex-1">{label}</span>
    </button>
  )
}
