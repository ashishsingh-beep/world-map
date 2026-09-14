import { allIsos, meta, metaOf, type Continent } from '../data/countries'
import { places as allPlaces, placesOfCountry, type PlaceType } from '../data/places'

export type BBox = [[number, number], [number, number]]

export interface Round {
  id: string
  title: string
  blurb: string
  /** Geography drawn on the map. */
  render: string[]
  /** Countries the quiz asks for. Differs from `render` only for Island Nations. */
  askable: string[]
  /**
   * Place ids the quiz asks for. Present only on deep-dive rounds, which ask
   * about places inside countries rather than the countries themselves.
   */
  places?: string[]
  view: BBox
}

const isosIn = (continent: Continent) =>
  allIsos.filter((iso) => meta[iso].continent === continent)

/** Bounding box that contains every listed country, with a little breathing room. */
function fit(isos: string[], pad = 3): BBox {
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  for (const iso of isos) {
    const [[cw, cs], [ce, cn]] = metaOf(iso).bounds
    w = Math.min(w, cw)
    s = Math.min(s, cs)
    e = Math.max(e, ce)
    n = Math.max(n, cn)
  }
  return [
    [Math.max(-180, w - pad), Math.max(-90, s - pad)],
    [Math.min(180, e + pad), Math.min(90, n + pad)],
  ]
}

/**
 * Views we set by hand rather than fitting to member countries.
 *
 * Europe is the important one. Fitting to its members would stretch the frame
 * to Russia's Pacific coast and squash actual Europe into a corner — which is
 * exactly what the reference site does, and it makes the micro-states
 * unplayable. Russia keeps its real geometry and simply runs off the canvas.
 */
const VIEW_OVERRIDES: Partial<Record<string, BBox>> = {
  world: [
    [-180, -58],
    [180, 84],
  ],
  europe: [
    [-26, 33],
    [46, 72],
  ],
}

function round(
  id: string,
  title: string,
  blurb: string,
  isos: string[],
  opts: { render?: string[]; view?: BBox } = {}
): Round {
  return {
    id,
    title,
    blurb,
    render: opts.render ?? isos,
    askable: isos,
    view: VIEW_OVERRIDES[id] ?? opts.view ?? fit(isos),
  }
}

export const ROUNDS: Record<string, Round> = {
  world: round('world', 'World Map', 'Every country on one map.', allIsos),
  africa: round('africa', 'Africa Map', 'Deserts, coastlines and inland nations.', isosIn('Africa')),
  asia: round('asia', 'Asia Map', 'Vast borders and island chains.', isosIn('Asia')),
  europe: round('europe', 'Europe Map', 'Compact borders packed close together.', isosIn('Europe')),
  'north-america': round(
    'north-america',
    'North America Map',
    'From the Arctic edge down through Central America.',
    isosIn('North America')
  ),
  oceania: round('oceania', 'Oceania Map', 'Island nations across the Pacific.', isosIn('Oceania')),
  'south-america': round(
    'south-america',
    'South America Map',
    'From the Andes to the Atlantic.',
    isosIn('South America')
  ),
}

export const ROUND_ORDER = [
  'world',
  'africa',
  'asia',
  'europe',
  'north-america',
  'oceania',
  'south-america',
] as const

/**
 * Deep-dive rounds: the places inside a country, not the country itself.
 *
 * The view must contain every askable place, because panning is clamped to the
 * starting view — a question you cannot scroll to is unanswerable. That is why
 * the box is fitted to the places as well as the country, and why Chile's round
 * reaches out to Easter Island.
 */
function fitAround(bounds: BBox, points: [number, number][], pad = 2): BBox {
  let [[w, s], [e, n]] = bounds
  for (const [lon, lat] of points) {
    w = Math.min(w, lon)
    s = Math.min(s, lat)
    e = Math.max(e, lon)
    n = Math.max(n, lat)
  }
  return [
    [Math.max(-180, w - pad), Math.max(-90, s - pad)],
    [Math.min(180, e + pad), Math.min(90, n + pad)],
  ]
}

/** Continents that have an authored syllabus, in menu order. */
export const PLACE_CONTINENTS = [...new Set(allPlaces.map((p) => p.continent))]

export const allPlacesRoundId = (continent: string) =>
  `places-all-${continent.toLowerCase().replace(/\s+/g, '-')}`
export const countryRoundId = (iso: string) => `places-${iso.toLowerCase()}`

function placeRound(iso: string): Round {
  const m = metaOf(iso)
  const ps = placesOfCountry(iso)
  return {
    id: `places-${iso.toLowerCase()}`,
    title: m.name,
    blurb: `Capitals, cities, ports and key sites of ${m.name}.`,
    render: isosIn(m.continent),
    askable: [],
    places: ps.map((p) => p.id),
    view: fitAround(m.bounds, ps.map((p) => p.point)),
  }
}

function continentPlaceRound(continent: string): Round {
  const ps = allPlaces.filter((p) => p.continent === continent)
  const isos = isosIn(continent as Continent)
  return {
    id: allPlacesRoundId(continent),
    title: `All of ${continent}`,
    blurb: `Every place in the set — ${ps.length} in total.`,
    render: isos,
    askable: [],
    places: ps.map((p) => p.id),
    view: fitAround(fit(isos), ps.map((p) => p.point)),
  }
}

/**
 * Theme rounds cut the same places a different way — every capital, every
 * port — which is how mapping revision is actually drilled. Types are grouped
 * so a theme is never a one-question round.
 */
const THEMES: { id: string; name: string; blurb: string; types: PlaceType[] }[] = [
  { id: 'capitals', name: 'Capitals', blurb: 'Every capital city.', types: ['capital'] },
  {
    id: 'cities-ports',
    name: 'Cities & Ports',
    blurb: 'Port cities and the cities that matter for other reasons.',
    types: ['city', 'port'],
  },
  {
    id: 'islands',
    name: 'Islands & Territories',
    blurb: 'Islands, island groups and overseas territories.',
    types: ['island', 'island-group', 'territory'],
  },
  {
    id: 'resources',
    name: 'Mines & Resources',
    blurb: 'Mines and resource regions.',
    types: ['mine', 'zone'],
  },
  {
    id: 'facts',
    name: 'Country Facts',
    blurb: 'Landlocked, coastlines, reserves — what each country is known for.',
    types: ['country'],
  },
]

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-')

function themeRound(continent: string, theme: (typeof THEMES)[number]): Round | null {
  const ps = allPlaces.filter(
    (p) => p.continent === continent && theme.types.includes(p.type)
  )
  // A round with a single question is not worth a menu card.
  if (ps.length < 2) return null
  const isos = isosIn(continent as Continent)
  return {
    id: `places-${slug(continent)}-${theme.id}`,
    title: theme.name,
    blurb: theme.blurb,
    render: isos,
    askable: [],
    places: ps.map((p) => p.id),
    view: fitAround(fit(isos), ps.map((p) => p.point)),
  }
}

export function themeRoundsOf(continent: string): Round[] {
  return THEMES.map((t) => themeRound(continent, t)).filter(Boolean) as Round[]
}

/** Countries that have places of their own, in the order the syllabus lists them. */
export function placeCountriesOf(continent: string): string[] {
  const out: string[] = []
  for (const p of allPlaces) {
    if (p.continent !== continent || !p.country) continue
    if (!out.includes(p.country)) out.push(p.country)
  }
  return out
}

export const PLACE_ROUNDS: Record<string, Round> = {}
for (const continent of PLACE_CONTINENTS) {
  const round = continentPlaceRound(continent)
  PLACE_ROUNDS[round.id] = round
  for (const iso of placeCountriesOf(continent)) {
    const r = placeRound(iso)
    PLACE_ROUNDS[r.id] = r
  }
  for (const r of themeRoundsOf(continent)) PLACE_ROUNDS[r.id] = r
}
