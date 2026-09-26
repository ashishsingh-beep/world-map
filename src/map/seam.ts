import type { Geometry, MultiLineString, Position } from 'geojson'

/**
 * Natural Earth cuts every shape that crosses the 180th meridian into pieces
 * that meet along it: Chukotka, Fiji, Antarctica, the Bering and Ross Seas and
 * the Pacific. While a map was cut there too the join hid under its edge, but a
 * view turned to put the Pacific in the middle — Oceania, and the world with
 * Samoa and Tonga beside Fiji — draws it as a line down open sea and land. The
 * fill needs those edges to close each piece; the outline must not trace them.
 */

const onMeridian = (a: Position, b: Position) =>
  Math.abs(a[0]) > 179.99 && Math.abs(b[0]) > 179.99 && Math.sign(a[0]) === Math.sign(b[0])

const cache = new WeakMap<object, MultiLineString | null>()

/** The outline without its edges along the 180th, or null when it has none. */
export function outlineWithoutSeam(g: Geometry | null | undefined): MultiLineString | null {
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
  if (cache.has(g)) return cache.get(g) ?? null
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  const lines: Position[][] = []
  let seam = false
  for (const ring of polys.flat()) {
    let run: Position[] = [ring[0]]
    for (let i = 1; i < ring.length; i++) {
      if (onMeridian(ring[i - 1], ring[i])) {
        seam = true
        if (run.length > 1) lines.push(run)
        run = [ring[i]]
      } else run.push(ring[i])
    }
    if (run.length > 1) lines.push(run)
  }
  const out: MultiLineString | null = seam ? { type: 'MultiLineString', coordinates: lines } : null
  cache.set(g, out)
  return out
}
