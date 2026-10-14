/**
 * The planetary pressure belts and the trade winds, for the Climate map, in
 * the four months the trades behave differently: January, when the ITCZ
 * swings south and the north-east trades cross the Equator, to arrive in
 * northern Australia as the north-west monsoon; March, the spring equinox,
 * when the two trade systems blow towards an ITCZ near the Equator; July, when
 * the ITCZ rides north and the south-east trades cross the Equator and turn
 * into the south-west monsoon; and September, the autumn equinox, when over
 * South Asia that monsoon is still blowing and only beginning to retreat.
 *
 * Each is one month, never an average of two. March and September were once
 * averaged as "the equinoxes", and over South Asia they are opposites — in
 * September the south-west monsoon is still blowing, at 6 m/s in the Bay of
 * Bengal, while March has the last of the north-east winds and the rain belt
 * south of the Equator. The average drew September's south-westerlies
 * blowing away from March's ITCZ: a picture of neither month.
 *
 * All from NOAA's 1991–2020 long-term means, the record the isotherms come
 * from:
 *
 * - Winds: NCEP/NCAR reanalysis near-surface wind (sigma 0.995), 2.5°.
 * - Subtropical highs: the same reanalysis's sea-level pressure, as the ridge
 *   of each ocean's own anticyclone between 15° and 50° — the North Pacific
 *   and Azores highs in the north, the South Pacific, St Helena and
 *   Mascarene highs in the south — averaged per hemisphere. Not the
 *   pressure averaged round the whole parallel: in September that is flat
 *   from 35° to 42.5°N and peaks at 40.5°N, lifted by the Siberian high
 *   building over Asia and by pressure reduced to sea level from Central
 *   Asia's plateaus, while both ocean highs ride at 35°N.
 * - Subpolar lows: the trough of pressure averaged round each parallel
 *   between 45° and 80°, the same all the way round. Belts are a latitude, so
 *   they are drawn as one, the month's own.
 * - The ITCZ: where the trades meet — the equatorial trough — so where the
 *   drawn arrows converge: the reanalysis's surface convergence (weight 1)
 *   and its lowest sea-level pressure (0.75), with GPCP rainfall (2.5°, 0.25)
 *   the light third. Rain cannot lead: July's heaviest falls on the Bay of
 *   Bengal's coast at 20°N, south of the monsoon trough where the
 *   south-westerlies meet the Bay branch's south-easterlies, and the Sahara's
 *   and Arabia's heat lows, where the July line rides north, are dry. Nor can
 *   pressure alone: it is reduced to sea level from southern Africa's high
 *   plateau and misses January's meeting over Zambia, which the winds and the
 *   rain both find. Traced as one continuous path round the globe — the best line that cannot
 *   leap between latitudes from one meridian to the next — or the South
 *   Pacific's own convergence zone and the Indian Ocean's southern branch pull
 *   it into pieces.
 */
import { readFileSync } from 'node:fs'
import * as hdf5 from 'jsfive'
import { NetCDFReader } from 'netcdfjs'
import { sample, smooth } from './isotherms.mjs'

const N = 73 * 144

function open(file, key) {
  const b = readFileSync(file)
  return new hdf5.File(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), file).get(key).value
}

/** The seasons, as months of the year (0 = January) averaged together. */
export const SEASONS = { january: [0], march: [2], july: [6], september: [8] }

/**
 * The oceans' subtropical anticyclones, as spans of longitude (degrees east,
 * written past 360 where one crosses Greenwich): the North Pacific and Azores
 * highs; the South Pacific, St Helena and Mascarene highs.
 */
const OCEAN_HIGHS = {
  north: [[150, 230], [300, 350]],
  south: [[180, 280], [320, 370], [50, 100]],
}

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
 * The subtropical high of one hemisphere: each ocean anticyclone's ridge — the
 * highest pressure averaged across its span of longitude — between two
 * parallels, the ridges then averaged.
 */
function subtropicalLatitude(slp, spans, from, to) {
  const ridges = spans.map(([west, east]) => {
    const lats = []
    const values = []
    for (let j = 0; j < 73; j++) {
      const lat = 90 - j * 2.5
      if (lat > Math.max(from, to) || lat < Math.min(from, to)) continue
      let s = 0
      let c = 0
      for (let i = 0; i < 144; i++) {
        const lon = i * 2.5 < west ? i * 2.5 + 360 : i * 2.5
        if (lon >= west && lon < east) {
          s += slp[j * 144 + i]
          c++
        }
      }
      lats.push(lat)
      values.push(s / c)
    }
    let at = 0
    values.forEach((v, k) => {
      if (v > values[at]) at = k
    })
    return refine(lats, values, at)
  })
  return Number((ridges.reduce((a, b) => a + b, 0) / ridges.length).toFixed(1))
}

/**
 * The ITCZ: a path, one latitude per meridian between 25°S and 35°N, scored
 * on each meridian by its convergence (the northward wind south of it less the
 * northward wind north of it), its low pressure and its rain, each as a share
 * of that meridian's range, less a cost for every step north or south. Run three
 * times round the globe and the middle lap kept, so it closes on itself.
 */
function itczPath(rain, v, slp) {
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
    const low = share(rows.map((j) => -slp.v[j * v.w + i]))
    return meet.map((x, k) => x + 0.75 * low[k] + 0.25 * wet[k])
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
 *
 * Two kinds of point get no arrow, found by auditing every arrow against
 * ships' and buoys' own observations (ICOADS, which the build now checks):
 * - Calm, under CALM m/s: the doldrums, where the wind has no steady way to
 *   blow. Under 1.5 m/s the reanalysis and the ships agree within 30° only
 *   82% of the time; from 3 m/s up, 99–100%. The textbook draws them calm too.
 * - High ground, over HIGHLAND metres on the reanalysis's own terrain: Tibet
 *   and the Himalaya, the Altiplano, the Mexican plateau. A wind there is the
 *   air on a plateau — monsoon air drawn up the Himalaya's slopes — not a trade
 *   wind, and a 2.5° model's terrain is at its least trustworthy.
 */
const CALM = 1.5
const HIGHLAND = 1500

function tradeArrows(u, v, height, south, north) {
  const out = []
  for (let j = 0; ; j++) {
    const lat = 27.5 - j * 5
    if (lat < -27.5) break
    if (lat > north - 2.5 || lat < south + 2.5) continue
    for (let i = 0; i < 48; i++) {
      const lon = -176.25 + i * 7.5
      const uu = sample(u, lat, lon)
      const vv = sample(v, lat, lon)
      if (Math.hypot(uu, vv) < CALM || sample(height, lat, lon) > HIGHLAND) continue
      out.push([i, j, lon, lat, Number(uu.toFixed(1)), Number(vv.toFixed(1))])
    }
  }
  return out
}

export function windsAndBelts({ uFile, vFile, slpFile, rainFile, heightFile }) {
  const height = grid(Float64Array.from(open(heightFile, 'hgt')))
  const u = open(uFile, 'uwnd')
  const v = open(vFile, 'vwnd')
  const slp = open(slpFile, 'slp')
  const rain = open(rainFile, 'precip')
  const RN = 72 * 144
  const out = {}
  for (const [id, months] of Object.entries(SEASONS)) {
    const p = mean(slp, months, N)
    const belts = {
      subtropicalNorth: subtropicalLatitude(p, OCEAN_HIGHS.north, 15, 50),
      subtropicalSouth: subtropicalLatitude(p, OCEAN_HIGHS.south, -15, -50),
      subpolarNorth: beltLatitude(p, 45, 80, false),
      subpolarSouth: beltLatitude(p, -45, -80, false),
    }
    // GPCP runs south to north from 88.75°S; turned to run north to south.
    const r = mean(rain, months, RN)
    const flipped = new Float64Array(RN)
    for (let j = 0; j < 72; j++) for (let i = 0; i < 144; i++) flipped[j * 144 + i] = r[(71 - j) * 144 + i]
    const uu = smooth(grid(mean(u, months, N)), 2)
    const vv = smooth(grid(mean(v, months, N)), 2)
    const itcz = itczPath(
      smooth({ w: 144, h: 72, step: 2.5, lat0: 88.75, lon0: 1.25, v: flipped }, 3),
      smooth(grid(mean(v, months, N)), 3),
      smooth(grid(p), 3)
    )
    out[id] = { belts, itcz, winds: tradeArrows(uu, vv, height, belts.subtropicalSouth, belts.subtropicalNorth), u: uu, v: vv }
  }
  return out
}

/**
 * Every arrow over the sea held to what ships and buoys measured: ICOADS
 * (1° enhanced monthly means), averaged over 1991–2020 for the arrow's month
 * and over the 5° box around it, wherever at least six of its 1° cells have
 * ten years or more of observations. The reanalysis is a model; this is
 * observation, so it is the independent referee. Compared only where both
 * winds blow at CALM or more — under that neither has a direction to speak of.
 * Returns, per month, how many arrows were compared and how far each is off.
 */
export function againstShips({ uFile, vFile, landFile }, seasons) {
  const read = (file, name) => {
    const r = new NetCDFReader(readFileSync(file))
    const attrs = r.variables.find((x) => x.name === name).attributes
    const num = (key) => Number([].concat(attrs.find((a) => a.name === key).value)[0])
    return { raw: r.getDataVariable(name), time: r.getDataVariable('time'), offset: num('add_offset'), scale: num('scale_factor') }
  }
  const U = read(uFile, 'uwnd')
  const V = read(vFile, 'vwnd')
  const land = open(landFile, 'land')
  const CELLS = 180 * 360
  const MISSING = 32766
  const out = {}
  for (const [id, months] of Object.entries(SEASONS)) {
    const su = new Float64Array(CELLS)
    const sv = new Float64Array(CELLS)
    const count = new Uint16Array(CELLS)
    U.time.forEach((days, k) => {
      const when = new Date(Date.UTC(1800, 0, 1) + days * 864e5)
      if (!months.includes(when.getUTCMonth()) || when.getUTCFullYear() < 1991 || when.getUTCFullYear() > 2020) return
      const a = U.raw[k]
      const b = V.raw[k]
      for (let c = 0; c < CELLS; c++) {
        if (a[c] === MISSING || b[c] === MISSING) continue
        su[c] += a[c] * U.scale + U.offset
        sv[c] += b[c] * V.scale + V.offset
        count[c]++
      }
    })
    const observed = (lon, lat) => {
      let u = 0
      let v = 0
      let n = 0
      for (let y = lat - 2; y <= lat + 2; y++) {
        for (let x = lon - 2; x <= lon + 2; x++) {
          const c = Math.round(89.5 - y) * 360 + ((Math.floor(x) % 360) + 360) % 360
          if (count[c] < 10) continue
          u += su[c] / count[c]
          v += sv[c] / count[c]
          n++
        }
      }
      return n >= 6 ? [u / n, v / n] : null
    }
    const sea = (lon, lat) => land[Math.round((90 - lat) / 2.5) * 144 + (Math.round((((lon % 360) + 360) % 360) / 2.5) % 144)] !== 1
    const off = []
    for (const [, , lon, lat, u, v] of seasons[id].winds) {
      if (!sea(lon, lat)) continue
      const o = observed(lon, lat)
      if (!o || Math.hypot(...o) < CALM) continue
      let d = Math.abs(Math.atan2(v, u) - Math.atan2(o[1], o[0])) * (180 / Math.PI)
      if (d > 180) d = 360 - d
      off.push({ at: [lon, lat], degrees: d })
    }
    out[id] = off
  }
  return out
}
