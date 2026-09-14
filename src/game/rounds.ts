import { allIsos, meta, metaOf, type Continent } from '../data/countries'

export type BBox = [[number, number], [number, number]]

export interface Round {
  id: string
  title: string
  blurb: string
  /** Geography drawn on the map. */
  render: string[]
  /** Countries the quiz asks for. Differs from `render` only for Island Nations. */
  askable: string[]
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
