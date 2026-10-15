import { useEffect, useMemo, useState } from 'react'
import { feature } from 'topojson-client'
import { geoArea } from 'd3-geo'
import type { Feature, Polygon } from 'geojson'
import { MapCanvas, type MapIsoline, type MapLabel, type MapPatch, type MapWind } from '../map/MapCanvas'
import { renderIsos } from '../data/countries'
import { WORLD_VIEW } from '../game/rounds'
import { useBare } from '../app/useBare'

/**
 * The climate map, for Learn only: where the Mediterranean, desert and
 * Sudan-type climates are, as patches over a physical world map. The regions
 * are the Köppen-Geiger classes of Beck et al. (2023) for 1991–2020, made into
 * polygons at build time (scripts/climate.mjs); what each card says is the
 * textbook's account of the climate.
 */
type ClimateId = 'equatorial' | 'mediterranean' | 'desert-hot' | 'desert-cold' | 'sudan'

interface Climate {
  id: ClimateId
  name: string
  koppen: string
  fill: string
  summary: string
  notes: string[]
}

const CLIMATES: Climate[] = [
  {
    id: 'equatorial',
    name: 'Equatorial',
    koppen: 'Af',
    fill: '#047857',
    summary:
      'Hot and wet every month of the year: no dry season, a thunderstorm most afternoons, and temperatures that barely change — the monotony of the equatorial lands.',
    notes: [
      'Within about 5°–10° of the Equator, under the ITCZ the whole year',
      'The Amazon Basin, the heart of the Congo Basin, the east coast of Madagascar, and the Indo-Malaysian lands — Malaysia, Indonesia, the southern Philippines and New Guinea',
      "Around them the Guinea coast, the outer Amazon and coastal Myanmar are monsoon rainforest (Köppen Am): forest still, but with a short dry season, so not shaded here",
      'About 27°C all year, an annual range of only 2°–3°C; over 1,500mm of rain, often 2,000mm or more, spread through the year (Köppen: at least 60mm even in the driest month)',
      'Convectional rain: the hot, moist air rises by midday and breaks in heavy afternoon thunderstorms',
      'The tropical rainforest, the selvas: tall evergreen hardwoods such as mahogany, ebony and greenheart, in layers, laced with lianas and epiphytes',
    ],
  },
  {
    id: 'mediterranean',
    name: 'Mediterranean',
    koppen: 'Csa · Csb',
    fill: '#7c3aed',
    summary:
      'Hot, dry summers and mild, rainy winters — the one climate whose rain comes in winter, brought by the westerlies.',
    notes: [
      'On the western margins of the continents, about 30°–45° north and south',
      'The Mediterranean Basin, central California, central Chile, the Cape in South Africa, and south-west and south Australia',
      'Summer lies under the dry, offshore trade winds; in winter the westerlies bring cyclonic rain',
      'Evergreen trees and shrubs with thick bark and waxy leaves — the maquis, the chaparral',
      "The 'orchard lands of the world': citrus fruit, grapes, olives and figs",
    ],
  },
  {
    id: 'desert-hot',
    name: 'Hot desert',
    koppen: 'BWh',
    fill: '#ea580c',
    summary:
      'Under 250mm of rain a year, and that unreliable; the highest day temperatures on Earth and the greatest range between day and night.',
    notes: [
      'About 15°–30° north and south, on the western sides of the continents',
      'Under the subtropical high-pressure belts, where the trade winds blow offshore and dry',
      'Cold currents chill the coastal air: the Peru (Humboldt) off the Atacama, the Benguela off the Namib, the Canaries off the western Sahara',
      'The Sahara, the Arabian, the Thar, the Kalahari and Namib, the Great Australian, the Sonoran and Mojave, the Atacama',
    ],
  },
  {
    id: 'desert-cold',
    name: 'Cold desert',
    koppen: 'BWk',
    fill: '#f9a8d4',
    summary:
      'The mid-latitude deserts: as dry as the hot ones, but far inland or in a mountain rain shadow, with hot summers and bitterly cold winters.',
    notes: [
      'Continental interiors, too far from the sea for moist winds to reach, or shut off by mountains',
      'The Gobi and the Taklamakan, Turkestan (the Karakum and Kyzylkum), Patagonia, the Great Basin, and Ladakh',
    ],
  },
  {
    id: 'sudan',
    name: 'Sudan type',
    koppen: 'Aw',
    fill: '#65a30d',
    summary:
      'The tropical savanna: hot all year, with rain in the hot season and a long dry season — between the equatorial forests and the hot deserts.',
    notes: [
      'About 5°–20° north and south of the Equator',
      'Named for the Sudan belt of Africa, where it is best developed',
      'Tall grass — elephant grass — with scattered trees such as acacia and baobab; the big-game country of Africa',
      'The Sudan belt and East Africa, the Llanos of the Orinoco and the Campos of Brazil, northern Australia',
      'Not peninsular India or mainland South-East Asia: Köppen classes much of them Aw too, but the textbook treats them as the Tropical Monsoon climate, with its own seasonal reversal of the winds',
    ],
  },
]

/**
 * The planetary pressure belts and the trade winds, at the three times of year
 * the trades behave differently — computed at build time from NOAA's 1991–2020
 * means (scripts/winds.mjs): the belts' latitudes from sea-level pressure, the
 * ITCZ from the tropical rain belt, the arrows from the surface wind.
 */
type SeasonId = 'january' | 'march' | 'july' | 'september'
/** Which planetary wind belt an arrow blows in, as the build tags it. */
type WindBelt = 0 | 1 | 2
interface Season {
  belts: { subtropicalNorth: number; subtropicalSouth: number; subpolarNorth: number; subpolarSouth: number }
  itcz: [number, number][]
  /** [i, j, lon, lat, u, v, belt] */
  winds: [number, number, number, number, number, number, WindBelt][]
  names: { text: string; at: [number, number]; belt: WindBelt }[]
}

/**
 * The three planetary wind belts, each in its own ink. An arrow takes the ink
 * of the belt it stands in, never of the way it points: the arrows show what
 * the wind does there, even where that is not what the belt's name says. Navy
 * trades; the westerlies a forest green and the polar easterlies a violet,
 * apart from the climates' colours where they share ground.
 */
const WIND_BELTS: { belt: WindBelt; name: string; ink: string; account: string }[] = [
  { belt: 0, name: 'Trade winds', ink: '#0f172a', account: '' },
  {
    belt: 1,
    name: 'Westerlies',
    ink: '#166534',
    account:
      "From the subtropical highs towards the subpolar lows, turned east by the Earth's rotation: south-westerly in the north, north-westerly in the south. Over the unbroken Southern Ocean they blow from the west all the way round, the strongest winds of any belt, all year: the Roaring Forties. In the north the continents break them up; over the oceans they blow hardest in winter, and round the Aleutian and Icelandic lows the winds circle the lows.",
  },
  {
    belt: 2,
    name: 'Polar easterlies',
    ink: '#6d28d9',
    account:
      "Cold air flowing out of the polar highs towards the subpolar lows, turned west. Along East Antarctica's coast they blow from the east and south-east all year; in the Amundsen and Bellingshausen Seas the trough lies further south, and that coast has westerlies. The Arctic's are weak and broken: north-easterly over the Chukchi Sea in winter and spring, while in winter the air pours north off Siberia's cold high and the Atlantic's south-westerlies reach on past Norway. In summer the Arctic's winds are too light to show.",
  },
]

const SEASONS: { id: SeasonId; name: string; caption: string }[] = [
  {
    id: 'january',
    name: 'January',
    caption:
      'In January the ITCZ swings south. The north-east trades cross the Equator the other way — over India they are the north-east monsoon — and arrive in northern Australia from the north-west: the north-west monsoon.',
  },
  {
    id: 'march',
    name: 'March',
    caption:
      'In March, at the spring equinox, the sun is overhead at the Equator. The north-east and south-east trades blow from the subtropical highs towards the ITCZ — just north of the Equator over the open oceans, still south of it over the Indian Ocean.',
  },
  {
    id: 'july',
    name: 'July',
    caption:
      "In July the ITCZ follows the sun north, furthest over the land. The south-east trades cross the Equator and, turned by the Earth's rotation, reach South Asia from the south-west: the south-west monsoon.",
  },
  {
    id: 'september',
    name: 'September',
    caption:
      'In September, at the autumn equinox, the sun is again overhead at the Equator, but the land and the sea lag behind it: the ITCZ still lies north over South Asia, and the south-west monsoon is still blowing there, only beginning to retreat. It is not the mirror of March.',
  },
]

type BeltKind = 'itcz' | 'subtropical' | 'subpolar' | 'polar'

const BELTS: Record<BeltKind, { name: string; fill: string; ink: string; summary: string; notes: string[] }> = {
  itcz: {
    name: 'ITCZ — the Doldrums',
    fill: '#dc2626',
    ink: '#b91c1c',
    summary:
      'The Inter-Tropical Convergence Zone: the equatorial low, where the trade winds of the two hemispheres meet, the hot air rises, and heavy convectional rain falls most afternoons. Calm and sultry — the doldrums of the sailing ships.',
    notes: [
      'Traced where the trades meet: where the surface winds converge and the pressure is lowest, with the rain their meeting brings',
      'Follows the overhead sun, a little behind it: north in July, south in January',
      'Swings furthest over the continents, which heat and cool faster than the sea — in July to the monsoon trough across northern India and to the heat lows of the Sahara and Arabia, in January well south of the Equator over southern Africa and northern Australia',
    ],
  },
  subtropical: {
    name: 'Subtropical high — the Horse Latitudes',
    fill: '#ca8a04',
    ink: '#854d0e',
    summary:
      'Air that rose at the Equator sinks here, warming as it falls: dry, settled weather and clear skies. Its calms held sailing ships for weeks — the horse latitudes.',
    notes: [
      'Where the trade winds blow from, towards the Equator, and the westerlies towards the poles',
      "On the continents' western sides it is the belt of the world's hot deserts",
      'Moves with the sun: north in July, south in January',
    ],
  },
  subpolar: {
    name: 'Subpolar low',
    fill: '#2563eb',
    ink: '#1e40af',
    summary:
      'Where the mild westerlies meet the cold polar easterlies: the warm air is forced up along the polar front, and depressions — temperate cyclones — form one after another, bringing changeable, stormy weather.',
    notes: [
      'In the south, over the unbroken Southern Ocean, one continuous trough',
      'In the north broken by the continents into the Aleutian and Icelandic lows, deepest in winter',
    ],
  },
  polar: {
    name: 'Polar high',
    fill: '#64748b',
    ink: '#334155',
    summary:
      'Cold, dense air sinks over the poles into a shallow high, from which the polar easterlies blow out towards the subpolar lows.',
    notes: [
      'Drawn as the zone poleward of 80°: sea-level pressure over the ice caps cannot be read reliably, so it is not traced from the data like the other belts',
    ],
  },
}

const BELT_IDS: Record<string, BeltKind> = {
  'belt-itcz': 'itcz',
  'belt-st-n': 'subtropical',
  'belt-st-s': 'subtropical',
  'belt-sp-n': 'subpolar',
  'belt-sp-s': 'subpolar',
  'belt-ph-n': 'polar',
  'belt-ph-s': 'polar',
}

let loadW: Promise<Record<SeasonId, Season>> | null = null
const loadWinds = () =>
  (loadW ??= import('../data/winds.json').then((m) => m.default as unknown as Record<SeasonId, Season>))

/** A ring the way d3-geo reads a polygon: the small side inside, not the rest of the globe. */
function polygon(ring: [number, number][]): Polygon {
  const p: Polygon = { type: 'Polygon', coordinates: [ring] }
  return geoArea(p) > 2 * Math.PI ? { type: 'Polygon', coordinates: [[...ring].reverse()] } : p
}

/**
 * A belt round the globe between two edges, each a latitude for every degree
 * of longitude, cut into four quarters — a ring all the way round would close
 * on itself — and stepped a degree at a time so its edges follow the
 * parallels instead of bowing along great circles.
 */
function beltFeature(south: (lon: number) => number, north: (lon: number) => number): Feature {
  const quarters = [-180, -90, 0, 90].map((w) => {
    const lons = Array.from({ length: 91 }, (_, k) => w + k)
    const ring: [number, number][] = [
      ...lons.map((lon): [number, number] => [lon, south(lon)]),
      ...[...lons].reverse().map((lon): [number, number] => [lon, north(lon)]),
    ]
    ring.push(ring[0])
    return polygon(ring).coordinates
  })
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: quarters } }
}

/** The ITCZ's latitude at any longitude, between its 2.5° points. */
const along = (line: [number, number][]) => (lon: number) => {
  const k = line.findIndex(([x]) => x >= lon)
  if (k <= 0) return line[0][1]
  const [[x0, y0], [x1, y1]] = [line[k - 1], line[k]]
  return y0 + ((lon - x0) / (x1 - x0)) * (y1 - y0)
}

/** Where each belt's name is written: over the three oceans. */
const NAME_LONS = [-150, -35, 75]
const ITCZ_NAME_LONS = [-115, 20, 150]
const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}`

/**
 * The equatorial regions' names, written on the patch as the textbook's map
 * names them. `npm run data` checks each point lies inside the Af patch.
 */
const EQUATORIAL_LABELS: { at: [number, number]; text: string }[] = [
  { at: [-63, -3], text: 'Amazon Basin' },
  { at: [21, 0.5], text: 'Congo Basin' },
  { at: [112, 1], text: 'Indo-Malaysian' },
]
const EQUATORIAL_INK = '#064e3b'

let load: Promise<Map<ClimateId, Feature>> | null = null
const loadClimate = () =>
  (load ??= import('../data/climate.topo.json').then((m) => {
    const topo = m.default as never as { objects: { climate: never } }
    const fc = feature(topo as never, topo.objects.climate) as unknown as { features: Feature[] }
    return new Map(fc.features.map((f) => [f.id as ClimateId, f]))
  }))

export function ClimateScreen({ onExit }: { onExit: () => void }) {
  const bare = useBare()
  const [regions, setRegions] = useState<Map<ClimateId, Feature> | null>(null)
  const [shown, setShown] = useState<Record<ClimateId, boolean>>({
    equatorial: true,
    mediterranean: true,
    'desert-hot': true,
    'desert-cold': true,
    sudan: true,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [seasons, setSeasons] = useState<Record<SeasonId, Season> | null>(null)
  const [beltsOn, setBeltsOn] = useState(false)
  const [windsOn, setWindsOn] = useState<Record<WindBelt, boolean>>({ 0: false, 1: false, 2: false })
  const anyWinds = windsOn[0] || windsOn[1] || windsOn[2]
  const [seasonId, setSeasonId] = useState<SeasonId>('march')

  useEffect(() => {
    let live = true
    loadClimate().then((r) => live && setRegions(r))
    return () => {
      live = false
    }
  }, [])
  // The winds are loaded the first time either switch is turned on.
  useEffect(() => {
    if (!beltsOn && !anyWinds) return
    let live = true
    loadWinds().then((w) => live && setSeasons(w))
    return () => {
      live = false
    }
  }, [beltsOn, anyWinds])

  const season = seasons?.[seasonId] ?? null
  const seasonInfo = SEASONS.find((x) => x.id === seasonId)!

  /** The belts as bands: under the climates, a faint wash with dashed edges. */
  const beltPatches: MapPatch[] = useMemo(() => {
    if (!beltsOn || !season) return []
    const { belts, itcz } = season
    const at = along(itcz)
    const flat = (lat: number) => () => lat
    const band = (id: string, kind: BeltKind, south: (lon: number) => number, north: (lon: number) => number): MapPatch => ({
      id,
      feature: beltFeature(south, north),
      fill: BELTS[kind].fill,
      opacity: kind === 'polar' ? 0.22 : 0.16,
      outline: false,
      selected: selected === id,
    })
    return [
      band('belt-ph-n', 'polar', flat(80), flat(90)),
      band('belt-ph-s', 'polar', flat(-90), flat(-80)),
      band('belt-sp-n', 'subpolar', flat(belts.subpolarNorth - 5), flat(belts.subpolarNorth + 5)),
      band('belt-sp-s', 'subpolar', flat(belts.subpolarSouth - 5), flat(belts.subpolarSouth + 5)),
      band('belt-st-n', 'subtropical', flat(belts.subtropicalNorth - 5), flat(belts.subtropicalNorth + 5)),
      band('belt-st-s', 'subtropical', flat(belts.subtropicalSouth - 5), flat(belts.subtropicalSouth + 5)),
      band('belt-itcz', 'itcz', (lon) => at(lon) - 4, (lon) => at(lon) + 4),
    ]
  }, [beltsOn, season, selected])

  const climatePatches: MapPatch[] = useMemo(
    () =>
      CLIMATES.filter((c) => shown[c.id] && regions?.get(c.id)).map((c) => ({
        id: c.id,
        feature: regions!.get(c.id)!,
        fill: c.fill,
        selected: selected === c.id,
      })),
    [regions, shown, selected]
  )

  /**
   * The ITCZ's own line, and every belt's edges: drawn as lines round the
   * globe, not as the bands' outlines, which would also stroke the seams
   * where a band's quarters meet.
   */
  const beltLines: MapIsoline[] = useMemo(() => {
    if (!beltsOn || !season) return []
    const { belts, itcz } = season
    const at = along(itcz)
    const lons = Array.from({ length: 181 }, (_, k) => -180 + k * 2)
    const edge = (id: string, kind: BeltKind, lat: (lon: number) => number): MapIsoline => ({
      id,
      line: lons.map((lon): [number, number] => [lon, lat(lon)]),
      color: BELTS[kind].fill,
      dashed: true,
      width: 1,
    })
    const flat = (id: string, kind: BeltKind, mid: number) => [
      edge(`${id}-s`, kind, () => mid - 5),
      edge(`${id}-n`, kind, () => mid + 5),
    ]
    return [
      edge('ph-n', 'polar', () => 80),
      edge('ph-s', 'polar', () => -80),
      ...flat('sp-n', 'subpolar', belts.subpolarNorth),
      ...flat('sp-s', 'subpolar', belts.subpolarSouth),
      ...flat('st-n', 'subtropical', belts.subtropicalNorth),
      ...flat('st-s', 'subtropical', belts.subtropicalSouth),
      edge('itcz-s', 'itcz', (lon) => at(lon) - 4),
      edge('itcz-n', 'itcz', (lon) => at(lon) + 4),
      { id: 'itcz', line: itcz, color: BELTS.itcz.fill, dashed: true, width: 2.4 },
    ]
  }, [beltsOn, season])

  const notes: MapLabel[] = useMemo(() => {
    const out: MapLabel[] = []
    // The winds' names first: where room is short, they are the ones kept.
    if (season) for (const n of season.names) if (windsOn[n.belt]) out.push({ at: n.at, text: n.text, color: WIND_BELTS[n.belt].ink })
    // Then the equatorial regions' names, as the textbook's map writes them.
    if (shown.equatorial && regions) for (const l of EQUATORIAL_LABELS) out.push({ ...l, color: EQUATORIAL_INK, caps: true })
    if (beltsOn && season) {
      const { belts, itcz } = season
      const at = along(itcz)
      // Clear of the trades' own names, which sit at the checked points.
      for (const lon of ITCZ_NAME_LONS) out.push({ at: [lon, at(lon) + 2.2], text: 'ITCZ', color: BELTS.itcz.ink, caps: true })
      for (const lon of NAME_LONS) {
        out.push({ at: [lon, belts.subtropicalNorth], text: 'Subtropical high', color: BELTS.subtropical.ink, caps: true })
        out.push({ at: [lon, belts.subtropicalSouth], text: 'Subtropical high', color: BELTS.subtropical.ink, caps: true })
        out.push({ at: [lon, belts.subpolarNorth], text: 'Subpolar low', color: BELTS.subpolar.ink, caps: true })
        out.push({ at: [lon, belts.subpolarSouth], text: 'Subpolar low', color: BELTS.subpolar.ink, caps: true })
        out.push({ at: [lon, 84], text: 'Polar high', color: BELTS.polar.ink, caps: true })
        out.push({ at: [lon, -84], text: 'Polar high', color: BELTS.polar.ink, caps: true })
      }
    }
    return out
  }, [season, beltsOn, windsOn, shown.equatorial, regions])

  const arrows: MapWind[] | undefined = useMemo(
    () =>
      season && anyWinds
        ? season.winds.filter((w) => windsOn[w[6]]).map(([i, j, lon, lat, u, v, b]) => [i, j, lon, lat, u, v, WIND_BELTS[b].ink])
        : undefined,
    [season, windsOn, anyWinds]
  )

  const card = CLIMATES.find((c) => c.id === selected && shown[c.id])
  const beltKind = selected && beltsOn ? BELT_IDS[selected] : undefined
  const belt = beltKind ? BELTS[beltKind] : undefined
  /** The season's own latitudes, for the belt's card. */
  const beltWhere =
    season && beltKind
      ? beltKind === 'subtropical'
        ? `${seasonInfo.name}: about ${fmtLat(season.belts.subtropicalNorth)} and ${fmtLat(season.belts.subtropicalSouth)}`
        : beltKind === 'subpolar'
          ? `${seasonInfo.name}: about ${fmtLat(season.belts.subpolarNorth)} and ${fmtLat(season.belts.subpolarSouth)}`
          : beltKind === 'polar'
            ? 'Poleward of 80°N and 80°S'
            : `${seasonInfo.name}: from ${fmtLat(Math.min(...season.itcz.map((c) => c[1])))} to ${fmtLat(Math.max(...season.itcz.map((c) => c[1])))}`
      : null

  const toggle = (on: boolean, set: (v: boolean) => void, label: string, ink?: string) => (
    <label
      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
        on ? 'text-slate-800' : 'text-slate-500'
      }`}
    >
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />
      {ink && <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: ink, opacity: on ? 1 : 0.4 }} />}
      {label}
    </label>
  )

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={renderIsos}
        askable={[]}
        states={{}}
        view={WORLD_VIEW}
        countryMarkers={false}
        physical
        patches={[...beltPatches, ...climatePatches]}
        isolines={beltLines}
        winds={arrows}
        notes={notes}
        onPatch={(id) => setSelected((s) => (s === id ? null : id))}
        onDeselect={() => setSelected(null)}
        credit={`Climate: Köppen-Geiger, Beck et al. (2023), 1991–2020${beltsOn || anyWinds ? ' · Winds and pressure: NCEP/NCAR reanalysis; rain: GPCP (NOAA PSL), 1991–2020' : ''}`}
        bare={bare}
      />

      {!bare.on && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto rounded-xl bg-white px-4 py-3 shadow-lg">
              <div className="font-extrabold text-slate-900">Climate</div>
              <div className="text-xs font-semibold text-slate-500">Tap a region or a belt for its account</div>
            </div>
            <button
              type="button"
              onClick={onExit}
              aria-label="Close"
              className="pointer-events-auto cursor-pointer rounded-xl bg-white px-4 py-3 text-lg font-bold text-slate-900 shadow-lg"
            >
              ✕
            </button>
          </div>
          <div className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
            {CLIMATES.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
                  shown[c.id] ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={shown[c.id]}
                  onChange={(e) => setShown((s) => ({ ...s, [c.id]: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <span
                  className={`inline-block h-3 w-4 rounded-sm ${shown[c.id] ? '' : 'opacity-40'}`}
                  style={{ background: c.fill, opacity: shown[c.id] ? 0.85 : 0.35 }}
                />
                {c.name}
              </label>
            ))}
          </div>
          <div className="pointer-events-auto mx-auto flex flex-wrap items-center justify-center gap-1 rounded-2xl bg-white/95 px-2 py-1.5 shadow-lg">
            {toggle(beltsOn, setBeltsOn, 'Pressure belts')}
            {WIND_BELTS.map((w) =>
              <span key={w.belt}>{toggle(windsOn[w.belt], (on) => setWindsOn((s) => ({ ...s, [w.belt]: on })), w.name, w.ink)}</span>
            )}
            {(beltsOn || anyWinds) && (
              <div role="radiogroup" aria-label="Time of year" className="flex rounded-full bg-slate-100 p-0.5">
                {SEASONS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={seasonId === x.id}
                    onClick={() => setSeasonId(x.id)}
                    className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold transition ${
                      seasonId === x.id ? 'bg-white text-slate-900 shadow' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {(card || belt || (anyWinds && season && !bare.on)) && (
        // Clear of the credit line at the map's foot.
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4 pb-10">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            {card ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="inline-block h-3 w-4 rounded-sm" style={{ background: card.fill }} />
                  <span className="text-lg font-extrabold text-slate-900">{card.name}</span>
                  <span className="text-xs font-bold tracking-wide text-slate-400">KÖPPEN {card.koppen}</span>
                </div>
                <p className="mt-1.5 text-sm leading-snug font-bold text-slate-800">{card.summary}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {card.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </>
            ) : belt ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="inline-block h-3 w-4 rounded-sm" style={{ background: belt.fill, opacity: 0.6 }} />
                  <span className="text-lg font-extrabold text-slate-900">{belt.name}</span>
                </div>
                {beltWhere && <div className="mt-0.5 text-xs font-bold tracking-wide text-slate-400 uppercase">{beltWhere}</div>}
                <p className="mt-1.5 text-sm leading-snug font-bold text-slate-800">{belt.summary}</p>
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {belt.notes.map((n) => (
                    <li key={n}>· {n}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <div className="text-xs font-bold tracking-wide text-slate-400 uppercase">Winds · {seasonInfo.name}</div>
                <div className="mt-1 max-h-36 space-y-1.5 overflow-y-auto text-[13px] leading-snug text-slate-700">
                  {WIND_BELTS.filter((w) => windsOn[w.belt]).map((w) => (
                    <p key={w.belt}>
                      <span className="font-bold" style={{ color: w.ink }}>
                        {w.name}.{' '}
                      </span>
                      {w.belt === 0 ? seasonInfo.caption : w.account}
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
