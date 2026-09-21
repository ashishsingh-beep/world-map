import { useEffect, useMemo, useRef, useState } from 'react'
import { metaOf } from '../data/countries'
import { TYPE_LABEL, WATER_GLYPH } from '../data/places'
import { MapCanvas } from '../map/MapCanvas'
import {
  QUESTION_SECONDS,
  normaliseName,
  useQuiz,
  type Mode,
  type QuizSnapshot,
} from '../game/useQuiz'
import type { Round } from '../game/rounds'
import { flagEmoji, formatClock } from '../ui/bits'
import { ResultsScreen } from './ResultsScreen'

const formatMiss = (km: number) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`)

/**
 * Suggestions start only once enough has been typed to be a recall rather than
 * a browse: three letters into a 135-question round still leaves you needing to
 * know the name. They fix spelling, they are not meant to be multiple choice.
 */
const SUGGEST_AFTER = 3
const SUGGEST_LIMIT = 6

interface Props {
  round: Round
  mode: Mode
  timed: boolean
  /** A round interrupted by a refresh, to carry on from. */
  initial?: QuizSnapshot | null
  /** Called with the round's state after each question, and null once it ends. */
  onProgress?: (snapshot: QuizSnapshot | null) => void
  onExit: () => void
  onRetry: () => void
}

export function PlayScreen({ round, mode, timed, initial, onProgress, onExit, onRetry }: Props) {
  const quiz = useQuiz({ round, mode, timed, initial })
  const [draft, setDraft] = useState('')
  /** Which suggestion the arrow keys are on; -1 means Enter submits what was typed. */
  const [active, setActive] = useState(-1)
  /** Escape hides the list without clearing the field, until the next keystroke. */
  const [dismissed, setDismissed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft('')
    setActive(-1)
    setDismissed(false)
    if (mode !== 'pin' && quiz.phase === 'asking') inputRef.current?.focus()
  }, [quiz.index, quiz.phase, mode])

  const { vocabulary } = quiz
  const suggestions = useMemo(() => {
    const typed = normaliseName(draft)
    if (typed.length < SUGGEST_AFTER) return []
    const starts: string[] = []
    const contains: string[] = []
    for (const name of vocabulary) {
      const n = normaliseName(name)
      if (n.startsWith(typed)) starts.push(name)
      else if (n.includes(typed)) contains.push(name)
    }
    // An exact match needs no suggesting — the field already holds the answer.
    if (starts.length === 1 && !contains.length && normaliseName(starts[0]) === typed) return []
    return [...starts, ...contains].slice(0, SUGGEST_LIMIT)
  }, [draft, vocabulary])

  const showing = !dismissed && quiz.phase === 'asking' ? suggestions : []

  // Saved once per question, not on the clock: `elapsed` ticks ten times a
  // second and writing that often would be absurd. Read through a ref for the
  // same reason — it must not be what triggers the save.
  const { answers, index, queueIds, phase } = quiz
  const elapsedRef = useRef(quiz.elapsed)
  elapsedRef.current = quiz.elapsed
  const finished = phase === 'finished'
  useEffect(() => {
    if (!onProgress) return
    onProgress(finished ? null : { ids: queueIds, index, answers, elapsed: elapsedRef.current })
  }, [onProgress, finished, queueIds, index, answers])

  if (quiz.phase === 'finished') {
    return (
      <ResultsScreen
        round={round}
        correct={quiz.correctCount}
        total={quiz.total}
        elapsed={quiz.elapsed}
        spellingSlips={quiz.spellingSlips}
        onRetry={onRetry}
        onExit={onExit}
      />
    )
  }

  const q = quiz.current
  const isPlaceRound = !!round.places
  const isWaterRound = q?.place?.section === 'water'
  const country = q?.iso ? metaOf(q.iso) : null

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={round.render}
        askable={mode === 'pin' ? round.askable : []}
        view={round.view}
        states={quiz.states}
        revealIso={quiz.revealIso}
        pinIso={quiz.pinIso}
        onPick={quiz.pick}
        points={quiz.points}
        areas={quiz.areas}
        bands={quiz.bands}
        atlas={round.atlas}
        revealPoints={quiz.revealPoints}
        pinPoint={quiz.pinPoint}
        markPoint={quiz.markPoint}
        countryMarkers={!isWaterRound}
        onPickPoint={isPlaceRound && mode === 'pin' ? quiz.pickPoint : undefined}
        padding={{ top: 180, right: 32, bottom: 32, left: 32 }}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
        <div className="pointer-events-auto mx-auto flex max-w-5xl items-center gap-3 rounded-2xl bg-[#1f2d4d] p-2 shadow-lg">
          <div className="rounded-xl bg-white px-3 py-1 text-center">
            <div className="text-[10px] font-bold tracking-widest text-slate-500">TIME</div>
            <div className="text-lg font-extrabold tabular-nums text-slate-900">
              {formatClock(quiz.elapsed)}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex h-3 gap-px overflow-hidden rounded">
              {Array.from({ length: quiz.total }, (_, i) => {
                const a = quiz.answers[i]
                const bg = !a ? 'bg-white' : a.correct ? 'bg-green-400' : 'bg-rose-400'
                return <div key={i} className={`h-full flex-1 ${bg}`} />
              })}
            </div>
            {timed && (
              <div className="mt-1 h-2 overflow-hidden rounded bg-white/25">
                <div
                  className={`h-full transition-[width] duration-100 ease-linear ${
                    quiz.remaining > 5 ? 'bg-green-400' : 'bg-yellow-300'
                  }`}
                  style={{ width: `${(quiz.remaining / QUESTION_SECONDS) * 100}%` }}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => quiz.setPaused(!quiz.paused)}
            className="rounded-xl bg-white px-4 py-2 text-lg font-bold text-slate-900"
            aria-label={quiz.paused ? 'Resume' : 'Pause'}
          >
            {quiz.paused ? '▶' : '❚❚'}
          </button>
        </div>
      </div>

      {/* Prompt: flag + name in Pin mode, a text field otherwise. Significance
          mode adds the clue above the field and highlights nothing. */}
      <div className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center gap-3 px-4">
        {mode === 'significance' && (
          <div className="max-w-2xl rounded-2xl bg-white px-6 py-4 text-center shadow-xl">
            <div className="text-[10px] font-bold tracking-widest text-slate-400">
              WHICH PLACE IS THIS?
            </div>
            <div className="mt-1 text-lg leading-snug font-extrabold text-slate-900">
              {q?.place?.significance}
            </div>
          </div>
        )}
        {mode === 'pin' ? (
          <div className="flex items-center gap-3 rounded-full bg-white px-7 py-3 shadow-xl">
            {!isPlaceRound && country && (
              <span className="text-3xl leading-none">{flagEmoji(country.iso2)}</span>
            )}
            {q?.place && WATER_GLYPH[q.place.type] && (
              <span className="text-2xl leading-none">{WATER_GLYPH[q.place.type]}</span>
            )}
            <span className="text-2xl font-extrabold text-slate-900">{q?.name}</span>
            {q?.place && q.place.type !== 'country' && (
              <span className="text-sm font-bold tracking-wide text-slate-400 uppercase">
                {TYPE_LABEL[q.place.type]}
              </span>
            )}
          </div>
        ) : (
          <form
            className="pointer-events-auto flex w-full max-w-4xl gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              // Only what was typed. Picking a suggestion is Enter *on* it,
              // handled below, so a fully typed answer is never swapped out.
              quiz.submitName(draft)
            }}
          >
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setActive(-1)
                  setDismissed(false)
                }}
                onKeyDown={(e) => {
                  if (!showing.length) return
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActive((i) => (i + 1) % showing.length)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActive((i) => (i <= 0 ? showing.length : i) - 1)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setDismissed(true)
                    setActive(-1)
                  } else if (e.key === 'Enter' && active >= 0) {
                    e.preventDefault()
                    quiz.submitName(showing[active])
                  }
                }}
                placeholder={isPlaceRound ? 'Type place name' : 'Type country name'}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                role="combobox"
                aria-expanded={showing.length > 0}
                aria-controls="answer-suggestions"
                aria-autocomplete="list"
                className="w-full rounded-xl bg-white px-5 py-4 text-xl font-semibold text-slate-900 shadow-xl outline-none"
              />
              {showing.length > 0 && (
                <ul
                  id="answer-suggestions"
                  className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl bg-white shadow-xl"
                >
                  {showing.map((name, i) => (
                    <li key={name}>
                      <button
                        type="button"
                        // mousedown, not click: a click would blur the field
                        // first and the question would advance without focus.
                        onMouseDown={(e) => {
                          e.preventDefault()
                          quiz.submitName(name)
                        }}
                        className={`block w-full cursor-pointer px-5 py-3 text-left text-lg font-semibold ${
                          i === active ? 'bg-blue-600 text-white' : 'text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={quiz.skip}
              aria-label="Skip"
              className="rounded-xl bg-white px-5 text-xl font-bold text-slate-900 shadow-xl"
            >
              ⏭
            </button>
          </form>
        )}
      </div>

      {/* Verdict toast. A typed answer that was right but misspelled still
          counts, and shows the spelling it should have had. */}
      {quiz.verdict && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4">
          <div
            className={`rounded-xl px-6 py-3 text-center text-xl font-extrabold shadow-xl ${
              quiz.verdict !== 'correct'
                ? 'bg-rose-500 text-white'
                : quiz.corrected
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-green-500 text-white'
            }`}
          >
            {quiz.verdict !== 'correct' ? (
              `✕ ${q?.name}${quiz.missKm != null ? ` — ${formatMiss(quiz.missKm)} off` : ''}`
            ) : quiz.corrected ? (
              <>
                ✓ CORRECT
                <span className="ml-2 font-bold">— it’s spelt “{quiz.corrected}”</span>
              </>
            ) : (
              '✓ CORRECT!'
            )}
          </div>
        </div>
      )}

      {quiz.paused && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-slate-900/70">
          <p className="text-4xl font-extrabold text-white">Paused</p>
          <div className="w-64 space-y-3">
            <button
              type="button"
              onClick={() => quiz.setPaused(false)}
              className="w-full rounded-full bg-yellow-300 px-6 py-3 text-lg font-extrabold text-slate-900"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={onExit}
              className="w-full rounded-full bg-white/90 px-6 py-3 text-lg font-extrabold text-slate-700"
            >
              Quit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
