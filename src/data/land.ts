import { feature } from 'topojson-client'
import type { Feature, Geometry } from 'geojson'
import topo from './land.topo.json'
import regionsJson from './regions.json'

/**
 * The real extent of every land region in the syllabus that is drawn as a
 * patch rather than a marker, keyed by place id: peninsulas, from Natural
 * Earth's physical regions layer, and the UK's constituent countries, from its
 * map units.
 *
 * A peninsula is a patch, not a pin: Baja California is 1,200km long, and a
 * point-and-radius marker for it is the same mistake a sea's marker used to
 * be (see `marine.ts`). Some of these polygons are clipped at build time to
 * the place's own `country` — Natural Earth draws the Malay Peninsula as the
 * landform, which runs into Thailand, while "West Malaysia" means only
 * Malaysia's share of it.
 */
export type LandFeature = Feature<Geometry, { id: string }>

const collection = feature(
  topo as never,
  (topo as never as { objects: Record<string, unknown> }).objects.land as never
) as unknown as { features: LandFeature[] }

/**
 * The regions a continent divides into (Melanesia, Polynesia…), drawn rather
 * than taken from a dataset and kept out of the topology for it: a ring that
 * runs east past 180 would not survive mapshaper's planar cleaning. They are
 * solid-ground patches to everything that draws or judges them.
 */
const regions = regionsJson as unknown as { features: LandFeature[] }

export const landById = new Map(
  [...collection.features, ...regions.features].map((f) => [f.properties.id, f])
)

/** The drawn extent of a place, or null when it is a point-and-radius marker. */
export function areaOf(id: string): LandFeature | null {
  return landById.get(id) ?? null
}
