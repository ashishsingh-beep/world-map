import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { featureByIso, meta, metaOf, type CountryFeature } from '../data/countries'
import { areaOf } from '../data/marine'
import { indiaDivides, indiaLand, indiaOutline, stateLines } from '../data/india'

/** How a country is painted. Drives both fill colour and hit behaviour. */
export type CountryState = 'idle' | 'correct' | 'wrong' | 'missed' | 'target'

/** A country smaller than this many screen pixels gets a circle marker instead. */
const MARKER_THRESHOLD_PX = 9
const MARKER_RADIUS_PX = 9
/** Padding factor when the map zooms in to reveal a country. */
const REVEAL_PADDING = 6
const MAX_REVEAL_SCALE = 14
/** A point has no size of its own, so its reveal zoom is capped rather than fitted. */
const POINT_REVEAL_SCALE = 5
const PLACE_MARKER_PX = 7

/** Screen-space clearance around the fitted geography, so it doesn't butt up
 *  against the viewport edge or hide behind HUD chrome a screen overlays. */
export interface MapPadding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

const DEFAULT_PADDING: Required<MapPadding> = { top: 24, right: 24, bottom: 24, left: 24 }

/**
 * The notation a marker is drawn with. A round circle reads as open water, a
 * diamond as a narrow gate between two of them, and the two are also coloured
 * apart — so a sea and a strait are never confused at a glance.
 */
export type MarkerShape = 'dot' | 'ocean' | 'sea' | 'strait' | 'canal' | 'peak'

/**
 * A mountain range, drawn as a band along its ridgeline. Ranges are the one
 * thing here that is neither a point nor a polygon: a line with width, which is
 * how an atlas draws them and how the notes teach them.
 */
export interface MapBand {
  id: string
  line: [number, number][]
  state: CountryState
  label?: string
  /** Which Himalayan belt it belongs to, which is what colours it. */
  belt?: Belt
}

/**
 * The belts, coloured apart. Four parallel ranges drawn in one brown were a
 * single smear; the colour is what says Trans from Greater from Lesser from
 * Shiwalik at a glance, before any label is read. `BeltSwatch` in
 * `src/ui/bits.tsx` draws the legend from these same values — change one and
 * change the other, or the legend stops describing the map.
 */
export type Belt = 'trans' | 'greater' | 'lesser' | 'outer'

export const BELT_BAND: Record<Belt, { band: string; ink: string }> = {
  trans: { band: '#b98a5c', ink: '#7c4a16' },
  greater: { band: '#5ec2f0', ink: '#075985' },
  lesser: { band: '#b49ae8', ink: '#5b21b6' },
  outer: { band: '#8fcc63', ink: '#3f6212' },
}

/** A sea or ocean drawn as its real extent rather than as a marker. */
export interface MapArea {
  id: string
  state: CountryState
}

/** A point place drawn on top of the geography (a city, port, sea, strait…). */
export interface MapPoint {
  id: string
  point: [number, number]
  state: CountryState
  shape?: MarkerShape
  /** Drawn beside the marker when set — used by Learn mode, never in play. */
  label?: string
  /**
   * False for a place drawn as an area: the polygon is the notation, and a pin
   * in the middle of it would only say the sea is there and not there. The
   * label still sits at the authored point, which is chosen to read well.
   */
  marker?: boolean
}

/** Idle fills, which is where the sea/strait distinction has to carry. */
const SHAPE_FILLS: Record<MarkerShape, string> = {
  dot: '#ffffff',
  ocean: '#0d9488',
  sea: '#1d4ed8',
  strait: '#f97316',
  canal: '#a855f7',
  // A peak is a brown triangle: the shape of the thing itself.
  peak: '#78350f',
}

/** An ocean outranks the seas inside it, so its marker is drawn larger. */
const SHAPE_SCALE: Record<MarkerShape, number> = {
  dot: 1,
  ocean: 1.7,
  sea: 1,
  strait: 1,
  canal: 1,
  peak: 1.15,
}

/** Projects lon/lat to current screen pixels, or null if it falls off the globe. */
export type ToScreen = (p: [number, number]) => [number, number] | null

export interface MapCanvasProps {
  /** Geography to draw. For a continent round this is just that continent. */
  render: string[]
  /** Countries that can be clicked. Usually equal to `render`, but not for
   *  Island Nations, which draws the whole world and asks only 46 of them. */
  askable?: string[]
  /** The view the map returns to between questions: [[w,s],[e,n]]. */
  view: [[number, number], [number, number]]
  states: Record<string, CountryState>
  /** When set, the map animates a zoom onto this country. Null resets the view. */
  revealIso?: string | null
  /** Drop a pin at this country's centroid (the wrong-answer reveal marker). */
  pinIso?: string | null
  onPick?: (iso: string) => void
  /**
   * A tap that landed on nothing selectable. Opt-in: Learn clears its selection
   * this way, while a quiz must ignore a tap on open water rather than react
   * to it. Country rounds only — place rounds already decide this themselves in
   * `onPickPoint`, which knows how near the nearest marker was.
   */
  onDeselect?: () => void
  /** Point places drawn above the geography. */
  points?: MapPoint[]
  /**
   * Sea and ocean extents, drawn under the land so coastlines still read. An
   * area and a marker are the two notations now: a patch for the things that
   * are patches, a pin for the chokepoints that really are points.
   */
  areas?: MapArea[]
  /** Mountain ranges, drawn as bands along their ridgelines. */
  bands?: MapBand[]
  /**
   * Which atlas to draw. 'india' adds the state and union-territory outlines
   * over the country geography; they are context, never questions.
   */
  atlas?: 'world' | 'india'
  /**
   * Zoom to frame these lon/lats instead of a country. Pass both the answer and
   * the player's tap so a near miss and a wild guess are each readable. Null
   * resets the view.
   */
  revealPoints?: [number, number][] | null
  /** Drop a pin at this lon/lat — used to show where the answer actually was. */
  pinPoint?: [number, number] | null
  /** Show where the player tapped, so a near miss is visible next to the answer. */
  markPoint?: [number, number] | null
  /**
   * A tap anywhere on the map. Receives the lon/lat plus a projector, so the
   * caller can measure the miss in screen pixels at the current zoom without
   * the map ever being told what the answer is.
   */
  onPickPoint?: (lonLat: [number, number], toScreen: ToScreen) => void
  /**
   * Micro-state circles. Off for the Seas & Straits round, where a stray ring
   * of country markers would compete with the sea notation.
   */
  countryMarkers?: boolean
  labels?: 'none' | 'all' | 'selected'
  selectedIso?: string | null
  className?: string
  /** Clearance around the fitted geography. Defaults to 24px on every side. */
  padding?: MapPadding
}

const FILLS: Record<CountryState, string> = {
  idle: '#f5f5c8',
  correct: '#4ade80',
  wrong: '#f43f5e',
  missed: '#9ca3af',
  target: '#f43f5e',
}

export function MapCanvas({
  render,
  askable,
  view,
  states,
  revealIso = null,
  pinIso = null,
  onPick,
  onDeselect,
  points,
  areas,
  bands,
  atlas = 'world',
  revealPoints = null,
  pinPoint = null,
  markPoint = null,
  onPickPoint,
  countryMarkers = true,
  labels = 'none',
  selectedIso = null,
  className,
  padding,
}: MapCanvasProps) {
  const pad = { ...DEFAULT_PADDING, ...padding }
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)

  // Track the container so the projection can refit on resize / orientation change.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const askSet = useMemo(() => new Set(askable ?? render), [askable, render])

  /**
   * On the Indian map, India itself is drawn from its own state source rather
   * than from the world country layer. The two disagree through Kashmir, and
   * drawing both laid a second line beside the first right where the border
   * matters most. Neighbours still come from the country layer.
   */
  const drawn = useMemo(
    () =>
      (atlas === 'india' ? [] : render)
        .map((iso) => featureByIso.get(iso))
        .filter(Boolean) as CountryFeature[],
    [render, atlas]
  )

  /**
   * One projection fitted to the round's view box. Everything downstream —
   * paths, marker positions, reveal zooms — reads from this, so a continent
   * round is genuinely just a different `view` and `render` list.
   */
  const projection = useMemo(() => {
    const p = geoEquirectangular()
    if (!size.width || !size.height) return p
    const [[w, s], [e, n]] = view
    /**
     * Fit to the four corners as points, NOT to a Polygon. d3-geo reads
     * polygons with spherical winding rules: a clockwise ring means "the whole
     * globe except this box", which silently fits the entire planet and
     * collapses every continent view down to world scale.
     */
    p.fitExtent(
      [
        [pad.left, pad.top],
        [size.width - pad.right, size.height - pad.bottom],
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
        ],
      }
    )
    return p
  }, [view, size.width, size.height, pad.left, pad.top, pad.right, pad.bottom])

  const path = useMemo(() => geoPath(projection), [projection])

  /** Base (unzoomed) screen geometry per country: where it sits and how big. */
  const layout = useMemo(() => {
    const out: Record<string, { cx: number; cy: number; px: number }> = {}
    if (!size.width) return out
    for (const f of drawn) {
      const iso = f.properties.iso
      // Context geography has no meta entry, and no marker or label either.
      if (!meta[iso]) continue
      const [x, y] = projection(metaOf(iso).centroid) ?? [NaN, NaN]
      if (!Number.isFinite(x)) continue
      const b = path.bounds(f)
      out[iso] = {
        cx: x,
        cy: y,
        px: Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]),
      }
    }
    return out
  }, [drawn, projection, path, size.width])

  // Pan and zoom by hand, same as the reference.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !size.width) return
    const behaviour = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 60])
      .translateExtent([
        [0, 0],
        [size.width, size.height],
      ])
      .on('start', () => {
        // The inline style covers the svg itself; the class covers its
        // children, which would otherwise keep their own pointer cursor
        // through a pan that started on top of them.
        svg.style.cursor = 'grabbing'
        svg.classList.add('is-panning')
      })
      .on('zoom', (event) => setTransform(event.transform))
      .on('end', () => {
        svg.style.cursor = 'grab'
        svg.classList.remove('is-panning')
      })
    select(svg).call(behaviour).on('dblclick.zoom', null)
    zoomRef.current = behaviour
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [size.width, size.height])

  /**
   * Reveal animation. Only ever fires on reveal — never while a question is
   * being asked — so the player is not handed the answer by the camera.
   */
  useEffect(() => {
    const svg = svgRef.current
    const behaviour = zoomRef.current
    if (!svg || !behaviour || !size.width) return
    const sel = select(svg)

    if (revealPoints?.length) {
      const bases = revealPoints.map((p) => projection(p)).filter(Boolean) as [number, number][]
      if (!bases.length) return
      const xs = bases.map((b) => b[0])
      const ys = bases.map((b) => b[1])
      const w = Math.max(...xs) - Math.min(...xs)
      const h = Math.max(...ys) - Math.min(...ys)
      // Fit whatever has to be visible, but never zoom past the point cap —
      // a single point has no extent to fit to.
      const k = Math.max(
        1,
        Math.min(
          POINT_REVEAL_SCALE,
          size.width / Math.max(w * 1.6, 1),
          size.height / Math.max(h * 1.6, 1)
        )
      )
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2
      sel
        .transition()
        .duration(650)
        .call(
          behaviour.transform,
          zoomIdentity.translate(size.width / 2 - cx * k, size.height / 2 - cy * k).scale(k)
        )
      return
    }

    if (!revealIso) {
      sel.transition().duration(500).call(behaviour.transform, zoomIdentity)
      return
    }
    const f = featureByIso.get(revealIso)
    if (!f) return
    const b = path.bounds(f)
    const w = Math.max(b[1][0] - b[0][0], 1)
    const h = Math.max(b[1][1] - b[0][1], 1)
    const k = Math.min(
      MAX_REVEAL_SCALE,
      Math.max(1, Math.min(size.width / (w * REVEAL_PADDING), size.height / (h * REVEAL_PADDING)))
    )
    const cx = (b[0][0] + b[1][0]) / 2
    const cy = (b[0][1] + b[1][1]) / 2
    const next = zoomIdentity
      .translate(size.width / 2 - cx * k, size.height / 2 - cy * k)
      .scale(k)
    sel.transition().duration(650).call(behaviour.transform, next)
  }, [revealIso, revealPoints, projection, path, size.width, size.height])

  const k = transform.k

  /** Where the pointer went down, so a pan is never mistaken for a tap. */
  const downAt = useRef<[number, number] | null>(null)
  /** Set by a country's own handler, read by the background one below. */
  const hitCountry = useRef(false)

  /** The tap position, or null when the pointer travelled — that was a pan. */
  const tapAt = (event: ReactMouseEvent): [number, number] | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const at: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    const from = downAt.current
    return from && Math.hypot(at[0] - from[0], at[1] - from[1]) > 5 ? null : at
  }

  const handle = (iso: string, event: ReactMouseEvent) => {
    if (!tapAt(event)) return
    if (onPick && askSet.has(iso)) {
      hitCountry.current = true
      onPick(iso)
    }
  }

  const handleMapClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    // Country paths sit under the svg, so their handler has already run.
    const onCountry = hitCountry.current
    hitCountry.current = false

    const at = tapAt(event)
    if (!at) return
    if (!onPickPoint) {
      if (!onCountry) onDeselect?.()
      return
    }
    const [sx, sy] = at

    const base = transform.invert([sx, sy])
    const lonLat = projection.invert?.(base)
    if (!lonLat) return
    const toScreen: ToScreen = (p) => {
      const b = projection(p)
      return b ? (transform.apply(b) as [number, number]) : null
    }
    onPickPoint(lonLat as [number, number], toScreen)
  }

  return (
    <div ref={wrapRef} className={className ?? 'h-full w-full'}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        style={{ background: '#22cdfb', cursor: 'grab' }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          downAt.current = [e.clientX - rect.left, e.clientY - rect.top]
        }}
        onClick={handleMapClick}
      >
        <g transform={transform.toString()}>
          {/* Under the land: a sea's polygon runs up to the coast and beyond it
              in places, and the coastline has to stay the thing you read. */}
          {areas?.map((a) => {
            const f = areaOf(a.id)
            if (!f) return null
            const idle = a.state === 'idle'
            return (
              <path
                key={`a-${a.id}`}
                d={path(f) ?? undefined}
                fill={idle ? '#0369a1' : FILLS[a.state]}
                fillOpacity={idle ? 0.18 : 0.75}
                stroke={idle ? '#0369a1' : FILLS[a.state]}
                strokeOpacity={idle ? 0.35 : 0.9}
                strokeWidth={idle ? 0.8 : 1.6}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )
          })}

          {drawn.map((f) => {
            const iso = f.properties.iso
            const state = states[iso] ?? 'idle'
            return (
              <path
                key={iso}
                d={path(f) ?? undefined}
                fill={FILLS[state]}
                stroke="#1f2d4d"
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
                className={askSet.has(iso) ? 'cursor-pointer' : undefined}
                onClick={(e) => handle(iso, e)}
              />
            )
          })}

          {atlas === 'india' && (
            <>
              {/* The surround, filled and never stroked. It is one dissolved
                  shape rather than eight countries because a neighbour's
                  outline drawn against India would run a second line beside
                  India's own, through exactly the border this project cares
                  most about. The countries part from each other below. */}
              {indiaLand.map((f, i) => (
                <path
                  key={`nl-${i}`}
                  d={path(f as never) ?? undefined}
                  // A solid muted land, not the idle fill at low opacity: over
                  // the sea that reads as teal, not as a quieter country.
                  fill="#eceedb"
                  stroke="none"
                  pointerEvents="none"
                />
              ))}
              {indiaDivides.map((f, i) => (
                <path
                  key={`nd-${i}`}
                  d={path(f as never) ?? undefined}
                  fill="none"
                  stroke="#1f2d4d"
                  strokeOpacity={0.55}
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ))}
              {/* India's land, from its own source: one boundary through
                  Kashmir, solid, with Gilgit-Baltistan and Aksai Chin inside
                  it. Filled before the state lines are drawn over it. */}
              {indiaOutline.map((f, i) => (
                <path
                  key={`io-${i}`}
                  d={path(f as never) ?? undefined}
                  fill={FILLS.idle}
                  stroke="none"
                  pointerEvents="none"
                />
              ))}
              {stateLines.map((f, i) => (
                <path
                  key={`s-${i}`}
                  d={path(f as never) ?? undefined}
                  fill="none"
                  stroke="#1f2d4d"
                  strokeOpacity={0.35}
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ))}
              {indiaOutline.map((f, i) => (
                <path
                  key={`ib-${i}`}
                  d={path(f as never) ?? undefined}
                  fill="none"
                  stroke="#1f2d4d"
                  strokeWidth={1.4}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ))}
            </>
          )}

          {/* Ranges: a band along the ridgeline, under the peaks standing on
              them. Width is in screen pixels, so a band stays a band at every
              zoom rather than swelling into a blob — wide enough that the peaks
              of a belt sit inside their own band (Rakaposhi, the furthest off
              its crest, is 26km out), and faint enough that where two belts
              overlap both still read. */}
          {bands?.map((b) => {
            const d = path({ type: 'LineString', coordinates: b.line } as never)
            if (!d) return null
            const idle = b.state === 'idle'
            const belt = BELT_BAND[b.belt ?? 'greater']
            return (
              <g key={`b-${b.id}`} pointerEvents="none">
                <path id={`band-${b.id}`} d={d} fill="none" stroke="none" />
                <path
                  d={d}
                  fill="none"
                  stroke={idle ? belt.band : FILLS[b.state]}
                  strokeOpacity={idle ? 0.38 : 0.75}
                  strokeWidth={22 / k}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {b.label && (
                  <text
                    fontSize={11 / k}
                    fontWeight={800}
                    fill={belt.ink}
                    stroke="#fff"
                    strokeWidth={3 / k}
                    paintOrder="stroke"
                    letterSpacing={`${2 / k}`}
                  >
                    <textPath href={`#band-${b.id}`} startOffset="50%" textAnchor="middle">
                      {b.label}
                    </textPath>
                  </text>
                )}
              </g>
            )
          })}

          {/* Circle markers so micro-states stay findable and tappable. They
              scale away as you zoom in, because by then the shape is visible. */}
          {(countryMarkers ? drawn : []).map((f) => {
            const iso = f.properties.iso
            const l = layout[iso]
            if (!l || l.px * k >= MARKER_THRESHOLD_PX) return null
            const state = states[iso] ?? 'idle'
            return (
              <circle
                key={`m-${iso}`}
                cx={l.cx}
                cy={l.cy}
                r={MARKER_RADIUS_PX / k}
                fill={state === 'idle' ? 'transparent' : FILLS[state]}
                fillOpacity={state === 'idle' ? 0 : 0.9}
                stroke="#1f2d4d"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
                className={askSet.has(iso) ? 'cursor-pointer' : undefined}
                onClick={(e) => handle(iso, e)}
              />
            )
          })}

          {/* Place markers. Sized in screen pixels so they stay tappable at
              every zoom, like the micro-state markers above. */}
          {points?.map((p) => {
            const base = projection(p.point)
            if (!base) return null
            const isTarget = p.state === 'target'
            const shape = p.shape ?? 'dot'
            const r = ((isTarget ? PLACE_MARKER_PX + 3 : PLACE_MARKER_PX) * SHAPE_SCALE[shape]) / k
            const fill = p.state === 'idle' ? SHAPE_FILLS[shape] : FILLS[p.state]
            const [cx, cy] = base
            return (
              // Hit-testable only when a tap does something, so the cursor can
              // say so. The click itself still bubbles to the svg, which owns
              // the nearest-marker logic.
              <g
                key={`p-${p.id}`}
                pointerEvents={onPickPoint ? 'visiblePainted' : 'none'}
                className={onPickPoint ? 'cursor-pointer' : undefined}
              >
                {p.marker === false ? null : shape === 'strait' ? (
                  // A diamond pinched by two bars: a narrow gate between waters.
                  <g vectorEffect="non-scaling-stroke">
                    <path
                      d={`M ${cx} ${cy - r * 1.25} L ${cx + r * 1.25} ${cy}
                          L ${cx} ${cy + r * 1.25} L ${cx - r * 1.25} ${cy} Z`}
                      fill={fill}
                      fillOpacity={0.95}
                      stroke="#1f2d4d"
                      strokeWidth={isTarget ? 2 : 1}
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Bars take the marker's own colour, not the outline's —
                        in navy they out-weigh the diamond and the glyph reads
                        black instead of orange. fill="none" or the two bars
                        fill the space between them. */}
                    <path
                      d={`M ${cx - r * 2.1} ${cy} L ${cx - r * 1.3} ${cy}
                         M ${cx + r * 1.3} ${cy} L ${cx + r * 2.1} ${cy}`}
                      fill="none"
                      stroke={fill}
                      strokeWidth={isTarget ? 4 : 3}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ) : shape === 'peak' ? (
                  <path
                    d={`M ${cx} ${cy - r * 1.3} L ${cx + r * 1.15} ${cy + r * 0.9}
                        L ${cx - r * 1.15} ${cy + r * 0.9} Z`}
                    fill={fill}
                    fillOpacity={0.95}
                    stroke="#1f2d4d"
                    strokeWidth={isTarget ? 2.5 : 1.2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : shape === 'canal' ? (
                  <rect
                    x={cx - r * 0.85}
                    y={cy - r}
                    width={r * 1.7}
                    height={r * 2}
                    fill={fill}
                    fillOpacity={0.95}
                    stroke="#1f2d4d"
                    strokeWidth={isTarget ? 2.5 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={fill}
                      fillOpacity={p.state === 'idle' && shape === 'dot' ? 0.55 : 0.95}
                      stroke="#1f2d4d"
                      strokeWidth={isTarget ? 2.5 : 1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                    {shape === 'ocean' && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r * 0.45}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </>
                )}
                {p.label && (
                  <text
                    x={cx}
                    y={cy - (p.marker === false ? -5 : PLACE_MARKER_PX * SHAPE_SCALE[shape] + 6) / k}
                    textAnchor="middle"
                    fontSize={(isTarget ? 15 : 11) / k}
                    fontWeight={800}
                    fill="#0f172a"
                    stroke="#fff"
                    strokeWidth={3 / k}
                    paintOrder="stroke"
                  >
                    {p.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Where the player tapped, drawn next to the answer on reveal. */}
          {markPoint &&
            (() => {
              const base = projection(markPoint)
              if (!base) return null
              const r = 6 / k
              return (
                <g pointerEvents="none" stroke="#1f2d4d" strokeWidth={2.5} vectorEffect="non-scaling-stroke">
                  <line x1={base[0] - r} y1={base[1] - r} x2={base[0] + r} y2={base[1] + r} />
                  <line x1={base[0] - r} y1={base[1] + r} x2={base[0] + r} y2={base[1] - r} />
                </g>
              )
            })()}

          {pinPoint &&
            (() => {
              const base = projection(pinPoint)
              if (!base) return null
              return (
                <g transform={`translate(${base[0]} ${base[1]}) scale(${1 / k})`} pointerEvents="none">
                  <path
                    d="M0 0 c -7 -9 -11 -13 -11 -19 a 11 11 0 1 1 22 0 c 0 6 -4 10 -11 19 z"
                    fill="#f43f5e"
                    stroke="#fff"
                    strokeWidth={2}
                  />
                  <circle cx={0} cy={-19} r={4} fill="#fff" />
                </g>
              )
            })()}

          {pinIso && layout[pinIso] && (
            <g
              transform={`translate(${layout[pinIso].cx} ${layout[pinIso].cy}) scale(${1 / k})`}
              pointerEvents="none"
            >
              <path
                d="M0 0 c -7 -9 -11 -13 -11 -19 a 11 11 0 1 1 22 0 c 0 6 -4 10 -11 19 z"
                fill="#f43f5e"
                stroke="#fff"
                strokeWidth={2}
              />
              <circle cx={0} cy={-19} r={4} fill="#fff" />
            </g>
          )}

          {labels !== 'none' &&
            drawn.map((f) => {
              const iso = f.properties.iso
              const l = layout[iso]
              if (!l) return null
              const isSelected = selectedIso === iso
              if (labels === 'selected' && !isSelected) return null
              return (
                <text
                  key={`l-${iso}`}
                  x={l.cx}
                  y={l.cy}
                  textAnchor="middle"
                  pointerEvents="none"
                  fontSize={(isSelected ? 15 : 10) / k}
                  fontWeight={700}
                  fill={isSelected ? '#0f172a' : '#64748b'}
                  // The selected country is painted under its own name, so the
                  // label needs a halo to stay readable on the fill.
                  stroke={isSelected ? '#fff' : undefined}
                  strokeWidth={isSelected ? 3.5 / k : undefined}
                  paintOrder="stroke"
                >
                  {metaOf(iso).name}
                </text>
              )
            })}
        </g>
      </svg>
    </div>
  )
}
