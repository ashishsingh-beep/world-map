import { useCallback, useEffect, useState } from 'react'
import {
  PLACE_CONTINENTS,
  PLACE_ROUNDS,
  WATER_CONTINENTS,
  ROUNDS,
  ROUND_ORDER,
  allPlacesRoundId,
  roundById,
} from './game/rounds'
import type { Mode, QuizSnapshot } from './game/useQuiz'
import { PlayScreen } from './screens/PlayScreen'
import { LearnScreen } from './screens/LearnScreen'
import { placeOf } from './data/places'
import {
  Button,
  KindSwatch,
  WATER_KINDS,
  WATER_REGIONS,
  type WaterKind,
  type WaterRegion,
} from './ui/bits'
import { HOME, useRoute } from './app/route'
import {
  clearRound,
  fits,
  loadPrefs,
  loadRound,
  savePrefs,
  saveRound,
  type SavedRound,
} from './app/storage'

export default function App() {
  const [route, navigate] = useRoute()
  const [prefs, setPrefs] = useState(loadPrefs)
  const { mode, timed, kinds, region } = prefs
  const setMode = (mode: Mode) => setPrefs((p) => ({ ...p, mode }))
  const setTimed = (timed: boolean) => setPrefs((p) => ({ ...p, timed }))
  const setKinds = (next: (k: Record<WaterKind, boolean>) => Record<WaterKind, boolean>) =>
    setPrefs((p) => ({ ...p, kinds: next(p.kinds) }))
  const setRegion = (region: WaterRegion) => setPrefs((p) => ({ ...p, region }))
  useEffect(() => savePrefs(prefs), [prefs])

  const [runKey, setRunKey] = useState(0)
  /** The round in progress, read once at start-up so a refresh can resume it. */
  const [saved, setSaved] = useState<SavedRound | null>(loadRound)
  /** Null once the player has chosen to begin again rather than carry on. */
  const [resuming, setResuming] = useState<SavedRound | null>(saved)

  const roundId = route.roundId
  // `useRoute` only ever yields a round that exists, so this cannot be null.
  const round = roundById(roundId)!

  const roundPlaces = round.places?.map(placeOf) ?? []
  const isWaterRound = roundPlaces[0]?.section === 'water'

  /**
   * Which part of the water set to practise: a region, then the notations
   * within it. Still not a question-count selector — the round asks every one
   * of whatever is left; these only decide which set.
   */
  const inRegion = isWaterRound
    ? roundPlaces.filter((p) => region === 'all' || p.regions?.includes(region))
    : roundPlaces
  const asked = isWaterRound
    ? inRegion.filter((p) => kinds[p.type as WaterKind] ?? true)
    : inRegion
  const playRound = isWaterRound ? { ...round, places: asked.map((p) => p.id) } : round
  const askIds = playRound.places ?? playRound.askable

  /** A save is only offered when it is still this exact round's questions. */
  const resumable = fits(saved, roundId, askIds) ? saved : null
  const playMode = !round.places && mode === 'significance' ? 'type' : mode

  const onProgress = useCallback(
    (snapshot: QuizSnapshot | null) => {
      if (!snapshot) {
        clearRound()
        setSaved(null)
        return
      }
      const next = { ...snapshot, roundId, mode: playMode, timed, savedAt: Date.now() }
      saveRound(next)
      setSaved(next)
    },
    [roundId, playMode, timed]
  )

  // A placeholder continent has nothing to ask. The menu disables its card, but
  // the URL is editable, so the round itself has to refuse rather than open a
  // quiz with no questions in it.
  const empty = askIds.length === 0
  useEffect(() => {
    if (route.view === 'play' && empty) navigate({ view: 'setup', roundId }, true)
  }, [route.view, empty, roundId, navigate])

  const begin = (from: SavedRound | null) => {
    if (!from) clearRound()
    setResuming(from)
    setRunKey((k) => k + 1)
    navigate({ view: 'play', roundId })
  }

  if (route.view === 'play' && empty) return null

  if (route.view === 'play') {
    return (
      <PlayScreen
        key={`${roundId}:${runKey}`}
        round={playRound}
        // Country rounds carry no significance data to ask about.
        mode={playMode}
        timed={timed}
        // Only on a refresh into a live round, or an explicit Resume.
        initial={fits(resuming, roundId, askIds) ? resuming : null}
        onProgress={onProgress}
        onExit={() => navigate(HOME)}
        onRetry={() => begin(null)}
      />
    )
  }

  if (route.view === 'learn') {
    return <LearnScreen round={round} onExit={() => navigate({ view: 'setup', roundId })} />
  }

  if (route.view === 'setup') {
    return (
      <div className="min-h-dvh bg-slate-50 px-5 py-8">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => navigate(HOME)}
            className="mb-4 cursor-pointer text-sm font-bold text-slate-500"
          >
            ← All games
          </button>
          <h1 className="text-4xl font-extrabold text-slate-900">{round.title}</h1>
          <p className="mt-1 mb-6 text-slate-600">{round.blurb}</p>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-bold text-slate-500">
              {round.places
                ? `${asked.length} ${isWaterRound ? 'features' : 'places'}`
                : `${round.askable.length} countries`}{' '}
              · every round asks all of them
            </p>

            {isWaterRound && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Region</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {WATER_REGIONS.map(({ id, label }) => {
                    const n =
                      id === 'all'
                        ? roundPlaces.length
                        : roundPlaces.filter((p) => p.regions?.includes(id)).length
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRegion(id)}
                        className={`cursor-pointer rounded-xl border-2 bg-white px-3 py-3 text-center ${
                          region === id ? 'border-blue-600' : 'border-transparent'
                        }`}
                      >
                        <div className="font-extrabold text-slate-900">{label}</div>
                        <div className="text-xs font-semibold text-slate-500">{n}</div>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Africa and Oceania ride with Asia. A boundary sea counts in both regions it
                  touches, so these do not add up.
                </p>

                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Practise</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {WATER_KINDS.map(({ type, label }) => {
                    // Counted within the chosen region, so "the last one" means
                    // the last that still has anything to ask here.
                    const n = inRegion.filter((p) => p.type === type).length
                    if (!n) return null
                    const on = kinds[type]
                    // Never let the last one be unticked — a round with nothing
                    // to ask is not a round.
                    const last = on && asked.length === n
                    return (
                      <label
                        key={type}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 bg-white px-3 py-3 text-center ${
                          on ? 'border-blue-600' : 'border-transparent'
                        } ${last ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={last}
                          onChange={(e) => setKinds((k) => ({ ...k, [type]: e.target.checked }))}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <KindSwatch type={type} />
                        <span className="text-sm font-extrabold text-slate-900">{label}</span>
                        <span className="text-xs font-bold text-slate-400">{n}</span>
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Mode</h2>
            <div className={`grid gap-3 ${round.places ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {(
                [
                  ['pin', 'Pin', 'Tap the map'],
                  ['type', 'Type', 'Enter the name'],
                  ...(round.places
                    ? ([['significance', 'Why', 'Name it from its fact']] as const)
                    : []),
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
              {resumable && (
                <Button onClick={() => begin(resumable)}>
                  RESUME · {resumable.index} of {resumable.ids.length} DONE
                </Button>
              )}
              {!empty && (
                <Button variant={resumable ? 'ghost' : 'primary'} onClick={() => begin(null)}>
                  {resumable ? 'START AGAIN' : 'START →'}
                </Button>
              )}
              <Button variant="ghost" onClick={() => navigate({ view: 'learn', roundId })}>
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
                onClick={() => navigate({ view: 'setup', roundId: id })}
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

        {WATER_CONTINENTS.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-extrabold text-slate-900">Seas &amp; Straits</h2>
            <p className="mt-1 mb-4 text-slate-600">
              Oceans, seas, straits and canals worldwide. Oceans are drawn as{' '}
              <span className="font-bold text-teal-600">large teal rings</span>, seas as{' '}
              <span className="font-bold text-blue-700">blue circles</span>, straits as{' '}
              <span className="font-bold text-orange-500">orange diamonds</span>.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {WATER_CONTINENTS.map((continent) => {
                const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => navigate({ view: 'setup', roundId: r.id })}
                    className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="text-lg font-extrabold text-slate-900">{r.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{r.blurb}</div>
                    <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">
                      {r.places?.length} FEATURES
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-2xl font-extrabold text-slate-900">Places</h2>
          <p className="mt-1 mb-4 text-slate-600">
            Capitals, cities, ports and key sites — the whole continent in one round.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {PLACE_CONTINENTS.map((continent) => {
              const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
              const empty = !r.places?.length
              return (
                <button
                  key={r.id}
                  type="button"
                  // An empty round would start a quiz with nothing to ask.
                  disabled={empty}
                  onClick={() => navigate({ view: 'setup', roundId: r.id })}
                  className={`rounded-2xl border border-slate-200 p-5 text-left shadow-sm transition ${
                    empty
                      ? 'cursor-not-allowed bg-slate-100 opacity-70'
                      : 'bg-white hover:shadow-md'
                  }`}
                >
                  <div className="text-lg font-extrabold text-slate-900">{r.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{r.blurb}</div>
                  <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">
                    {empty ? 'COMING SOON' : `${r.places?.length} PLACES`}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
