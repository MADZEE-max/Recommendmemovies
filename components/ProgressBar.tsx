'use client'

type Props = {
  current: number
  total: number
}

export default function ProgressBar({ current, total }: Props) {
  const pct = Math.round((current / total) * 100)

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-400 mb-2">
        <span>Question {current} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
