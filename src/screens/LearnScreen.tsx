import { useMemo, useState } from 'react'
import { geoArea, geoContains } from 'd3-geo'
import { metaOf } from '../data/countries'
import { TYPE_LABEL, WATER_GLYPH, distanceToLineKm, groupsFor, placeOf } from '../data/places'
import { MapCanvas, type MapArea, type MapBand, type MapPoint } from '../map/MapCanvas'
import { areaOf } from '../data/marine'
import { shapeOf } from '../game/useQuiz'
import type { Round } from '../game/rounds'
import { KindSwatch, WATER_KINDS } from '../ui/bits'
import { TrickDiagram } from '../ui/TrickDiagram'
import { TricksSheet } from '../ui/TricksSheet'

/**
 * Learn mode: no timer, no scoring. Click a country to reveal its name, or a
 * place to reveal what the notes say about it — this is the revise-before-you-
 * practise screen. Everything is labelled, and each water
 * notation can be filtered so a world of them stays readable.
 */
export function LearnScreen({ round, onExit }: { round: Round; onExit: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  /** Which notations are drawn. All of them at once is unreadable worldwide. */
  const [shown, setShown] = useState({ ocean: true, sea: true, strait: true, canal: true })
  const [tricks, setTricks] = useState(false)

  const roundPlaces = useMemo(() => round.places?.map(placeOf) ?? [], [round.places])
  const isPlaceRound = roundPlaces.length > 0
  const isWaterKind = (t: string): t is keyof typeof shown =>
    t === 'ocean' || t === 'sea' || t === 'strait' || t === 'canal'
  const hasWater = roundPlaces.some((p) => isWaterKind(p.type))
  const isWaterRound = roundPlaces[0]?.section === 'water'

  const visible = useMemo(
    () =>
      roundPlaces.filter((p) => (isWaterKind(p.type) ? shown[p.type] : true)),
    [roundPlaces, shown]
  )
  // A card for something no longer on the map would be stranded.
  const place = selected ? (visible.find((p) => p.id === selected) ?? null) : null

  const points: MapPoint[] = useMemo(
    () =>
      visible
        // A range is a band and the band carries its own name along it; a
        // second label at the midpoint would just repeat itself.
        .filter((p) => !p.line)
        .map((p) => ({
          id: p.id,
          point: p.point,
          state: selected === p.id ? 'target' : 'idle',
          shape: shapeOf({ place: p }),
          label: showAll || selected === p.id ? p.name : undefined,
          // An ocean or sea is drawn as its own extent; the point only carries
          // the label. Everything else is still a marker.
          marker: !areaOf(p.id),
        })),
    [visible, selected, showAll]
  )

  /**
   * Every sea on screen at once, so the map reads as patches of named water.
   * Oceans only when picked: their polygons are most of the planet, and drawn
   * faintly they just wash the map out.
   */
  const areas: MapArea[] = useMemo(
    () =>
      visible
        .filter((p) => areaOf(p.id) && (p.type !== 'ocean' || selected === p.id))
        .map((p) => ({ id: p.id, state: selected === p.id ? 'target' : 'idle' })),
    [visible, selected]
  )

  /** Ranges, always drawn: a band is the notation, not a reveal. */
  const bands: MapBand[] = useMemo(
    () =>
      visible
        .filter((p) => p.line)
        .map((p) => ({
          id: p.id,
          line: p.line as [number, number][],
          state: selected === p.id ? 'target' : 'idle',
          label: showAll || selected === p.id ? p.name.toUpperCase() : undefined,
        })),
    [visible, selected, showAll]
  )

  /** Tricks attached to the place itself or to the country it sits in. */
  const mnemonics = place ? groupsFor([place]).filter((g) => g.mnemonic) : []

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={round.render}
        // `askable`, not `render`: the latter now carries context geography
        // like Greenland, which has no name to reveal.
        askable={isPlaceRound ? [] : round.askable}
        view={round.view}
        // Practice paints the country it is asking about; Learn paints the one
        // you tapped, so the name arrives with the shape that goes with it.
        // Place rounds are excluded: there `selected` is a place id, not an ISO.
        states={isPlaceRound || !selected ? {} : { [selected]: 'target' }}
        onPick={setSelected}
        // A tap on open sea, or on geography this round does not ask about,
        // clears the highlight. Place rounds already do this in `onPickPoint`.
        onDeselect={isPlaceRound ? undefined : () => setSelected(null)}
        points={isPlaceRound ? points : undefined}
        areas={isPlaceRound ? areas : undefined}
        bands={isPlaceRound ? bands : undefined}
        atlas={round.atlas}
        onPickPoint={
          isPlaceRound
            ? (lonLat, toScreen) => {
                // Markers first. Every strait sits inside some sea and the
                // Scotia Sea inside the Southern Ocean, so letting the area win
                // would make a marker in open water impossible to click.
                let best: { id: string; px: number } | null = null
                for (const p of visible) {
                  if (areaOf(p.id)) continue
                  const a = toScreen(lonLat)
                  const b = toScreen(p.point)
                  if (!a || !b) continue
                  const px = Math.hypot(a[0] - b[0], a[1] - b[1])
                  if (!best || px < best.px) best = { id: p.id, px }
                }
                if (best && best.px <= 40) {
                  setSelected(best.id)
                  return
                }
                // Then the nearest ridgeline within its own tolerance.
                let ridge: { id: string; km: number } | null = null
                for (const p of visible) {
                  if (!p.line) continue
                  const km = distanceToLineKm(p.line as [number, number][], lonLat)
                  if (km <= (p.spanKm ?? 60) && (!ridge || km < ridge.km)) {
                    ridge = { id: p.id, km }
                  }
                }
                if (ridge) {
                  setSelected(ridge.id)
                  return
                }
                // Otherwise the sea the tap landed in, smallest first so the
                // Tyrrhenian beats the Mediterranean around it.
                let inside: { id: string; area: number } | null = null
                for (const p of visible) {
                  const f = areaOf(p.id)
                  if (!f || !geoContains(f, lonLat)) continue
                  const size = geoArea(f)
                  if (!inside || size < inside.area) inside = { id: p.id, area: size }
                }
                setSelected(inside ? inside.id : null)
              }
            : undefined
        }
        countryMarkers={!isWaterRound}
        labels={isPlaceRound ? 'none' : showAll ? 'all' : 'selected'}
        selectedIso={isPlaceRound ? null : selected}
        // Constant, not conditional on `place`: refitting when a card opens
        // would make the whole map jump on every selection.
        padding={{ top: 88, right: 32, bottom: isPlaceRound ? 170 : 32, left: 32 }}
      />

      {hasWater && (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
            {WATER_KINDS.map(({ type, label }) => {
              const n = roundPlaces.filter((p) => p.type === type).length
              if (!n) return null
              return (
                <label
                  key={type}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
                    shown[type] ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={shown[type]}
                    onChange={(e) => setShown((s) => ({ ...s, [type]: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  <span className={shown[type] ? '' : 'opacity-40'}>
                    <KindSwatch type={type} />
                  </span>
                  {label}
                  <span className="font-semibold text-slate-400">{n}</span>
                </label>
              )
            })}
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
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTricks(true)}
            className="cursor-pointer rounded-xl bg-yellow-300 px-4 py-3 font-extrabold text-slate-900 shadow-lg"
          >
            Tricks
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="Close"
            className="cursor-pointer rounded-xl bg-white px-4 py-3 text-lg font-bold text-slate-900 shadow-lg"
          >
            ✕
          </button>
        </div>
      </div>

      {place && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-extrabold text-slate-900">
                {WATER_GLYPH[place.type] ? `${WATER_GLYPH[place.type]} ` : ''}
                {place.name}
              </span>
              <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                {TYPE_LABEL[place.type]}
              </span>
              {/* Skipped when the place *is* the country, or the line just
                  repeats the name back. */}
              {place.type !== 'country' && (place.country || place.sovereign) && (
                <span className="text-xs font-semibold text-slate-500">
                  {metaOf((place.country ?? place.sovereign)!).name}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm leading-snug font-bold text-slate-800">
              {place.significance}
            </p>

            {place.connects && (
              <p className="mt-1.5 text-xs font-bold text-slate-700">
                <span className="text-slate-400">CONNECTS </span>
                {place.connects}
              </p>
            )}
            {place.borders && place.borders.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                <span className="font-bold text-slate-400">ALONG </span>
                {place.borders.map((iso) => place.borderAs?.[iso] ?? metaOf(iso).name).join(', ')}
              </p>
            )}

            {place.notes.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {place.notes.map((n) => (
                  <li key={n} className="text-xs text-slate-600">
                    · {n}
                  </li>
                ))}
              </ul>
            )}

            {mnemonics.map((g) => (
              <div key={g.id} className="mt-2 rounded-xl bg-yellow-50 px-3 py-2">
                {/* A spatial trick is drawn rather than described; the
                    mnemonic then reads as the drawing's caption. */}
                {g.visual && (
                  // Capped: the card is anchored to the bottom of the map and
                  // a full-width diagram would climb over the geography.
                  <div className="mb-1 max-w-[17rem]">
                    <TrickDiagram visual={g.visual} compact />
                  </div>
                )}
                <p className="text-xs font-bold text-slate-700">
                  {g.name}: {g.mnemonic}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tricks && (
        <TricksSheet
          subject={roundPlaces}
          isos={isPlaceRound ? [] : round.askable}
          onClose={() => setTricks(false)}
        />
      )}
    </div>
  )
}
