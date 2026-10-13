/**
 * Climate regions — Phenomena's Climate map — from the Köppen-Geiger
 * classification of Beck et al. (2023), "High-resolution (1 km) Köppen-Geiger
 * maps for 1901–2099 based on constrained CMIP6 projections", Scientific Data
 * 10, 724 (CC BY 4.0): its present-day map, 1991–2020, at 0.1°.
 *
 * Köppen is the classification the textbooks' climate types are drawn from,
 * and each maps onto its classes directly (G. C. Leong's names):
 *   Mediterranean — Csa and Csb, the dry-summer subtropical climates
 *     (Csc, a cold-summer highland variant of a few cells, is left out);
 *   Desert — BWh, the hot deserts, and BWk, the mid-latitude (cold) ones,
 *     kept apart so the map can tell the Sahara from the Gobi;
 *   Sudan type — Aw, the tropical wet-and-dry savanna.
 *
 * Each class becomes a mask and the mask a polygon by marching squares
 * (d3-contour), so a region's edge is the class boundary itself, not a hand
 * tracing. Specks under MIN_CELLS — single valleys, a hill's rain shadow —
 * are dropped, as an atlas generalises them away.
 */
import { contours } from 'd3-contour'
import { fromFile } from 'geotiff'

export const CLIMATE_CLASSES = {
  mediterranean: [8, 9], // Csa, Csb — outside the tropics only, below
  'desert-hot': [4], // BWh
  'desert-cold': [5], // BWk
  sudan: [3], // Aw
}

/**
 * Köppen also classes a few tropical highlands Cs — pockets of the Ethiopian
 * and East African plateaus — but the Mediterranean climate is a subtropical
 * one of the continents' west margins, 30°–45° N and S. Inside the tropics a
 * dry-summer cell is a tropical highland, not the Mediterranean.
 */
const TROPIC = 23.44
const OUTSIDE_TROPICS_ONLY = new Set(['mediterranean'])

/** About 2,500km² at the equator: anything smaller is a speck, not a region. */
const MIN_CELLS = 20

/** Twice the planar signed area of a ring, in its own units: its winding. */
const signedArea = (ring) =>
  ring.reduce((s, [x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]
    return s + (x1 * y2 - x2 * y1)
  }, 0) / 2

export async function climateRegions(tifPath) {
  const image = await (await fromFile(tifPath)).getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const [west, north] = image.getOrigin()
  const [dx, dy] = image.getResolution()
  const [raster] = await image.readRasters()

  const features = []
  for (const [id, codes] of Object.entries(CLIMATE_CLASSES)) {
    const wanted = new Set(codes)
    const mask = new Float64Array(width * height)
    const extratropical = OUTSIDE_TROPICS_ONLY.has(id)
    for (let i = 0; i < raster.length; i++) {
      const lat = north + (Math.floor(i / width) + 0.5) * dy
      mask[i] = wanted.has(raster[i]) && (!extratropical || Math.abs(lat) >= TROPIC) ? 1 : 0
    }
    const [shape] = contours().size([width, height]).thresholds([0.5]).smooth(true)(mask)
    const toLonLat = ([x, y]) => [+(west + x * dx).toFixed(4), +(north + y * dy).toFixed(4)]
    const polygons = []
    for (const rings of shape.coordinates) {
      const [outer, ...holes] = rings
      if (Math.abs(signedArea(outer)) < MIN_CELLS) continue
      // Written the way a shapefile winds them — exterior clockwise, holes
      // anticlockwise, in lon/lat — which mapshaper and d3-geo both read as
      // the region and not the globe less the region.
      const wind = (ring, clockwise) => {
        const ll = ring.map(toLonLat)
        return (signedArea(ll) < 0) === clockwise ? ll : ll.reverse()
      }
      polygons.push([
        wind(outer, true),
        ...holes.filter((h) => Math.abs(signedArea(h)) >= MIN_CELLS).map((h) => wind(h, false)),
      ])
    }
    features.push({ type: 'Feature', properties: { id }, geometry: { type: 'MultiPolygon', coordinates: polygons } })
  }
  return { type: 'FeatureCollection', features }
}
