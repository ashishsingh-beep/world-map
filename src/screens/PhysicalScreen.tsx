import { MapCanvas } from '../map/MapCanvas'
import { renderIsos } from '../data/countries'
import { WORLD_VIEW } from '../game/rounds'
import { useBare } from '../app/useBare'
import type { PhysicalSection } from '../app/physical'

/**
 * A physical section's map before its notes arrive: the world as land and
 * water, with the Borders switch to lay the countries and their names over it.
 */
export function PhysicalScreen({ section, onExit }: { section: PhysicalSection; onExit: () => void }) {
  const bare = useBare()
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={renderIsos}
        askable={[]}
        states={{}}
        view={WORLD_VIEW}
        countryMarkers={false}
        physical
        bare={bare}
      />

      {!bare.on && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="pointer-events-auto rounded-xl bg-white px-4 py-3 shadow-lg">
            <div className="font-extrabold text-slate-900">{section.title}</div>
            <div className="text-xs font-semibold text-slate-500">Physical map · notes to come</div>
          </div>
          <button
            type="button"
            onClick={onExit}
            aria-label="Close"
            className="pointer-events-auto cursor-pointer rounded-xl bg-white px-4 py-3 text-lg font-bold text-slate-900 shadow-lg"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
