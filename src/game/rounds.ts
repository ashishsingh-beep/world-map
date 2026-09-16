import { allIsos, meta, metaOf, type Continent } from '../data/countries'
import { places as allPlaces, syllabusContinents } from '../data/places'

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
 * The places round: every place on the continent, asked in one go.
 *
 * The view must contain every askable place, because panning is clamped to the
 * starting view — a question you cannot scroll to is unanswerable. That is why
 * the box is fitted to the places as well as to the continent, and why South
 * America's reaches out to Easter Island.
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

/**
 * Continents with a syllabus file, in menu order. A file with no places yet is
 * still listed — it shows in the menu as a placeholder rather than vanishing.
 */
const SYLLABUS = syllabusContinents
export const PLACE_CONTINENTS = SYLLABUS.filter((c) => c.section !== 'water')
/** The Seas & Straits section — water features, drawn with their own notation. */
export const WATER_CONTINENTS = SYLLABUS.filter((c) => c.section === 'water')

export const allPlacesRoundId = (continent: string) =>
  `places-${continent.toLowerCase().replace(/\s+/g, '-')}`

function continentPlaceRound({ name, title }: { name: string; title: string }): Round {
  const ps = allPlaces.filter((p) => p.continent === name)
  // Seas and straits span the globe, so their round draws every country.
  const worldwide = name === 'World'
  const isos = worldwide ? allIsos : isosIn(name as Continent)
  return {
    id: allPlacesRoundId(name),
    title,
    blurb: ps.length
      ? `Every place in the set — ${ps.length} in total.`
      : 'Nothing added yet — the notes for this one are still to come.',
    render: isos,
    askable: [],
    places: ps.map((p) => p.id),
    // Antarctic seas and the Arctic sit outside the standard world box, so the
    // water round stretches it to reach them — an unreachable question is
    // unanswerable, since panning is clamped to the starting view.
    view: fitAround(
      worldwide ? (VIEW_OVERRIDES.world as BBox) : fit(isos),
      ps.map((p) => p.point)
    ),
  }
}

export const PLACE_ROUNDS: Record<string, Round> = {}
for (const continent of SYLLABUS) {
  const round = continentPlaceRound(continent)
  PLACE_ROUNDS[round.id] = round
}
