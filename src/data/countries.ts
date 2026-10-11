import { feature, mesh } from 'topojson-client'
import type { Feature, Geometry, MultiLineString, Position } from 'geojson'
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

/**
 * Every coast and no border: the arcs of the country topology that belong to
 * one country alone. A physical map draws the land with this as its only
 * line, so the countries read as one landmass until their borders are asked
 * for. Natural Earth's cut along the 180th — Chukotka, Fiji, Antarctica — is
 * an arc of one country too, so those stretches are dropped, or a line would
 * run down the Pacific.
 */
let coast: MultiLineString | null = null
export function coastline(): MultiLineString {
  if (coast) return coast
  const objects = (topo as never as { objects: Record<string, unknown> }).objects
  const all = mesh(topo as never, objects.countries as never, (a: unknown, b: unknown) => a === b)
  const onMeridian = (a: Position, b: Position) =>
    Math.abs(a[0]) > 179.99 && Math.abs(b[0]) > 179.99 && Math.sign(a[0]) === Math.sign(b[0])
  const lines: Position[][] = []
  for (const line of all.coordinates) {
    let run: Position[] = [line[0]]
    for (let i = 1; i < line.length; i++) {
      if (onMeridian(line[i - 1], line[i])) {
        if (run.length > 1) lines.push(run)
        run = [line[i]]
      } else run.push(line[i])
    }
    if (run.length > 1) lines.push(run)
  }
  coast = { type: 'MultiLineString', coordinates: lines }
  return coast
}
