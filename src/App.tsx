import { useState } from 'react'
import {
  PLACE_CONTINENTS,
  PLACE_ROUNDS,
  ROUNDS,
  ROUND_ORDER,
  placeCountriesOf,
} from './game/rounds'
import type { Mode } from './game/useQuiz'
import { PlayScreen } from './screens/PlayScreen'
import { LearnScreen } from './screens/LearnScreen'
import { Button } from './ui/bits'

type View = 'home' | 'setup' | 'play' | 'learn'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [roundId, setRoundId] = useState<string>('world')
  const [mode, setMode] = useState<Mode>('pin')
  const [timed, setTimed] = useState(true)
  const [runKey, setRunKey] = useState(0)

  const round = ROUNDS[roundId] ?? PLACE_ROUNDS[roundId]

  if (view === 'play') {
    return (
      <PlayScreen
        key={runKey}
        round={round}
        mode={mode}
        timed={timed}
        onExit={() => setView('home')}
        onRetry={() => setRunKey((k) => k + 1)}
      />
    )
  }

  if (view === 'learn') {
    return <LearnScreen round={round} onExit={() => setView('setup')} />
  }

  if (view === 'setup') {
    return (
      <div className="min-h-dvh bg-slate-50 px-5 py-8">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => setView('home')}
            className="mb-4 text-sm font-bold text-slate-500"
          >
            ← All games
          </button>
          <h1 className="text-4xl font-extrabold text-slate-900">{round.title}</h1>
          <p className="mt-1 mb-6 text-slate-600">{round.blurb}</p>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-bold text-slate-500">
              {round.places
                ? `${round.places.length} places`
                : `${round.askable.length} countries`}{' '}
              · every round asks all of them
            </p>

            <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Mode</h2>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['pin', 'Pin', 'Tap the map'],
                  ['type', 'Type', 'Enter the name'],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-xl border-2 bg-white px-4 py-3 text-center ${
                    mode === value ? 'border-blue-600' : 'border-transparent'
                  }`}
                >
                  <div className="font-extrabold text-slate-900">{label}</div>
                  <div className="text-xs font-semibold text-slate-500">{hint}</div>
                </button>
              ))}
            </div>

            <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Time limit</h2>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  [true, 'On', '15s'],
                  [false, 'Off', 'Unlimited'],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setTimed(value)}
                  className={`rounded-xl border-2 bg-white px-4 py-3 text-center ${
                    timed === value ? 'border-blue-600' : 'border-transparent'
                  }`}
                >
                  <div className="font-extrabold text-slate-900">{label}</div>
                  <div className="text-xs font-semibold text-slate-500">{hint}</div>
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              <Button
                onClick={() => {
                  setRunKey((k) => k + 1)
                  setView('play')
                }}
              >
                START →
              </Button>
              <Button variant="ghost" onClick={() => setView('learn')}>
                LEARN
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Country Map Games</h1>
        <p className="mt-1 mb-8 text-slate-600">Find countries on the map.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {ROUND_ORDER.map((id) => {
            const r = ROUNDS[id]
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setRoundId(id)
                  setView('setup')
                }}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="text-lg font-extrabold text-slate-900">{r.title}</div>
                <div className="mt-1 text-sm text-slate-600">{r.blurb}</div>
                <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">
                  {r.askable.length} COUNTRIES
                </div>
              </button>
            )
          })}
        </div>

        {PLACE_CONTINENTS.map((continent) => (
          <section key={continent} className="mt-10">
            <h2 className="text-2xl font-extrabold text-slate-900">Places — {continent}</h2>
            <p className="mt-1 mb-4 text-slate-600">
              Capitals, cities, ports and key sites inside each country.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                PLACE_ROUNDS[
                  `places-all-${continent.toLowerCase().replace(/\s+/g, '-')}`
                ],
                ...placeCountriesOf(continent).map(
                  (iso) => PLACE_ROUNDS[`places-${iso.toLowerCase()}`]
                ),
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRoundId(r.id)
                    setView('setup')
                  }}
                  className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="text-lg font-extrabold text-slate-900">{r.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{r.blurb}</div>
                  <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">
                    {r.places?.length} {r.places?.length === 1 ? 'PLACE' : 'PLACES'}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
