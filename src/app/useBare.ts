import { useState } from 'react'
import { loadBare, saveBare } from './storage'
import type { MapBare } from '../map/MapCanvas'

/** The clear-the-screen switch for a Learn map, remembered across every map. */
export function useBare(): MapBare {
  const [on, setOn] = useState(loadBare)
  return {
    on,
    toggle: () => {
      saveBare(!on)
      setOn(!on)
    },
  }
}
