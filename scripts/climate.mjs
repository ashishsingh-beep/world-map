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
 *   Sudan type — Aw, the tropical wet-and-dry savanna;
 *   Equatorial — Af, the tropical rainforest: hot and wet every month, at
 *     least 60mm of rain in the driest.
 *
 * The Tropical Monsoon climate is not Köppen's: it is drawn from the reference
 * map it was asked for (REFERENCE, below), and wherever it and the
 * Mediterranean or Sudan-type patches meet, the reference wins. The deserts
 * are BWh and BWk wherever Köppen puts them, and the reference gives way.
 *
 * Each class becomes a mask and the mask a polygon by marching squares
 * (d3-contour), so a region's edge is the class boundary itself, not a hand
 * tracing. Specks under MIN_CELLS — single valleys, a hill's rain shadow —
 * are dropped, as an atlas generalises them away.
 */
import { contours } from 'd3-contour'
import { readFileSync } from 'node:fs'
import { fromFile } from 'geotiff'

export const CLIMATE_CLASSES = {
  mediterranean: [8, 9], // Csa, Csb — outside the tropics only, below
  'desert-hot': [4], // BWh
  'desert-cold': [5], // BWk
  sudan: [3], // Aw
  equatorial: [1], // Af
}

/**
 * Köppen also classes a few tropical highlands Cs — pockets of the Ethiopian
 * and East African plateaus — but the Mediterranean climate is a subtropical
 * one of the continents' west margins, 30°–45° N and S. Inside the tropics a
 * dry-summer cell is a tropical highland, not the Mediterranean.
 */
const TROPIC = 23.44
const OUTSIDE_TROPICS_ONLY = new Set(['mediterranean'])

/**
 * Köppen's Aw — tropical wet and dry — covers peninsular India, Myanmar,
 * Thailand and Indochina as well as the Sudan, the Llanos and the Campos. The
 * textbook does not: Leong keeps those Asian lands as the Tropical Monsoon
 * climate, with its own reversal of the winds, and the Sudan (savanna) type
 * for Africa, South America and northern Australia. So the Sudan type is not
 * taken in monsoon Asia: north of the Equator, between MONSOON_ASIA's two
 * meridians — east of Africa's savanna, which stops short of 52°E at the
 * Horn, and taking in the Philippines. Northern Australia's and Timor's, south
 * of the Equator, stay.
 */
const MONSOON_ASIA = [60, 150]
const NOT_IN_MONSOON_ASIA = new Set(['sudan'])

/**
 * Climates drawn from a reference map rather than from Köppen, each a lon/lat
 * outline in scripts/climate-reference/. The reference is the authority for
 * the climates it was asked for, so each overwrites the Köppen-drawn classes
 * in OVERWRITTEN where they meet. The classes in KEEP are not overwritten —
 * the equatorial (Af), and the hot and cold deserts, which are drawn as
 * Köppen's BWh and BWk exactly, as asked — and keep their ground: a reference
 * climate is cut out of them.
 */
const REFERENCE = { monsoon: 'monsoon.geojson' }
const OVERWRITTEN = new Set(['mediterranean', 'sudan'])
const KEEP = ['equatorial', 'desert-hot', 'desert-cold']

/**
 * Fills a lon/lat (Multi)Polygon onto the raster's grid, even-odd by scanline:
 * a cell is in when its centre is.
 */
function rasterize(geometry, width, height, west, north, dx, dy) {
  const mask = new Uint8Array(width * height)
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const edges = []
  for (const rings of polys) for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      if (a[1] !== b[1]) edges.push([a, b])
    }
  for (let r = 0; r < height; r++) {
    const lat = north + (r + 0.5) * dy
    const xs = []
    for (const [[x1, y1], [x2, y2]] of edges)
      if ((y1 <= lat) !== (y2 <= lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1))
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - west) / dx - 0.5))
      const c1 = Math.min(width - 1, Math.floor((xs[k + 1] - west) / dx - 0.5))
      for (let c = c0; c <= c1; c++) mask[r * width + c] = 1
    }
  }
  return mask
}

/** About 2,500km² at the equator: anything smaller is a speck, not a region. */
const MIN_CELLS = 20

/** A mask less its 4-connected specks under MIN_CELLS, as the contours drop them. */
function drawnCells(mask, width) {
  const seen = new Uint8Array(mask.length)
  const stack = new Int32Array(mask.length)
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue
    let n = 0, top = 0
    const members = []
    stack[top++] = start
    seen[start] = 1
    while (top) {
      const i = stack[--top]
      members.push(i)
      n++
      const x = i % width
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width])
        if (j >= 0 && j < mask.length && mask[j] && !seen[j]) { seen[j] = 1; stack[top++] = j }
    }
    if (n < MIN_CELLS) for (const i of members) mask[i] = 0
  }
  return mask
}

/** Twice the planar signed area of a ring, in its own units: its winding. */
const signedArea = (ring) =>
  ring.reduce((s, [x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]
    return s + (x1 * y2 - x2 * y1)
  }, 0) / 2

/** A mask as MultiPolygon coordinates by marching squares, its specks under MIN_CELLS dropped. */
function maskPolygons(mask, width, height, west, north, dx, dy) {
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
  return polygons
}

/** Köppen's class codes in the raster, 1 to 30, by name. */
const KOPPEN = ['Af', 'Am', 'Aw', 'BWh', 'BWk', 'BSh', 'BSk', 'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc', 'Cfa', 'Cfb', 'Cfc',
  'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb', 'Dfc', 'Dfd', 'ET', 'EF']

/**
 * The part of a lon/lat (Multi)Polygon that Köppen puts in the named classes,
 * as MultiPolygon coordinates: a place whose extent is a climate within a
 * frame — the Patagonian Desert is the dry steppe (BWk, BSk) of Argentina's
 * Patagonian provinces, not the Andes' forests and ice beside it.
 */
export async function koppenWithin(tifPath, classes, geometry) {
  const unknown = classes.filter((c) => !KOPPEN.includes(c))
  if (unknown.length) throw new Error(`Köppen classes not known: ${unknown.join(', ')}`)
  const image = await (await fromFile(tifPath)).getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const [west, north] = image.getOrigin()
  const [dx, dy] = image.getResolution()
  const [raster] = await image.readRasters()
  const codes = new Set(classes.map((c) => KOPPEN.indexOf(c) + 1))
  const mask = rasterize(geometry, width, height, west, north, dx, dy)
  for (let i = 0; i < mask.length; i++) if (mask[i] && !codes.has(raster[i])) mask[i] = 0
  return maskPolygons(drawnCells(mask, width), width, height, west, north, dx, dy)
}

export async function climateRegions(tifPath) {
  const image = await (await fromFile(tifPath)).getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const [west, north] = image.getOrigin()
  const [dx, dy] = image.getResolution()
  const [raster] = await image.readRasters()

  // The ground a KEEP class holds is what it draws, so its specks are not held
  // back: dropped from its own patch, they would leave holes in the reference's.
  const kept = new Uint8Array(width * height)
  for (const id of KEEP) {
    const codes = new Set(CLIMATE_CLASSES[id])
    const drawn = drawnCells(Uint8Array.from(raster, (v) => (codes.has(v) ? 1 : 0)), width)
    for (let i = 0; i < kept.length; i++) kept[i] |= drawn[i]
  }
  const references = Object.entries(REFERENCE).map(([id, file]) => {
    const { geometry } = JSON.parse(readFileSync(new URL(`climate-reference/${file}`, import.meta.url), 'utf8'))
    const mask = rasterize(geometry, width, height, west, north, dx, dy)
    for (let i = 0; i < mask.length; i++) if (kept[i]) mask[i] = 0
    return [id, mask]
  })
  const overwritten = new Uint8Array(width * height)
  for (const [, mask] of references) for (let i = 0; i < mask.length; i++) overwritten[i] |= mask[i]

  const masks = []
  for (const [id, codes] of Object.entries(CLIMATE_CLASSES)) {
    const wanted = new Set(codes)
    const mask = new Uint8Array(width * height)
    const extratropical = OUTSIDE_TROPICS_ONLY.has(id)
    const notMonsoon = NOT_IN_MONSOON_ASIA.has(id)
    const giveWay = OVERWRITTEN.has(id)
    for (let i = 0; i < raster.length; i++) {
      const lat = north + (Math.floor(i / width) + 0.5) * dy
      const lon = west + ((i % width) + 0.5) * dx
      const monsoonAsia = lat > 0 && lon > MONSOON_ASIA[0] && lon < MONSOON_ASIA[1]
      mask[i] =
        wanted.has(raster[i]) &&
        (!extratropical || Math.abs(lat) >= TROPIC) &&
        !(notMonsoon && monsoonAsia) &&
        !(giveWay && overwritten[i])
          ? 1
          : 0
    }
    masks.push([id, mask])
  }
  masks.push(...references)

  const features = []
  for (const [id, mask] of masks)
    features.push({ type: 'Feature', properties: { id }, geometry: { type: 'MultiPolygon', coordinates: maskPolygons(mask, width, height, west, north, dx, dy) } })
  return { type: 'FeatureCollection', features }
}
