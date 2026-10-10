import { useEffect, useMemo, useState } from 'react'
import { interpolateRgb } from 'd3-interpolate'
import { MapCanvas, CURRENT_INK, type MapIsoline } from '../map/MapCanvas'
import { renderIsos } from '../data/countries'
import { WORLD_VIEW } from '../game/rounds'
import { loadIsothermMap, saveIsothermMap, type IsothermMap } from '../app/storage'

/**
 * The isotherm maps, for Learn only: January, July and the range between them,
 * contoured at build time from NOAA's 1991–2020 long-term means (see
 * scripts/isotherms.mjs) at the textbook figures' own levels.
 *
 * Coloured on the ocean currents' own scale — blue cold, red warm — so a line's
 * colour says how warm it is before its label does; on the range map, blue is
 * a small range and red a great one.
 */
interface IsoMap {
  levels: number[]
  lines: { value: number; line: [number, number][]; labels: [number, number][] }[]
  thermalEquator?: [number, number][]
}
type Isotherms = Record<IsothermMap, IsoMap>

const MAPS: { id: IsothermMap; label: string; caption: string }[] = [
  { id: 'january', label: 'January', caption: 'The distribution of surface air temperature in the month of January' },
  { id: 'july', label: 'July', caption: 'The distribution of surface air temperature in the month of July' },
  { id: 'range', label: 'Jan–Jul range', caption: 'The range of temperature between January and July' },
]

/** The line the thermal equator and its label are drawn in: neither end of the scale. */
const THERMAL_INK = '#1f2d4d'

let load: Promise<Isotherms> | null = null
const loadIsotherms = () => (load ??= import('../data/isotherms.json').then((m) => m.default as unknown as Isotherms))

/** A level's colour: the cold current's blue at the lowest, the warm current's red at the highest. */
const colourFor = (levels: number[], v: number) =>
  interpolateRgb(CURRENT_INK.cold.line, CURRENT_INK.warm.line)((v - levels[0]) / (levels[levels.length - 1] - levels[0]))

/** The point of a line nearest a longitude, for a label that should sit there. */
const atLon = (line: [number, number][], lon: number) =>
  line.reduce((best, c) => (Math.abs(c[0] - lon) < Math.abs(best[0] - lon) ? c : best))

export function IsothermScreen({ onExit }: { onExit: () => void }) {
  const [data, setData] = useState<Isotherms | null>(null)
  const [which, setWhich] = useState<IsothermMap>(loadIsothermMap)
  useEffect(() => {
    let live = true
    loadIsotherms().then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [])
  const choose = (m: IsothermMap) => {
    setWhich(m)
    saveIsothermMap(m)
  }

  const map = data?.[which]
  const colourOf = (v: number) => (map ? colourFor(map.levels, v) : CURRENT_INK.unknown.line)

  const isolines = useMemo((): MapIsoline[] => {
    if (!map) return []
    const equator: [number, number][] = Array.from({ length: 73 }, (_, i) => [-180 + i * 5, 0])
    const out: MapIsoline[] = [
      { id: 'equator', line: equator, color: '#64748b', width: 1.2, dashed: true, label: 'Equator', labels: [[-150, 0]] },
    ]
    if (map.thermalEquator) {
      out.push({
        id: 'thermal',
        line: map.thermalEquator,
        color: THERMAL_INK,
        width: 2.4,
        dashed: true,
        label: 'Thermal Equator',
        // Over open ocean, where no isotherm's own label is.
        labels: [atLon(map.thermalEquator, -30), atLon(map.thermalEquator, 170)],
      })
    }
    map.lines.forEach((l, n) =>
      out.push({ id: `${which}-${n}`, line: l.line, color: colourFor(map.levels, l.value), label: `${l.value}°C`, labels: l.labels })
    )
    return out
  }, [map, which])

  const caption = MAPS.find((m) => m.id === which)!.caption

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-sky-200">
      <MapCanvas
        className="absolute inset-0"
        render={renderIsos}
        askable={[]}
        states={{}}
        view={WORLD_VIEW}
        countryMarkers={false}
        isolines={isolines}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-xl bg-white px-4 py-3 font-extrabold text-slate-900 shadow-lg">
          Isotherms
        </div>
        <div
          role="radiogroup"
          aria-label="Which map"
          className="pointer-events-auto flex rounded-xl bg-white p-1 shadow-lg"
        >
          {MAPS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={which === m.id}
              onClick={() => choose(m.id)}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-extrabold transition sm:px-4 ${
                which === m.id ? 'bg-[#1f2d4d] text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
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

      {map && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto max-w-2xl rounded-2xl bg-white/95 px-4 py-3 shadow-xl">
            <p className="text-sm font-bold text-slate-800">{caption}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {map.levels.map((v) => (
                <span key={v} className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true" className="shrink-0">
                    <path d="M1 4 H21" stroke={colourOf(v)} strokeWidth="2.6" strokeLinecap="round" />
                  </svg>
                  {v}°C
                </span>
              ))}
              {map.thermalEquator && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true" className="shrink-0">
                    <path d="M1 4 H25" stroke={THERMAL_INK} strokeWidth="2.4" strokeDasharray="6 4" />
                  </svg>
                  Thermal Equator
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[10px] font-semibold text-slate-400">
              NOAA NCEP/NCAR reanalysis and GHCN-CAMS, 1991–2020 means; January and July reduced to sea level
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
