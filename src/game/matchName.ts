/**
 * Judging a typed answer.
 *
 * Someone who knows the place but cannot spell it should be marked right and
 * shown the spelling. The risk is that leniency quietly turns one place into
 * another, and this set is full of near-twins: San José and San Juan, Santos
 * and Santiago, Guyana and French Guyana, Paraguay and Uruguay.
 *
 * So an answer has to clear two bars, not one:
 *
 *   1. be close enough to the target, on a budget that scales with its length
 *   2. be strictly closer to the target than to every rival name
 *
 * The rivals are the other places in the round plus every country name, which
 * is what stops "Uruguay" being accepted as a two-letter slip of "Paraguay",
 * or "Brazil" as one of "Brasília". It is the same rule Pin mode uses for
 * taps: near the answer is not enough, it has to be nearer than the
 * alternatives.
 */

export interface Candidate {
  id: string
  name: string
  aliases: string[]
}

export interface NameVerdict {
  correct: boolean
  /** The canonical spelling, set only when the answer was accepted despite typos. */
  corrected: string | null
}

/** Case-, accent- and punctuation-insensitive. No autocomplete anywhere. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

/**
 * Folds the substitutions people actually make, so "Havanna" keys the same as
 * "Havana" and "Chukikamata" the same as "Chuquicamata". Applied to both sides
 * of every comparison, so it can only ever bring spellings together.
 */
function loosen(s: string): string {
  return s
    .replace(/ph/g, 'f')
    .replace(/[kq]/g, 'c')
    .replace(/z/g, 's')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1')
}

/**
 * Optimal string alignment distance: insertions, deletions, substitutions and
 * swaps of neighbouring letters — the four things a typing hand does wrong.
 */
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m

  let twoAgo: number[] = []
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const row = new Array<number>(n + 1)
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], twoAgo[j - 2] + 1)
      }
    }
    twoAgo = prev
    prev = row
  }
  return prev[n]
}

/** How many typos a name of this length can carry and still be recognisable. */
function allowance(len: number): number {
  if (len <= 3) return 1
  if (len <= 5) return 2
  if (len <= 8) return 3
  if (len <= 12) return 4
  return 5
}

const formsOf = (c: Candidate) =>
  [c.name, ...c.aliases].map(normaliseName).filter(Boolean)

/** Distance from what was typed to the closest spelling of one candidate. */
function distanceTo(typed: string, loose: string, forms: string[]): number {
  let best = Infinity
  for (const form of forms) {
    if (form === typed) return 0
    best = Math.min(best, editDistance(typed, form), editDistance(loose, loosen(form)))
  }
  return best
}

export function judgeName(input: string, target: Candidate, rivals: Candidate[]): NameVerdict {
  const typed = normaliseName(input)
  if (!typed) return { correct: false, corrected: null }

  const targetForms = formsOf(target)
  if (targetForms.includes(typed)) return { correct: true, corrected: null }

  const loose = loosen(typed)
  const distance = distanceTo(typed, loose, targetForms)
  if (distance > allowance(targetForms[0]?.length ?? 0)) {
    return { correct: false, corrected: null }
  }

  // A rival that goes by one of the target's own names is not a rival — it is
  // the same answer wearing another id, and letting it compete would make a
  // country-level fact unanswerable by its own name.
  const shared = new Set(targetForms)
  for (const rival of rivals) {
    if (rival.id === target.id) continue
    const forms = formsOf(rival)
    if (forms.some((f) => shared.has(f))) continue
    if (distanceTo(typed, loose, forms) <= distance) {
      return { correct: false, corrected: null }
    }
  }

  return { correct: true, corrected: target.name }
}
