import { feature } from 'topojson-client'
import type { Feature, Geometry } from 'geojson'
import topo from './marine.topo.json'

/**
 * The real extent of every ocean and sea in the syllabus, from Natural Earth's
 * marine layer, keyed by place id.
 *
 * A sea is a patch, not a pin. Drawing one as a dot and judging a tap by its
 * distance from that dot marked a tap off Somalia as outside the Arabian Sea —
 * the sea is 1,200km across and the radius was 850. These polygons are what the
 * map paints and what the quiz judges against.
 *
 * Straits and canals are deliberately absent: a chokepoint genuinely is a
 * point, and Natural Earth has no polygon for most of them anyway. Two seas are
 * missing too — the Celtic Sea and the Gulf of Panama are not in the layer — so
 * anything here is a lookup that may legitimately come back empty.
 */
export type MarineFeature = Feature<Geometry, { id: string }>

const collection = feature(
  topo as never,
  (topo as never as { objects: Record<string, unknown> }).objects.marine as never
) as unknown as { features: MarineFeature[] }

export const marineById = new Map(collection.features.map((f) => [f.properties.id, f]))

/** The drawn extent of a place, or null when it is one of the point kinds. */
export function areaOf(id: string): MarineFeature | null {
  return marineById.get(id) ?? null
}
