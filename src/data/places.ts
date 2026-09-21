import placesJson from './places.json'

export type PlaceType =
  | 'country'
  | 'territory'
  | 'capital'
  | 'city'
  | 'port'
  | 'island'
  | 'island-group'
  | 'mine'
  | 'canal'
  | 'zone'
  | 'peninsula'
  | 'peak'
  | 'range'
  | 'ocean'
  | 'sea'
  | 'strait'

export interface Place {
  id: string
  name: string
  aliases: string[]
  type: PlaceType
  /** Which menu section this belongs to. */
  section: 'places' | 'water' | 'mountains'
  /** ISO3 of the country it belongs to, or null for territories and shared features. */
  country: string | null
  /** ISO3 of the governing state, when that differs from `country`. */
  sovereign?: string
  /** [lon, lat] — always resolved by the build, including for country facts. */
  point: [number, number]
  /** True when the point sits outside its country's drawn polygon. */
  offshore?: boolean
  /** The clue used by Significance mode, and the headline shown on reveal. */
  significance: string
  notes: string[]
  tier: number
  continent: string
  /** Countries and territories along it — water features touch several. */
  borders?: string[]
  /**
   * How to name one of those countries on this feature's card, where the bare
   * name loses the point: the Kerch Strait's Ukrainian side is Crimea, and
   * "Ukraine" alone does not say so.
   */
  borderAs?: Record<string, string>
  /** What a strait joins, e.g. "Red Sea ↔ Gulf of Aden". */
  connects?: string
  /** Ocean basin or region it is filed under. */
  basin?: string
  /**
   * Practice regions this water feature belongs to, derived by the build from
   * the countries along it. Several when it is a boundary sea.
   */
  regions?: string[]
  /** Which map this belongs to: the world atlas or the Indian one. */
  atlas: 'world' | 'india'
  /**
   * A range's ridgeline, west to east. Hand-traced: no published dataset
   * carries the Zaskar, the Pir Panjal or the Mahabharat. The `point` the
   * build derives from it is the label's anchor and nothing else.
   */
  line?: [number, number][]
  /** Metres, for a peak. */
  elevationM?: number
  /** Which Himalayan belt a peak or range sits in. */
  belt?: 'trans' | 'greater' | 'lesser' | 'outer'
  /** Hit radius in km. A sea is answered by pointing anywhere in it. */
  spanKm?: number
}

export interface PlaceGroup {
  id: string
  name: string
  /** Country ISO3s and/or place ids. */
  members: string[]
  mnemonic: string | null
  /** The syllabus the trick was authored in. */
  continent: string
  section: 'places' | 'water'
  /**
   * Key into `TRICK_DIAGRAMS` in `src/ui/TrickDiagram.tsx`. Set when the trick
   * is spatial and a drawing says it better than a sentence; the mnemonic then
   * reads as the diagram's caption. The build checks the key is a known one.
   */
  visual?: string
}

/** A continent with an authored syllabus. `count` is 0 for a placeholder. */
export interface SyllabusContinent {
  name: string
  title: string
  section: 'places' | 'water' | 'mountains'
  atlas: 'world' | 'india'
  count: number
}

const doc = placesJson as unknown as {
  continents: SyllabusContinent[]
  places: Place[]
  groups: PlaceGroup[]
}

export const syllabusContinents: SyllabusContinent[] = doc.continents
export const places: Place[] = doc.places
export const placeGroups: PlaceGroup[] = doc.groups

export const placeById = new Map(places.map((p) => [p.id, p]))

export function placeOf(id: string): Place {
  const p = placeById.get(id)
  if (!p) throw new Error(`Unknown place: ${id}`)
  return p
}

/** A short human label for the place type, used in prompts. */
export const TYPE_LABEL: Record<PlaceType, string> = {
  country: 'country',
  territory: 'territory',
  capital: 'capital',
  city: 'city',
  port: 'port',
  island: 'island',
  'island-group': 'islands',
  mine: 'mine',
  canal: 'canal',
  zone: 'region',
  peninsula: 'peninsula',
  peak: 'peak',
  range: 'range',
  ocean: 'ocean',
  sea: 'sea',
  strait: 'strait',
}

/** The two notations the Seas & Straits section is built around. */
export const WATER_GLYPH: Partial<Record<PlaceType, string>> = {
  ocean: '🌏',
  sea: '🌊',
  strait: '↔️',
  canal: '⇅',
}

/**
 * The tricks that apply to a set of places — a group counts if it names one of
 * them, or the country one of them sits in (the mnemonic for Canada's big three
 * belongs on Montreal's card as much as on Canada's).
 */
export function groupsFor(subject: Place[], isos: string[] = []): PlaceGroup[] {
  const ids = new Set<string>(isos)
  for (const p of subject) {
    ids.add(p.id)
    if (p.country) ids.add(p.country)
    if (p.sovereign) ids.add(p.sovereign)
  }
  return placeGroups.filter((g) => g.members.some((m) => ids.has(m)))
}

const EARTH_RADIUS_KM = 6371

/**
 * How far a lon/lat is from a ridgeline, in kilometres — the range equivalent
 * of "inside this sea". Measured to the nearest segment rather than to the
 * nearest vertex, or a tap halfway along a long straight stretch would read as
 * far off.
 */
export function distanceToLineKm(line: [number, number][], at: [number, number]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]
    const [bx, by] = line[i + 1]
    // Flat-earth within a segment: these are tens of kilometres apart, and the
    // cosine keeps longitude honest at Himalayan latitudes.
    const k = Math.cos((((ay + by) / 2) * Math.PI) / 180)
    const vx = (bx - ax) * k
    const vy = by - ay
    const wx = (at[0] - ax) * k
    const wy = at[1] - ay
    const len2 = vx * vx + vy * vy
    const t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0
    const dx = wx - t * vx
    const dy = wy - t * vy
    const deg = Math.sqrt(dx * dx + dy * dy)
    best = Math.min(best, (deg * Math.PI * EARTH_RADIUS_KM) / 180)
  }
  return best
}
