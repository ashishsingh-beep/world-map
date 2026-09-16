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
  | 'sea'
  | 'strait'

export interface Place {
  id: string
  name: string
  aliases: string[]
  type: PlaceType
  /** Which menu section this belongs to. */
  section: 'places' | 'water'
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
  /** What a strait joins, e.g. "Red Sea ↔ Gulf of Aden". */
  connects?: string
  /** Ocean basin or region it is filed under. */
  basin?: string
  /** Hit radius in km. A sea is answered by pointing anywhere in it. */
  spanKm?: number
}

export interface PlaceGroup {
  id: string
  name: string
  /** Country ISO3s and/or place ids. */
  members: string[]
  mnemonic: string | null
}

/** A continent with an authored syllabus. `count` is 0 for a placeholder. */
export interface SyllabusContinent {
  name: string
  title: string
  section: 'places' | 'water'
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
  sea: 'sea',
  strait: 'strait',
}

/** The two notations the Seas & Straits section is built around. */
export const WATER_GLYPH: Partial<Record<PlaceType, string>> = {
  sea: '🌊',
  strait: '↔️',
  canal: '⇅',
}
