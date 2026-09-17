import { useMemo } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { features, meta } from '../data/countries'
import { placeOf } from '../data/places'

/**
 * Drawings for tricks that are about *where* things are. A sentence can carry
 * "Bothnia, Baltic, Riga, Finland"; it cannot carry "left of this line", so
 * those tricks get a diagram and the mnemonic becomes its caption.
 *
 * Keys here are the `visual` field on a syllabus group, and `GROUP_VISUALS` in
 * `scripts/build-data.mjs` holds the same set so a typo fails the build.
 */

const W = 520
const H = 340

/** Land inside the frame, so the diagram is real geography, not a sketch. */
function landIn(box: [[number, number], [number, number]]) {
  const [[w, s], [e, n]] = box
  return features.filter((f) => {
    const m = meta[f.properties.iso]
    if (!m) return false
    const [[cw, cs], [ce, cn]] = m.bounds
    return cw <= e && ce >= w && cs <= n && cn >= s
  })
}

/** Mercator fitted to the corners as a MultiPoint — a Polygon reads as the
 *  whole globe minus the box (see the winding trap in CLAUDE.md). */
function frame(box: [[number, number], [number, number]]) {
  const [[w, s], [e, n]] = box
  return geoMercator().fitExtent(
    [
      [10, 10],
      [W - 10, H - 10],
    ],
    {
      type: 'MultiPoint',
      coordinates: [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
      ],
    } as never
  )
}

/** Blue for the seas whose name starts with A, pink for the ones ending -ian. */
const A_SIDE = '#1d4ed8'
const IAN_SIDE = '#be185d'

function ItalyGreeceSeas() {
  const box: [[number, number], [number, number]] = [
    [6, 33.5],
    [29.5, 47.5],
  ]
  const { path, projection } = useMemo(() => {
    const p = frame(box)
    return { path: geoPath(p), projection: p }
  }, [])

  const at = (lonLat: [number, number]) => projection(lonLat) ?? [0, 0]

  // Each rule runs northwest to southeast down the length of its peninsula.
  const rules: [[number, number], [number, number]][] = [
    [
      [6.8, 46.9],
      [19.2, 38.6],
    ],
    [
      [19.4, 41.8],
      [27.8, 34.6],
    ],
  ]

  const labels: { id: string; colour: string; anchor: 'start' | 'end' }[] = [
    { id: 'sea-adriatic', colour: A_SIDE, anchor: 'start' },
    { id: 'sea-aegean', colour: A_SIDE, anchor: 'start' },
    { id: 'sea-tyrrhenian', colour: IAN_SIDE, anchor: 'end' },
    { id: 'sea-ionian', colour: IAN_SIDE, anchor: 'end' },
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-[#cdeffd]" aria-hidden>
      {landIn(box).map((f) => (
        <path
          key={f.properties.iso}
          d={path(f) ?? undefined}
          fill={f.properties.iso === 'ITA' || f.properties.iso === 'GRC' ? '#fde68a' : '#f1f5e8'}
          stroke="#94a3b8"
          strokeWidth={0.7}
        />
      ))}

      {rules.map(([a, b], i) => {
        const [x1, y1] = at(a)
        const [x2, y2] = at(b)
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#0f172a"
            strokeWidth={2.5}
            strokeDasharray="7 5"
            strokeLinecap="round"
          />
        )
      })}

      {labels.map(({ id, colour, anchor }) => {
        const place = placeOf(id)
        const [x, y] = at(place.point)
        return (
          <g key={id}>
            <circle cx={x} cy={y} r={4} fill={colour} stroke="#fff" strokeWidth={1.5} />
            <text
              x={x + (anchor === 'start' ? 9 : -9)}
              y={y + 4}
              textAnchor={anchor}
              fontSize={17}
              fontWeight={800}
              fill={colour}
              stroke="#fff"
              strokeWidth={3.5}
              paintOrder="stroke"
            >
              {place.name}
            </text>
          </g>
        )
      })}

      {/* Which side is which, said once rather than per sea. */}
      <text x={W - 14} y={27} textAnchor="end" fontSize={16} fontWeight={800} fill={A_SIDE}>
        left of the line → starts with A
      </text>
      <text x={14} y={H - 14} fontSize={16} fontWeight={800} fill={IAN_SIDE}>
        right of the line → ends in -ian
      </text>
    </svg>
  )
}

export const TRICK_DIAGRAMS: Record<string, () => React.JSX.Element> = {
  'italy-greece-seas': ItalyGreeceSeas,
}

/** The diagram for a group, or null when the trick is fine as a sentence. */
export function TrickDiagram({ visual }: { visual?: string }) {
  const Diagram = visual ? TRICK_DIAGRAMS[visual] : undefined
  return Diagram ? <Diagram /> : null
}
