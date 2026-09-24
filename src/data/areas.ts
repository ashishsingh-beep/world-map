import { areaOf as waterAreaOf, type MarineFeature } from './marine'
import { areaOf as landAreaOf, type LandFeature } from './land'

/**
 * Whether a place is drawn and judged as a patch rather than a point, whatever
 * kind of patch it is. A sea and a peninsula never share an id, so checking
 * water first and land second is safe and never masks one with the other.
 *
 * `MapCanvas` does not use this: it draws a sea's patch under the land and a
 * peninsula's patch over it, so it needs to know which is which and imports
 * `marine.ts` and `land.ts` directly. Everywhere else — judging a tap,
 * deciding whether a place gets a marker, framing the reveal — the two kinds
 * are interchangeable, and this is the one thing to import.
 */
export function areaOf(id: string): MarineFeature | LandFeature | null {
  return waterAreaOf(id) ?? landAreaOf(id)
}
