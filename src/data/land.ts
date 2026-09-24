import { feature } from 'topojson-client'
import type { Feature, Geometry } from 'geojson'
import topo from './land.topo.json'

/**
 * The real extent of every land region in the syllabus that is drawn as a
 * patch rather than a marker — so far, peninsulas — from Natural Earth's
 * physical regions layer, keyed by place id.
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

export const landById = new Map(collection.features.map((f) => [f.properties.id, f]))

/** The drawn extent of a place, or null when it is a point-and-radius marker. */
export function areaOf(id: string): LandFeature | null {
  return landById.get(id) ?? null
}
