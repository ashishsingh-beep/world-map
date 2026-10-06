import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { geoEquirectangular, geoGraticule, geoPath } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { featureByIso, meta, metaOf, type CountryFeature } from '../data/countries'
import { areaOf as waterAreaOf } from '../data/marine'
import { areaOf as landAreaOf } from '../data/land'
import { placeById } from '../data/places'
import { indiaDivides, indiaLand, indiaOutline, stateLines } from '../data/india'
import { outlineWithoutSeam } from './seam'
import { formatLat, formatLon, GRID_STEPS, REFERENCE_LINES } from './grid'
import { loadGrid, saveGrid } from '../app/storage'

/** How a country is painted. Drives both fill colour and hit behaviour. */
export type CountryState = 'idle' | 'correct' | 'wrong' | 'missed' | 'target'

/** A country smaller than this many screen pixels gets a circle marker instead. */
const MARKER_THRESHOLD_PX = 9
const MARKER_RADIUS_PX = 9
/**
 * Archipelagos ringed until their largest island is this big, not 9px. Viti
 * Levu, Guadalcanal and Espiritu Santo each clear 9px on the Oceania map, but
 * what you are looking for there is a scatter of specks, not one island — the
 * reference rings all three, and Timor-Leste, one solid island, it does not.
 */
const ARCHIPELAGO_THRESHOLD_PX: Partial<Record<string, number>> = { FJI: 48, SLB: 48, VUT: 48 }
/** Padding factor when the map zooms in to reveal a country. */
const REVEAL_PADDING = 6
const MAX_REVEAL_SCALE = 14
/**
 * How far a hand can zoom in. Deep enough that the smallest land drawn —
 * Ilhéu das Rolas on the Equator, Tuvalu's atolls — is a shape and not a
 * speck. Automatic zooms keep their own, much lower, caps.
 */
const MAX_ZOOM = 400

/** The look of the map's own buttons, Lat/Long and Reset. */
const CONTROL =
  'flex w-[60px] cursor-pointer flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] leading-none font-extrabold shadow-lg transition'
/** A point has no size of its own, so its reveal zoom is capped rather than fitted. */
const POINT_REVEAL_SCALE = 5
/** A Type-mode sea smaller than this on the unzoomed map is zoomed to while asked. */
const SMALL_SEA_PX = 30
/** How much of its surroundings a focused sea is shown with: this many times its size… */
const FOCUS_CONTEXT = 4
/** …and never less than this much of the map, so there are coasts to know it by. */
const FOCUS_MIN_DEG = 20
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
 * apart — so a sea and a strait are never confused at a glance. `capital` is
 * the same circle as `dot`, coloured apart for the same reason: a places round
 * mixes capitals in with cities, ports and islands, and the one thing worth
 * finding at a glance is which pin is the capital.
 */
export type MarkerShape = 'dot' | 'capital' | 'ocean' | 'sea' | 'strait' | 'canal' | 'peak'

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

/**
 * A band with no belt is a coast — the Gold Coast, the Slave Coast — laid
 * along the shoreline. Amber, the notes' own ink for them: the belts' sky blue
 * would vanish half over the sea.
 */
const COAST_BAND = { band: '#e0a030', ink: '#7c2d12' }

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
export const SHAPE_FILLS: Record<MarkerShape, string> = {
  dot: '#ffffff',
  // Gold, the cartographic convention for a capital — and the one colour nothing
  // else on the map already uses.
  capital: '#ca8a04',
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
  capital: 1,
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
  /**
   * The sea a Type-mode question has painted. Zoomed to while it is asked, but
   * only when it is too small to find on the unzoomed map.
   */
  focusPoints?: [number, number][] | null
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

/**
 * Lon/lats by value. Callers build a fresh array on every render, and a round
 * re-renders many times a second while its clock runs; a camera keyed on that
 * identity restarted its zoom each time and crept toward the answer without
 * ever arriving.
 */
function useStablePoints(points: [number, number][] | null): [number, number][] | null {
  const key = points?.flat().join(',') ?? ''
  return useMemo(() => {
    if (!key) return null
    const n = key.split(',').map(Number)
    const out: [number, number][] = []
    for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]])
    return out
  }, [key])
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
  focusPoints = null,
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
     * A view may cross the antimeridian, written as an east past 180 — Oceania
     * runs 110°E to 210°E. Turn the globe so that view's own middle meridian
     * is the middle of the map. Without it d3 cuts the Pacific down the 180th:
     * Samoa, Tonga and Kiribati come out at the far left of the map while
     * Australia sits at the far right, and the fitted box is 356° wide, so the
     * whole round is drawn at world scale.
     *
     * Only when the view asks for it. Every other round keeps a rotation of
     * zero, and so keeps the map it has always drawn.
     */
    if (e > 180 || w < -180) p.rotate([-(w + e) / 2, 0])
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

  /**
   * How big a country looks on screen, measured as its largest single piece.
   *
   * Not the bounds of the whole feature: Fiji, New Zealand, Russia and the USA
   * straddle the antimeridian, and a feature with parts on both sides has
   * bounds as wide as the map. Fiji came out 1,336px across on the world map —
   * so it never fell under the marker threshold, and the one country that most
   * needs a ring to be findable was the one that never got one.
   *
   * The largest piece is the honest answer to "is this visible without help?"
   * anyway: the USA does not need a marker because the lower 48 are big, not
   * because Guam and Maine are far apart.
   */
  const biggestPartPx = useCallback(
    (f: CountryFeature) => {
      const parts =
        f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.map((coordinates) => ({ type: 'Polygon' as const, coordinates }))
          : [f.geometry]
      let px = 0
      for (const part of parts) {
        const b = path.bounds(part as never)
        px = Math.max(px, b[1][0] - b[0][0], b[1][1] - b[0][1])
      }
      return px
    },
    [path]
  )

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
      out[iso] = { cx: x, cy: y, px: biggestPartPx(f) }
    }
    return out
  }, [drawn, projection, biggestPartPx, size.width])

  // Pan and zoom by hand, same as the reference.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !size.width) return
    const behaviour = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
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

  const stableRevealPoints = useStablePoints(revealPoints)
  const stableFocusPoints = useStablePoints(focusPoints)

  /**
   * Where a set of lon/lats sits on the unzoomed map, and how big it is. A frame
   * running across the map's own edge — the Bering Sea on a world cut at
   * 168.75°W — projects to both sides at once and would fit the whole map, so
   * it is walked point by point, each kept within half a world of the last,
   * and comes out as one piece hanging off that edge.
   */
  const frameOf = useCallback(
    (points: [number, number][]) => {
      const bases = points.map((p) => projection(p)).filter(Boolean) as [number, number][]
      if (!bases.length) return null
      const worldPx = projection.scale() * 2 * Math.PI
      for (let i = 1; i < bases.length; i++) {
        const prev = bases[i - 1][0]
        let x = bases[i][0]
        while (x - prev > worldPx / 2) x -= worldPx
        while (prev - x > worldPx / 2) x += worldPx
        bases[i] = [x, bases[i][1]]
      }
      const xs = bases.map((b) => b[0])
      const ys = bases.map((b) => b[1])
      return {
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        cx: (Math.max(...xs) + Math.min(...xs)) / 2,
        cy: (Math.max(...ys) + Math.min(...ys)) / 2,
      }
    },
    [projection]
  )

  /**
   * The camera. It moves on reveal, and otherwise only for something small
   * painted by a Type-mode question — never while a Pin-mode question is being asked,
   * where the camera would hand the player the answer.
   */
  useEffect(() => {
    const revealPoints = stableRevealPoints
    const focusPoints = stableFocusPoints
    const svg = svgRef.current
    const behaviour = zoomRef.current
    if (!svg || !behaviour || !size.width) return
    const sel = select(svg)

    // Framed in the part of the map that is not under a panel or the HUD.
    const viewW = Math.max(1, size.width - pad.left - pad.right)
    const viewH = Math.max(1, size.height - pad.top - pad.bottom)
    const midX = pad.left + viewW / 2
    const midY = pad.top + viewH / 2
    const at = (cx: number, cy: number, k: number) =>
      zoomIdentity.translate(midX - cx * k, midY - cy * k).scale(k)

    if (revealPoints?.length) {
      const fr = frameOf(revealPoints)
      if (!fr) return
      // Fit whatever has to be visible, but never zoom past the point cap —
      // a single point has no extent to fit to.
      const k = Math.max(
        1,
        Math.min(
          POINT_REVEAL_SCALE,
          viewW / Math.max(fr.w * 1.6, 1),
          viewH / Math.max(fr.h * 1.6, 1)
        )
      )
      sel.transition().duration(650).call(behaviour.transform, at(fr.cx, fr.cy, k))
      return
    }

    // A Type-mode sea, country or place too small to find at this scale:
    // frame it with its surroundings, so it can be seen and still recognised. Back to the
    // whole map first if the last reveal left the camera zoomed, so each
    // question starts from the same place.
    const fr = focusPoints?.length ? frameOf(focusPoints) : null
    if (fr && Math.max(fr.w, fr.h) < SMALL_SEA_PX) {
      const pxPerDeg = (projection.scale() * Math.PI) / 180
      const span = Math.max(Math.max(fr.w, fr.h) * FOCUS_CONTEXT, FOCUS_MIN_DEG * pxPerDeg)
      const k = Math.min(60, Math.min(viewW, viewH) / span)
      const t = sel.transition()
      const from = zoomTransform(svg).k > 1.01 ? t.duration(450).call(behaviour.transform, zoomIdentity).transition() : t
      from.duration(700).call(behaviour.transform, at(fr.cx, fr.cy, k))
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
      Math.max(1, Math.min(viewW / (w * REVEAL_PADDING), viewH / (h * REVEAL_PADDING)))
    )
    const cx = (b[0][0] + b[1][0]) / 2
    const cy = (b[0][1] + b[1][1]) / 2
    sel.transition().duration(650).call(behaviour.transform, at(cx, cy, k))
  }, [
    revealIso,
    stableRevealPoints,
    stableFocusPoints,
    frameOf,
    projection,
    path,
    size.width,
    size.height,
    pad.left,
    pad.right,
    pad.top,
    pad.bottom,
  ])

  const k = transform.k

  /** Already showing the round's whole frame, so Reset has nothing to do. */
  const atHome = k < 1.001 && Math.abs(transform.x) < 0.5 && Math.abs(transform.y) < 0.5
  const resetZoom = () => {
    const svg = svgRef.current
    const behaviour = zoomRef.current
    if (!svg || !behaviour) return
    select(svg).transition().duration(500).call(behaviour.transform, zoomIdentity)
  }

  /**
   * Latitude and longitude, switched on and off from the map itself and
   * remembered for every map after it. The graticule is the finest spacing
   * that keeps its lines ~48px apart at the current zoom — 30° on a phone's
   * world map, 15° (an hour) on a desktop's, a degree or two over India.
   */
  const [grid, setGrid] = useState(loadGrid)
  const toggleGrid = () => {
    const next = !grid
    setGrid(next)
    saveGrid(next)
  }
  const pxPerDeg = ((projection.scale() * Math.PI) / 180) * k
  const gridStep = GRID_STEPS.find((s) => s * pxPerDeg >= 48) ?? GRID_STEPS[GRID_STEPS.length - 1]
  /**
   * Under a degree, only the cells on screen: a tenth-of-a-degree graticule
   * of the whole globe is half a million points. Snapped outward to the step,
   * so panning within a cell does not rebuild it.
   */
  const gridExtent = (() => {
    const whole = '-180,-90,180,90'
    if (!grid || gridStep >= 1 || !size.width) return whole
    const corner = (x: number, y: number) => projection.invert?.(transform.invert([x, y]))
    const nw = corner(0, 0)
    const se = corner(size.width, size.height)
    if (!nw || !se) return whole
    // Across the 180th the east edge is counted on past it, as views are.
    const east = se[0] < nw[0] ? se[0] + 360 : se[0]
    const snap = (v: number, up: boolean) => (up ? Math.ceil(v / gridStep) + 1 : Math.floor(v / gridStep) - 1) * gridStep
    return [snap(nw[0], false), Math.max(-90, snap(se[1], false)), snap(east, true), Math.min(90, snap(nw[1], true))].join(',')
  })()
  const graticulePath = useMemo(() => {
    if (!grid) return null
    const [w, s, e, n] = gridExtent.split(',').map(Number)
    const lines = geoGraticule()
      .extent([
        [w, Math.max(s, -90 + 1e-6)],
        [e, Math.min(n, 90 - 1e-6)],
      ])
      .step([gridStep, gridStep])
      .precision(Math.min(2.5, gridStep))
      .lines()
    return path({ type: 'MultiLineString', coordinates: lines.map((l) => l.coordinates) }) ?? null
  }, [grid, gridStep, gridExtent, path])
  const referencePaths = useMemo(
    () =>
      grid
        ? REFERENCE_LINES.map((l) => ({
            ...l,
            d: path({ type: 'LineString', coordinates: l.coordinates }) ?? undefined,
            base: l.coordinates.map((c) => projection(c)),
          }))
        : [],
    [grid, path, projection]
  )

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
    <div ref={wrapRef} className={className ?? 'relative h-full w-full'}>
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
          {/* Under the land too: a region of Oceania is mostly ocean with its
              islands in it, so it tints the sea the way the notes do and leaves
              the islands — and Australia's states over it — to be read. In the
              notes' own colour, which is what tells Melanesia from Polynesia. */}
          {areas?.map((a) => {
            const place = placeById.get(a.id)
            const tint = place?.onLand ? undefined : place?.tint
            const f = tint ? landAreaOf(a.id) : null
            if (!f || !tint) return null
            const idle = a.state === 'idle'
            const d = path(f) ?? undefined
            // A pale wash first: straight onto the cyan sea, red reads as grey
            // and pink as lavender, and the notes' pastels are lost.
            return (
              <Fragment key={`r-${a.id}`}>
                <path d={d} fill="#ffffff" fillOpacity={0.85} stroke="none" pointerEvents="none" />
                <path
                  d={d}
                  fill={idle ? tint : FILLS[a.state]}
                  fillOpacity={idle ? 0.32 : 0.7}
                  stroke={idle ? tint : FILLS[a.state]}
                  strokeOpacity={0.9}
                  strokeWidth={idle ? 1.2 : 2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              </Fragment>
            )
          })}

          {/* Under the land: a sea's polygon runs up to the coast and beyond it
              in places, and the coastline has to stay the thing you read. */}
          {areas?.map((a) => {
            const f = waterAreaOf(a.id)
            if (!f) return null
            const idle = a.state === 'idle'
            const seamless = outlineWithoutSeam(f.geometry)
            const stroke = {
              stroke: idle ? '#0369a1' : FILLS[a.state],
              strokeOpacity: idle ? 0.35 : 0.9,
              strokeWidth: idle ? 0.8 : 1.6,
            }
            return (
              <Fragment key={`a-${a.id}`}>
                <path
                  d={path(f) ?? undefined}
                  fill={idle ? '#0369a1' : FILLS[a.state]}
                  fillOpacity={idle ? 0.18 : 0.75}
                  {...(seamless ? { stroke: 'none' } : stroke)}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {seamless && (
                  <path
                    d={path(seamless) ?? undefined}
                    fill="none"
                    {...stroke}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
              </Fragment>
            )
          })}

          {drawn.map((f) => {
            const iso = f.properties.iso
            const state = states[iso] ?? 'idle'
            const seamless = outlineWithoutSeam(f.geometry)
            return (
              <Fragment key={iso}>
                <path
                  d={path(f) ?? undefined}
                  fill={FILLS[state]}
                  stroke={seamless ? 'none' : '#1f2d4d'}
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  className={askSet.has(iso) ? 'cursor-pointer' : undefined}
                  onClick={(e) => handle(iso, e)}
                />
                {seamless && (
                  <path
                    d={path(seamless) ?? undefined}
                    fill="none"
                    stroke="#1f2d4d"
                    strokeWidth={0.6}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
              </Fragment>
            )
          })}

          {/* Over the land, the opposite of a sea: a peninsula's polygon is
              solid ground, so highlighting it under the country fill would
              bury the highlight completely rather than let it show at the
              coast. */}
          {areas?.map((a) => {
            const f = landAreaOf(a.id)
            if (!f) return null
            const idle = a.state === 'idle'
            // A region over the sea is drawn under the land instead, above;
            // one on land keeps its own colour here.
            const place = placeById.get(a.id)
            if (place?.tint && !place.onLand) return null
            const ink = place?.tint ?? '#c2410c'
            return (
              <path
                key={`la-${a.id}`}
                d={path(f) ?? undefined}
                fill={idle ? ink : FILLS[a.state]}
                fillOpacity={idle ? 0.32 : 0.75}
                stroke={idle ? ink : FILLS[a.state]}
                strokeOpacity={idle ? 0.55 : 0.9}
                strokeWidth={idle ? 1 : 1.6}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
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

          {/* The grid, over the land so the Equator can be followed across
              Africa, under every band, marker and name. A white casing under
              each named line keeps it legible over the cyan sea and the
              pale land alike. */}
          {grid && (
            <g pointerEvents="none" fill="none">
              <path
                d={graticulePath ?? undefined}
                stroke="#1f2d4d"
                strokeOpacity={0.28}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
              {referencePaths.map((l) => (
                <Fragment key={`g-${l.id}`}>
                  <path
                    d={l.d}
                    stroke="#fff"
                    strokeOpacity={0.75}
                    strokeWidth={3.6}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={l.d}
                    stroke={l.colour}
                    strokeWidth={1.8}
                    strokeDasharray={l.dash}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </Fragment>
              ))}
            </g>
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
            const belt = b.belt ? BELT_BAND[b.belt] : COAST_BAND
            // A coast is short and kinked where a ridgeline is long and smooth:
            // text along it ran off the end or folded at a headland, so its
            // name sits upright at the middle of the shore instead.
            const mid = b.belt ? null : projection(b.line[Math.floor(b.line.length / 2)])
            return (
              <g key={`b-${b.id}`} pointerEvents="none">
                <path id={`band-${b.id}`} d={d} fill="none" stroke="none" />
                <path
                  d={d}
                  fill="none"
                  stroke={idle ? belt.band : FILLS[b.state]}
                  strokeOpacity={idle ? 0.38 : 0.75}
                  strokeWidth={(b.belt ? 22 : 14) / k}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {b.label && mid && (
                  <text
                    x={mid[0]}
                    y={mid[1] + 20 / k}
                    fontSize={11 / k}
                    fontWeight={800}
                    fill={belt.ink}
                    stroke="#fff"
                    strokeWidth={3 / k}
                    paintOrder="stroke"
                    textAnchor="middle"
                  >
                    {b.label}
                  </text>
                )}
                {b.label && !mid && (
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
            if (!l || l.px * k >= (ARCHIPELAGO_THRESHOLD_PX[iso] ?? MARKER_THRESHOLD_PX)) return null
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
                    fill="#1f2d4d"
                    stroke="#fff"
                    strokeWidth={3.5 / k}
                    strokeLinejoin="round"
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
                  fontSize={(isSelected ? 15 : 12) / k}
                  fontWeight={800}
                  fill="#1f2d4d"
                  // A halo keeps the name readable over borders, marker rings
                  // and the selected country's own fill.
                  stroke="#fff"
                  strokeWidth={3.5 / k}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {metaOf(iso).name}
                </text>
              )
            })}
        </g>

        {grid && gridLabels()}
      </svg>

      {/* The map's own controls, at its right edge halfway down: the one
          place no screen puts anything of its own. */}
      <div className="absolute top-1/2 right-3 z-[5] flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={toggleGrid}
          aria-pressed={grid}
          title={grid ? 'Hide latitude and longitude' : 'Show latitude and longitude'}
          className={`${CONTROL} ${grid ? 'bg-[#1f2d4d] text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="11" cy="11" rx="4" ry="9" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 11h18M3.5 6.5h15M3.5 15.5h15" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2 11h18" stroke="#dc2626" strokeWidth="1.8" />
          </svg>
          Lat/Long
        </button>
        {/* Back to the round's own frame, from however far in or across
            you have gone. Greyed when you are already there. */}
        <button
          type="button"
          onClick={resetZoom}
          disabled={atHome}
          title="Back to the whole map"
          className={`${CONTROL} bg-white text-slate-700 enabled:hover:bg-slate-100 disabled:cursor-default disabled:opacity-45`}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path
              d="M3 8V3h5M19 8V3h-5M3 14v5h5M19 14v5h-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="11" cy="11" r="2.2" fill="currentColor" />
          </svg>
          Reset
        </button>
      </div>
    </div>
  )

  /**
   * Names in screen space, not on the map: they hug the edges of whatever is
   * on screen, so a parallel is named at the left wherever you have panned,
   * and the numbers along the edges stay as many as the graticule's lines.
   */
  function gridLabels() {
    const { width: W, height: H } = size
    const s = projection.scale()
    const [tx, ty] = projection.translate()
    const mapL = transform.applyX(tx - s * Math.PI)
    const mapR = transform.applyX(tx + s * Math.PI)
    const mapT = transform.applyY(ty - (s * Math.PI) / 2)
    const mapB = transform.applyY(ty + (s * Math.PI) / 2)
    const left = Math.max(mapL, 0) + 6
    const foot = Math.min(mapB, H) - 6
    const yOf = (lat: number) => transform.applyY(projection([0, lat])?.[1] ?? NaN)
    const xOf = (lon: number) => transform.applyX(projection([lon, 0])?.[0] ?? NaN)
    const onScreenY = (y: number) => y > Math.max(mapT, 0) + 10 && y < Math.min(mapB, H) - 4
    const onScreenX = (x: number) => x > Math.max(mapL, 0) + 4 && x < Math.min(mapR, W) - 4

    const named = referencePaths.flatMap((l) => {
      if (l.runs === 'parallel') {
        const y = yOf(l.coordinates[0][1])
        return onScreenY(y) ? [{ l, text: `${l.name} ${l.at}`, x: left, y: y - 5, vertical: false }] : []
      }
      // A meridian is named reading upward from just above the foot of the
      // map, beside the line where it crosses that height; the Date Line's
      // zig-zag included. A segment that leaps the map is the seam, not it.
      const at = foot - 18
      const pts = l.base.map((b) => (b ? (transform.apply(b) as [number, number]) : null))
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        if (!a || !b || Math.abs(b[0] - a[0]) > W / 2 || a[1] <= at === b[1] <= at) continue
        const x = a[0] + ((at - a[1]) / (b[1] - a[1])) * (b[0] - a[0])
        if (!onScreenX(x)) continue
        // Rotated, a name has only the map's height to run in: on a phone's
        // world map that is not enough for the whole of it, so it loses its
        // number first and then its name, rather than running off the map.
        const room = at - Math.max(mapT, 0) - 8
        const text = [`${l.name} ${l.at}`, l.name].find((t) => t.length * 6.2 <= room)
        return text ? [{ l, text, x: x - 5, y: at, vertical: true }] : []
      }
      return []
    })
    const namedYs = named.filter((n) => !n.vertical).map((n) => n.y + 5)

    // Counted in whole steps, not summed, or a tenth of a degree drifts.
    const lats: number[] = []
    for (let i = 1; i * gridStep < 180; i++) lats.push(-90 + i * gridStep)
    // A longitude is wider than the gap between its lines on a small screen:
    // every other one is named, or every third, until they stop touching.
    const lonEvery = gridStep * ([1, 2, 3, 4, 6, 12].find((m) => gridStep * m * pxPerDeg >= 40) ?? 12)
    const lons: number[] = []
    for (let i = 0; i * gridStep < 360; i++) {
      const lon = -180 + i * gridStep
      if (Math.abs(lon / lonEvery - Math.round(lon / lonEvery)) < 1e-6) lons.push(lon)
    }

    const halo = { stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' as const, paintOrder: 'stroke' }
    return (
      <g pointerEvents="none" fontWeight={800}>
        {lats.map((lat) => {
          const y = yOf(lat)
          // Not down among the longitudes along the foot.
          if (!onScreenY(y) || y > foot - 14 || namedYs.some((n) => Math.abs(n - y) < 14)) return null
          return (
            <text key={`la-${lat}`} x={left} y={y - 3} fontSize={10} fill="#1f2d4d" fillOpacity={0.75} {...halo}>
              {formatLat(lat)}
            </text>
          )
        })}
        {lons.map((lon) => {
          const x = xOf(lon)
          if (!onScreenX(x)) return null
          return (
            <text key={`lo-${lon}`} x={x + 3} y={foot} fontSize={10} fill="#1f2d4d" fillOpacity={0.75} {...halo}>
              {formatLon(lon)}
            </text>
          )
        })}
        {named.map(({ l, text, x, y, vertical }) => (
          <text
            key={`n-${l.id}`}
            x={x}
            y={y}
            fontSize={11}
            fill={l.colour}
            transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}
            {...halo}
          >
            {text}
          </text>
        ))}
      </g>
    )
  }
}
