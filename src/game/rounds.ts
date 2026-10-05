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
  /**
   * Political Map rounds only: the scope (`world`, `africa`…), and the tighter
   * frame to use when only countries are asked. `view` is then the frame for
   * the places too, which can reach further — Oceania's to Easter Island.
   */
  scope?: string
  countryView?: BBox
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

/**
 * The world, cut at 168.75°W rather than down the 180th, so Samoa and Tonga sit
 * on the right with Fiji and the rest of the Pacific instead of alone on the
 * far left. Nothing gives a clean cut east of Samoa: St Lawrence Island, the
 * Aleutians and Alaska overlap in longitude all the way along. At 168.75°W the
 * nearest of them ends within a kilometre either side, too thin to see, and
 * Chukotka comes back whole beside the rest of Russia.
 */
export const WORLD_VIEW: BBox = [
  [-168.75, -58],
  [191.25, 84],
]

const VIEW_OVERRIDES: Partial<Record<string, BBox>> = {
  world: WORLD_VIEW,
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
  const [[w0, s0], [e0, n0]] = bounds
  // A frame written past 180 (the world, Oceania) spans w0 to w0 + 360: a point
  // west of it belongs on its eastern side, and 180 is no longer the wall.
  const crosses = e0 > 180
  let [w, s, e, n] = [w0, s0, e0, n0]
  for (const [raw, lat] of points) {
    const lon = crosses && raw < w0 ? raw + 360 : raw
    w = Math.min(w, lon)
    s = Math.min(s, lat)
    e = Math.max(e, lon)
    n = Math.max(n, lat)
  }
  const [lo, hi] = crosses ? [e0 - 360, w0 + 360] : [-180, 180]
  return [
    [Math.max(lo, w - pad), Math.max(-90, s - pad)],
    [Math.min(hi, e + pad), Math.min(90, n + pad)],
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

/**
 * Countries a places round draws beyond its own continent's members.
 *
 * Russia is filed as European for the country rounds — right there, wrong
 * here: the Asia places round reaches Kamchatka, Sakhalin, the Kuril Islands
 * and the Trans-Siberian Railway's own ends, all of it Russian, and without
 * Russia drawn those places are patches and pins floating in open sea with no
 * land under them.
 */
const EXTRA_RENDER: Partial<Record<string, string[]>> = {
  Asia: ['RUS'],
}

/**
 * Africa's places frame, set by hand: Cape Verde to Mauritius, the Cape to
 * Gibraltar. Fitted to its members it reached Rodrigues and the Prince Edward
 * Islands, which added nothing but ocean.
 */
const AFRICA_PLACES_VIEW: BBox = [
  [-26, -37],
  [60, 40],
]

/**
 * Oceania's places frame: the whole of the notes' map, Australia in the west
 * to the Polynesian triangle's corners at Hawaii and Easter Island, which the
 * country round's frame stops well short of. Written east past 180.
 */
const OCEANIA_PLACES_VIEW: BBox = [
  [108, -52],
  [258, 32],
]

/**
 * Whether a country's bounds reach into a frame, minding the antimeridian twice
 * over: a country can wrap it (Fiji, the USA), and so can a frame written east
 * past 180 (Oceania's), where Samoa at -172 is really at 188.
 */
function touches(iso: string, [[w, s], [e, n]]: BBox) {
  const [[cw, cs], [ce, cn]] = metaOf(iso).bounds
  if (cs > n || cn < s) return false
  const overlaps = (a: number, b: number) => b >= w && a <= e
  if (cw > ce) return overlaps(cw, ce + 360) || overlaps(cw - 360, ce)
  return overlaps(cw, ce) || overlaps(cw + 360, ce + 360)
}

/**
 * Africa's places round draws whatever else its frame shows, never asked:
 * Ceuta faces Spain, Sinai runs up to Israel and the Horn looks across at
 * Arabia, and with those shores left blank the notes' own landmarks sit beside
 * open sea.
 */
const CONTEXT_IN_VIEW: Partial<Record<string, BBox>> = {
  Africa: AFRICA_PLACES_VIEW,
  Oceania: OCEANIA_PLACES_VIEW,
}

/**
 * A places round's frame before its own places stretch it. Fitting Europe to
 * its members reaches Russia's Pacific coast, as the country round found; it
 * starts from that round's hand-set frame instead, and Greenland, Svalbard and
 * Jan Mayen then widen it only as far as they need.
 */
const PLACE_BASE_VIEW: Partial<Record<string, BBox>> = {
  Europe: VIEW_OVERRIDES.europe,
  Africa: AFRICA_PLACES_VIEW,
  Oceania: OCEANIA_PLACES_VIEW,
}

function contextIn(name: string): string[] {
  const view = CONTEXT_IN_VIEW[name]
  if (!view) return []
  return allIsos.filter((iso) => meta[iso].continent !== name && touches(iso, view))
}

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
        : [
            ...isosIn(name as Continent),
            ...(EXTRA_RENDER[name] ?? []),
            ...contextIn(name),
          ]
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
            worldwide ? (VIEW_OVERRIDES.world as BBox) : (PLACE_BASE_VIEW[name] ?? fit(isos)),
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
 * The Political Map: countries and the places inside them in one round, by
 * scope — the whole world or one continent. What it asks is narrowed on setup
 * by section (countries, capitals, regions, other places), so the country and
 * places rounds it replaces are its arguments, not separate menus.
 */
export const POLITICAL_SCOPES = [
  { id: 'world', label: 'World', continent: null },
  { id: 'africa', label: 'Africa', continent: 'Africa' },
  { id: 'asia', label: 'Asia', continent: 'Asia' },
  { id: 'europe', label: 'Europe', continent: 'Europe' },
  { id: 'north-america', label: 'North America', continent: 'North America' },
  { id: 'south-america', label: 'South America', continent: 'South America' },
  { id: 'oceania', label: 'Oceania', continent: 'Oceania' },
] as const

export const politicalRoundId = (scope: string) => `political-${scope}`

function politicalRound(scope: (typeof POLITICAL_SCOPES)[number]): Round {
  const countries = ROUNDS[scope.id]
  const placesRound = scope.continent ? PLACE_ROUNDS[allPlacesRoundId(scope.continent)] : null
  const places = placesRound
    ? (placesRound.places ?? [])
    : allPlaces.filter((p) => p.section === 'places' && p.atlas === 'world').map((p) => p.id)
  return {
    id: politicalRoundId(scope.id),
    title: scope.label,
    blurb: 'Countries, capitals and key places, together on one map.',
    render: [...new Set([...countries.render, ...(placesRound?.render ?? [])])],
    askable: countries.askable,
    places,
    view: placesRound
      ? placesRound.view
      : fitAround(WORLD_VIEW, places.map((id) => allPlaces.find((p) => p.id === id)!.point)),
    countryView: countries.view,
    scope: scope.id,
  }
}

export const POLITICAL_ROUNDS: Record<string, Round> = {}
for (const scope of POLITICAL_SCOPES) {
  const round = politicalRound(scope)
  POLITICAL_ROUNDS[round.id] = round
}

/**
 * Where an old link now lives. The country rounds (`#/europe`) and the world
 * atlas's places rounds (`#/places-europe`) are both the Political Map now; the
 * Seas & Straits and India rounds keep their own ids.
 */
export function canonicalRoundId(id: string): string {
  if (POLITICAL_ROUNDS[id]) return id
  if (ROUNDS[id]) return politicalRoundId(id)
  // Only a world-atlas places round: `places-world` is Seas & Straits, whose
  // continent happens to be called World, and keeps its own round.
  const r = PLACE_ROUNDS[id]
  const isPlaces = r?.atlas !== 'india' && !!r?.places?.length &&
    r.places.every((pid) => allPlaces.find((p) => p.id === pid)?.section === 'places')
  const scope = id.replace(/^places-/, '')
  if (isPlaces && POLITICAL_ROUNDS[politicalRoundId(scope)]) return politicalRoundId(scope)
  return id
}

/**
 * A round by id, or null. Null rather than a throw because ids now come from
 * the URL, where anyone can type one that does not exist.
 */
export function roundById(id: string): Round | null {
  return POLITICAL_ROUNDS[id] ?? ROUNDS[id] ?? PLACE_ROUNDS[id] ?? null
}
