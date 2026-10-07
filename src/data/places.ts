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
  /** A headland — the Cape of Good Hope. A point, not an area. */
  | 'cape'
  /** A stretch of shoreline — the Gold Coast. Drawn as a band, like a range. */
  | 'coast'
  /** A state or territory within a country — Queensland. An area, from admin-1. */
  | 'state'
  /** A lake too small to draw as an area at continental scale — Lake Taupo. */
  | 'lake'
  /** A reef — the Great Barrier Reef. An area, from the marine layer. */
  | 'reef'
  /**
   * One of the great divisions of a continent — Melanesia, Micronesia,
   * Polynesia. Its own section of a places round, apart from capitals and
   * other places, and drawn as a tinted area.
   */
  | 'region'
  /** A country inside a sovereign state — England, Scotland, Wales, Northern Ireland. */
  | 'constituent'
  | 'peak'
  | 'range'
  | 'ocean'
  | 'sea'
  | 'strait'
  /** An ocean current — Phenomena. An arrow along its course, red warm, blue cold. */
  | 'current'

export interface Place {
  id: string
  name: string
  aliases: string[]
  type: PlaceType
  /** Which menu section this belongs to. */
  section: 'places' | 'water' | 'mountains' | 'phenomena'
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
  /** A current's temperature: what Name mode asks alongside its name. */
  temp?: 'warm' | 'cold'
  /** The ocean a current flows in — which of the three North Equatorial Currents. */
  ocean?: 'Atlantic' | 'Pacific' | 'Indian' | 'Southern'
  /** Metres, for a peak. */
  elevationM?: number
  /** Which Himalayan belt a peak or range sits in. */
  belt?: 'trans' | 'greater' | 'lesser' | 'outer'
  /** Hit radius in km. A sea is answered by pointing anywhere in it. */
  spanKm?: number
  /** A region's own colour, as the notes draw it. */
  tint?: string
  /**
   * A tinted patch that lies on land — the Lithium Triangle — and so is drawn
   * over the countries, like a peninsula, not under them like a sea region.
   */
  onLand?: boolean
  /**
   * A capital of a state or constituent country — Perth, Edinburgh — rather
   * than of the country itself. Still under Capitals; never in the country's
   * own Why-mode clue.
   */
  subnational?: boolean
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
  section: 'places' | 'water' | 'mountains' | 'phenomena'
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

/**
 * Three oceans each have a North Equatorial, a South Equatorial and an
 * Equatorial Counter Current. The name is still the answer — typed, it is all
 * that is asked — but wherever one is *shown*, a prompt or a label, the ocean
 * goes with it, or "Find: North Equatorial Current" would have three right
 * answers.
 */
const sharedCurrentNames = new Set(
  places
    .filter((p) => p.type === 'current')
    .map((p) => p.name)
    .filter((name, i, all) => all.indexOf(name) !== i)
)
export const displayName = (p: Place): string =>
  p.type === 'current' && sharedCurrentNames.has(p.name) ? `${p.name} (${p.ocean})` : p.name

/**
 * A country's national capitals, from the places syllabi: one for most, more
 * where a country has several (South Africa's three, Bolivia's two), none for a
 * country no syllabus has reached yet.
 */
const capitalsByIso = new Map<string, string[]>()
for (const p of places) {
  if (p.type !== 'capital' || p.subnational || !p.country) continue
  capitalsByIso.set(p.country, [...(capitalsByIso.get(p.country) ?? []), p.name])
}

/** A country's national capitals, by name, for its Learn card. */
export const capitalsOf = (iso: string): string[] => capitalsByIso.get(iso) ?? []

/**
 * A country's Why-mode clue: "Country with capital Nairobi". Null when no
 * syllabus names its capital yet, and Why mode leaves that country out.
 */
export function countryClue(iso: string): string | null {
  const caps = capitalsByIso.get(iso)
  if (!caps?.length) return null
  if (caps.length === 1) return `Country with capital ${caps[0]}`
  return `Country with capitals ${caps.slice(0, -1).join(', ')} and ${caps[caps.length - 1]}`
}

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
  cape: 'cape',
  coast: 'coast',
  state: 'state',
  lake: 'lake',
  reef: 'reef',
  region: 'region',
  constituent: 'constituent country',
  peak: 'peak',
  range: 'range',
  ocean: 'ocean',
  sea: 'sea',
  strait: 'strait',
  current: 'ocean current',
}

/**
 * The sections a Political Map round is split into: the countries themselves
 * (never a place — `placeKindOf` does not return it); the capitals; the great regions a
 * continent divides into (Melanesia, Micronesia, Polynesia), where it has any;
 * and everything else it asks about — cities, ports, islands, island groups,
 * peninsulas, capes, coasts, states, zones, territories alike. Not a bucket
 * for each of those: "other" is deliberately everything that is neither a
 * capital nor a region, so the choice stays the one the setup screen and Learn
 * legend actually offer.
 */
export type PlaceKind = 'country' | 'capital' | 'other' | 'region'
export const placeKindOf = (type: PlaceType): PlaceKind =>
  type === 'capital' ? 'capital' : type === 'region' ? 'region' : 'other'

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
