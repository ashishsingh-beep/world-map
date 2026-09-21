import { feature } from 'topojson-client'
import type { Feature, Geometry } from 'geojson'
import topo from './india.topo.json'

/**
 * India's states and union territories, for the Indian map.
 *
 * Natural Earth publishes no India point-of-view admin-1 file — its ISO build
 * stops Indian territory at 35.5°N, carves out a separate "Kashmir" and gives
 * Pakistan "Azad Kashmir". This comes from an Indian district source instead,
 * dissolved to states, and `npm run data` asserts Ladakh reaches ~37°N before
 * it will write this file. See the first non-negotiable in CLAUDE.md.
 *
 * Drawn for context only: a state is never a question here. The mountains are.
 */
export type StateFeature = Feature<Geometry, { state: string }>

const collection = feature(
  topo as never,
  (topo as never as { objects: Record<string, unknown> }).objects.states as never
) as unknown as { features: StateFeature[] }

export const states: StateFeature[] = collection.features
