import type { Mode, QuizSnapshot } from '../game/useQuiz'
import type { WaterKind, WaterRegion } from '../ui/bits'
import type { PlaceKind } from '../data/places'

/**
 * What survives a refresh, beyond the screen you were on (that lives in the URL
 * — see `route.ts`). Two separate things, because they expire differently:
 * settings you chose once and want to keep, and a round you are part-way
 * through and want back exactly as it was.
 *
 * Every read is defended. `localStorage` throws outright in some private-browsing
 * modes, and anything already stored may come from an older build of the app, so
 * nothing here is trusted to be the shape it claims.
 */

const PREFS_KEY = 'map-practice:prefs'
const PROGRESS_KEY = 'map-practice:progress'

/** How many of a round's questions to ask: a random handful, or every one. */
export type QuestionCount = 10 | 30 | 50 | 100 | 'all'
export const QUESTION_COUNTS: QuestionCount[] = [10, 30, 50, 100, 'all']

/** The number a round of `total` actually asks: a count it cannot fill means all of it. */
export const roundSize = (count: QuestionCount, total: number) =>
  count === 'all' ? total : Math.min(count, total)

export interface Prefs {
  mode: Mode
  timed: boolean
  count: QuestionCount
  /**
   * Type and Why modes: a list of the round's names under the field, Enter to
   * submit. Off, the field accepts the answer the moment it is spelt right and
   * waits otherwise, as the reference does.
   */
  suggestions: boolean
  kinds: Record<WaterKind, boolean>
  region: WaterRegion
  /** Which of a places round's two sections to ask — capitals, other places, or both. */
  placeKinds: Record<PlaceKind, boolean>
}

export const DEFAULT_PREFS: Prefs = {
  mode: 'pin',
  timed: true,
  count: 'all',
  suggestions: false,
  kinds: { ocean: true, sea: true, strait: true, canal: true },
  region: 'all',
  placeKinds: { capital: true, other: true, region: true },
}

/** A round interrupted part-way, enough to put it back exactly as it was. */
export interface SavedRound extends QuizSnapshot {
  roundId: string
  mode: Mode
  timed: boolean
  savedAt: number
  /** Set when the round is a practice of an earlier round's misses: those ids. */
  drill?: string[]
}

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Full, or storage is denied. Losing the save is not worth an error.
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

const MODES: Mode[] = ['pin', 'type', 'significance']
const KINDS: WaterKind[] = ['ocean', 'sea', 'strait', 'canal']
const REGIONS: WaterRegion[] = ['all', 'america', 'europe', 'asia']
const PLACE_KIND_IDS: PlaceKind[] = ['capital', 'other', 'region']

export function loadPrefs(): Prefs {
  const raw = read(PREFS_KEY) as Partial<Prefs> | null
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS
  const kinds = { ...DEFAULT_PREFS.kinds }
  for (const k of KINDS) {
    if (typeof raw.kinds?.[k] === 'boolean') kinds[k] = raw.kinds[k]
  }
  // Never restore a state with nothing to ask — the picker forbids it live, and
  // a hand-edited store must not get around that.
  if (!KINDS.some((k) => kinds[k])) return DEFAULT_PREFS
  const placeKinds = { ...DEFAULT_PREFS.placeKinds }
  for (const k of PLACE_KIND_IDS) {
    if (typeof raw.placeKinds?.[k] === 'boolean') placeKinds[k] = raw.placeKinds[k]
  }
  if (!PLACE_KIND_IDS.some((k) => placeKinds[k])) return DEFAULT_PREFS
  return {
    mode: MODES.includes(raw.mode as Mode) ? (raw.mode as Mode) : DEFAULT_PREFS.mode,
    timed: typeof raw.timed === 'boolean' ? raw.timed : DEFAULT_PREFS.timed,
    suggestions:
      typeof raw.suggestions === 'boolean' ? raw.suggestions : DEFAULT_PREFS.suggestions,
    count: QUESTION_COUNTS.includes(raw.count as QuestionCount)
      ? (raw.count as QuestionCount)
      : DEFAULT_PREFS.count,
    kinds,
    region: REGIONS.includes(raw.region as WaterRegion)
      ? (raw.region as WaterRegion)
      : DEFAULT_PREFS.region,
    placeKinds,
  }
}

export const savePrefs = (prefs: Prefs) => write(PREFS_KEY, prefs)

export function loadRound(): SavedRound | null {
  const raw = read(PROGRESS_KEY) as SavedRound | null
  if (!raw || typeof raw !== 'object') return null
  const ok =
    typeof raw.roundId === 'string' &&
    Array.isArray(raw.ids) &&
    raw.ids.every((id) => typeof id === 'string') &&
    Array.isArray(raw.answers) &&
    typeof raw.index === 'number' &&
    raw.index >= 0 &&
    raw.index < raw.ids.length &&
    typeof raw.elapsed === 'number'
  if (!ok) return null
  // A drill that is not a list of ids is not a drill; the round still stands.
  if (raw.drill !== undefined && !(Array.isArray(raw.drill) && raw.drill.every((id) => typeof id === 'string'))) {
    return { ...raw, drill: undefined }
  }
  return raw
}

export const saveRound = (saved: SavedRound) => write(PROGRESS_KEY, saved)
export const clearRound = () => drop(PROGRESS_KEY)

/**
 * Whether a save can still be resumed. Its questions must all be ones the round
 * would ask now, and as many of them as it would ask: untick Straits, edit a
 * syllabus or pick another count, and yesterday's half-finished round is no
 * longer this round.
 */
export function fits(
  saved: SavedRound | null,
  roundId: string,
  askIds: string[],
  size: number
): boolean {
  if (!saved || saved.roundId !== roundId || saved.ids.length !== size) return false
  const wanted = new Set(askIds)
  return saved.ids.every((id) => wanted.has(id))
}
