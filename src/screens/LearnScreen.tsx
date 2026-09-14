import { useState } from 'react'
import { MapCanvas } from '../map/MapCanvas'
import type { Round } from '../game/rounds'

/**
 * Learn mode: no timer, no scoring. Click a country to reveal its name;
 * the checkbox shows every label at once and dims all but the selected one.
 */
export function LearnScreen({ round, onExit }: { round: Round; onExit: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={round.render}
        askable={round.render}
        view={round.view}
        states={{}}
        onPick={setSelected}
        labels={showAll ? 'all' : 'selected'}
        selectedIso={selected}
        padding={{ top: 88, right: 32, bottom: 32, left: 32 }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <label className="pointer-events-auto flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 font-extrabold text-slate-900 shadow-lg">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-5 w-5 accent-blue-600"
          />
          Show all names
        </label>
        <button
          type="button"
          onClick={onExit}
          aria-label="Close"
          className="pointer-events-auto rounded-xl bg-white px-4 py-3 text-lg font-bold text-slate-900 shadow-lg"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
