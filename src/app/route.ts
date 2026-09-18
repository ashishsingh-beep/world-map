import { useCallback, useEffect, useState } from 'react'
import { roundById } from '../game/rounds'

/**
 * Where you are, kept in the URL hash rather than in component state, so a
 * refresh lands you back on the same screen instead of the menu.
 *
 * The hash and not the path: this deploys as static files with no server, and a
 * path like /europe/learn would 404 on a hard refresh unless the host is set up
 * to rewrite it. A hash cannot, on any host, ever.
 *
 *   #/                     the menu
 *   #/europe               that round's setup
 *   #/europe/learn         Learn mode
 *   #/europe/play          a round in progress
 */
export type View = 'home' | 'setup' | 'learn' | 'play'

export interface Route {
  view: View
  roundId: string
}

export const HOME: Route = { view: 'home', roundId: 'world' }

/** Always returns a route that exists — a hand-edited hash cannot crash the app. */
export function parseHash(hash: string): Route {
  const [id, screen] = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (!id || !roundById(id)) return HOME
  if (screen === 'learn' || screen === 'play') return { view: screen, roundId: id }
  return { view: 'setup', roundId: id }
}

export function toHash(route: Route): string {
  if (route.view === 'home') return '#/'
  if (route.view === 'setup') return `#/${route.roundId}`
  return `#/${route.roundId}/${route.view}`
}

export function useRoute(): [Route, (next: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  // Compared rather than replaced, so the back button and a navigate() that
  // lands on the current screen do not both re-render the world.
  const apply = useCallback((hash: string) => {
    setRoute((prev) => {
      const next = parseHash(hash)
      return prev.view === next.view && prev.roundId === next.roundId ? prev : next
    })
  }, [])

  // Both events: navigate() uses pushState, which fires popstate on Back but
  // never hashchange; a hash typed into the address bar fires only hashchange.
  useEffect(() => {
    const sync = () => apply(window.location.hash)
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [apply])

  // Tidy a hash that was absent, abbreviated or nonsense, without adding a
  // history entry for the correction. Keyed on the route rather than run once
  // at mount, because editing the hash by hand never remounts anything.
  useEffect(() => {
    const wanted = toHash(route)
    if (window.location.hash !== wanted) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${wanted}`)
    }
  }, [route])

  const navigate = useCallback(
    (next: Route, replace = false) => {
      const hash = toHash(next)
      const url = `${window.location.pathname}${window.location.search}${hash}`
      if (replace) window.history.replaceState(null, '', url)
      else window.history.pushState(null, '', url)
      apply(hash)
    },
    [apply]
  )

  return [route, navigate]
}
