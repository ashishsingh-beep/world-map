import { useCallback, useEffect, useState } from 'react'
import {
  INDIA_CONTINENTS,
  POLITICAL_ROUNDS,
  POLITICAL_SCOPES,
  PLACE_ROUNDS,
  politicalIdFor,
  politicalRoundId,
  scopesOf,
  WATER_CONTINENTS,
  PHENOMENA_CONTINENTS,
  allPlacesRoundId,
  roundById,
} from './game/rounds'
import type { Mode, QuizSnapshot } from './game/useQuiz'
import { PlayScreen } from './screens/PlayScreen'
import { LearnScreen } from './screens/LearnScreen'
import { countryClue, placeKindOf, placeOf, type Place, type PlaceKind } from './data/places'
import { meta } from './data/countries'
import {
  Button,
  KindSwatch,
  PlaceKindSwatch,
  PLACE_KINDS,
  WATER_KINDS,
  WATER_REGIONS,
  type WaterKind,
  type WaterRegion,
} from './ui/bits'
import { HOME, ISOTHERMS, useRoute, type Atlas, type Route } from './app/route'
import { IsothermScreen } from './screens/IsothermScreen'
import {
  clearRound,
  fits,
  loadPrefs,
  loadRound,
  QUESTION_COUNTS,
  roundSize,
  savePrefs,
  saveRound,
  type QuestionCount,
  type SavedRound,
} from './app/storage'

/** A rivers round's size, its rivers and the origins asked beside them counted apart. */
const riverTally = (asked: Place[]) => {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`
  const rivers = asked.filter((p) => p.type === 'river').length
  const origins = asked.filter((p) => p.type === 'origin').length
  // Majuli, Namcha Barwa: places on a river's course, asked beside it.
  const landmarks = asked.length - rivers - origins
  return [n(rivers, 'river'), origins && n(origins, 'origin'), landmarks && n(landmarks, 'landmark')].filter(Boolean).join(' · ')
}

/**
 * The isotherm maps have no round behind them, so they are answered before
 * anything that needs one.
 */
export default function App() {
  const [route, navigate] = useRoute()
  if (route.roundId === ISOTHERMS) {
    return <IsothermScreen onExit={() => navigate({ view: 'atlas', roundId: HOME.roundId, atlas: 'world' })} />
  }
  return <Rounds route={route} navigate={navigate} />
}

function Rounds({ route, navigate }: { route: Route; navigate: (next: Route, replace?: boolean) => void }) {
  const [prefs, setPrefs] = useState(loadPrefs)
  const { mode, timed, count, suggestions, kinds, region, placeKinds, basins: basinPref } = prefs
  const setMode = (mode: Mode) => setPrefs((p) => ({ ...p, mode }))
  const setTimed = (timed: boolean) => setPrefs((p) => ({ ...p, timed }))
  const setCount = (count: QuestionCount) => setPrefs((p) => ({ ...p, count }))
  const setSuggestions = (suggestions: boolean) => setPrefs((p) => ({ ...p, suggestions }))
  const setKinds = (next: (k: Record<WaterKind, boolean>) => Record<WaterKind, boolean>) =>
    setPrefs((p) => ({ ...p, kinds: next(p.kinds) }))
  const setRegion = (region: WaterRegion) => setPrefs((p) => ({ ...p, region }))
  const setBasins = (basins: string[]) => setPrefs((p) => ({ ...p, basins }))
  const setPlaceKinds = (next: (k: Record<PlaceKind, boolean>) => Record<PlaceKind, boolean>) =>
    setPrefs((p) => ({ ...p, placeKinds: next(p.placeKinds) }))
  useEffect(() => savePrefs(prefs), [prefs])

  const [runKey, setRunKey] = useState(0)
  /** The round in progress, read once at start-up so a refresh can resume it. */
  const [saved, setSaved] = useState<SavedRound | null>(loadRound)
  /**
   * A practice of one round's misses: just those questions, in the same mode and
   * timer. Kept with the saved round, so a refresh mid-practice carries on with
   * it rather than dropping back to the full set.
   */
  const [drill, setDrill] = useState<{ roundId: string; ids: string[] } | null>(() =>
    saved?.drill ? { roundId: saved.roundId, ids: saved.drill } : null
  )
  /** Null once the player has chosen to begin again rather than carry on. */
  const [resuming, setResuming] = useState<SavedRound | null>(saved)

  const roundId = route.roundId
  // `useRoute` only ever yields a round that exists, so this cannot be null.
  const round = roundById(roundId)!

  const roundPlaces = round.places?.map(placeOf) ?? []
  const isWaterRound = roundPlaces[0]?.section === 'water'
  /** Phenomena — the ocean currents: Pin and Name only, no Why. */
  const isPhenomena = roundPlaces[0]?.section === 'phenomena'
  /** The Political Map: countries and their places in one round. */
  const isPolitical = !!round.scope
  /** Which continents it covers — one, several, or `world`. */
  const scopes = scopesOf(roundId) ?? []
  const isPlacesRound = isPolitical || roundPlaces[0]?.section === 'places'

  /**
   * Which part of the water set to practise: a region, then the notations
   * within it. These decide which set; the question count then decides how
   * many of it.
   */
  /**
   * A rivers round narrows by river system — the Godavari's, the Mahanadi's,
   * any several together — which picks the set the question count then draws
   * from. None chosen is all of them, as is every one; a stored system this
   * round does not have is dropped.
   */
  const isRivers = roundPlaces[0]?.section === 'rivers'
  const basins = isRivers ? [...new Set(roundPlaces.map((p) => p.basin ?? ''))].filter(Boolean) : []
  const basinsHere = basinPref.filter((b) => basins.includes(b))
  const allBasins = basinsHere.length === 0 || basinsHere.length === basins.length
  const inBasins = (b: string | undefined) => allBasins || basinsHere.includes(b ?? '')
  /** All stands alone; a system toggles in and out, and the last cannot be tapped away. */
  const tapBasin = (id: string) => {
    if (id === 'all') return setBasins([])
    const next = allBasins ? [id] : basinsHere.includes(id) ? basinsHere.filter((b) => b !== id) : [...basinsHere, id]
    if (!next.length) return
    setBasins(next.length === basins.length ? [] : next)
  }
  const inRegion = isWaterRound
    ? roundPlaces.filter((p) => region === 'all' || p.regions?.includes(region))
    : isRivers
      ? roundPlaces.filter((p) => inBasins(p.basin))
      : roundPlaces
  /**
   * Why mode's clue for a country is its capital, so a country no syllabus
   * names a capital for yet has no clue to ask from, and sits out.
   */
  const clueless = isPolitical ? round.askable.filter((iso) => !countryClue(iso)) : []
  const roundCountries =
    isPolitical && mode === 'significance'
      ? round.askable.filter((iso) => countryClue(iso))
      : isPolitical
        ? round.askable
        : []
  const inSection = (k: PlaceKind) =>
    k === 'country' ? roundCountries.length : roundPlaces.filter((p) => placeKindOf(p.type) === k).length
  /**
   * The sections this round has — Regions is Oceania's alone. One preference
   * backs every round, so Regions on by itself would leave Europe nothing to
   * ask; when none of a round's own sections is on, all of them are.
   */
  const kindsHere = PLACE_KINDS.map((k) => k.kind).filter((k) => inSection(k) > 0)
  const kindOn = (k: PlaceKind) => placeKinds[k] || !kindsHere.some((h) => placeKinds[h])
  const asked = isWaterRound
    ? inRegion.filter((p) => kinds[p.type as WaterKind] ?? true)
    : isPlacesRound
      ? inRegion.filter((p) => kindOn(placeKindOf(p.type)))
      : inRegion
  const askedCountries = isPolitical && kindOn('country') ? roundCountries : []
  /**
   * A round narrowed to these questions. A Political Map round with no places
   * left in it takes the countries' own frame — Oceania's stops at Samoa, not
   * Easter Island, when there is no Polynesia to reach.
   */
  const withQuestions = (places: string[], countries: string[]) =>
    isPolitical
      ? {
          ...round,
          places,
          askable: countries,
          view: places.length ? round.view : (round.countryView ?? round.view),
        }
      : round.places
        ? {
            ...round,
            places,
            // Context rivers ride along with their own system only.
            backdrop: [
              ...inRegion.map((p) => p.id),
              ...(round.context ?? []).filter((id) => !isRivers || inBasins(placeOf(id).basin)),
            ],
          }
        : { ...round, askable: countries }
  // A drill lives only on its play screen: off it — the browser's back button
  // included — the round is its full set again, and every way back in through
  // `begin` says afresh whether it is a drill.
  const drillIds = route.view === 'play' && drill?.roundId === roundId ? drill.ids : null
  const playRound = drillIds
    ? withQuestions(
        drillIds.filter((id) => !meta[id]),
        drillIds.filter((id) => meta[id])
      )
    : isWaterRound || isPlacesRound || isRivers
      ? withQuestions(
          asked.map((p) => p.id),
          askedCountries
        )
      : round
  const askIds = [...(playRound.places ?? []), ...playRound.askable]
  // A drill asks every miss; the question count chose the round it came from.
  const size = drillIds ? askIds.length : roundSize(count, askIds.length)
  /** The counts this round can fill; a round of 14 offers 10 and All, not 30. */
  const counts = QUESTION_COUNTS.filter((c) => c === 'all' || c < askIds.length)

  /** A save is only offered when it is still this exact round's questions. */
  const resumable = fits(saved, roundId, askIds, size) ? saved : null
  const playMode = (!round.places?.length || isPhenomena) && mode === 'significance' ? 'type' : mode

  const onProgress = useCallback(
    (snapshot: QuizSnapshot | null) => {
      if (!snapshot) {
        clearRound()
        setSaved(null)
        return
      }
      const next: SavedRound = {
        ...snapshot,
        roundId,
        mode: playMode,
        timed,
        savedAt: Date.now(),
        ...(drillIds ? { drill: drillIds } : {}),
      }
      saveRound(next)
      setSaved(next)
    },
    [roundId, playMode, timed, drillIds]
  )

  // A placeholder continent has nothing to ask. The menu disables its card, but
  // the URL is editable, so the round itself has to refuse rather than open a
  // quiz with no questions in it.
  const empty = askIds.length === 0
  useEffect(() => {
    if (route.view === 'play' && empty) navigate({ view: 'setup', roundId }, true)
  }, [route.view, empty, roundId, navigate])

  const begin = (from: SavedRound | null, nextDrill: string[] | null = null) => {
    setDrill(nextDrill ? { roundId, ids: nextDrill } : null)
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
        size={size}
        suggest={suggestions}
        // Only on a refresh into a live round, or an explicit Resume.
        initial={fits(resuming, roundId, askIds, size) ? resuming : null}
        onProgress={onProgress}
        onExit={() =>
          navigate({ view: 'atlas', roundId, atlas: round.atlas === 'india' ? 'india' : 'world' })
        }
        // From a drill, Retry means the full round again.
        onRetry={() => begin(null)}
        onPractiseMissed={(ids) => begin(null, ids)}
        drill={!!drillIds}
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
            onClick={() =>
              navigate({ view: 'atlas', roundId, atlas: round.atlas === 'india' ? 'india' : 'world' })
            }
            className="mb-4 cursor-pointer text-sm font-bold text-slate-500"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-extrabold text-slate-900">
            {isPolitical ? 'Political Map' : round.title}
          </h1>
          <p className="mt-1 mb-6 text-slate-600">{round.blurb}</p>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-sm font-bold text-slate-500">
              {isPolitical
                ? `${askIds.length} question${askIds.length === 1 ? '' : 's'} · ${round.title}`
                : round.places
                  ? isRivers
                    ? riverTally(asked)
                    : `${asked.length} ${isWaterRound ? 'features' : isPhenomena ? 'currents' : 'places'}`
                  : `${round.askable.length} countries`}
            </p>

            {isPolitical && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Scope</h2>
                <div className="flex flex-wrap gap-2">
                  {POLITICAL_SCOPES.map((scope) => {
                    const on = scopes.includes(scope.id)
                    /**
                     * The world on its own, or any mix of continents. A
                     * continent tapped while the world is on starts a mix of
                     * one; the last continent of a mix cannot be tapped away.
                     */
                    const next =
                      scope.id === 'world'
                        ? ['world']
                        : scopes.includes('world')
                          ? [scope.id]
                          : on
                            ? scopes.filter((x) => x !== scope.id)
                            : [...scopes, scope.id]
                    const last = on && scopes.length === 1
                    return (
                      <button
                        key={scope.id}
                        type="button"
                        aria-pressed={on}
                        disabled={last && scope.id !== 'world'}
                        // In place: the scope is part of the address, so a
                        // refresh keeps it, but it is one setup screen.
                        onClick={() =>
                          next.length &&
                          navigate({ view: 'setup', roundId: politicalIdFor(next) }, true)
                        }
                        className={`rounded-full border-2 bg-white px-4 py-2 text-sm font-extrabold text-slate-900 ${
                          on ? 'border-blue-600' : 'border-transparent'
                        } ${last ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        {on && scope.id !== 'world' && scopes.length > 1 ? '✓ ' : ''}
                        {scope.label}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Tap continents to practise several together, or World for all of them.
                </p>
              </>
            )}

            {isRivers && basins.length > 1 && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">River system</h2>
                <div className="grid grid-cols-3 gap-3">
                  {['all', ...basins].map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => tapBasin(id)}
                      aria-pressed={id === 'all' ? allBasins : !allBasins && basinsHere.includes(id)}
                      className={`cursor-pointer rounded-xl border-2 bg-white px-3 py-3 text-center ${
                        (id === 'all' ? allBasins : !allBasins && basinsHere.includes(id))
                          ? 'border-blue-600'
                          : 'border-transparent'
                      }`}
                    >
                      <div className="font-extrabold text-slate-900">{id === 'all' ? 'All' : id}</div>
                      <div className="text-xs font-semibold text-slate-500">
                        {id === 'all' ? roundPlaces.length : roundPlaces.filter((p) => p.basin === id).length}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Tap systems to practise several together, or All for every one. A system is
                  its main river with every tributary and distributary that belongs to it.
                </p>
              </>
            )}

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

            {isPlacesRound && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">
                  {isPolitical ? 'Include' : 'Practise'}
                </h2>
                <div
                  className={`grid grid-cols-2 gap-3 ${
                    kindsHere.length === 3 ? 'sm:grid-cols-3' : kindsHere.length === 4 ? 'sm:grid-cols-4' : ''
                  }`}
                >
                  {PLACE_KINDS.map(({ kind, label }) => {
                    const n = inSection(kind)
                    if (!n) return null
                    const on = kindOn(kind)
                    // Never let the last one be unticked — a round with nothing
                    // to ask is not a round.
                    const last = on && askIds.length === n
                    return (
                      <label
                        key={kind}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 bg-white px-3 py-3 text-center ${
                          on ? 'border-blue-600' : 'border-transparent'
                        } ${last ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={last}
                          // From what this round shows, not the raw preference,
                          // so a section it lent back on stays on.
                          onChange={(e) =>
                            setPlaceKinds((k) => {
                              const next = { ...k }
                              for (const h of kindsHere) next[h] = kindOn(h)
                              return { ...next, [kind]: e.target.checked }
                            })
                          }
                          className="h-4 w-4 accent-blue-600"
                        />
                        <PlaceKindSwatch kind={kind} />
                        <span className="text-sm font-extrabold text-slate-900">{label}</span>
                        <span className="text-xs font-bold text-slate-400">{n}</span>
                      </label>
                    )
                  })}
                </div>
                {isPolitical && mode === 'significance' && kindOn('country') && clueless.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Why mode asks a country by its capital, so the {clueless.length}{' '}
                    {clueless.length === 1 ? 'country' : 'countries'} whose capital is not in the
                    notes yet {clueless.length === 1 ? 'sits' : 'sit'} this one out.
                  </p>
                )}
              </>
            )}

            <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Questions</h2>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }}
            >
              {counts.map((c) => {
                // A saved count this round cannot fill plays as All, so All is lit.
                const on = c === 'all' ? size === askIds.length : c === size && c < askIds.length
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCount(c)}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 bg-white px-2 py-3 text-center ${
                      on ? 'border-blue-600' : 'border-transparent'
                    }`}
                  >
                    <div className="font-extrabold text-slate-900">{c === 'all' ? 'All' : c}</div>
                    {c === 'all' && (
                      <div className="text-xs font-semibold text-slate-500">{askIds.length}</div>
                    )}
                  </button>
                )
              })}
            </div>

            <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Mode</h2>
            <div className={`grid gap-3 ${round.places && !isPhenomena ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {(
                isPhenomena
                  ? ([
                      ['pin', 'Pin', 'Tap the right arrow'],
                      ['type', 'Name', 'Warm or cold, then its name'],
                    ] as const)
                  : ([
                      ['pin', 'Pin', 'Tap the map'],
                      ['type', 'Type', 'Enter the name'],
                      ...(round.places
                        ? ([['significance', 'Why', 'Name it from its fact']] as const)
                        : []),
                    ] as const)
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-xl border-2 bg-white px-4 py-3 text-center ${
                    playMode === value ? 'border-blue-600' : 'border-transparent'
                  }`}
                >
                  <div className="font-extrabold text-slate-900">{label}</div>
                  <div className="text-xs font-semibold text-slate-500">{hint}</div>
                </button>
              ))}
            </div>

            {playMode !== 'pin' && (
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white px-4 py-3">
                <input
                  type="checkbox"
                  checked={suggestions}
                  onChange={(e) => setSuggestions(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-blue-600"
                />
                <span>
                  <span className="block font-extrabold text-slate-900">Show suggestions</span>
                  <span className="block text-xs font-semibold text-slate-500">
                    {suggestions
                      ? 'Names appear after 3 letters; press Enter to answer.'
                      : 'No list. The answer is taken once it is spelt right; skip if you are stuck.'}
                  </span>
                </span>
              </label>
            )}

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

  if (route.view === 'home') {
    const atlases: { id: Atlas; title: string; blurb: string; count: string }[] = [
      {
        id: 'world',
        title: 'World Map',
        blurb: 'Countries, capitals and ports, and the seas and straits between them.',
        count: `Political Map · Seas & Straits`,
      },
      {
        id: 'india',
        title: 'India Map',
        blurb: 'The subcontinent in detail, state by state. Mountains first.',
        count: `${INDIA_CONTINENTS.length} section${INDIA_CONTINENTS.length === 1 ? '' : 's'}`,
      },
    ]
    return (
      <div className="min-h-dvh bg-slate-50 px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Map Practice</h1>
          <p className="mt-1 mb-8 text-slate-600">Pick a map.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {atlases.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate({ view: 'atlas', roundId, atlas: a.id })}
                className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="text-2xl font-extrabold text-slate-900">{a.title}</div>
                <div className="mt-1 text-sm text-slate-600">{a.blurb}</div>
                <div className="mt-4 text-xs font-bold tracking-wide text-slate-400 uppercase">
                  {a.count}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (route.atlas === 'india') {
    return (
      <div className="min-h-dvh bg-slate-50 px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            onClick={() => navigate(HOME)}
            className="mb-4 cursor-pointer text-sm font-bold text-slate-500"
          >
            ← Both maps
          </button>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">India Map</h1>
          <p className="mt-1 mb-8 text-slate-600">
            Drawn with India's own borders: Gilgit-Baltistan and Aksai Chin are part of Ladakh.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {INDIA_CONTINENTS.map((continent) => {
              const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => navigate({ view: 'setup', roundId: r.id })}
                  className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-5 py-10">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => navigate(HOME)}
          className="mb-4 cursor-pointer text-sm font-bold text-slate-500"
        >
          ← Both maps
        </button>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">World Map</h1>
        <p className="mt-1 mb-8 text-slate-600">
          Countries and the places inside them on one map, the seas and straits between them, and
          the currents that flow through them.
        </p>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
          <button
            type="button"
            onClick={() => navigate({ view: 'setup', roundId: politicalRoundId('world') })}
            className="w-full cursor-pointer text-left"
          >
            <div className="text-2xl font-extrabold text-slate-900">Political Map</div>
            <div className="mt-1 text-sm text-slate-600">
              Countries, capitals, regions and key places — the whole world or one continent, in
              any mix.
            </div>
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            {POLITICAL_SCOPES.map((scope) => (
              <button
                key={scope.id}
                type="button"
                onClick={() => navigate({ view: 'setup', roundId: politicalRoundId(scope.id) })}
                className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                {scope.label}
              </button>
            ))}
          </div>
          <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">
            {POLITICAL_ROUNDS[politicalRoundId('world')].askable.length} COUNTRIES ·{' '}
            {POLITICAL_ROUNDS[politicalRoundId('world')].places?.length} PLACES
          </div>
        </div>

        {WATER_CONTINENTS.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-extrabold text-slate-900">Seas &amp; Straits</h2>
            <p className="mt-1 mb-4 text-slate-600">
              Oceans, seas, straits and canals worldwide. Oceans and seas are drawn as{' '}
              <span className="font-bold text-sky-700">their real extent</span>, straits as{' '}
              <span className="font-bold text-orange-500">orange diamonds</span>, canals as{' '}
              <span className="font-bold text-purple-500">purple squares</span>.
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

        {PHENOMENA_CONTINENTS.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-extrabold text-slate-900">Phenomena</h2>
            <p className="mt-1 mb-4 text-slate-600">
              What moves across the map rather than sits on it, starting with the ocean currents —{' '}
              <span className="font-bold text-red-600">red arrows warm</span>,{' '}
              <span className="font-bold text-blue-700">blue arrows cold</span>.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {PHENOMENA_CONTINENTS.map((continent) => {
                const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => navigate({ view: 'setup', roundId: r.id })}
                    className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="text-lg font-extrabold text-slate-900">{r.title}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Warm and cold currents of every ocean, drawn as arrows.
                    </div>
                    <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">
                      {r.places?.length} CURRENTS
                    </div>
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => navigate({ view: 'learn', roundId: ISOTHERMS })}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md"
              >
                <div className="text-lg font-extrabold text-slate-900">Isotherms</div>
                <div className="mt-1 text-sm text-slate-600">
                  Surface air temperature in January and July, and the range between them.
                </div>
                <div className="mt-3 text-xs font-bold tracking-wide text-slate-400">LEARN · 3 MAPS</div>
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
