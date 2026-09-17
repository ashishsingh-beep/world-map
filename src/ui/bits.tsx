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
  if (type === 'ocean') {
    return (
      <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
        <circle r="8" fill="#0d9488" stroke="#1f2d4d" strokeWidth="1" />
        <circle r="3.6" fill="none" stroke="#fff" strokeWidth="1.5" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden>
      <circle r="5.5" fill="#1d4ed8" stroke="#1f2d4d" strokeWidth="1" />
    </svg>
  )
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
