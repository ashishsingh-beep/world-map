import { useEffect, useMemo, useRef, useState } from 'react'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { featureByIso, metaOf, type CountryFeature } from '../data/countries'

/** How a country is painted. Drives both fill colour and hit behaviour. */
export type CountryState = 'idle' | 'correct' | 'wrong' | 'missed' | 'target'

/** A country smaller than this many screen pixels gets a circle marker instead. */
const MARKER_THRESHOLD_PX = 9
const MARKER_RADIUS_PX = 9
/** Padding factor when the map zooms in to reveal a country. */
const REVEAL_PADDING = 6
const MAX_REVEAL_SCALE = 14

/** Screen-space clearance around the fitted geography, so it doesn't butt up
 *  against the viewport edge or hide behind HUD chrome a screen overlays. */
export interface MapPadding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

const DEFAULT_PADDING: Required<MapPadding> = { top: 24, right: 24, bottom: 24, left: 24 }

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

  const drawn = useMemo(
    () => render.map((iso) => featureByIso.get(iso)).filter(Boolean) as CountryFeature[],
    [render]
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
        svg.style.cursor = 'grabbing'
      })
      .on('zoom', (event) => setTransform(event.transform))
      .on('end', () => {
        svg.style.cursor = 'grab'
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
  }, [revealIso, path, size.width, size.height])

  const k = transform.k
  const handle = (iso: string) => {
    if (onPick && askSet.has(iso)) onPick(iso)
  }

  return (
    <div ref={wrapRef} className={className ?? 'h-full w-full'}>
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        className="block touch-none select-none"
        style={{ background: '#22cdfb', cursor: 'grab' }}
      >
        <g transform={transform.toString()}>
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
                onClick={() => handle(iso)}
              />
            )
          })}

          {/* Circle markers so micro-states stay findable and tappable. They
              scale away as you zoom in, because by then the shape is visible. */}
          {drawn.map((f) => {
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
                onClick={() => handle(iso)}
              />
            )
          })}

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
