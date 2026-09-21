import type { ReactNode } from 'react'

/** ISO-2 → regional indicator pair, e.g. "IN" → 🇮🇳. */
export function flagEmoji(iso2: string): string {
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  )
}

export function formatClock(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** The water notations, used by the Learn legend and the setup filter. */
export const WATER_KINDS = [
  { type: 'ocean' as const, label: 'Oceans' },
  { type: 'sea' as const, label: 'Seas' },
  { type: 'strait' as const, label: 'Straits' },
  { type: 'canal' as const, label: 'Canals' },
]

export type WaterKind = (typeof WATER_KINDS)[number]['type']

/**
 * Practice regions. Three plus All, not six continents: Africa rides with Asia
 * and Oceania with the Pacific side of it. A boundary sea counts in both of the
 * regions it touches, so these do not add up to the total.
 */
export const WATER_REGIONS = [
  { id: 'all' as const, label: 'All' },
  { id: 'america' as const, label: 'Americas' },
  { id: 'europe' as const, label: 'Europe' },
  { id: 'asia' as const, label: 'Asia' },
]

export type WaterRegion = (typeof WATER_REGIONS)[number]['id']

/** The marker as it is drawn on the map, so legend and map never drift apart. */
export function KindSwatch({ type }: { type: WaterKind }) {
  if (type === 'strait') {
    return (
      <svg width="18" height="14" viewBox="-9 -7 18 14" aria-hidden>
        <path d="M0 -5.5 L5.5 0 L0 5.5 L-5.5 0 Z" fill="#f97316" stroke="#1f2d4d" strokeWidth="1" />
        <path d="M-8.5 0 L-6 0 M6 0 L8.5 0" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'canal') {
    return (
      <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden>
        <rect x="-4" y="-5.5" width="8" height="11" fill="#a855f7" stroke="#1f2d4d" strokeWidth="1" />
      </svg>
    )
  }
  // Oceans and seas are drawn as their real extent now, so the legend shows a
  // patch rather than a pin. The two share a notation; their labels tell them
  // apart, and an ocean's patch is wider because an ocean is.
  const patch = (w: number) => (
    <svg width={w} height="14" viewBox={`0 0 ${w} 14`} aria-hidden>
      <path
        d={`M 2 9 Q ${w * 0.25} 3 ${w * 0.5} 6 Q ${w * 0.78} 9 ${w - 2} 4
            L ${w - 2} 11 L 2 12 Z`}
        fill="#0369a1"
        fillOpacity="0.35"
        stroke="#0369a1"
        strokeOpacity="0.7"
        strokeWidth="1"
      />
    </svg>
  )
  return patch(type === 'ocean' ? 20 : 15)
}

export function Button({
  children,
  onClick,
  variant = 'primary',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost'
}) {
  const base =
    'w-full rounded-full px-6 py-3 text-lg font-extrabold transition active:translate-y-0.5'
  const styles =
    variant === 'primary'
      ? 'bg-yellow-300 text-slate-900 shadow-[0_5px_0_#d4a72c] hover:bg-yellow-200'
      : 'bg-white/90 text-slate-700 shadow-[0_5px_0_#cbd5e1] hover:bg-white'
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}
