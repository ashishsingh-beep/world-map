import { useCallback, useEffect, useState } from 'react'
import {
  INDIA_CONTINENTS,
  POLITICAL_ROUNDS,
  POLITICAL_SCOPES,
  PLACE_ROUNDS,
  PHYSICAL_ALL_ROUND,
  physicalSectionOf,
  politicalIdFor,
  politicalRoundId,
  scopesOf,
  WATER_CONTINENTS,
  PHENOMENA_CONTINENTS,
  allPlacesRoundId,
  framing,
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
import { CLIMATE, HOME, ISOTHERMS, useRoute, type Route } from './app/route'
import { MenuCard, MenuSection } from './ui/Menu'
import { IsothermScreen } from './screens/IsothermScreen'
import { ClimateScreen } from './screens/ClimateScreen'
import { PhysicalScreen } from './screens/PhysicalScreen'
import { PHYSICAL_SECTIONS, physicalSection, type PhysicalSection } from './app/physical'
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
  const confluences = asked.filter((p) => p.type === 'confluence').length
  // Majuli, Namcha Barwa: places on a river's course, asked beside it.
  const places = asked.length - rivers - origins - confluences
  return [
    rivers && n(rivers, 'river'),
    origins && n(origins, 'origin'),
    confluences && n(confluences, 'confluence'),
    places && n(places, 'place'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * What a rivers round can ask, by kind: the rivers themselves, where they
 * rise, where they meet, and the places on their courses (Majuli, Shipki La,
 * Angel Falls) — one bucket for everything that is none of the other three.
 */
const RIVER_KINDS = [
  ['river', 'Rivers'],
  ['origin', 'Origins'],
  ['confluence', 'Confluences'],
  ['place', 'Places'],
] as const
const riverKindOf = (p: Place) =>
  p.type === 'river' || p.type === 'origin' || p.type === 'confluence' ? p.type : 'place'

/** A physical section's round, once its syllabus has something in it. */
const physicalRound = (s: PhysicalSection) => {
  const r = PLACE_ROUNDS[allPlacesRoundId(s.syllabus)]
  return r?.places?.length ? r : null
}

/**
 * The isotherm maps have no round behind them, so they are answered before
 * anything that needs one.
 */
export default function App() {
  const [route, navigate] = useRoute()
  const toWorld = () => navigate({ view: 'atlas', roundId: HOME.roundId, atlas: 'world' })
  if (route.roundId === ISOTHERMS) return <IsothermScreen onExit={toWorld} />
  if (route.roundId === CLIMATE) return <ClimateScreen onExit={toWorld} />
  // A physical section with its notes in is a round; until then, its map.
  const physical = physicalSection(route.roundId)
  if (physical && !physicalRound(physical)) return <PhysicalScreen section={physical} onExit={toWorld} />
  if (physical) return <Rounds route={{ ...route, roundId: physicalRound(physical)!.id }} navigate={navigate} />
  return <Rounds route={route} navigate={navigate} />
}

function Rounds({ route, navigate }: { route: Route; navigate: (next: Route, replace?: boolean) => void }) {
  const [prefs, setPrefs] = useState(loadPrefs)
  const { mode, timed, count, suggestions, kinds, region, placeKinds, basins: basinPref, physicalSections: sectionPref, physicalContinents: continentPref, riverKinds: riverKindPref } = prefs
  const setMode = (mode: Mode) => setPrefs((p) => ({ ...p, mode }))
  const setTimed = (timed: boolean) => setPrefs((p) => ({ ...p, timed }))
  const setCount = (count: QuestionCount) => setPrefs((p) => ({ ...p, count }))
  const setSuggestions = (suggestions: boolean) => setPrefs((p) => ({ ...p, suggestions }))
  const setKinds = (next: (k: Record<WaterKind, boolean>) => Record<WaterKind, boolean>) =>
    setPrefs((p) => ({ ...p, kinds: next(p.kinds) }))
  const setRegion = (region: WaterRegion) => setPrefs((p) => ({ ...p, region }))
  const setBasins = (basins: string[]) => setPrefs((p) => ({ ...p, basins }))
  const setSections = (physicalSections: string[]) => setPrefs((p) => ({ ...p, physicalSections }))
  const setContinents = (physicalContinents: string[]) => setPrefs((p) => ({ ...p, physicalContinents }))
  const setRiverKinds = (riverKinds: string[]) => setPrefs((p) => ({ ...p, riverKinds }))
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
  /** Phenomena — the ocean currents and the local winds: Pin and Name, warm or cold. */
  const isPhenomena = roundPlaces[0]?.section === 'phenomena'
  /** The winds also have Why: each has a clue worth naming it from ("the snow eater"). */
  const isWinds = roundPlaces.some((p) => p.type === 'wind')
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
  /**
   * The unified Physical Map narrows by section — rivers, mountains, any
   * several — exactly as a rivers round narrows by system.
   */
  /**
   * Every physical round — the unified map and each section — narrows first
   * by continent: the continents its features lie on (`realm`), any several
   * together, toggled like the sections. Sections, systems and the frame are
   * then what those continents hold.
   */
  const isPhysical = !!round.physical
  const continentsHere: string[] = isPhysical
    ? POLITICAL_SCOPES.flatMap((s) => (s.continent && roundPlaces.some((p) => p.realm === s.continent) ? [s.continent] : []))
    : []
  const continentsChosen = continentPref.filter((c) => continentsHere.includes(c))
  const allContinents = continentsChosen.length === 0 || continentsChosen.length === continentsHere.length
  const inContinents = (p: Place) => allContinents || continentsChosen.includes(p.realm ?? '')
  const tapContinent = (id: string) => {
    if (id === 'all') return setContinents([])
    const next = allContinents
      ? [id]
      : continentsChosen.includes(id)
        ? continentsChosen.filter((c) => c !== id)
        : [...continentsChosen, id]
    if (!next.length) return
    setContinents(next.length === continentsHere.length ? [] : next)
  }
  const localPlaces = isPhysical ? roundPlaces.filter(inContinents) : roundPlaces
  /** The chosen continents' own frame, or the round's when every one is on. */
  const localView = isPhysical && !allContinents ? framing(localPlaces) : round.view

  const isPhysicalAll = !!round.physicalAll
  const sectionsHere = PHYSICAL_SECTIONS.filter((s) => localPlaces.some((p) => physicalSectionOf(p)?.id === s.id))
  const sectionsChosen = sectionPref.filter((id) => sectionsHere.some((s) => s.id === id))
  const allSections = sectionsChosen.length === 0 || sectionsChosen.length === sectionsHere.length
  const inSections = (p: Place) => allSections || sectionsChosen.includes(physicalSectionOf(p)?.id ?? '')
  const tapSection = (id: string) => {
    if (id === 'all') return setSections([])
    const next = allSections
      ? [id]
      : sectionsChosen.includes(id)
        ? sectionsChosen.filter((s) => s !== id)
        : [...sectionsChosen, id]
    if (!next.length) return
    setSections(next.length === sectionsHere.length ? [] : next)
  }
  const isRivers = !isPhysicalAll && roundPlaces[0]?.section === 'rivers'
  const basins = isRivers ? [...new Set(localPlaces.map((p) => p.basin ?? ''))].filter(Boolean) : []
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
  /**
   * Then by kind — rivers, origins, confluences, places — several at once,
   * toggled like the systems. A kind left out is not asked, but the rivers
   * stay drawn: an origin or a confluence is read off the courses.
   */
  const riverKindsHere: string[] = isRivers
    ? RIVER_KINDS.map(([k]) => k as string).filter((k) => localPlaces.some((p) => inBasins(p.basin) && riverKindOf(p) === k))
    : []
  const riverKindsChosen = riverKindPref.filter((k) => riverKindsHere.includes(k))
  const allRiverKinds = riverKindsChosen.length === 0 || riverKindsChosen.length === riverKindsHere.length
  const inRiverKinds = (p: Place) => allRiverKinds || riverKindsChosen.includes(riverKindOf(p))
  const tapRiverKind = (id: string) => {
    if (id === 'all') return setRiverKinds([])
    const next = allRiverKinds
      ? [id]
      : riverKindsChosen.includes(id)
        ? riverKindsChosen.filter((k) => k !== id)
        : [...riverKindsChosen, id]
    if (!next.length) return
    setRiverKinds(next.length === riverKindsHere.length ? [] : next)
  }
  const inRegion = isWaterRound
    ? roundPlaces.filter((p) => region === 'all' || p.regions?.includes(region))
    : isRivers
      ? localPlaces.filter((p) => inBasins(p.basin))
      : isPhysicalAll
        ? localPlaces.filter(inSections)
        : localPlaces
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
      : isRivers
        ? inRegion.filter(inRiverKinds)
        : inRegion
  const askedCountries = isPolitical && kindOn('country') ? roundCountries : []
  /** Context rivers ride along with their own system, sections and continents only. */
  const inContext = (p: Place) =>
    (!isPhysical || inContinents(p)) && (isRivers ? inBasins(p.basin) : !isPhysicalAll || inSections(p))
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
            view: localView,
            // Context rivers ride along with their own system only.
            backdrop: [
              ...inRegion.map((p) => p.id),
              ...(round.context ?? []).filter((id) => inContext(placeOf(id))),
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
    : isWaterRound || isPlacesRound || isRivers || isPhysicalAll
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
  const playMode = (!round.places?.length || (isPhenomena && !isWinds)) && mode === 'significance' ? 'type' : mode

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
    /**
     * Learn opens on what the setup has chosen, as Practice does: the
     * Political Map's sections, the water round's region and notations, the
     * rivers' systems. Its own legend chips then turn things on and off from
     * there, for this visit only.
     */
    const learnRound =
      isWaterRound || isRivers
        ? {
            ...round,
            places: inRegion.map((p) => p.id),
            context: round.context?.filter((id) => !isRivers || inContext(placeOf(id))),
            view: localView,
          }
        : isPhysical && !allContinents
          ? {
              ...round,
              places: localPlaces.map((p) => p.id),
              context: round.context?.filter((id) => inContinents(placeOf(id))),
              view: localView,
            }
          : round
    return (
      <LearnScreen
        round={learnRound}
        initial={{
          placeKinds: isPlacesRound
            ? (Object.fromEntries(PLACE_KINDS.map(({ kind }) => [kind, kindOn(kind)])) as Record<PlaceKind, boolean>)
            : undefined,
          kinds: isWaterRound ? kinds : undefined,
          sections: isPhysicalAll && !allSections ? sectionsChosen : undefined,
          riverKinds: isRivers && !allRiverKinds ? riverKindsChosen : undefined,
        }}
        onExit={() => navigate({ view: 'setup', roundId })}
      />
    )
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
                    : `${asked.length} ${isWaterRound || isPhysicalAll ? 'features' : isPhenomena ? (isWinds ? 'winds' : 'currents') : 'places'}`
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

            {isPhysical && continentsHere.length > 1 && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Continent</h2>
                <div className="grid grid-cols-3 gap-3">
                  {['all', ...continentsHere].map((id) => {
                    const on = id === 'all' ? allContinents : !allContinents && continentsChosen.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => tapContinent(id)}
                        aria-pressed={on}
                        className={`cursor-pointer rounded-xl border-2 bg-white px-3 py-3 text-center ${
                          on ? 'border-blue-600' : 'border-transparent'
                        }`}
                      >
                        <div className="font-extrabold text-slate-900">{id === 'all' ? 'All' : id}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          {id === 'all' ? roundPlaces.length : roundPlaces.filter((p) => p.realm === id).length}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Tap continents to practise several together, or All for the whole map.
                </p>
              </>
            )}

            {isPhysicalAll && sectionsHere.length > 1 && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Features</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[{ id: 'all', title: 'All' }, ...sectionsHere].map(({ id, title }) => {
                    const on = id === 'all' ? allSections : !allSections && sectionsChosen.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => tapSection(id)}
                        aria-pressed={on}
                        className={`cursor-pointer rounded-xl border-2 bg-white px-3 py-3 text-center ${
                          on ? 'border-blue-600' : 'border-transparent'
                        }`}
                      >
                        <div className="font-extrabold text-slate-900">{title}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          {id === 'all'
                            ? localPlaces.length
                            : localPlaces.filter((p) => physicalSectionOf(p)?.id === id).length}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Tap sections to practise several together, or All for every feature on the map.
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

            {isRivers && riverKindsHere.length > 1 && (
              <>
                <h2 className="mt-5 mb-2 font-extrabold text-slate-900">Questions on</h2>
                <div className="grid grid-cols-3 gap-3">
                  {['all', ...riverKindsHere].map((id) => {
                    const on = id === 'all' ? allRiverKinds : !allRiverKinds && riverKindsChosen.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => tapRiverKind(id)}
                        aria-pressed={on}
                        className={`cursor-pointer rounded-xl border-2 bg-white px-3 py-3 text-center ${
                          on ? 'border-blue-600' : 'border-transparent'
                        }`}
                      >
                        <div className="font-extrabold text-slate-900">
                          {id === 'all' ? 'All' : RIVER_KINDS.find(([k]) => k === id)![1]}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">
                          {id === 'all' ? inRegion.length : inRegion.filter((p) => riverKindOf(p) === id).length}
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Tap kinds to practise several together, or All for everything. The rivers stay
                  on the map either way.
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
                      // A tile, like the mode and count tiles beside it: the
                      // box in its corner, then the swatch, the name and the
                      // count stacked — four across left no room for them in a row.
                      <label
                        key={kind}
                        className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-white px-2 py-3 text-center ${
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
                          className="absolute top-2 left-2 h-4 w-4 accent-blue-600"
                        />
                        <PlaceKindSwatch kind={kind} />
                        <span className="text-sm font-extrabold whitespace-nowrap text-slate-900">{label}</span>
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
            <div className={`grid gap-3 ${round.places && (!isPhenomena || isWinds) ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {(
                isPhenomena
                  ? ([
                      ['pin', 'Pin', 'Tap the right arrow'],
                      ['type', 'Name', 'Warm or cold, then its name'],
                      ...(isWinds ? ([['significance', 'Why', 'Name it from its fact']] as const) : []),
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
                      ? 'Names appear after 3 letters; Enter takes the highlighted one.'
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

  // The menus share one card and one section (`src/ui/Menu.tsx`), so the
  // home screen and both maps read alike.
  const backToMaps = (
    <button
      type="button"
      onClick={() => navigate(HOME)}
      className="mb-4 cursor-pointer text-sm font-bold text-slate-500 hover:text-slate-700"
    >
      ← Both maps
    </button>
  )

  if (route.view === 'home') {
    return (
      <div className="min-h-dvh bg-slate-50 px-5 py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Map Practice</h1>
          <p className="mt-1 text-slate-600">Pick a map.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MenuCard
              icon="globe"
              title="World Map"
              blurb="Countries and capitals, seas and straits, currents and temperatures."
              meta="Political · Physical · Phenomena"
              onClick={() => navigate({ view: 'atlas', roundId, atlas: 'world' })}
            />
            <MenuCard
              icon="india"
              title="India Map"
              blurb="The subcontinent in detail, state by state, on India's own borders."
              meta="Mountains · Rivers"
              onClick={() => navigate({ view: 'atlas', roundId, atlas: 'india' })}
            />
          </div>
        </div>
      </div>
    )
  }

  if (route.atlas === 'india') {
    return (
      <div className="min-h-dvh bg-slate-50 px-5 py-10">
        <div className="mx-auto max-w-3xl">
          {backToMaps}
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">India Map</h1>
          <p className="mt-1 text-slate-600">
            Drawn with India's own borders: Gilgit-Baltistan and Aksai Chin are part of Ladakh.
          </p>
          <MenuSection title="Physical" blurb="The mountains and rivers of the subcontinent.">
            {INDIA_CONTINENTS.map((continent) => {
              const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
              const rivers = continent.section === 'rivers'
              return (
                <MenuCard
                  key={r.id}
                  icon={rivers ? 'river' : 'mountain'}
                  title={r.title}
                  blurb={
                    rivers
                      ? 'River systems with their origins, tributaries, distributaries and confluences.'
                      : 'The Himalaya belt by belt — its ranges and peaks.'
                  }
                  meta={
                    rivers
                      ? `${new Set((r.places ?? []).map((id) => placeOf(id).basin)).size} systems · ${r.places?.length ?? 0} features`
                      : `${r.places?.length ?? 0} features`
                  }
                  onClick={() => navigate({ view: 'setup', roundId: r.id })}
                />
              )
            })}
          </MenuSection>
        </div>
      </div>
    )
  }

  const world = POLITICAL_ROUNDS[politicalRoundId('world')]
  /** The continents the Physical Map has features on, in the Political Map's order. */
  const physicalContinents = POLITICAL_SCOPES.flatMap((s) =>
    s.continent && PHYSICAL_ALL_ROUND?.places?.some((id) => placeOf(id).realm === s.continent) ? [s.continent as string] : []
  )
  return (
    <div className="min-h-dvh bg-slate-50 px-5 py-10">
      <div className="mx-auto max-w-3xl">
        {backToMaps}
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">World Map</h1>
        <p className="mt-1 text-slate-600">Pick a map, then practise it or learn it.</p>

        <MenuSection title="Political" blurb="Countries and the places inside them.">
          <MenuCard
            wide
            icon="globe"
            title="Political Map"
            blurb="Countries, capitals, regions and key places — the whole world, one continent, or any mix."
            meta={`${world.askable.length} countries · ${world.places?.length ?? 0} places`}
            onClick={() => navigate({ view: 'setup', roundId: politicalRoundId('world') })}
          >
            <div className="flex flex-wrap gap-2">
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
          </MenuCard>
        </MenuSection>

        <MenuSection title="Physical" blurb="The land and water themselves.">
          {WATER_CONTINENTS.map((continent) => {
            const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
            return (
              <MenuCard
                key={r.id}
                wide
                icon="waves"
                title={r.title}
                blurb="Oceans and seas as their real extent, straits as diamonds, canals as squares."
                meta={`${r.places?.length ?? 0} features`}
                onClick={() => navigate({ view: 'setup', roundId: r.id })}
              />
            )
          })}
          {PHYSICAL_ALL_ROUND && (
            <MenuCard
              wide
              icon="terrain"
              title="Physical Map"
              blurb="Rivers, mountains, plateaus, deserts, grasslands and lakes — every physical feature on one map."
              meta={`${PHYSICAL_ALL_ROUND.places?.length ?? 0} features · ${physicalContinents.length} continents`}
              onClick={() => navigate({ view: 'setup', roundId: PHYSICAL_ALL_ROUND!.id })}
            >
              {/* As the Political Map's: a continent opens the map with just it ticked, World with every one. */}
              <div className="flex flex-wrap gap-2">
                {['World', ...physicalContinents].map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setContinents(label === 'World' ? [] : [label])
                      navigate({ view: 'setup', roundId: PHYSICAL_ALL_ROUND!.id })
                    }}
                    className="cursor-pointer rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </MenuCard>
          )}
          {PHYSICAL_SECTIONS.map((section) => {
            const r = physicalRound(section)
            return r ? (
              <MenuCard
                key={section.id}
                icon={section.icon}
                title={section.title}
                blurb={r.blurb}
                meta={`${r.places?.length ?? 0} ${r.places?.some((id) => placeOf(id).type === 'river') ? 'features' : section.title.toLowerCase()}`}
                onClick={() => navigate({ view: 'setup', roundId: r.id })}
              />
            ) : (
              <MenuCard
                key={section.id}
                icon={section.icon}
                title={section.title}
                blurb="Notes to come — the world map is ready, borders and names on a switch."
                meta="Map ready"
                onClick={() => navigate({ view: 'learn', roundId: section.id })}
              />
            )
          })}
        </MenuSection>

        {PHENOMENA_CONTINENTS.length > 0 && (
          <MenuSection title="Phenomena" blurb="What moves across the map rather than sits on it.">
            {PHENOMENA_CONTINENTS.map((continent) => {
              const r = PLACE_ROUNDS[allPlacesRoundId(continent.name)]
              const winds = r.places?.some((id) => placeOf(id).type === 'wind')
              return (
                <MenuCard
                  key={r.id}
                  icon={winds ? 'wind' : 'currents'}
                  title={r.title}
                  blurb={
                    winds
                      ? 'Hot and cold local winds — the Chinook, the Mistral, the Harmattan — drawn as red and blue arrows.'
                      : 'Warm and cold currents of every ocean, drawn as red and blue arrows.'
                  }
                  meta={`${r.places?.length ?? 0} ${winds ? 'winds' : 'currents'}`}
                  onClick={() => navigate({ view: 'setup', roundId: r.id })}
                />
              )
            })}
            <MenuCard
              icon="thermometer"
              title="Isotherms"
              blurb="Surface air temperature in January and July, and the range between them."
              meta="Learn · 3 maps"
              onClick={() => navigate({ view: 'learn', roundId: ISOTHERMS })}
            />
            <MenuCard
              icon="climate"
              title="Climate"
              blurb="Equatorial, monsoon, Mediterranean, desert and Sudan-type climates, with the pressure belts and winds."
              meta="Learn · 6 climates"
              onClick={() => navigate({ view: 'learn', roundId: CLIMATE })}
            />
          </MenuSection>
        )}
      </div>
    </div>
  )
}
