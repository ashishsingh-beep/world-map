#!/usr/bin/env node
/**
 * Builds the country dataset for the map quiz.
 *
 * Source: Natural Earth 1:10m Admin 0 countries, INDIA POINT OF VIEW.
 * This variant is deliberate and non-negotiable: it depicts Jammu & Kashmir
 * (including PoK / Gilgit-Baltistan) and Aksai Chin as part of India, matching
 * the official Indian map. Do not swap it for the ISO/default build.
 *
 * Outputs:
 *   src/data/countries.topo.json  - simplified geometry, quantised
 *   src/data/countries.meta.json  - name, iso, continent, centroid, area
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geoArea, geoCentroid, geoBounds, geoContains, geoDistance } from 'd3-geo'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const CACHE = resolve(ROOT, '.cache')
const OUT = resolve(ROOT, 'src/data')
const SRC_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson'
const RAW = resolve(CACHE, 'ne_10m_admin_0_countries_ind.geojson')

/** The 197 entries: 193 UN members + 2 UN observers + Taiwan + Kosovo. */
const UN_MEMBERS = `
AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN
BOL BIH BWA BRA BRN BGR BFA BDI CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG COD
CRI CIV HRV CUB CYP CZE DNK DJI DMA DOM ECU EGY SLV GNQ ERI EST SWZ ETH FJI FIN
FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ
IRL ISR ITA JAM JPN JOR KAZ KEN KIR PRK KOR KWT KGZ LAO LVA LBN LSO LBR LBY LIE
LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG MNE MAR MOZ MMR
NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT
QAT ROU RUS RWA KNA LCA VCT WSM SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM
ZAF SSD ESP LKA SDN SUR SWE CHE SYR TJK TZA THA TLS TGO TON TTO TUN TUR TKM TUV
UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB ZWE
`.trim().split(/\s+/)

/**
 * Kosovo does not exist as a separate entity in the India point-of-view
 * dataset — India does not recognise it, so its territory sits inside Serbia.
 * Including it would mean grafting geometry from a different worldview, which
 * defeats the point of choosing the India POV. Flip to true only if that
 * trade-off is accepted; the build will then need a Kosovo patch source.
 */
const INCLUDE_KOSOVO = false

// Vatican, Palestine, Taiwan (+ Kosovo, see above)
const EXTRA = ['VAT', 'PSE', 'TWN', ...(INCLUDE_KOSOVO ? ['XKX'] : [])]
const WANTED = new Set([...UN_MEMBERS, ...EXTRA])
const EXPECTED_COUNT = 196 + (INCLUDE_KOSOVO ? 1 : 0)

/** Display names where Natural Earth's ADMIN string isn't what a player expects. */
const NAME_OVERRIDES = {
  BHS: 'Bahamas',
  COD: 'DR Congo',
  COG: 'Republic of the Congo',
  CIV: "Côte d'Ivoire",
  CZE: 'Czechia',
  SWZ: 'Eswatini',
  PRK: 'North Korea',
  KOR: 'South Korea',
  LAO: 'Laos',
  MKD: 'North Macedonia',
  TLS: 'Timor-Leste',
  TZA: 'Tanzania',
  GBR: 'United Kingdom',
  USA: 'United States',
  VAT: 'Vatican City',
  TWN: 'Taiwan',
  PSE: 'Palestine',
  VNM: 'Vietnam',
  SYR: 'Syria',
  IRN: 'Iran',
  RUS: 'Russia',
  MMR: 'Myanmar',
  BOL: 'Bolivia',
  VEN: 'Venezuela',
  MDA: 'Moldova',
  BRN: 'Brunei',
  CPV: 'Cape Verde',
}

/** Natural Earth's CONTINENT is right for our purposes except where noted. */
const CONTINENT_OVERRIDES = {
  RUS: 'Europe', // NE already says Europe; pinned here so it can't drift
  TUR: 'Asia',
  CYP: 'Europe', // NE says Asia; politically and for quiz purposes, Europe
  ARM: 'Asia',
  AZE: 'Asia',
  GEO: 'Asia',
  // NE files these under "Seven seas (open ocean)"; UN M49 places them thus
  SYC: 'Africa',
  MUS: 'Africa',
  MDV: 'Asia',
}

function download() {
  if (existsSync(RAW)) return
  mkdirSync(CACHE, { recursive: true })
  console.log('Downloading Natural Earth (India POV)…')
  execFileSync('curl', ['-sSL', '-o', RAW, SRC_URL], { stdio: 'inherit' })
}

function assertIndiaPointOfView(features) {
  const india = features.find((f) => f.properties.ADM0_A3 === 'IND')
  if (!india) throw new Error('India missing from source data')
  const [, [, north]] = geoBounds(india)
  if (north < 36.5) {
    throw new Error(
      `India's northern extent is ${north.toFixed(2)}°N — expected ~37°N. ` +
        'This is NOT the India point-of-view dataset. Check SRC_URL.'
    )
  }
  console.log(`India POV verified: northern extent ${north.toFixed(2)}°N`)
}

download()

const raw = JSON.parse(readFileSync(RAW, 'utf8'))
assertIndiaPointOfView(raw.features)

/**
 * Natural Earth carries both ISO_A3 and its own ADM0_A3, and they disagree for
 * a handful of units (South Sudan is SDS, Palestine is PSX). Prefer the real
 * ISO code and fall back to ADM0_A3 so the whitelist can stay in ISO terms.
 */
const isoOf = (p) => (/^[A-Z]{3}$/.test(p.ISO_A3) ? p.ISO_A3 : p.ADM0_A3)

const picked = new Map()
for (const f of raw.features) {
  const iso = isoOf(f.properties)
  if (!WANTED.has(iso)) continue
  // Natural Earth can carry more than one feature per admin-0 unit; keep the
  // largest so we never lose the mainland to an outlying scrap.
  const prev = picked.get(iso)
  if (!prev || geoArea(f) > geoArea(prev)) picked.set(iso, f)
}

const missing = [...WANTED].filter((iso) => !picked.has(iso))
if (missing.length) throw new Error(`Missing from source: ${missing.join(', ')}`)
if (picked.size !== EXPECTED_COUNT)
  throw new Error(`Expected ${EXPECTED_COUNT} entries, got ${picked.size}`)
console.log(`Matched all ${picked.size} entries`)

/** Alternative spellings accepted in Type mode. */
const ALIASES = {
  USA: ['USA', 'US', 'United States of America', 'America'],
  GBR: ['UK', 'Great Britain', 'Britain'],
  ARE: ['UAE'],
  COD: ['Democratic Republic of the Congo', 'DRC', 'Congo Kinshasa'],
  COG: ['Congo', 'Congo Brazzaville'],
  CIV: ['Ivory Coast', 'Cote d Ivoire'],
  CZE: ['Czech Republic'],
  SWZ: ['Swaziland'],
  MMR: ['Burma'],
  NLD: ['Holland', 'The Netherlands'],
  TLS: ['East Timor'],
  CPV: ['Cabo Verde'],
  PRK: ['DPRK', 'Korea North'],
  KOR: ['Korea South', 'Republic of Korea'],
  VAT: ['Holy See'],
  FSM: ['Micronesia'],
  MKD: ['Macedonia'],
  TUR: ['Turkiye'],
  BHS: ['The Bahamas'],
  GMB: ['The Gambia'],
  VCT: ['St Vincent and the Grenadines'],
  KNA: ['St Kitts and Nevis'],
  LCA: ['St Lucia'],
}

const meta = {}
const features = []
for (const [iso, f] of picked) {
  const name = NAME_OVERRIDES[iso] ?? f.properties.ADMIN
  const continent = CONTINENT_OVERRIDES[iso] ?? f.properties.CONTINENT
  const iso2 = /^[A-Z]{2}$/.test(f.properties.ISO_A2)
    ? f.properties.ISO_A2
    : f.properties.ISO_A2_EH
  meta[iso] = {
    iso,
    iso2,
    name,
    aliases: ALIASES[iso] ?? [],
    continent,
    centroid: geoCentroid(f).map((n) => +n.toFixed(4)),
    bounds: geoBounds(f).map((p) => p.map((n) => +n.toFixed(4))),
    // steradians; used at render time to decide when a country needs a marker
    area: +geoArea(f).toExponential(4),
  }
  features.push({
    type: 'Feature',
    id: iso,
    properties: { iso },
    geometry: f.geometry,
  })
}

mkdirSync(OUT, { recursive: true })
mkdirSync(CACHE, { recursive: true })
const filtered = resolve(CACHE, 'filtered.geojson')
writeFileSync(filtered, JSON.stringify({ type: 'FeatureCollection', features }))

// keep-shapes stops micro-states collapsing to nothing during simplification
const topoOut = resolve(OUT, 'countries.topo.json')
execFileSync(
  resolve(ROOT, 'node_modules/.bin/mapshaper'),
  [
    filtered,
    '-simplify', '6%', 'keep-shapes',
    '-clean',
    '-rename-layers', 'countries',
    '-o', 'format=topojson', 'quantization=1e5', 'id-field=iso', topoOut,
  ],
  { stdio: 'inherit' }
)

writeFileSync(resolve(OUT, 'countries.meta.json'), JSON.stringify(meta, null, 2))

/**
 * Second input: the hand-authored syllabus files.
 *
 * Geometry comes from Natural Earth; meaning ("Pittsburgh = Iron & Steel
 * Capital of the World") exists only in the study notes, so it is authored by
 * hand. This pass joins the two and refuses to emit anything it cannot verify
 * against the country polygons above — a mistyped coordinate is otherwise
 * invisible until a question points at open ocean.
 */
const PLACE_TYPES = new Set([
  'country', 'territory', 'capital', 'city', 'port', 'island', 'island-group',
  'mine', 'canal', 'zone',
  // Seas & Straits section
  'sea', 'strait',
])
/** Water features sit offshore by definition, so containment never applies. */
const WATER_TYPES = new Set(['sea', 'strait', 'canal'])
/**
 * How far outside its country an onshore place may sit before it's an error.
 * A port sits on the water's edge, and Natural Earth's coastline is generalised,
 * so Halifax and Miami land a few km offshore of their own country. That slack
 * is nothing next to a real mistake, which misses by hundreds of km.
 */
const ONSHORE_SLACK_KM = 25

/** Distance from a point to the nearest vertex of a feature's geometry. */
function distanceToFeatureKm(feature, point) {
  let best = Infinity
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const d = geoDistance(coords, point) * 6371
      if (d < best) best = d
      return
    }
    for (const c of coords) walk(c)
  }
  walk(feature.geometry.coordinates)
  return best
}

const SYLLABUS = resolve(OUT, 'syllabus')
const places = []
const groups = []
/** Declared continents, including ones authored as empty placeholders. */
const continents = []
const errors = []
const seen = new Set()

const syllabusFiles = existsSync(SYLLABUS)
  ? readdirSync(SYLLABUS).filter((f) => f.endsWith('.json')).sort()
  : []

for (const file of syllabusFiles) {
  const doc = JSON.parse(readFileSync(resolve(SYLLABUS, file), 'utf8'))
  const where = (id) => `${file}:${id}`
  continents.push({
    name: doc.continent,
    title: doc.title ?? doc.continent,
    section: doc.section ?? 'places',
    count: doc.places.length,
  })
  groups.push(...(doc.groups ?? []))

  for (const p of doc.places) {
    if (seen.has(p.id)) errors.push(`${where(p.id)}: duplicate id`)
    seen.add(p.id)

    if (!PLACE_TYPES.has(p.type)) errors.push(`${where(p.id)}: unknown type "${p.type}"`)
    if (!p.significance) errors.push(`${where(p.id)}: missing significance`)
    for (const iso of [p.country, p.sovereign, ...(p.borders ?? [])]) {
      if (iso && !meta[iso]) errors.push(`${where(p.id)}: unknown ISO "${iso}"`)
    }
    if (WATER_TYPES.has(p.type) && !p.spanKm) {
      errors.push(`${where(p.id)}: a water feature needs a spanKm hit radius`)
    }

    // A country-level fact borrows the country's own geometry and centroid.
    let point = p.point
    if (p.type === 'country') {
      if (!p.country) errors.push(`${where(p.id)}: country fact needs a country`)
      point = meta[p.country]?.centroid ?? null
    } else if (!Array.isArray(point) || point.length !== 2) {
      errors.push(`${where(p.id)}: missing point`)
    }

    // The check that catches transposed or mistyped coordinates.
    const feature = p.country ? picked.get(p.country) : null
    if (feature && point && !p.offshore && p.type !== 'country') {
      const slack = geoContains(feature, point) ? 0 : distanceToFeatureKm(feature, point)
      if (slack > ONSHORE_SLACK_KM) {
        const km = geoDistance(point, meta[p.country].centroid) * 6371
        errors.push(
          `${where(p.id)}: point ${point} is ${slack.toFixed(0)}km outside ${p.country} ` +
            `(${km.toFixed(0)}km from its centroid). Fix it, or mark "offshore": true.`
        )
      }
    }
    if (feature && point && p.offshore && geoContains(feature, point)) {
      errors.push(`${where(p.id)}: marked offshore but the point is inside ${p.country}`)
    }

    places.push({ ...p, point, continent: doc.continent, section: doc.section ?? 'places' })
  }

  for (const g of doc.groups ?? []) {
    for (const m of g.members) {
      if (!meta[m] && !doc.places.some((p) => p.id === m)) {
        errors.push(`${file}:${g.id}: member "${m}" is neither a country nor a place`)
      }
    }
  }
}

if (errors.length) {
  console.error(`\nSyllabus validation failed (${errors.length}):`)
  for (const e of errors) console.error('  ' + e)
  process.exit(1)
}

writeFileSync(resolve(OUT, 'places.json'), JSON.stringify({ continents, places, groups }, null, 2))

const byContinent = {}
for (const m of Object.values(meta)) {
  byContinent[m.continent] = (byContinent[m.continent] ?? 0) + 1
}
console.log('Continents:', byContinent)
console.log('Wrote', topoOut)
console.log(
  `Syllabus: ${places.length} places from ${syllabusFiles.length} file(s), all verified`
)
for (const c of continents) {
  if (!c.count) console.log(`  ${c.title}: placeholder, no places authored yet`)
}
