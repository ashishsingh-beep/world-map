import { useMemo, useRef, useState } from 'react'
import { geoArea, geoContains } from 'd3-geo'
import { featureByIso, meta, metaOf } from '../data/countries'
import {
  WATER_GLYPH,
  capitalsOf,
  displayName,
  distanceToLineKm,
  kindLabel,
  groupsFor,
  placeKindOf,
  placeOf,
} from '../data/places'
import { MapCanvas, type MapArea, type MapBand, type MapPoint } from '../map/MapCanvas'
import { areaOf } from '../data/areas'
import { screenDistanceToLine, shapeOf } from '../game/useQuiz'
import type { Round } from '../game/rounds'
import { BELTS, BeltSwatch, CurrentSwatch, KindSwatch, PeakSwatch, RiverSwatch, PlaceKindSwatch, PLACE_KINDS, WATER_KINDS } from '../ui/bits'
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
  /** Which of a round's sections are drawn: countries, capitals, regions, other places. */
  const [placeKindsShown, setPlaceKindsShown] = useState({
    country: true,
    capital: true,
    other: true,
    region: true,
  })
  /** Which rivers are drawn, by role and by system. */
  const [rolesShown, setRolesShown] = useState({ main: true, tributary: true, distributary: true, origin: true })
  const [basinsHidden, setBasinsHidden] = useState<string[]>([])
  /** Which currents are drawn: the warm ones, the cold ones, or both. */
  const [tempsShown, setTempsShown] = useState({ warm: true, cold: true })
  /** The country under the last tap, which a place on top of it may outrank. */
  const tappedCountry = useRef<string | null>(null)
  const [tricks, setTricks] = useState(false)

  const roundPlaces = useMemo(() => round.places?.map(placeOf) ?? [], [round.places])
  const isPlaceRound = roundPlaces.length > 0
  const isWaterKind = (t: string): t is keyof typeof shown =>
    t === 'ocean' || t === 'sea' || t === 'strait' || t === 'canal'
  const hasWater = roundPlaces.some((p) => isWaterKind(p.type))
  const isWaterRound = roundPlaces[0]?.section === 'water'
  const isPlacesSection = roundPlaces[0]?.section === 'places'
  const isPhenomena = roundPlaces[0]?.section === 'phenomena'
  const isRivers = roundPlaces[0]?.section === 'rivers'
  const basins = [...new Set(roundPlaces.map((p) => (p.type === 'river' ? p.basin : undefined)))].filter(
    (b): b is string => !!b
  )
  /**
   * A Political Map round shows its countries and its places on one map. Its
   * countries are a section of the legend like any other, so they can be put
   * away to get at a state that covers one.
   */
  const isMixed = isPlaceRound && round.askable.length > 0
  const countriesShown = isMixed && placeKindsShown.country
  const countryCount = isMixed ? round.askable.length : 0
  // Which belts this round actually draws, so the legend never names one that
  // is not on the map.
  const belts = BELTS.filter((b) => roundPlaces.some((p) => p.belt === b.id && p.line))

  const visible = useMemo(
    () =>
      roundPlaces.filter((p) => {
        if (isWaterKind(p.type)) return shown[p.type]
        if (isPlacesSection) return placeKindsShown[placeKindOf(p.type)]
        if (p.type === 'current') return p.temp ? tempsShown[p.temp] : true
        if (p.type === 'river') return (!p.role || rolesShown[p.role]) && !basinsHidden.includes(p.basin ?? '')
        if (p.type === 'origin') return rolesShown.origin && !basinsHidden.includes(p.basin ?? '')
        return true
      }),
    [roundPlaces, shown, isPlacesSection, placeKindsShown, tempsShown, rolesShown, basinsHidden]
  )
  // A card for something no longer on the map would be stranded.
  const place = selected ? (visible.find((p) => p.id === selected) ?? null) : null
  const selectedCountry = selected && meta[selected] && (!isMixed || countriesShown) ? selected : null

  const points: MapPoint[] = useMemo(
    () =>
      visible
        // A range is a band and the band carries its own name along it; a
        // second label at the midpoint would just repeat itself.
        .filter((p) => !p.line)
        .map((p): MapPoint => ({
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

  /** Rivers drawn only to join the network up — the Kanhan. Never a card, never labelled. */
  const context = useMemo(
    () =>
      (round.context ?? [])
        .map(placeOf)
        .filter((p) => p.line && !basinsHidden.includes(p.basin ?? '')),
    [round.context, basinsHidden]
  )

  /** Ranges, always drawn: a band is the notation, not a reveal. */
  const bands: MapBand[] = useMemo(
    () =>
      [
        ...context.map((p): MapBand => ({
          id: p.id,
          line: p.line as [number, number][],
          state: 'idle',
          river: p.role,
          quiet: true,
        })),
        ...visible
        .filter((p) => p.line)
        .map((p) => ({
          id: p.id,
          line: p.line as [number, number][],
          state: selected === p.id ? 'target' : 'idle',
          label:
            showAll || selected === p.id
              ? p.type === 'current' || p.type === 'river'
                ? displayName(p) + (p.role === 'distributary' ? ' (distributary)' : '')
                : p.name.toUpperCase()
              : undefined,
          belt: p.belt,
          current: p.type === 'current' ? p.temp : undefined,
          river: p.type === 'river' ? p.role : undefined,
          // A delta branch that reaches the sea is named at its mouth.
          labelAt:
            p.role === 'distributary' && !roundPlaces.some((q) => q.joins === p.id) ? 'end' : 'mid',
        })),
      ] as MapBand[],
    [visible, selected, showAll, roundPlaces, context]
  )

  /** Tricks attached to the place itself or to the country it sits in. */
  const mnemonics = place
    ? groupsFor([place]).filter((g) => g.mnemonic)
    : selectedCountry && isMixed
      ? groupsFor([], [selectedCountry]).filter((g) => g.mnemonic)
      : []

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#22cdfb]">
      <MapCanvas
        className="absolute inset-0"
        render={round.render}
        // `askable`, not `render`: the latter now carries context geography
        // like Greenland, which has no name to reveal.
        askable={isPlaceRound && !countriesShown ? [] : round.askable}
        view={round.view}
        // Practice paints the country it is asking about; Learn paints the one
        // you tapped, so the name arrives with the shape that goes with it.
        // Place rounds are excluded: there `selected` is a place id, not an ISO.
        states={selectedCountry ? { [selectedCountry]: 'target' } : {}}
        onPick={(iso) => {
          // A place round decides in `onPickPoint`, which runs next and knows
          // whether a marker or a smaller patch sits under the same tap.
          if (isMixed) tappedCountry.current = iso
          else setSelected(iso)
        }}
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
                  // A current or a river is its whole line, not the label's anchor.
                  if (areaOf(p.id) || p.type === 'current' || p.type === 'river') continue
                  const a = toScreen(lonLat)
                  const b = toScreen(p.point)
                  if (!a || !b) continue
                  const px = Math.hypot(a[0] - b[0], a[1] - b[1])
                  if (!best || px < best.px) best = { id: p.id, px }
                }
                const country = tappedCountry.current
                tappedCountry.current = null
                if (best && best.px <= 40) {
                  setSelected(best.id)
                  return
                }
                // Then the nearest current's arrow, measured on screen.
                const at = toScreen(lonLat)
                let arrow: { id: string; px: number } | null = null
                for (const p of visible) {
                  if ((p.type !== 'current' && p.type !== 'river') || !at) continue
                  const px = screenDistanceToLine(p.line as [number, number][], toScreen, at)
                  if (px <= 24 && (!arrow || px < arrow.px)) arrow = { id: p.id, px }
                }
                if (arrow) {
                  setSelected(arrow.id)
                  return
                }
                // Then the nearest ridgeline within its own tolerance.
                let ridge: { id: string; km: number } | null = null
                for (const p of visible) {
                  if (!p.line || p.type === 'current' || p.type === 'river') continue
                  const km = distanceToLineKm(p.line as [number, number][], lonLat)
                  if (km <= (p.spanKm ?? 60) && (!ridge || km < ridge.km)) {
                    ridge = { id: p.id, km }
                  }
                }
                if (ridge) {
                  setSelected(ridge.id)
                  return
                }
                // Otherwise the patch the tap landed in, smallest first so the
                // Tyrrhenian beats the Mediterranean around it — and the
                // country under it is one more patch: Fiji beats Melanesia,
                // Sinai beats Egypt, and Australia's states beat Australia.
                let inside: { id: string; area: number } | null = null
                const consider = (id: string, f: Parameters<typeof geoArea>[0]) => {
                  const size = geoArea(f)
                  if (!inside || size < inside.area) inside = { id, area: size }
                }
                for (const p of visible) {
                  const f = areaOf(p.id)
                  if (f && geoContains(f, lonLat)) consider(p.id, f)
                }
                const cf = country ? featureByIso.get(country) : null
                if (country && cf) consider(country, cf)
                setSelected(inside ? (inside as { id: string }).id : null)
              }
            : undefined
        }
        countryMarkers={!isWaterRound && !isPhenomena}
        labels={isPlaceRound && !countriesShown ? 'none' : showAll ? 'all' : 'selected'}
        selectedIso={selectedCountry}
        // Constant, not conditional on `place`: refitting when a card opens
        // would make the whole map jump on every selection.
        padding={{ top: 88, right: 32, bottom: isPlaceRound ? 170 : 32, left: 32 }}
      />

      {/* One column, not three independently positioned pills, so that if a
          round ever needs two legends they stack rather than sit on top of
          each other. */}
      <div className="pointer-events-none absolute inset-x-0 top-20 flex flex-col items-center gap-2 px-4">
        {belts.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-3 py-1.5 shadow-lg">
            {belts.map((b) => (
              <span
                key={b.id}
                className="flex items-center gap-1.5 px-1.5 text-xs font-bold text-slate-700"
              >
                <BeltSwatch belt={b.id} />
                {b.label}
              </span>
            ))}
          </div>
        )}

        {isRivers && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
            {(
              [
                ['main', 'Main rivers'],
                ['tributary', 'Tributaries'],
                ['distributary', 'Distributaries'],
                ['origin', 'Origins'],
              ] as const
            ).map(([role, label]) => (
              <label
                key={role}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
                  rolesShown[role] ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={rolesShown[role]}
                  onChange={(e) => setRolesShown((s) => ({ ...s, [role]: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <span className={rolesShown[role] ? '' : 'opacity-40'}>
                  {role === 'origin' ? <PeakSwatch /> : <RiverSwatch role={role} />}
                </span>
                {label}
                <span className="font-semibold text-slate-400">
                  {roundPlaces.filter((p) => (role === 'origin' ? p.type === 'origin' : p.role === role)).length}
                </span>
              </label>
            ))}
          </div>
        )}
        {isRivers && basins.length > 1 && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
            {basins.map((b) => {
              const on = !basinsHidden.includes(b)
              return (
                <label
                  key={b}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
                    on ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setBasinsHidden((h) => (e.target.checked ? h.filter((x) => x !== b) : [...h, b]))
                    }
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  {b} system
                  <span className="font-semibold text-slate-400">
                    {roundPlaces.filter((p) => p.basin === b).length}
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {isPhenomena && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
            {(['warm', 'cold'] as const).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
                  tempsShown[t] ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={tempsShown[t]}
                  onChange={(e) => setTempsShown((s) => ({ ...s, [t]: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-blue-600"
                />
                <span className={tempsShown[t] ? '' : 'opacity-40'}>
                  <CurrentSwatch temp={t} />
                </span>
                {t === 'warm' ? 'Warm currents' : 'Cold currents'}
                <span className="font-semibold text-slate-400">
                  {roundPlaces.filter((p) => p.temp === t).length}
                </span>
              </label>
            ))}
          </div>
        )}

        {isPlacesSection && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg">
            {PLACE_KINDS.map(({ kind, label }) => {
              const n =
                kind === 'country'
                  ? countryCount
                  : roundPlaces.filter((p) => placeKindOf(p.type) === kind).length
              if (!n) return null
              return (
                <label
                  key={kind}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition hover:bg-slate-100 ${
                    placeKindsShown[kind] ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={placeKindsShown[kind]}
                    onChange={(e) =>
                      setPlaceKindsShown((s) => ({ ...s, [kind]: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  <span className={placeKindsShown[kind] ? '' : 'opacity-40'}>
                    <PlaceKindSwatch kind={kind} />
                  </span>
                  {label}
                  <span className="font-semibold text-slate-400">{n}</span>
                </label>
              )
            })}
          </div>
        )}

        {hasWater && (
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
        )}
      </div>

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

      {selectedCountry && isMixed && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-extrabold text-slate-900">{metaOf(selectedCountry).name}</span>
              <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">country</span>
              <span className="text-xs font-semibold text-slate-500">{metaOf(selectedCountry).continent}</span>
            </div>
            <p className="mt-1.5 text-sm leading-snug font-bold text-slate-800">
              {capitalsOf(selectedCountry).length
                ? `Capital${capitalsOf(selectedCountry).length > 1 ? 's' : ''}: ${capitalsOf(selectedCountry).join(', ')}`
                : 'Its capital is not in the notes yet.'}
            </p>
            {mnemonics.map((g) => (
              <div key={g.id} className="mt-2 rounded-xl bg-yellow-50 px-3 py-2">
                <p className="text-xs font-bold text-slate-700">
                  {g.name}: {g.mnemonic}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {place && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-extrabold text-slate-900">
                {WATER_GLYPH[place.type] ? `${WATER_GLYPH[place.type]} ` : ''}
                {place.name}
              </span>
              {place.temp && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-extrabold text-white uppercase ${
                    place.temp === 'warm' ? 'bg-red-600' : 'bg-blue-700'
                  }`}
                >
                  {place.temp}
                </span>
              )}
              <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">
                {kindLabel(place)}
              </span>
              {place.type === 'river' && (
                <span className="text-xs font-semibold text-slate-500">
                  {place.basin} system · {place.lengthKm?.toLocaleString()} km
                </span>
              )}
              {place.ocean && (
                <span className="text-xs font-semibold text-slate-500">
                  {place.ocean} Ocean
                </span>
              )}
              {/* Skipped when the place *is* the country, or the line just
                  repeats the name back. */}
              {place.type !== 'country' && place.type !== 'river' && (place.country || place.sovereign) && (
                <span className="text-xs font-semibold text-slate-500">
                  {metaOf((place.country ?? place.sovereign)!).name}
                </span>
              )}
            </div>

            <p className="mt-1.5 text-sm leading-snug font-bold text-slate-800">
              {place.significance}
            </p>

            {place.type === 'origin' && place.river && (
              <p className="mt-1.5 text-xs font-bold text-slate-700">
                <span className="text-slate-400">SOURCE OF </span>
                the {placeOf(place.river).name}
              </p>
            )}

            {/* Where it sits in its system — the river it feeds, or leaves. */}
            {place.type === 'river' && (
              <p className="mt-1.5 text-xs font-bold text-slate-700">
                {place.role === 'main' && place.source && (
                  <>
                    <span className="text-slate-400">RISES </span>
                    {place.source.name}
                  </>
                )}
                {place.role === 'tributary' && place.joins && (
                  <>
                    <span className="text-slate-400">FLOWS INTO </span>
                    the {placeOf(place.joins).name}
                    {place.via ? `, through the ${place.via}` : ''}
                    {place.bank ? ` (${place.bank} bank)` : ''}
                  </>
                )}
                {place.role === 'distributary' && place.joins && (
                  <>
                    <span className="text-slate-400">LEAVES </span>
                    the {placeOf(place.joins).name}, carrying its water to the sea
                  </>
                )}
              </p>
            )}

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
          isos={isPlaceRound && !isMixed ? [] : round.askable}
          onClose={() => setTricks(false)}
        />
      )}
    </div>
  )
}
