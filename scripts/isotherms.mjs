/**
 * Isotherms for the Phenomena section's January, July and annual-range maps,
 * contoured from NOAA's long-term (1991–2020) monthly means rather than traced
 * from the textbook's figures, which are generalised from the same kind of
 * record:
 *
 * - January and July: NCEP/NCAR reanalysis near-surface air (sigma 0.995),
 *   2.5° grid, reduced to sea level at 6.5°C a kilometre — an isotherm map is a
 *   map of sea-level temperature, or Tibet and the Andes become cold islands
 *   that say only that mountains are high. The ice caps of Greenland and
 *   Antarctica are left as they are, as the figures leave them: Greenland is
 *   the textbook's July 0°C and part of its January −25°C.
 * - The range between them: GHCN-CAMS, a 0.5° grid of station records, over
 *   land, and the reanalysis over the sea. On the 2.5° grid Siberia's range
 *   peaks at 53°C; the stations reach Verkhoyansk's 62°C, the core the figure
 *   draws at 60°C. A range needs no sea-level reduction — altitude shifts both
 *   months alike.
 *
 * Each field is smoothed until its lines read as the broad sweeps the figures
 * draw, then contoured by marching squares, wrapping round the globe.
 */
import { readFileSync } from 'node:fs'
import * as hdf5 from 'jsfive'
import { NetCDFReader } from 'netcdfjs'

/** A global grid: `w` columns east from `lon0`, `h` rows south from `lat0`, `step` degrees apart. */
const grid = (w, h, step, lat0, lon0, v) => ({ w, h, step, lat0, lon0, v })
const latOf = (g, j) => g.lat0 - j * g.step
const lonOf = (g, i) => g.lon0 + i * g.step
const wrapLon = (lon) => {
  const l = ((lon % 360) + 360) % 360
  return l > 180 ? l - 360 : l
}

function openHdf5(file) {
  const b = readFileSync(file)
  return new hdf5.File(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), file)
}

/** The reanalysis: January, July and surface height, rows 90°N to 90°S, columns from Greenwich. */
export function readReanalysis(airFile, heightFile) {
  const n = 73 * 144
  const air = openHdf5(airFile).get('air').value
  const height = openHdf5(heightFile).get('hgt').value
  const month = (m) => grid(144, 73, 2.5, 90, 0, Float64Array.from(air.slice(m * n, (m + 1) * n)))
  return { jan: month(0), jul: month(6), height: grid(144, 73, 2.5, 90, 0, Float64Array.from(height, (x) => Math.max(0, x))) }
}

/** GHCN-CAMS land temperatures, °C, with the sea as NaN. Rows 89.75°N south, columns from 0.25°E. */
export function readStations(file) {
  const r = new NetCDFReader(readFileSync(file))
  const air = r.getDataVariable('air')
  const n = 720 * 360
  const month = (m) =>
    grid(720, 360, 0.5, 89.75, 0.25, Float64Array.from(air.slice(m * n, (m + 1) * n), (k) => (k > 100 && k < 400 ? k - 273.15 : NaN)))
  return { jan: month(0), jul: month(6) }
}

/** Bilinear sample of a grid at a point, wrapping in longitude. */
export function sample(g, lat, lon) {
  const y = (g.lat0 - lat) / g.step
  const x = (((lon - g.lon0) % 360) + 360) % 360 / g.step
  const j = Math.max(0, Math.min(g.h - 2, Math.floor(y)))
  const i = Math.floor(x)
  const ty = Math.max(0, Math.min(1, y - j))
  const tx = x - i
  const at = (ii, jj) => g.v[jj * g.w + (((ii % g.w) + g.w) % g.w)]
  return (
    at(i, j) * (1 - tx) * (1 - ty) + at(i + 1, j) * tx * (1 - ty) + at(i, j + 1) * (1 - tx) * ty + at(i + 1, j + 1) * tx * ty
  )
}

/** The ice caps the figures leave unreduced: Greenland and Antarctica. */
const iceCap = (lat, lon) => lat < -60 || (lat > 59 && lon > -75 && lon < -10)

/** Temperature as it would be at sea level, by the standard 6.5°C a kilometre, ice caps aside. */
export function seaLevel(t, height) {
  return grid(t.w, t.h, t.step, t.lat0, t.lon0, t.v.map((v, k) => {
    const lat = latOf(t, Math.floor(k / t.w))
    const lon = wrapLon(lonOf(t, k % t.w))
    return iceCap(lat, lon) ? v : v + (6.5 * height.v[k]) / 1000
  }))
}

/** The January–July range: stations over land, the reanalysis over the sea, on the stations' grid. */
export function annualRange(stations, reanalysis) {
  const { jan, jul } = stations
  const v = new Float64Array(jan.v.length)
  for (let k = 0; k < v.length; k++) {
    const a = jan.v[k]
    const b = jul.v[k]
    if (Number.isFinite(a) && Number.isFinite(b)) v[k] = Math.abs(b - a)
    else {
      const lat = latOf(jan, Math.floor(k / jan.w))
      const lon = lonOf(jan, k % jan.w)
      v[k] = Math.abs(sample(reanalysis.jul, lat, lon) - sample(reanalysis.jan, lat, lon))
    }
  }
  return grid(jan.w, jan.h, jan.step, jan.lat0, jan.lon0, v)
}

/**
 * Gaussian smoothing, `sigmaDeg` degrees along a meridian and the same
 * distance on the ground along a parallel — so wider in longitude towards the
 * poles, where a degree is short — wrapping in longitude.
 */
export function smooth(g, sigmaDeg) {
  const kernel = (s) => {
    const r = Math.ceil(s * 3)
    const w = Array.from({ length: 2 * r + 1 }, (_, k) => Math.exp(-((k - r) ** 2) / (2 * s * s)))
    const sum = w.reduce((a, b) => a + b, 0)
    return { r, w: w.map((x) => x / sum) }
  }
  const s = sigmaDeg / g.step
  const across = new Float64Array(g.v.length)
  for (let j = 0; j < g.h; j++) {
    const c = Math.max(Math.cos((latOf(g, j) * Math.PI) / 180), 0.25)
    const { r, w } = kernel(Math.min(s / c, g.w / 6))
    for (let i = 0; i < g.w; i++) {
      let sum = 0
      for (let k = -r; k <= r; k++) sum += w[k + r] * g.v[j * g.w + (((i + k) % g.w) + g.w) % g.w]
      across[j * g.w + i] = sum
    }
  }
  const out = new Float64Array(g.v.length)
  const { r, w } = kernel(s)
  for (let j = 0; j < g.h; j++) {
    for (let i = 0; i < g.w; i++) {
      let sum = 0
      let ws = 0
      for (let k = -r; k <= r; k++) {
        const jj = j + k
        if (jj < 0 || jj >= g.h) continue
        sum += w[k + r] * across[jj * g.w + i]
        ws += w[k + r]
      }
      out[j * g.w + i] = sum / ws
    }
  }
  return grid(g.w, g.h, g.step, g.lat0, g.lon0, out)
}

/**
 * Marching squares at one level, wrapping in longitude, between `north` and
 * `south` latitudes: each cell gives the segments where the level crosses its
 * edges, and segments sharing an edge are chained into lines — a closed one
 * ends where it began. Lines come back as [lon, lat], longitudes in ±180.
 */
export function contour(g, level, north = 90, south = -90) {
  const v = (i, j) => g.v[j * g.w + (((i % g.w) + g.w) % g.w)]
  const fromJ = Math.max(0, Math.ceil((g.lat0 - north) / g.step))
  const toJ = Math.min(g.h - 1, Math.floor((g.lat0 - south) / g.step))
  const point = (i0, j0, i1, j1) => {
    const a = v(i0, j0)
    const b = v(i1, j1)
    const t = (level - a) / (b - a)
    return [g.lon0 + (i0 + (i1 - i0) * t) * g.step, latOf(g, j0 + (j1 - j0) * t)]
  }
  const keyH = (i, j) => `h${((i % g.w) + g.w) % g.w},${j}`
  const keyV = (i, j) => `v${((i % g.w) + g.w) % g.w},${j}`
  const segs = []
  for (let j = fromJ; j < toJ; j++) {
    for (let i = 0; i < g.w; i++) {
      const code = (v(i, j) > level ? 8 : 0) | (v(i + 1, j) > level ? 4 : 0) | (v(i + 1, j + 1) > level ? 2 : 0) | (v(i, j + 1) > level ? 1 : 0)
      if (code === 0 || code === 15) continue
      const T = { k: keyH(i, j), p: () => point(i, j, i + 1, j) }
      const R = { k: keyV(i + 1, j), p: () => point(i + 1, j, i + 1, j + 1) }
      const B = { k: keyH(i, j + 1), p: () => point(i, j + 1, i + 1, j + 1) }
      const L = { k: keyV(i, j), p: () => point(i, j, i, j + 1) }
      // A saddle is settled by the cell's centre.
      const high = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > level
      const table = {
        1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]],
        5: high ? [[L, T], [B, R]] : [[L, B], [T, R]],
        6: [[T, B]], 7: [[L, T]], 8: [[L, T]], 9: [[T, B]],
        10: high ? [[T, R], [L, B]] : [[T, L], [B, R]],
        11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]],
      }
      for (const s of table[code]) segs.push(s)
    }
  }
  const at = new Map()
  const coords = new Map()
  segs.forEach(([a, b], n) => {
    for (const e of [a, b]) {
      if (!at.has(e.k)) at.set(e.k, [])
      at.get(e.k).push(n)
      if (!coords.has(e.k)) coords.set(e.k, e.p())
    }
  })
  const used = new Uint8Array(segs.length)
  const lines = []
  for (let n = 0; n < segs.length; n++) {
    if (used[n]) continue
    used[n] = 1
    const keys = [segs[n][0].k, segs[n][1].k]
    for (const dir of [1, -1]) {
      for (;;) {
        const end = dir === 1 ? keys[keys.length - 1] : keys[0]
        const next = (at.get(end) ?? []).find((m) => !used[m])
        if (next === undefined) break
        used[next] = 1
        const [a, b] = segs[next]
        const other = a.k === end ? b.k : a.k
        if (dir === 1) keys.push(other)
        else keys.unshift(other)
      }
    }
    lines.push(keys.map((k) => coords.get(k)))
  }
  return lines
}

/**
 * Douglas–Peucker in degrees, on longitudes unwrapped so a line crossing the
 * 180th is one line, then wrapped back to ±180.
 */
export function simplify(line, tol) {
  const un = [line[0].slice()]
  for (let k = 1; k < line.length; k++) {
    let lon = line[k][0]
    while (lon - un[k - 1][0] > 180) lon -= 360
    while (lon - un[k - 1][0] < -180) lon += 360
    un.push([lon, line[k][1]])
  }
  const keep = new Uint8Array(un.length)
  keep[0] = keep[un.length - 1] = 1
  const stack = [[0, un.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = -1
    let at = -1
    const [ax, ay] = un[a]
    const [bx, by] = un[b]
    for (let k = a + 1; k < b; k++) {
      const [px, py] = un[k]
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy)
      if (d > worst) {
        worst = d
        at = k
      }
    }
    if (worst > tol) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  return un.filter((_, k) => keep[k]).map(([lon, lat]) => [Number(wrapLon(lon).toFixed(2)), Number(lat.toFixed(2))])
}

/**
 * The thermal equator: on each meridian, the latitude of the warmest air
 * between 30°N and 30°S, smoothed along the parallel so the line sweeps rather
 * than steps, round the whole globe.
 */
export function thermalEquator(g, windowDeg = 15) {
  const raw = []
  for (let i = 0; i < g.w; i++) {
    let best = null
    for (let j = 0; j < g.h; j++) {
      const lat = latOf(g, j)
      if (lat > 30 || lat < -30) continue
      if (best === null || g.v[j * g.w + i] > g.v[best * g.w + i]) best = j
    }
    raw.push(latOf(g, best))
  }
  const win = Math.round(windowDeg / g.step)
  const line = []
  for (let i = 0; i <= g.w; i++) {
    let s = 0
    for (let k = -win; k <= win; k++) s += raw[(((i + k) % g.w) + g.w) % g.w]
    line.push([lonOf(g, i), s / (2 * win + 1)])
  }
  return simplify(line, 0.2)
}
