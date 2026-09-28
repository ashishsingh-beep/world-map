import { useEffect, useMemo, useState } from 'react'
import {
  MapCanvas,
  type CountryState,
  type MapArea,
  type MapBand,
  type MapPoint,
} from '../map/MapCanvas'
import type { Round } from '../game/rounds'
import type { Miss } from '../game/useQuiz'
import { Button, formatClock } from '../ui/bits'

/** Score tiers. Our own ladder, not the reference site's. */
const TIERS: { min: number; title: string; blurb: string }[] = [
  { min: 1, title: 'LEGENDARY', blurb: 'Perfect run. You did not miss one.' },
  { min: 0.9, title: 'CARTOGRAPHER', blurb: 'Near flawless. The gaps are tiny now.' },
  { min: 0.75, title: 'NAVIGATOR', blurb: 'Strong. A few regions still need work.' },
  { min: 0.6, title: 'EXPLORER', blurb: 'Solid ground, with real room to grow.' },
  { min: 0.4, title: 'WANDERER', blurb: 'The shape is there. Keep going.' },
  { min: 0, title: 'CASTAWAY', blurb: 'Early days. Try Learn mode first.' },
]

/** The round's map as it ended: every answer painted right or missed. */
export interface FinalMap {
  states: Record<string, CountryState>
  points: MapPoint[]
  areas: MapArea[]
  bands: MapBand[]
  countryMarkers: boolean
}

interface Props {
  round: Round
  correct: number
  total: number
  elapsed: number
  /** Answers that were right but misspelled — counted, never penalised. */
  spellingSlips?: number
  map: FinalMap
  missed: Miss[]
  /** A round of only the misses. Absent when there are none. */
  onPractiseMissed?: () => void
  /** This round was itself a practice of misses, so Retry means the full round. */
  drill?: boolean
  onRetry: () => void
  onExit: () => void
}

function useWide() {
  const query = '(min-width: 768px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/**
 * The end of a round, and the start of revising it. The map is the round's own,
 * painted as it finished; tapping a miss flies to it and names it there. One
 * button then practises exactly those — revising and practising are the same
 * step, not two options to choose between.
 */
export function ResultsScreen({
  round,
  correct,
  total,
  elapsed,
  spellingSlips = 0,
  map,
  missed,
  onPractiseMissed,
  drill = false,
  onRetry,
  onExit,
}: Props) {
  const ratio = total ? correct / total : 0
  const tier = TIERS.find((t) => ratio >= t.min) ?? TIERS[TIERS.length - 1]
  const wide = useWide()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = missed.find((m) => m.id === selectedId) ?? null

  // The one being looked at is lit and named; everything else keeps its colour.
  const shown = useMemo(() => {
    if (!selected) return map
    const points = map.points.map((p) =>
      p.id === selected.id ? { ...p, state: 'target' as const, label: selected.name } : p
    )
    const isBand = map.bands.some((b) => b.id === selected.id)
    // An area has no marker of its own to hang a name on, so it gets a bare label.
    if (!selected.iso && selected.extent && !isBand) {
      points.push({
        id: `${selected.id}-label`,
        point: selected.point,
        state: 'target',
        marker: false,
        label: selected.name,
      })
    }
    return {
      ...map,
      states: selected.iso ? { ...map.states, [selected.iso]: 'target' as const } : map.states,
      points,
      areas: map.areas.map((a) => (a.id === selected.id ? { ...a, state: 'target' as const } : a)),
      bands: map.bands.map((b) =>
        b.id === selected.id ? { ...b, state: 'target' as const, label: selected.name } : b
      ),
    }
  }, [map, selected])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={round.render}
        askable={[]}
        view={round.view}
        atlas={round.atlas}
        states={shown.states}
        points={shown.points}
        areas={shown.areas}
        bands={shown.bands}
        countryMarkers={shown.countryMarkers}
        labels="selected"
        selectedIso={selected?.iso ?? null}
        revealIso={selected?.iso ?? null}
        revealPoints={selected && !selected.iso ? selected.frame : null}
        padding={
          wide
            ? { top: 32, right: 32, bottom: 32, left: 440 }
            : { top: 32, right: 16, bottom: 380, left: 16 }
        }
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 md:inset-y-0 md:right-auto md:flex md:w-[420px] md:items-center md:p-5">
        <div className="pointer-events-auto flex max-h-[55dvh] w-full flex-col rounded-3xl bg-white/95 p-5 shadow-2xl md:max-h-full">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{tier.title}</h1>
            <div className="text-right text-sm font-bold whitespace-nowrap text-slate-500 tabular-nums">
              <span className="text-2xl font-extrabold text-slate-900">
                {correct}/{total}
              </span>{' '}
              · {formatClock(elapsed)}
            </div>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {tier.blurb}
            {spellingSlips > 0 && ` ${spellingSlips} spelt wrong but counted.`}
          </p>

          {missed.length > 0 && (
            <>
              <h2 className="mt-4 text-xs font-bold tracking-widest text-slate-400">
                MISSED — TAP ONE TO SEE IT ON THE MAP
              </h2>
              <div className="mt-2 flex min-h-0 flex-wrap gap-2 overflow-y-auto pb-1">
                {missed.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedId((id) => (id === m.id ? null : m.id))}
                    className={`cursor-pointer rounded-full border-2 px-3 py-1 text-sm font-bold ${
                      m.id === selectedId
                        ? 'border-rose-500 bg-rose-500 text-white'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-4 space-y-3">
            {onPractiseMissed ? (
              <Button onClick={onPractiseMissed}>Practise the {missed.length} you missed →</Button>
            ) : (
              <Button onClick={onRetry}>{drill ? 'Play the full round →' : 'Retry →'}</Button>
            )}
            <div className="flex gap-3">
              {onPractiseMissed && (
                <Button variant="ghost" onClick={onRetry}>
                  {drill ? 'Full round' : 'Retry'}
                </Button>
              )}
              <Button variant="ghost" onClick={onExit}>
                Back
              </Button>
            </div>
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-slate-500">
            {round.title}
            {drill && ' · practising misses'}
          </p>
        </div>
      </div>
    </div>
  )
}
