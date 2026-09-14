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
