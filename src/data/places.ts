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
  | 'zone'

export interface Place {
  id: string
  name: string
  aliases: string[]
  type: PlaceType
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
}

export interface PlaceGroup {
  id: string
  name: string
  /** Country ISO3s and/or place ids. */
  members: string[]
  mnemonic: string | null
}

const doc = placesJson as unknown as { places: Place[]; groups: PlaceGroup[] }

export const places: Place[] = doc.places
export const placeGroups: PlaceGroup[] = doc.groups

export const placeById = new Map(places.map((p) => [p.id, p]))

export function placeOf(id: string): Place {
  const p = placeById.get(id)
  if (!p) throw new Error(`Unknown place: ${id}`)
  return p
}

/** Places to practise for a country: its own facts plus everything inside it. */
export function placesOfCountry(iso: string): Place[] {
  return places.filter((p) => p.country === iso || p.sovereign === iso)
}

/** Countries that have any syllabus places, in the order they appear. */
export function countriesWithPlaces(continent: string): string[] {
  const out: string[] = []
  for (const p of places) {
    if (p.continent !== continent) continue
    const iso = p.country ?? p.sovereign
    if (iso && !out.includes(iso)) out.push(iso)
  }
  return out
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
  zone: 'region',
}
