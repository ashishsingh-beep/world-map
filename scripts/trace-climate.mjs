/**
 * Traces a climate's region off a reference map into
 * scripts/climate-reference/<id>.geojson, which scripts/climate.mjs then draws
 * in place of Köppen's class (see REFERENCE there).
 *
 *   node scripts/trace-climate.mjs monsoon path/to/reference.webp
 *
 * The reference is a picture, so each one is described in REFERENCES below:
 * how its map is projected, which pixels are the climate, which are sea.
 *
 * The projection is fitted, not guessed: for each candidate its pixels'
 * land-or-sea is compared with the Köppen raster's land, and the best fit
 * kept. The monsoon reference is a Miller cylindrical map stretched a little
 * north–south (sy ≠ sx); fitted over 20°S–40°N it agrees with the real
 * coastline at 96% of pixels, the rest being its own generalised coasts.
 *
 * Two fixes for what a picture does. The reference leaves a grey fringe of a
 * few pixels between its colour and the sea, and its coasts are not ours, so
 * the colour is grown across that fringe and a few pixels out to sea; the
 * build clips it back to the drawn land. Growing never crosses land the
 * reference left grey, so its inland edges stay exactly where it drew them.
 * And the pixel staircase is softened by a small blur before contouring.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { contours } from 'd3-contour'

const miller = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + (0.4 * lat * Math.PI) / 180))

const REFERENCES = {
  // "Distribution of monsoon climate area": yellow on grey land, dark sea.
  monsoon: {
    size: [1956, 1104],
    fit: { x0: 980.3046875, y0: 674.5, sx: 5.07921875, sy: 5.53671875, project: miller },
    colour: (r, g, b) => r > 170 && g > 120 && b < 110 && r - b > 100,
    sea: (r, g) => r < 80 && g < 95,
    fringe: 3,
    grow: 7,
    // The reference leaves Sri Lanka out; grown off India's tip, the colour
    // would reach Jaffna, 50km across the Palk Strait.
    leaveOut: [{ west: 79.6, east: 82.5, south: 5.5, north: 10 }],
    bounds: { west: -120, east: 160, south: -32, north: 40 },
  },
}

const [id, imagePath] = process.argv.slice(2)
const ref = REFERENCES[id]
if (!ref || !imagePath) {
  console.error(`usage: node scripts/trace-climate.mjs <${Object.keys(REFERENCES).join('|')}> <image>`)
  process.exit(1)
}

const [W, H] = ref.size
const dir = mkdtempSync(join(tmpdir(), 'trace-'))
const rgb = join(dir, 'image.rgb')
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', resolve(imagePath), '-f', 'rawvideo', '-pix_fmt', 'rgb24', rgb])
const img = readFileSync(rgb)
if (img.length !== W * H * 3) throw new Error(`${imagePath} is not ${W}×${H}`)

const { x0, y0, sx, sy, project } = ref.fit
const toX = (lon) => x0 + sx * lon
const toY = (lat) => y0 - sy * (180 / Math.PI) * project(lat)
const toLon = (x) => (x - x0) / sx

const colour = new Uint8Array(W * H)
const passable = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) {
  const [r, g, b] = [img[3 * i], img[3 * i + 1], img[3 * i + 2]]
  colour[i] = ref.colour(r, g, b) ? 1 : 0
  passable[i] = ref.sea(r, g, b) ? 1 : 0
}
const neighbour = (a, i) => a[i - 1] || a[i + 1] || a[i - W] || a[i + W]
// The fringe: land within a few pixels of the sea.
for (let k = 0; k < ref.fringe; k++) {
  const next = passable.slice()
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (neighbour(passable, y * W + x)) next[y * W + x] = 1
  passable.set(next)
}
for (let k = 0; k < ref.grow; k++) {
  const next = colour.slice()
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (!colour[i] && passable[i] && neighbour(colour, i)) next[i] = 1
    }
  colour.set(next)
}
for (const box of ref.leaveOut ?? [])
  for (let y = Math.max(0, Math.floor(toY(box.north))); y <= Math.min(H - 1, Math.ceil(toY(box.south))); y++)
    for (let x = 0; x < W; x++) {
      const lon = toLon(x)
      if (lon > box.west && lon < box.east) colour[y * W + x] = 0
    }

// A 5×5 box blur, sampled bilinearly onto a 0.1° grid.
const soft = new Float32Array(W * H)
for (let y = 2; y < H - 2; y++)
  for (let x = 2; x < W - 2; x++) {
    let s = 0
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) s += colour[(y + j) * W + x + i]
    soft[y * W + x] = s / 25
  }
const sample = (fx, fy) => {
  const x = Math.floor(fx), y = Math.floor(fy), u = fx - x, v = fy - y
  const at = (i, j) => soft[(y + j) * W + x + i]
  return (1 - u) * (1 - v) * at(0, 0) + u * (1 - v) * at(1, 0) + (1 - u) * v * at(0, 1) + u * v * at(1, 1)
}
const D = 0.1
const { west, east, south, north } = ref.bounds
const gw = Math.round((east - west) / D), gh = Math.round((north - south) / D)
const grid = new Float64Array(gw * gh)
for (let r = 0; r < gh; r++) {
  const y = toY(north - (r + 0.5) * D)
  for (let c = 0; c < gw; c++) {
    const x = toX(west + (c + 0.5) * D)
    if (x >= 2 && x < W - 3 && y >= 2 && y < H - 3) grid[r * gw + c] = sample(x, y)
  }
}
const [shape] = contours().size([gw, gh]).thresholds([0.5]).smooth(true)(grid)
const toLonLat = ([x, y]) => [+(west + x * D).toFixed(3), +(north - y * D).toFixed(3)]
const raw = join(dir, 'raw.json')
writeFileSync(raw, JSON.stringify({ type: 'MultiPolygon', coordinates: shape.coordinates.map((rings) => rings.map((r) => r.map(toLonLat))) }))
const simple = join(dir, 'simple.json')
execFileSync(resolve('node_modules/.bin/mapshaper'), ['-i', raw, '-simplify', 'interval=4000', 'keep-shapes', '-o', 'precision=0.01', simple])
const [geometry] = JSON.parse(readFileSync(simple, 'utf8')).geometries
const out = resolve('scripts/climate-reference', `${id}.geojson`)
writeFileSync(out, JSON.stringify({ type: 'Feature', properties: { id }, geometry }) + '\n')
rmSync(dir, { recursive: true })
console.log(`Wrote ${out}: ${geometry.coordinates.length} pieces`)
