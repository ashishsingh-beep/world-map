import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoBounds, geoContains, geoDistance } from 'd3-geo'
import { allIsos, featureByIso, metaOf } from '../data/countries'
import { areaOf } from '../data/areas'
import { distanceToLineKm, placeOf, type Place } from '../data/places'
import { judgeName, type Candidate } from './matchName'
import type {
  CountryState,
  MapArea,
  MapBand,
  MapPoint,
  MarkerShape,
  ToScreen,
} from '../map/MapCanvas'
import type { Round } from './rounds'

export { normaliseName } from './matchName'

/**
 * Every country name, as rivals for the spelling judge. Without them "Uruguay"
 * would read as a slip of "Paraguay" in a round that only asks one of the two.
 */
const COUNTRY_VOCABULARY: Candidate[] = allIsos.map((iso) => {
  const m = metaOf(iso)
  return { id: iso, name: m.name, aliases: m.aliases ?? [] }
})

/**
 * Pin: name → tap the map. Type: map highlights it → type the name.
 * Significance: a clue from the notes ("Copper abundance…") → type the name,
 * with nothing highlighted, because the point is to recall the fact.
 */
export type Mode = 'pin' | 'type' | 'significance'
export type Phase = 'asking' | 'revealing' | 'finished'
export type Verdict = 'correct' | 'incorrect'

export const QUESTION_SECONDS = 15
const REVEAL_MS = 1400
/** How close a tap must land to a point place to count, in screen pixels. */
export const PIN_TOLERANCE_PX = 28
const EARTH_RADIUS_KM = 6371

export interface QuizOptions {
  round: Round
  mode: Mode
  timed: boolean
  /**
   * A round to pick back up rather than start. Ignored unless its questions are
   * exactly the ones this round would ask, so a stale save cannot resume into
   * a round that has since changed.
   */
  initial?: QuizSnapshot | null
}

/** Everything needed to rebuild a round in progress, and nothing more. */
export interface QuizSnapshot {
  /** The shuffled order, so resuming does not reshuffle the questions. */
  ids: string[]
  index: number
  answers: Answer[]
  elapsed: number
}

export interface Answer {
  id: string
  correct: boolean
  /** How far the tap landed from the answer, for point questions. */
  km?: number
  /** Set when a typed answer was accepted despite its spelling. */
  corrected?: string
}

/**
 * One question, whether it is asking for a country or for a place inside one.
 * `iso` is set when the answer is a country polygon, which is how a country
 * round and a country-level fact ("which country is landlocked?") share a path.
 */
interface Question {
  id: string
  name: string
  aliases: string[]
  point: [number, number]
  iso: string | null
  place: Place | null
}

function buildQuestions(round: Round): Question[] {
  if (round.places) {
    return round.places.map((id) => {
      const p = placeOf(id)
      return {
        id,
        name: p.name,
        aliases: p.aliases,
        point: p.point,
        iso: p.type === 'country' ? p.country : null,
        place: p,
      }
    })
  }
  return round.askable.map((iso) => {
    const m = metaOf(iso)
    return { id: iso, name: m.name, aliases: m.aliases ?? [], point: m.centroid, iso, place: null }
  })
}

/** Sea, strait, canal and peak each get their own notation; a capital gets its
 *  own colour, coloured apart from every other place a places round asks
 *  about; everything else is a plain dot. */
export function shapeOf(q: { place: Place | null }): MarkerShape {
  const t = q.place?.type
  if (t === 'ocean' || t === 'sea' || t === 'strait' || t === 'canal' || t === 'peak') return t
  return t === 'capital' ? 'capital' : 'dot'
}

function shuffle<T>(input: T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * A saved round rebuilt, or a fresh shuffle when the save no longer fits. The
 * check is by question, not by count: a save whose ids are not exactly this
 * round's is from a different round, whatever it claims.
 */
function resume(round: Round, initial: QuizSnapshot | null) {
  const built = buildQuestions(round)
  const fresh = { queue: shuffle(built), index: 0, answers: [] as Answer[], elapsed: 0 }
  if (!initial || initial.ids.length !== built.length) return fresh

  const byId = new Map(built.map((q) => [q.id, q]))
  const queue: Question[] = []
  for (const id of initial.ids) {
    const q = byId.get(id)
    if (!q) return fresh
    queue.push(q)
  }
  if (initial.index < 0 || initial.index >= queue.length) return fresh
  return {
    queue,
    index: initial.index,
    answers: initial.answers,
    elapsed: initial.elapsed,
  }
}

/**
 * Round state machine. Every round asks its full set — there is no
 * question-count selector by design.
 */
export function useQuiz({ round, mode, timed, initial = null }: QuizOptions) {
  // Resolved once, so a re-render can never reshuffle a round mid-flight.
  const [start] = useState(() => resume(round, initial))
  const [queue] = useState(start.queue)
  const [index, setIndex] = useState(start.index)
  const [phase, setPhase] = useState<Phase>('asking')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [answers, setAnswers] = useState<Answer[]>(start.answers)
  const [wrongPick, setWrongPick] = useState<string | null>(null)
  const [tapped, setTapped] = useState<[number, number] | null>(null)
  const [missKm, setMissKm] = useState<number | null>(null)
  const [corrected, setCorrected] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(start.elapsed)
  const [remaining, setRemaining] = useState(QUESTION_SECONDS)

  const current = queue[index] ?? null
  const advanceRef = useRef<number | null>(null)

  // Elapsed clock, counting up for the whole round.
  useEffect(() => {
    if (paused || phase === 'finished') return
    const id = window.setInterval(() => setElapsed((e) => e + 0.1), 100)
    return () => window.clearInterval(id)
  }, [paused, phase])

  const settle = useCallback(
    (correct: boolean, picked?: string, km?: number, corrected?: string) => {
      if (!current) return
      setVerdict(correct ? 'correct' : 'incorrect')
      setWrongPick(correct ? null : (picked ?? null))
      setMissKm(km ?? null)
      setCorrected(corrected ?? null)
      setAnswers((a) => [...a, { id: current.id, correct, km, corrected }])
      setPhase('revealing')
      advanceRef.current = window.setTimeout(() => {
        setVerdict(null)
        setWrongPick(null)
        setTapped(null)
        setMissKm(null)
        setCorrected(null)
        setIndex((i) => {
          const next = i + 1
          if (next >= queue.length) {
            setPhase('finished')
            return i
          }
          setPhase('asking')
          setRemaining(QUESTION_SECONDS)
          return next
        })
      }, REVEAL_MS)
    },
    [current, queue.length]
  )

  // Per-question countdown. Runs only while a question is actually being asked.
  useEffect(() => {
    if (!timed || paused || phase !== 'asking') return
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 0.1) {
          settle(false)
          return 0
        }
        return r - 0.1
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [timed, paused, phase, settle])

  useEffect(() => () => {
    if (advanceRef.current) window.clearTimeout(advanceRef.current)
  }, [])

  const pick = useCallback(
    (iso: string) => {
      if (phase !== 'asking' || !current) return
      settle(iso === current.id, iso)
    },
    [phase, current, settle]
  )

  /**
   * A tap anywhere on the map, used by place rounds. A country answer is judged
   * by containment; a point answer by how close the tap landed on screen, so
   * the difficulty stays the same whatever the zoom.
   */
  const pickPoint = useCallback(
    (lonLat: [number, number], toScreen: ToScreen) => {
      if (phase !== 'asking' || !current) return
      setTapped(lonLat)
      const km = geoDistance(lonLat, current.point) * EARTH_RADIUS_KM

      if (current.iso) {
        const f = featureByIso.get(current.iso)
        settle(!!f && geoContains(f, lonLat), undefined, km)
        return
      }
      /**
       * A sea is judged by its own extent, exactly like a country. No rival
       * check: the Aegean is inside the Mediterranean, and a tap there is a
       * perfectly good answer to "where is the Mediterranean" — marking it
       * wrong while painting the Mediterranean over the tap would be absurd.
       */
      const area = areaOf(current.id)
      if (area) {
        settle(geoContains(area, lonLat), undefined, km)
        return
      }
      /**
       * A range is a line, so it is answered by tapping near the ridgeline
       * anywhere along it — not near the midpoint the label happens to sit on.
       */
      const line = current.place?.line
      if (line) {
        const off = distanceToLineKm(line as [number, number][], lonLat)
        settle(off <= (current.place?.spanKm ?? 60), undefined, off)
        return
      }
      const at = toScreen(lonLat)
      const screenDistance = (q: Question) => {
        const b = at && toScreen(q.point)
        return at && b ? Math.hypot(at[0] - b[0], at[1] - b[1]) : Infinity
      }
      // Being within tolerance is not enough: the tap must also be closer to
      // this place than to any other in the round, or one tap between Santos
      // and São Paulo would answer both.
      const px = screenDistance(current)
      const nearestOnScreen = queue.reduce((best, q) =>
        !q.iso && screenDistance(q) < screenDistance(best) ? q : best
      )
      const byScreen = px <= PIN_TOLERANCE_PX && nearestOnScreen.id === current.id

      /**
       * A sea is an area, not a point, so pointing anywhere inside it counts.
       * Scoring by distance ÷ its own span also settles nesting for free: a tap
       * in the middle of the Mediterranean scores better against the
       * Mediterranean than against the Tyrrhenian inside it, and vice versa.
       */
      const spanScore = (q: Question) =>
        q.place?.spanKm
          ? (geoDistance(lonLat, q.point) * EARTH_RADIUS_KM) / q.place.spanKm
          : Infinity
      const nearestBySpan = queue.reduce((best, q) => (spanScore(q) < spanScore(best) ? q : best))
      const bySpan = spanScore(current) <= 1 && nearestBySpan.id === current.id

      settle(byScreen || bySpan, undefined, km)
    },
    [phase, current, settle, queue]
  )

  const submitName = useCallback(
    (text: string) => {
      if (phase !== 'asking' || !current) return
      const { correct, corrected } = judgeName(text, current, [...queue, ...COUNTRY_VOCABULARY])
      settle(correct, undefined, undefined, corrected ?? undefined)
    },
    [phase, current, settle, queue]
  )

  const skip = useCallback(() => {
    if (phase !== 'asking') return
    settle(false)
  }, [phase, settle])

  const byId = useMemo(() => new Map(queue.map((q) => [q.id, q])), [queue])

  /** Per-country paint state, carried for the rest of the round. */
  const states = useMemo(() => {
    const out: Record<string, CountryState> = {}
    const paint = (id: string, state: CountryState) => {
      const iso = byId.get(id)?.iso
      if (iso) out[iso] = state
    }
    for (const a of answers) paint(a.id, a.correct ? 'correct' : 'missed')
    if (wrongPick) paint(wrongPick, 'wrong')
    if (phase === 'revealing' && current) {
      paint(current.id, verdict === 'correct' ? 'correct' : 'missed')
    }
    // In Type mode the answer is highlighted, since the player has to name
    // what they are shown.
    if (mode === 'type' && phase === 'asking' && current) paint(current.id, 'target')
    return out
  }, [answers, wrongPick, phase, current, verdict, mode, byId])

  /**
   * Markers for point places. Only answered places and the one in play are
   * drawn — showing every place up front would turn Pin mode into multiple
   * choice.
   */
  const points = useMemo(() => {
    // Keyed, because the place being revealed is already in `answers` by then.
    const out = new Map<string, MapPoint>()
    const add = (q: Question | null | undefined, state: CountryState) => {
      // A place with an extent is drawn as that extent, never also as a pin.
      if (q && !q.iso && !areaOf(q.id) && !q.place?.line) {
        out.set(q.id, { id: q.id, point: q.point, state, shape: shapeOf(q) })
      }
    }
    for (const a of answers) add(byId.get(a.id), a.correct ? 'correct' : 'missed')
    if (phase === 'revealing' && current) {
      add(current, verdict === 'correct' ? 'correct' : 'missed')
    }
    if (mode === 'type' && phase === 'asking' && current) add(current, 'target')
    return [...out.values()]
  }, [answers, phase, current, verdict, mode, byId])

  /** The same states as `points`, for the ranges drawn as bands instead. */
  const bands = useMemo(() => {
    const out = new Map<string, MapBand>()
    const add = (q: Question | null | undefined, state: CountryState) => {
      const line = q?.place?.line
      if (q && line) {
        out.set(q.id, { id: q.id, line: line as [number, number][], state, belt: q.place?.belt })
      }
    }
    for (const a of answers) add(byId.get(a.id), a.correct ? 'correct' : 'missed')
    if (phase === 'revealing' && current) {
      add(current, verdict === 'correct' ? 'correct' : 'missed')
    }
    if (mode === 'type' && phase === 'asking' && current) add(current, 'target')
    return [...out.values()]
  }, [answers, phase, current, verdict, mode, byId])

  /** The same states as `points`, for the places drawn as regions instead. */
  const areas = useMemo(() => {
    const out = new Map<string, MapArea>()
    const add = (q: Question | null | undefined, state: CountryState) => {
      if (q && !q.iso && areaOf(q.id)) out.set(q.id, { id: q.id, state })
    }
    for (const a of answers) add(byId.get(a.id), a.correct ? 'correct' : 'missed')
    if (phase === 'revealing' && current) {
      add(current, verdict === 'correct' ? 'correct' : 'missed')
    }
    if (mode === 'type' && phase === 'asking' && current) add(current, 'target')
    return [...out.values()]
  }, [answers, phase, current, verdict, mode, byId])

  const correctCount = answers.filter((a) => a.correct).length
  const revealing = phase === 'revealing' && current
  const isPointAnswer = !!current && !current.iso
  const currentArea = current ? areaOf(current.id) : null

  /**
   * A sea reveals by framing the whole sea, not the label's point. Skipped for
   * anything whose bounds wrap the antimeridian — the Pacific's run 128°E to
   * 68°W, which as a box is the rest of the planet.
   */
  const areaFrame = (): [number, number][] | null => {
    const line = current?.place?.line
    if (line) return line as [number, number][]
    if (!currentArea) return null
    const [[w, s], [e, n]] = geoBounds(currentArea)
    return w > e ? null : [[w, s], [e, n]]
  }

  /** Stable, so saving can key off "a question was answered" and nothing else. */
  const queueIds = useMemo(() => queue.map((q) => q.id), [queue])

  /**
   * Every answer in the round, for the typed input's suggestions. The round's
   * own set and not all 196 countries: a name this round never asks for is not
   * a thing the player could mean.
   */
  const vocabulary = useMemo(
    () => queue.map((q) => q.name).sort((a, b) => a.localeCompare(b)),
    [queue]
  )

  return {
    current,
    index,
    queueIds,
    total: queue.length,
    phase,
    verdict,
    answers,
    correctCount,
    elapsed,
    remaining,
    paused,
    setPaused,
    pick,
    pickPoint,
    submitName,
    skip,
    states,
    points,
    areas,
    bands,
    vocabulary,
    /** How far the last tap landed from the answer — only set on point questions. */
    missKm,
    /** The right spelling, when the typed answer was accepted in spite of it. */
    corrected,
    spellingSlips: answers.filter((a) => a.corrected).length,
    /** Only non-null during a reveal — the camera never moves while asking. */
    revealIso: revealing && current.iso ? current.iso : null,
    revealPoints:
      revealing && isPointAnswer
        ? [
            ...(areaFrame() ?? [current.point]),
            ...(tapped && verdict === 'incorrect' ? [tapped] : []),
          ]
        : null,
    pinIso: revealing && verdict === 'incorrect' && current.iso ? current.iso : null,
    // No pin on a sea: the painted region already says where it was, and a pin
    // in the middle of it would only re-assert the point this replaced.
    pinPoint:
      revealing && verdict === 'incorrect' && isPointAnswer && !currentArea && !current.place?.line
        ? current.point
        : null,
    markPoint: revealing && verdict === 'incorrect' ? tapped : null,
  }
}
