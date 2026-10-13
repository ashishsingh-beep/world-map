import type { ReactNode } from 'react'

/**
 * The menus' one card and one section, so the home screen, the World Map and
 * the India Map read alike: an icon in its own tint, the title, a line on what
 * is inside, and a count at the foot. The whole card is the tap target; any
 * chips inside it (the Political Map's continents) sit above that and answer
 * on their own.
 */
export function MenuSection({ title, blurb, children }: { title: string; blurb: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
      <p className="mt-0.5 mb-3 text-sm text-slate-500">{blurb}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export type MenuIcon =
  | 'globe'
  | 'waves'
  | 'currents'
  | 'thermometer'
  | 'mountain'
  | 'river'
  | 'india'
  | 'desert'
  | 'grass'
  | 'lake'
  | 'climate'

const TINTS: Record<MenuIcon, string> = {
  globe: 'bg-amber-100 text-amber-700',
  waves: 'bg-sky-100 text-sky-700',
  currents: 'bg-rose-100 text-rose-700',
  thermometer: 'bg-orange-100 text-orange-700',
  mountain: 'bg-emerald-100 text-emerald-700',
  river: 'bg-blue-100 text-blue-700',
  india: 'bg-orange-100 text-orange-700',
  desert: 'bg-yellow-100 text-yellow-700',
  grass: 'bg-lime-100 text-lime-700',
  lake: 'bg-cyan-100 text-cyan-700',
  climate: 'bg-violet-100 text-violet-700',
}

export function MenuCard({
  icon,
  title,
  blurb,
  meta,
  onClick,
  wide = false,
  children,
}: {
  icon: MenuIcon
  title: string
  blurb: string
  meta: string
  onClick: () => void
  wide?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={`group relative flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md ${
        wide ? 'sm:col-span-2' : ''
      }`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TINTS[icon]}`}>
        <Icon name={icon} />
      </div>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onClick}
          // Stretched over the whole card, so anywhere on it is a tap.
          className="flex w-full cursor-pointer items-center justify-between gap-2 text-left after:absolute after:inset-0 after:rounded-2xl after:content-['']"
        >
          <span className="text-lg font-extrabold text-slate-900">{title}</span>
          <span aria-hidden className="text-lg font-bold text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500">
            →
          </span>
        </button>
        <p className="mt-0.5 text-sm text-slate-600">{blurb}</p>
        {children && <div className="relative z-10 mt-3">{children}</div>}
        <div className="mt-3 text-xs font-bold tracking-wide text-slate-400 uppercase">{meta}</div>
      </div>
    </div>
  )
}

function Icon({ name }: { name: MenuIcon }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'globe':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
        </svg>
      )
    case 'waves':
      return (
        <svg {...common}>
          <path d="M3 8c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0M3 13c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0M3 18c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
        </svg>
      )
    case 'currents':
      return (
        <svg {...common}>
          <path d="M4 15c3-6 9-8 15-5" />
          <path d="m16 7 3 3-3.6 1.4" />
          <path d="M20 9c-3 6-9 8-15 5" opacity="0.55" />
        </svg>
      )
    case 'thermometer':
      return (
        <svg {...common}>
          <path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z" />
          <path d="M12 9v6" />
        </svg>
      )
    case 'mountain':
      return (
        <svg {...common}>
          <path d="m3 19 6-10 4 6 2.5-3.5L21 19z" />
          <path d="m7.4 11.7 1.6 1.3 1.4-1.3" />
        </svg>
      )
    case 'river':
      return (
        <svg {...common}>
          <path d="M6 3c4 3-3 6 1 9s-2 6 2 9M14 3c3 2.5-1 5.5 2 8.5" />
        </svg>
      )
    case 'desert':
      return (
        <svg {...common}>
          <circle cx="16.5" cy="7" r="2.5" />
          <path d="M2 18c3-4 6-4 9-1.5 2.5-2.5 6-3 11 1.5M2 21h20" />
        </svg>
      )
    case 'grass':
      return (
        <svg {...common}>
          <path d="M3 20h18M6 20c0-4-1-7-3-9M9 20c0-5 1-9 3-12M14 20c0-4 1-7 4-9M18 20c0-3 0-5 2-7" />
        </svg>
      )
    case 'lake':
      return (
        <svg {...common}>
          <path d="M4 12c0-3.5 3.6-6 8-6s8 2.5 8 6-3.6 6-8 6-8-2.5-8-6z" />
          <path d="M8 12c1-.8 2-.8 3 0s2 .8 3 0" />
        </svg>
      )
    case 'climate':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.5" />
          <path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1" />
          <path d="M8 19h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4 1.5A2.8 2.8 0 0 0 8 19z" />
        </svg>
      )
    case 'india':
      return (
        <svg {...common}>
          <path d="M8 3h5l2 3 4 1-2 3-3 1-1 4-2 6-2-5-3-3V6z" />
        </svg>
      )
  }
}
