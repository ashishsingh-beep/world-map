/**
 * The planetary pressure belts and the trade winds, for the Climate map, at
 * the three times of year the trades behave differently: the equinoxes
 * (March and September averaged), when the two trade systems meet near the
 * Equator; July, when the ITCZ rides north and the south-east trades cross the
 * Equator and turn into the south-west monsoon; and January, when it swings
 * south and the north-east trades cross the other way, to arrive in northern
 * Australia as the north-west monsoon. Every month between is one of these
 * shading into another.
 *
 * All from NOAA's 1991–2020 long-term means, the record the isotherms come
 * from:
 *
 * - Winds: NCEP/NCAR reanalysis near-surface wind (sigma 0.995), 2.5°.
 * - Subtropical highs and subpolar lows: the same reanalysis's sea-level
 *   pressure, averaged round each parallel — the ridge between 15° and 50°,
 *   the trough between 45° and 80°, in each hemisphere. Belts are a
 *   latitude, so they are drawn as one, the season's own.
 * - The ITCZ: where the trades meet, and the rain belt their meeting brings —
 *   the reanalysis's surface convergence and GPCP rainfall (2.5°), equally
 *   weighted. Either alone is wrong somewhere: rain misses July's dry
 *   convergence over the Sahara and Arabia, where the line rides north to the
 *   heat lows, and convergence misses January's dip over southern Africa.
 *   Traced as one continuous path round the globe — the best line that cannot
 *   leap between latitudes from one meridian to the next — or the South
 *   Pacific's own convergence zone and the Indian Ocean's southern branch pull
 *   it into pieces.
 */
import { readFileSync } from 'node:fs'
import * as hdf5 from 'jsfive'
import { sample, smooth } from './isotherms.mjs'

const N = 73 * 144

function open(file, key) {
  const b = readFileSync(file)
  return new hdf5.File(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), file).get(key).value
}

/** The seasons, as months of the year (0 = January) averaged together. */
export const SEASONS = { equinox: [2, 8], july: [6], january: [0] }

const mean = (values, months, n) =>
  Float64Array.from({ length: n }, (_, k) => months.reduce((s, m) => s + values[m * n + k], 0) / months.length)

const grid = (v) => ({ w: 144, h: 73, step: 2.5, lat0: 90, lon0: 0, v })

/** Where a sampled profile peaks, between grid rows, by a parabola through the top three. */
function refine(lats, values, at) {
  if (at === 0 || at === values.length - 1) return lats[at]
  const [a, b, c] = [values[at - 1], values[at], values[at + 1]]
  const d = a - 2 * b + c
  const shift = d === 0 ? 0 : (0.5 * (a - c)) / d
  return lats[at] + shift * (lats[at + 1] - lats[at])
}

/** The latitude of the highest (or lowest) zonal-mean pressure between two parallels. */
function beltLatitude(slp, from, to, highest) {
  const lats = []
  const zonal = []
  for (let j = 0; j < 73; j++) {
    const lat = 90 - j * 2.5
    if (lat > Math.max(from, to) || lat < Math.min(from, to)) continue
    let s = 0
    for (let i = 0; i < 144; i++) s += slp[j * 144 + i]
    lats.push(lat)
    zonal.push(s / 144)
  }
  let at = 0
  zonal.forEach((v, k) => {
    if (highest ? v > zonal[at] : v < zonal[at]) at = k
  })
  return Number(refine(lats, zonal, at).toFixed(1))
}

/**
 * The ITCZ: a path, one latitude per meridian between 25°S and 35°N, scored
 * on each meridian by its rain and its convergence (the northward wind south
 * of it less the northward wind north of it), each as a share of that
 * meridian's range, less a cost for every step north or south. Run three
 * times round the globe and the middle lap kept, so it closes on itself.
 */
function itczPath(rain, v) {
  const rows = []
  for (let j = 1; j < v.h - 1; j++) {
    const lat = v.lat0 - j * v.step
    if (lat <= 35 && lat >= -25) rows.push(j)
  }
  const share = (c) => {
    const top = Math.max(...c)
    const bottom = Math.min(...c)
    return c.map((x) => (x - bottom) / (top - bottom || 1))
  }
  const scores = Array.from({ length: v.w }, (_, i) => {
    const wet = share(rows.map((j) => sample(rain, v.lat0 - j * v.step, v.lon0 + i * v.step)))
    const meet = share(rows.map((j) => v.v[(j + 1) * v.w + i] - v.v[(j - 1) * v.w + i]))
    return wet.map((x, k) => x + meet[k])
  })
  const COST = 0.6
  const laps = v.w * 3
  let best = scores[0]
  const back = []
  for (let i = 1; i < laps; i++) {
    const s = scores[i % v.w]
    const next = []
    const from = []
    for (let r = 0; r < rows.length; r++) {
      let m = -Infinity
      let a = 0
      for (let q = 0; q < rows.length; q++) {
        const c = best[q] - COST * Math.abs(q - r) ** 1.5
        if (c > m) {
          m = c
          a = q
        }
      }
      next.push(m + s[r])
      from.push(a)
    }
    best = next
    back.push(from)
  }
  let r = best.indexOf(Math.max(...best))
  const path = [r]
  for (let i = laps - 2; i >= 0; i--) {
    r = back[i][r]
    path.unshift(r)
  }
  const lats = path.slice(v.w, v.w * 2).map((r) => v.lat0 - rows[r] * v.step)
  // Swept along the parallel (±7.5°), as the figures draw it.
  const swept = lats.map((_, i) => {
    let s = 0
    for (let k = -3; k <= 3; k++) s += lats[(i + k + v.w) % v.w]
    return s / 7
  })
  const line = swept.map((lat, i) => [v.lon0 + i * v.step, lat])
  // From −180 round to 180, closed.
  const start = line.findIndex(([lon]) => lon >= 180)
  const ordered = [...line.slice(start), ...line.slice(0, start)].map(([lon, lat]) => [
    Number((lon >= 180 ? lon - 360 : lon).toFixed(2)),
    Number(lat.toFixed(2)),
  ])
  return [...ordered, [180, ordered[0][1]]]
}

/**
 * Trade-wind arrows: on a 7.5° by 5° grid between the season's two
 * subtropical ridges, the near-surface wind, smoothed over 2° so an arrow
 * shows the wind of its region rather than one grid cell's. `i` and `j` are
 * the arrow's place on the grid, so the map can thin it evenly as it zooms out.
 */
function tradeArrows(u, v, south, north) {
  const out = []
  for (let j = 0; ; j++) {
    const lat = 27.5 - j * 5
    if (lat < -27.5) break
    if (lat > north - 2.5 || lat < south + 2.5) continue
    for (let i = 0; i < 48; i++) {
      const lon = -176.25 + i * 7.5
      const uu = sample(u, lat, lon)
      const vv = sample(v, lat, lon)
      if (Math.hypot(uu, vv) < 1) continue
      out.push([i, j, lon, lat, Number(uu.toFixed(1)), Number(vv.toFixed(1))])
    }
  }
  return out
}

export function windsAndBelts({ uFile, vFile, slpFile, rainFile }) {
  const u = open(uFile, 'uwnd')
  const v = open(vFile, 'vwnd')
  const slp = open(slpFile, 'slp')
  const rain = open(rainFile, 'precip')
  const RN = 72 * 144
  const out = {}
  for (const [id, months] of Object.entries(SEASONS)) {
    const p = mean(slp, months, N)
    const belts = {
      subtropicalNorth: beltLatitude(p, 15, 50, true),
      subtropicalSouth: beltLatitude(p, -15, -50, true),
      subpolarNorth: beltLatitude(p, 45, 80, false),
      subpolarSouth: beltLatitude(p, -45, -80, false),
    }
    // GPCP runs south to north from 88.75°S; turned to run north to south.
    const r = mean(rain, months, RN)
    const flipped = new Float64Array(RN)
    for (let j = 0; j < 72; j++) for (let i = 0; i < 144; i++) flipped[j * 144 + i] = r[(71 - j) * 144 + i]
    const uu = smooth(grid(mean(u, months, N)), 2)
    const vv = smooth(grid(mean(v, months, N)), 2)
    const itcz = itczPath(smooth({ w: 144, h: 72, step: 2.5, lat0: 88.75, lon0: 1.25, v: flipped }, 3), smooth(grid(mean(v, months, N)), 3))
    out[id] = { belts, itcz, winds: tradeArrows(uu, vv, belts.subtropicalSouth, belts.subtropicalNorth), u: uu, v: vv }
  }
  return out
}
