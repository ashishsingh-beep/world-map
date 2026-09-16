import { useMemo, useState } from 'react'
import { metaOf } from '../data/countries'
import { TYPE_LABEL, WATER_GLYPH, placeGroups, placeOf } from '../data/places'
import { MapCanvas, type MapPoint } from '../map/MapCanvas'
import { shapeOf } from '../game/useQuiz'
import type { Round } from '../game/rounds'

/**
 * Learn mode: no timer, no scoring. Click a country to reveal its name, or a
 * place to reveal what the notes say about it — this is the revise-before-you-
 * practise screen, so nothing is ever hidden.
 */
export function LearnScreen({ round, onExit }: { round: Round; onExit: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const roundPlaces = useMemo(() => round.places?.map(placeOf) ?? [], [round.places])
  const isPlaceRound = roundPlaces.length > 0
  const place = isPlaceRound && selected ? roundPlaces.find((p) => p.id === selected) : null
  const hasWater = roundPlaces.some((p) => p.type === 'sea' || p.type === 'strait')
  const isWaterRound = roundPlaces[0]?.section === 'water'

  const points: MapPoint[] = useMemo(
    () =>
      roundPlaces.map((p) => ({
        id: p.id,
        point: p.point,
        state: selected === p.id ? 'target' : 'idle',
        shape: shapeOf({ place: p }),
        label: showAll || selected === p.id ? p.name : undefined,
      })),
    [roundPlaces, selected, showAll]
  )

  /** Mnemonics attached to the place itself or to the country it sits in. */
  const mnemonics = place
    ? placeGroups
        .filter(
          (g) =>
            g.mnemonic &&
            (g.members.includes(place.id) || (place.country && g.members.includes(place.country)))
        )
        .map((g) => `${g.name}: ${g.mnemonic}`)
    : []

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={round.render}
        askable={isPlaceRound ? [] : round.render}
        view={round.view}
        states={{}}
        onPick={setSelected}
        points={isPlaceRound ? points : undefined}
        onPickPoint={
          isPlaceRound
            ? (_lonLat, toScreen) => {
                // Select whatever the tap landed nearest to, so small markers
                // stay reachable without pixel-hunting.
                let best: { id: string; px: number } | null = null
                for (const p of roundPlaces) {
                  const a = toScreen(_lonLat)
                  const b = toScreen(p.point)
                  if (!a || !b) continue
                  const px = Math.hypot(a[0] - b[0], a[1] - b[1])
                  if (!best || px < best.px) best = { id: p.id, px }
                }
                setSelected(best && best.px <= 40 ? best.id : null)
              }
            : undefined
        }
        countryMarkers={!isWaterRound}
        labels={isPlaceRound ? 'none' : showAll ? 'all' : 'selected'}
        selectedIso={isPlaceRound ? null : selected}
        // Constant, not conditional on `place`: refitting when a card opens
        // would make the whole map jump on every selection.
        padding={{ top: 88, right: 32, bottom: isPlaceRound ? 200 : 32, left: 32 }}
      />

      {hasWater && (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-4">
          <div className="flex items-center gap-4 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-slate-700 shadow-lg">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden>
                <circle r="5.5" fill="#1d4ed8" stroke="#1f2d4d" strokeWidth="1.5" />
              </svg>
              SEA
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="18" height="14" viewBox="-9 -7 18 14" aria-hidden>
                <path d="M0 -5.5 L5.5 0 L0 5.5 L-5.5 0 Z" fill="#f97316" stroke="#1f2d4d" strokeWidth="1.5" />
                <path d="M-8.5 0 L-6 0 M6 0 L8.5 0" stroke="#1f2d4d" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              STRAIT
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden>
                <rect x="-4" y="-5.5" width="8" height="11" fill="#a855f7" stroke="#1f2d4d" strokeWidth="1.5" />
              </svg>
              CANAL
            </span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <label className="pointer-events-auto flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-3 font-extrabold text-slate-900 shadow-lg">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-5 w-5 accent-blue-600"
          />
          Show all names
        </label>
        <button
          type="button"
          onClick={onExit}
          aria-label="Close"
          className="pointer-events-auto rounded-xl bg-white px-4 py-3 text-lg font-bold text-slate-900 shadow-lg"
        >
          ✕
        </button>
      </div>

      {place && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-extrabold text-slate-900">
                {WATER_GLYPH[place.type] ? `${WATER_GLYPH[place.type]} ` : ''}
                {place.name}
              </span>
              <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                {TYPE_LABEL[place.type]}
              </span>
              {/* Skipped when the place *is* the country, or the line just
                  repeats the name back. */}
              {place.type !== 'country' && (place.country || place.sovereign) && (
                <span className="text-sm font-semibold text-slate-500">
                  {metaOf((place.country ?? place.sovereign)!).name}
                </span>
              )}
            </div>

            <p className="mt-2 text-lg leading-snug font-bold text-slate-800">
              {place.significance}
            </p>

            {place.connects && (
              <p className="mt-2 text-sm font-bold text-slate-700">
                <span className="text-slate-400">CONNECTS </span>
                {place.connects}
              </p>
            )}
            {place.borders && place.borders.length > 0 && (
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-bold text-slate-400">ALONG </span>
                {place.borders.map((iso) => metaOf(iso).name).join(', ')}
              </p>
            )}

            {place.notes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {place.notes.map((n) => (
                  <li key={n} className="text-sm text-slate-600">
                    · {n}
                  </li>
                ))}
              </ul>
            )}

            {mnemonics.map((m) => (
              <p
                key={m}
                className="mt-3 rounded-xl bg-yellow-50 px-3 py-2 text-sm font-bold text-slate-700"
              >
                {m}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
