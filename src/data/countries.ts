import { feature } from 'topojson-client'
import type { Feature, Geometry } from 'geojson'
import topo from './countries.topo.json'
import metaJson from './countries.meta.json'

export type Continent =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'Oceania'
  | 'South America'

export interface CountryMeta {
  iso: string
  /** ISO 3166-1 alpha-2, used to build the flag emoji. */
  iso2: string
  name: string
  /** Alternative spellings accepted in Type mode. */
  aliases: string[]
  continent: Continent
  /** [lon, lat] */
  centroid: [number, number]
  /** [[west, south], [east, north]] */
  bounds: [[number, number], [number, number]]
  /** spherical area in steradians */
  area: number
}

export type CountryFeature = Feature<Geometry, { iso: string }>

export const meta = metaJson as unknown as Record<string, CountryMeta>

const collection = feature(
  topo as never,
  (topo as never as { objects: Record<string, unknown> }).objects.countries as never
) as unknown as { features: CountryFeature[] }

export const features: CountryFeature[] = collection.features

export const featureByIso = new Map(features.map((f) => [f.properties.iso, f]))

/**
 * The quiz set: exactly the 196, taken from the metadata rather than the
 * geometry. The map carries more shapes than that — Greenland is drawn for
 * context — and anything without a meta entry must never become a question.
 */
export const allIsos = Object.keys(meta)

/** Geography drawn purely as context, never asked about. */
export const renderOnlyIsos = features
  .map((f) => f.properties.iso)
  .filter((iso) => !meta[iso])

/** Everything the map draws: the quizzable set plus its context. */
export const renderIsos = [...allIsos, ...renderOnlyIsos]

export function metaOf(iso: string): CountryMeta {
  const m = meta[iso]
  if (!m) throw new Error(`Unknown country: ${iso}`)
  return m
}
