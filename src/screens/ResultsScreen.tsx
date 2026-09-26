import { MapCanvas } from '../map/MapCanvas'
import { WORLD_VIEW, type Round } from '../game/rounds'
import { renderIsos } from '../data/countries'
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

interface Props {
  round: Round
  correct: number
  total: number
  elapsed: number
  /** Answers that were right but misspelled — counted, never penalised. */
  spellingSlips?: number
  onRetry: () => void
  onExit: () => void
}

export function ResultsScreen({
  round,
  correct,
  total,
  elapsed,
  spellingSlips = 0,
  onRetry,
  onExit,
}: Props) {
  const ratio = total ? correct / total : 0
  const tier = TIERS.find((t) => ratio >= t.min) ?? TIERS[TIERS.length - 1]

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <div className="absolute inset-0 opacity-30">
        <MapCanvas
          render={renderIsos}
          askable={[]}
          view={WORLD_VIEW}
          states={{}}
        />
      </div>

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center justify-center gap-8 px-6 md:flex-row md:gap-14">
        <div className="grid aspect-square w-60 place-items-center rounded-full border-[10px] border-yellow-300 bg-white shadow-2xl">
          <div className="text-center">
            <div className="text-xs font-bold tracking-widest text-slate-500">CORRECT</div>
            <div className="text-5xl font-extrabold text-slate-900">
              {correct}/{total}
            </div>
            <div className="mx-auto my-2 h-px w-24 bg-slate-200" />
            <div className="text-xs font-bold tracking-widest text-slate-500">TIME</div>
            <div className="text-3xl font-extrabold tabular-nums text-slate-900">
              {formatClock(elapsed)}
            </div>
          </div>
        </div>

        <div className="w-full max-w-sm text-center md:text-left">
          <h1 className="text-5xl font-extrabold tracking-tight text-white drop-shadow md:text-6xl">
            {tier.title}
          </h1>
          <p className="mt-2 mb-6 font-semibold text-slate-800">{tier.blurb}</p>
          <div className="space-y-3">
            <Button onClick={onRetry}>Retry →</Button>
            <Button variant="ghost" onClick={onExit}>
              Back to the games
            </Button>
          </div>
          <p className="mt-4 text-center text-sm font-semibold text-slate-700 md:text-left">
            {round.title}
            {spellingSlips > 0 && (
              <>
                {' · '}
                {spellingSlips} spelt wrong but counted
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
