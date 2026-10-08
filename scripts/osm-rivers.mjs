/**
 * River courses from OpenStreetMap, for the Indian map's rivers.
 *
 * Natural Earth carries the Godavari and the Mahanadi and almost none of their
 * tributaries; OpenStreetMap carries all of them, traced from imagery. A river
 * there is a relation of many ways (or, for the ones nobody has gathered into
 * a relation yet, just ways that share a name), so this module fetches them
 * from the OSM API, caches the raw answer, and joins the pieces into one line
 * from source to mouth.
 *
 * Only the OSM API is used, never Overpass: the API answers a relation or a
 * way by id reliably, where the Overpass mirrors were found refusing or timing
 * out for an afternoon.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { geoDistance } from 'd3-geo'

const API = 'https://api.openstreetmap.org/api/0.6'
const KM = 6371

function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const out = execFileSync('curl', ['-sS', '-f', '-m', '120', '-A', 'map-practice-build', url], {
        maxBuffer: 1 << 28,
      })
      return JSON.parse(out.toString())
    } catch (e) {
      if (attempt === 3) throw new Error(`OSM API failed for ${url}: ${e.message}`)
      execFileSync('sleep', [String(2 ** (attempt + 1))])
    }
  }
}

/** A way as [node ids] and [[lon, lat]], from an API `full` answer. */
function waysFrom(elements, keep) {
  const nodes = new Map(elements.filter((e) => e.type === 'node').map((e) => [e.id, [e.lon, e.lat]]))
  return elements
    .filter((e) => e.type === 'way' && keep(e))
    .map((w) => ({ id: w.id, nodes: w.nodes, coords: w.nodes.map((n) => nodes.get(n)) }))
    .filter((w) => w.coords.every(Boolean))
}

/**
 * The raw ways of one river, cached. `R123` is a relation: its main-stream
 * members (or, where a relation has no roles, all its ways). `W123` is a seed
 * way: every way reachable from it by shared nodes that carries one of the
 * river's own names — how a river with no relation is gathered.
 */
export function fetchRiverWays(osm, names, cacheDir, box = null, extra = [], { allRoles = false, canal = false } = {}) {
  const key =
    (osm.startsWith('R') ? osm : `${osm}-${names.join('+')}${box ? `-${box.flat().join(',')}` : ''}`) +
    (extra.length ? `-${extra.join('+')}` : '') +
    (allRoles ? '-all' : '') +
    (canal ? '-canal' : '')
  const cache = resolve(cacheDir, `osm-river-${key.replace(/[^A-Za-z0-9+,.-]/g, '_')}.json`)
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  let ways
  if (osm.startsWith('R')) {
    const full = get(`${API}/relation/${osm.slice(1)}/full.json`)
    const rel = full.elements.find((e) => e.type === 'relation' && e.id === Number(osm.slice(1)))
    const members = rel.members.filter((m) => m.type === 'way')
    const main = members.filter((m) => m.role === 'main_stream')
    // `allRoles`: a relation whose main_stream tags cover only a stretch — the
    // Malaprabha's mark two ways of nineteen — is taken whole, side streams
    // still left out; the course is the shortest path through it either way.
    const wanted = new Set(
      (main.length && !allRoles ? main : members.filter((m) => m.role !== 'side_stream')).map((m) => m.ref)
    )
    ways = waysFrom(full.elements, (w) => wanted.has(w.id))
  } else {
    const allowed = new Set(names.map((n) => n.toLowerCase()))
    // `canal`: a river OSM has tagged as a canal along its length — the
    // Thirumanimuthar through Salem and Namakkal — is walked through those too.
    const kinds = canal ? /^(river|stream|canal)$/ : /^(river|stream)$/
    const named = (w) => w.tags && kinds.test(w.tags.waterway) && allowed.has((w.tags.name ?? '').toLowerCase())
    const inside = (way) =>
      !box || way.coords.every(([x, y]) => x >= box[0][0] && x <= box[1][0] && y >= box[0][1] && y <= box[1][1])
    const seen = new Map()
    const queue = [Number(osm.slice(1))]
    while (queue.length) {
      const id = queue.shift()
      if (seen.has(id)) continue
      const full = get(`${API}/way/${id}/full.json`)
      const [way] = waysFrom(full.elements, (w) => w.id === id)
      // A way that strays out of the box is not taken, nor walked through:
      // how a branch named after its parent stops at the delta's head.
      seen.set(id, inside(way) ? way : null)
      if (!inside(way)) continue
      for (const n of [way.nodes[0], way.nodes[way.nodes.length - 1]]) {
        const touching = get(`${API}/node/${n}/ways.json`).elements
        for (const w of touching) if (named(w) && !seen.has(w.id)) queue.push(w.id)
      }
    }
    ways = [...seen.values()].filter(Boolean)
  }
  // Ways named by id: a stretch OSM leaves unnamed — the Kinnarsani above its
  // dam — that no walk by name can reach.
  for (const w of extra) {
    const id = Number(w.slice(1))
    ways.push(...waysFrom(get(`${API}/way/${id}/full.json`).elements, (e) => e.id === id))
  }
  writeFileSync(cache, JSON.stringify(ways))
  return ways
}

/** Kilometres from a point to a line, flat within each segment. */
export function kmToLine(line, at) {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]
    const [bx, by] = line[i + 1]
    const k = Math.cos((((ay + by) / 2) * Math.PI) / 180)
    const vx = (bx - ax) * k
    const vy = by - ay
    const wx = (at[0] - ax) * k
    const wy = at[1] - ay
    const len2 = vx * vx + vy * vy
    const t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0
    best = Math.min(best, (Math.hypot(wx - t * vx, wy - t * vy) * Math.PI * KM) / 180)
  }
  return best
}

/**
 * One line from source to mouth. The ways become a graph on their shared
 * nodes; pieces a mapper left apart (a reservoir with no centreline, a stretch
 * named differently) are bridged end to end where the gap is under `maxGapKm`;
 * and the course is the shortest path between the two ends, so a braided
 * stretch contributes one channel, not all of them.
 *
 * `start` picks the upstream end — the endpoint nearest an authored source —
 * or, given `downstream`, the end is the endpoint nearest that line (a
 * tributary's parent) and the start the endpoint furthest from it along the
 * river. A distributary is the other way round: it leaves its parent.
 */
export function joinCourse(ways, { source = null, parent = null, leaves = false, maxGapKm = 40 }) {
  const coord = new Map()
  const adj = new Map()
  const link = (a, b, km) => {
    if (!adj.has(a)) adj.set(a, new Map())
    if (!adj.has(b)) adj.set(b, new Map())
    adj.get(a).set(b, Math.min(km, adj.get(a).get(b) ?? Infinity))
    adj.get(b).set(a, Math.min(km, adj.get(b).get(a) ?? Infinity))
  }
  for (const w of ways) {
    w.nodes.forEach((n, i) => coord.set(n, w.coords[i]))
    for (let i = 1; i < w.nodes.length; i++) {
      link(w.nodes[i - 1], w.nodes[i], geoDistance(w.coords[i - 1], w.coords[i]) * KM)
    }
  }
  // Components, then bridges between them, closest first.
  const compOf = new Map()
  const comps = []
  for (const n of adj.keys()) {
    if (compOf.has(n)) continue
    const members = []
    const stack = [n]
    compOf.set(n, comps.length)
    while (stack.length) {
      const x = stack.pop()
      members.push(x)
      for (const y of adj.get(x).keys()) {
        if (compOf.has(y)) continue
        compOf.set(y, comps.length)
        stack.push(y)
      }
    }
    comps.push(members)
  }
  const ends = (members) => members.filter((n) => adj.get(n).size === 1)
  const bridges = []
  const group = comps.map((_, i) => i)
  const root = (i) => (group[i] === i ? i : (group[i] = root(group[i])))
  for (;;) {
    let best = null
    for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        if (root(i) === root(j)) continue
        for (const a of ends(comps[i])) {
          for (const b of ends(comps[j])) {
            const km = geoDistance(coord.get(a), coord.get(b)) * KM
            if (km < maxGapKm && (!best || km < best.km)) best = { a, b, km, i, j }
          }
        }
      }
    }
    if (!best) break
    link(best.a, best.b, best.km)
    bridges.push(best.km)
    group[root(best.j)] = root(best.i)
  }

  const dijkstra = (from) => {
    const dist = new Map([[from, 0]])
    const prev = new Map()
    const done = new Set()
    // Small graphs (a few thousand nodes): a linear scan is plenty.
    const open = new Set([from])
    while (open.size) {
      let x = null
      for (const n of open) if (x === null || dist.get(n) < dist.get(x)) x = n
      open.delete(x)
      done.add(x)
      for (const [y, km] of adj.get(x)) {
        if (done.has(y)) continue
        const d = dist.get(x) + km
        if (d < (dist.get(y) ?? Infinity)) {
          dist.set(y, d)
          prev.set(y, x)
          open.add(y)
        }
      }
    }
    return { dist, prev }
  }
  const endpoints = [...adj.keys()].filter((n) => adj.get(n).size === 1)
  const nearest = (pts, score) => pts.reduce((b, n) => (score(n) < score(b) ? n : b))
  let from
  let to
  if (source) {
    from = nearest(endpoints, (n) => geoDistance(coord.get(n), source))
    const { dist } = dijkstra(from)
    to = endpoints.filter((n) => dist.has(n)).reduce((b, n) => (dist.get(n) > dist.get(b) ? n : b), from)
  } else {
    const touch = nearest(endpoints, (n) => kmToLine(parent, coord.get(n)))
    const { dist } = dijkstra(touch)
    const far = endpoints.filter((n) => dist.has(n)).reduce((b, n) => (dist.get(n) > dist.get(b) ? n : b), touch)
    ;[from, to] = leaves ? [touch, far] : [far, touch]
  }
  const { prev } = dijkstra(from)
  const path = [to]
  while (path[path.length - 1] !== from) {
    const p = prev.get(path[path.length - 1])
    if (p === undefined) throw new Error('river course has no path from source to mouth')
    path.push(p)
  }
  const line = path.reverse().map((n) => coord.get(n))
  return { line, bridges, pieces: comps.length }
}

/**
 * Douglas–Peucker in degrees, scaled by latitude: the courses come with a
 * vertex every few tens of metres, far more than any zoom of the Indian map
 * can show.
 */
export function simplifyLine(line, toleranceKm) {
  const tol = toleranceKm / 111.32
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack = [[0, line.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = -1
    let at = -1
    const [ax, ay] = line[a]
    const [bx, by] = line[b]
    const k = Math.cos((((ay + by) / 2) * Math.PI) / 180)
    for (let i = a + 1; i < b; i++) {
      const [px, py] = line[i]
      const vx = (bx - ax) * k
      const vy = by - ay
      const wx = (px - ax) * k
      const wy = py - ay
      const len2 = vx * vx + vy * vy
      const t = len2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0
      const d = Math.hypot(wx - t * vx, wy - t * vy)
      if (d > worst) {
        worst = d
        at = i
      }
    }
    if (worst > tol) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  return line.filter((_, i) => keep[i]).map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))])
}

export const lengthKm = (line) => line.slice(1).reduce((s, c, i) => s + geoDistance(line[i], c) * KM, 0)

/**
 * A main river ends where the notes end it: the Godavari at the Dowleswaram
 * barrage, where it divides into the Gautami and the Vasishta. OpenStreetMap
 * runs its course on down one of the branches to the sea.
 */
export function endAt(line, at) {
  let best = 0
  for (let i = 1; i < line.length; i++) {
    if (geoDistance(line[i], at) < geoDistance(line[best], at)) best = i
  }
  return line.slice(0, best + 1)
}

/**
 * A distributary begins where it leaves its parent. Mapped branches often
 * start a little upstream, drawn over the parent's own channel, or a little
 * downstream of the fork with the head left unnamed: either way the line is
 * cut where it parts from the parent and given the parent's nearest point as
 * its first, so the two meet exactly.
 */
export function leaveFrom(line, parent, withinKm = 0.6) {
  let i = 0
  while (i < line.length - 2 && kmToLine(parent, line[i + 1]) < withinKm) i++
  let best = parent[0]
  for (const p of parent) if (geoDistance(p, line[i]) < geoDistance(best, line[i])) best = p
  return [best, ...line.slice(i)]
}
