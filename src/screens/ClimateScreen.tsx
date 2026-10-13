import { useEffect, useMemo, useState } from 'react'
import { feature } from 'topojson-client'
import type { Feature } from 'geojson'
import { MapCanvas, type MapPatch } from '../map/MapCanvas'
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
type ClimateId = 'mediterranean' | 'desert-hot' | 'desert-cold' | 'sudan'

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
      'On the Köppen map also much of peninsular India and mainland South-East Asia, which the textbook treats as monsoon lands',
    ],
  },
]

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
    mediterranean: true,
    'desert-hot': true,
    'desert-cold': true,
    sudan: true,
  })
  const [selected, setSelected] = useState<ClimateId | null>(null)

  useEffect(() => {
    let live = true
    loadClimate().then((r) => live && setRegions(r))
    return () => {
      live = false
    }
  }, [])

  const patches: MapPatch[] = useMemo(
    () =>
      CLIMATES.filter((c) => shown[c.id] && regions?.get(c.id)).map((c) => ({
        id: c.id,
        feature: regions!.get(c.id)!,
        fill: c.fill,
        selected: selected === c.id,
      })),
    [regions, shown, selected]
  )
  const card = CLIMATES.find((c) => c.id === selected && shown[c.id])

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
        patches={patches}
        onPatch={(id) => setSelected((s) => (s === id ? null : (id as ClimateId)))}
        onDeselect={() => setSelected(null)}
        credit="Climate: Köppen-Geiger, Beck et al. (2023), 1991–2020"
        bare={bare}
      />

      {!bare.on && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto rounded-xl bg-white px-4 py-3 shadow-lg">
              <div className="font-extrabold text-slate-900">Climate</div>
              <div className="text-xs font-semibold text-slate-500">Tap a region for its climate</div>
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
        </div>
      )}

      {card && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
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
          </div>
        </div>
      )}
    </div>
  )
}
