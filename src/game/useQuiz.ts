import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoContains, geoDistance } from 'd3-geo'
import { featureByIso, metaOf } from '../data/countries'
import { placeOf, type Place } from '../data/places'
import type { CountryState, MapPoint, ToScreen } from '../map/MapCanvas'
import type { Round } from './rounds'

/** Case- and accent-insensitive, punctuation-agnostic. No autocomplete anywhere. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

export type Mode = 'pin' | 'type'
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
}

export interface Answer {
  id: string
  correct: boolean
  /** How far the tap landed from the answer, for point questions. */
  km?: number
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

function shuffle<T>(input: T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Round state machine. Every round asks its full set — there is no
 * question-count selector by design.
 */
export function useQuiz({ round, mode, timed }: QuizOptions) {
  const [queue] = useState(() => shuffle(buildQuestions(round)))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('asking')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [wrongPick, setWrongPick] = useState<string | null>(null)
  const [tapped, setTapped] = useState<[number, number] | null>(null)
  const [missKm, setMissKm] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
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
    (correct: boolean, picked?: string, km?: number) => {
      if (!current) return
      setVerdict(correct ? 'correct' : 'incorrect')
      setWrongPick(correct ? null : (picked ?? null))
      setMissKm(km ?? null)
      setAnswers((a) => [...a, { id: current.id, correct, km }])
      setPhase('revealing')
      advanceRef.current = window.setTimeout(() => {
        setVerdict(null)
        setWrongPick(null)
        setTapped(null)
        setMissKm(null)
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
      const at = toScreen(lonLat)
      const screenDistance = (q: Question) => {
        const b = at && toScreen(q.point)
        return at && b ? Math.hypot(at[0] - b[0], at[1] - b[1]) : Infinity
      }
      // Being within tolerance is not enough: the tap must also be closer to
      // this place than to any other in the round, or one tap between Santos
      // and São Paulo would answer both.
      const px = screenDistance(current)
      const nearest = queue.reduce((best, q) =>
        !q.iso && screenDistance(q) < screenDistance(best) ? q : best
      )
      settle(px <= PIN_TOLERANCE_PX && nearest.id === current.id, undefined, km)
    },
    [phase, current, settle, queue]
  )

  const submitName = useCallback(
    (text: string) => {
      if (phase !== 'asking' || !current) return
      const accepted = [current.name, ...current.aliases].map(normaliseName)
      settle(accepted.includes(normaliseName(text)))
    },
    [phase, current, settle]
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
      if (q && !q.iso) out.set(q.id, { id: q.id, point: q.point, state })
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

  return {
    current,
    index,
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
    /** How far the last tap landed from the answer — only set on point questions. */
    missKm,
    /** Only non-null during a reveal — the camera never moves while asking. */
    revealIso: revealing && current.iso ? current.iso : null,
    revealPoints:
      revealing && isPointAnswer
        ? tapped && verdict === 'incorrect'
          ? [current.point, tapped]
          : [current.point]
        : null,
    pinIso: revealing && verdict === 'incorrect' && current.iso ? current.iso : null,
    pinPoint: revealing && verdict === 'incorrect' && isPointAnswer ? current.point : null,
    markPoint: revealing && verdict === 'incorrect' ? tapped : null,
  }
}
