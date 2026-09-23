import { allIsos, meta, metaOf, renderOnlyIsos, type Continent } from '../data/countries'
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
  /** Which atlas the round is drawn on: the world map or the Indian one. */
  atlas?: 'world' | 'india'
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
/**
 * The Indian map's frame: the whole of India with the neighbours that surround
 * it. Fixed rather than fitted, so every Indian round — mountains now, rivers
 * and the rest later — opens on the same recognisable map.
 */
const INDIA_VIEW: BBox = [
  [66, 5],
  [98, 38],
]

const VIEW_OVERRIDES: Partial<Record<string, BBox>> = {
  world: [
    [-180, -58],
    [180, 84],
  ],
  europe: [
    [-26, 33],
    [46, 72],
  ],
  /**
   * Oceania crosses the antimeridian, so its east is past 180 and `MapCanvas`
   * turns the globe to suit. Fitting to its members cannot express that: Tonga
   * and Samoa are at -176 and -172, Tuvalu at 179, so a plain min/max frame
   * runs -176 to 180 — the whole planet — and the round drew Australia hard
   * against one edge with Samoa, Tonga and Kiribati against the other.
   *
   * 110°E reaches past Australia's west coast, 210°E (that is, 150°W) past
   * Kiribati's Line Islands, and -50° past the bottom of New Zealand.
   */
  oceania: [
    [110, -50],
    [210, 22],
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
    // Context geography is always drawn and never askable, so it rides along
    // with `render` while `askable` stays the quiz set.
    render: [...(opts.render ?? isos), ...renderOnlyIsos],
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
  oceania: round('oceania', 'Oceania Map', 'Island nations across the Pacific.', isosIn('Oceania'), {
    // Maritime South-East Asia as context, or the western third of the frame
    // is open sea where everyone expects Indonesia. Drawn, never asked.
    render: [...isosIn('Oceania'), 'IDN', 'PHL', 'MYS', 'BRN', 'TLS'],
  }),
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
export const PLACE_CONTINENTS = SYLLABUS.filter(
  (c) => c.section !== 'water' && c.section !== 'mountains'
)
/** The Indian map's sections — mountains for now, more to come. */
export const INDIA_CONTINENTS = SYLLABUS.filter((c) => c.atlas === 'india')
/** The Seas & Straits section — water features, drawn with their own notation. */
export const WATER_CONTINENTS = SYLLABUS.filter((c) => c.section === 'water')

export const allPlacesRoundId = (continent: string) =>
  `places-${continent.toLowerCase().replace(/\s+/g, '-')}`

function continentPlaceRound({
  name,
  title,
  atlas,
}: {
  name: string
  title: string
  atlas?: 'world' | 'india'
}): Round {
  const ps = allPlaces.filter((p) => p.continent === name)
  // Seas and straits span the globe, so their round draws every country.
  const worldwide = name === 'World'
  // The Himalaya runs through five countries, so its round draws the whole
  // neighbourhood and lets the state outlines do the locating.
  // The Indian map is India plus only the neighbours that frame it — enough
  // context for the mountains, rivers and coasts to sit against, and no more.
  const isos =
    atlas === 'india'
      ? ['IND', 'PAK', 'NPL', 'BTN', 'CHN', 'BGD', 'AFG', 'MMR', 'LKA']
      : worldwide
        ? allIsos
        : isosIn(name as Continent)
  return {
    id: allPlacesRoundId(name),
    title,
    atlas,
    blurb: ps.length
      ? `Every place in the set — ${ps.length} in total.`
      : 'Nothing added yet — the notes for this one are still to come.',
    render: [...isos, ...renderOnlyIsos],
    askable: [],
    places: ps.map((p) => p.id),
    // Antarctic seas and the Arctic sit outside the standard world box, so the
    // water round stretches it to reach them — an unreachable question is
    // unanswerable, since panning is clamped to the starting view.
    /**
     * The Indian map always frames the whole country, whatever the round is
     * about: Kanyakumari to Ladakh, with the neighbours that touch it. Fitting
     * to the round's own features instead would give the mountains a
     * Himalaya-shaped letterbox and leave nowhere for the rivers to go.
     */
    view:
      atlas === 'india'
        ? INDIA_VIEW
        : fitAround(
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

/**
 * A round by id, or null. Null rather than a throw because ids now come from
 * the URL, where anyone can type one that does not exist.
 */
export function roundById(id: string): Round | null {
  return ROUNDS[id] ?? PLACE_ROUNDS[id] ?? null
}
