import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { metaOf } from '../data/countries'
import type { CountryState } from '../map/MapCanvas'
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

export interface QuizOptions {
  round: Round
  mode: Mode
  timed: boolean
}

export interface Answer {
  iso: string
  correct: boolean
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
 * Round state machine. Every round asks the full country set — there is no
 * question-count selector by design.
 */
export function useQuiz({ round, mode, timed }: QuizOptions) {
  const [queue] = useState(() => shuffle(round.askable))
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('asking')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [wrongPick, setWrongPick] = useState<string | null>(null)
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
    (correct: boolean, picked?: string) => {
      if (!current) return
      setVerdict(correct ? 'correct' : 'incorrect')
      setWrongPick(correct ? null : (picked ?? null))
      setAnswers((a) => [...a, { iso: current, correct }])
      setPhase('revealing')
      advanceRef.current = window.setTimeout(() => {
        setVerdict(null)
        setWrongPick(null)
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
      settle(iso === current, iso)
    },
    [phase, current, settle]
  )

  const submitName = useCallback(
    (text: string) => {
      if (phase !== 'asking' || !current) return
      const m = metaOf(current)
      const accepted = [m.name, ...(m.aliases ?? [])].map(normaliseName)
      settle(accepted.includes(normaliseName(text)))
    },
    [phase, current, settle]
  )

  const skip = useCallback(() => {
    if (phase !== 'asking') return
    settle(false)
  }, [phase, settle])

  /** Per-country paint state, carried for the rest of the round. */
  const states = useMemo(() => {
    const out: Record<string, CountryState> = {}
    for (const a of answers) out[a.iso] = a.correct ? 'correct' : 'missed'
    if (wrongPick) out[wrongPick] = 'wrong'
    if (phase === 'revealing' && current) {
      out[current] = verdict === 'correct' ? 'correct' : 'missed'
    }
    // In Type mode the country being asked is highlighted, since the player
    // has to name what they are shown.
    if (mode === 'type' && phase === 'asking' && current) out[current] = 'target'
    return out
  }, [answers, wrongPick, phase, current, verdict, mode])

  const correctCount = answers.filter((a) => a.correct).length

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
    submitName,
    skip,
    states,
    /** Only non-null during a reveal — the camera never moves while asking. */
    revealIso: phase === 'revealing' ? current : null,
    pinIso: phase === 'revealing' && verdict === 'incorrect' ? current : null,
  }
}
