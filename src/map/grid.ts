import dateLine from '../data/dateline.json'

/**
 * The reference lines the grid switch adds to every map: the faint graticule
 * itself, and the five lines a geography syllabus names, picked out in colour.
 *
 * The Tropics are at 23°26′, the obliquity of the ecliptic now; Natural
 * Earth's own Tropics sit at 23.56° and are not used. Only the Date Line comes
 * from data (`npm run data` writes it, stitched pole to pole and checked island
 * by island), because it is the one that is not a straight line.
 */

export const TROPIC_LAT = 23 + 26 / 60

export interface ReferenceLine {
  id: string
  name: string
  /** What the line is at, for its label: 23°26′N, 0°, 180°. */
  at: string
  /** Lines of latitude are labelled at the map's left edge, meridians near its foot. */
  runs: 'parallel' | 'meridian'
  colour: string
  dash?: string
  coordinates: [number, number][]
}

/** Every degree, so d3 walks a parallel along it rather than a great circle. */
const parallel = (lat: number): [number, number][] =>
  Array.from({ length: 361 }, (_, i) => [i - 180, lat] as [number, number])

const meridian = (lon: number): [number, number][] =>
  Array.from({ length: 181 }, (_, i) => [lon, i - 90] as [number, number])

export const REFERENCE_LINES: ReferenceLine[] = [
  { id: 'equator', name: 'Equator', at: '0°', runs: 'parallel', colour: '#dc2626', coordinates: parallel(0) },
  {
    id: 'cancer',
    name: 'Tropic of Cancer',
    at: '23°26′N',
    runs: 'parallel',
    colour: '#d97706',
    dash: '7 4',
    coordinates: parallel(TROPIC_LAT),
  },
  {
    id: 'capricorn',
    name: 'Tropic of Capricorn',
    at: '23°26′S',
    runs: 'parallel',
    colour: '#d97706',
    dash: '7 4',
    coordinates: parallel(-TROPIC_LAT),
  },
  {
    id: 'prime',
    name: 'Prime Meridian',
    at: '0° · GMT',
    runs: 'meridian',
    colour: '#1d4ed8',
    coordinates: meridian(0),
  },
  {
    id: 'date-line',
    name: 'International Date Line',
    at: '180°',
    runs: 'meridian',
    colour: '#7e22ce',
    coordinates: dateLine.geometry.coordinates as [number, number][],
  },
]

/** Graticule spacings to choose from, finest first; 15° is an hour of time. */
export const GRID_STEPS = [1, 2, 5, 10, 15, 30]

export const formatLat = (lat: number) => (lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`)

export const formatLon = (lon: number) => {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180
  return l === 0 || l === -180 ? `${Math.abs(l)}°` : `${Math.abs(l)}°${l > 0 ? 'E' : 'W'}`
}
