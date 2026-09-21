import { feature } from 'topojson-client'
import type { Feature, Geometry } from 'geojson'
import topo from './india.topo.json'
import frameTopo from './india-frame.topo.json'

/**
 * The Indian map's geography: India, the neighbours that frame it, and the
 * state lines inside.
 *
 * India and its neighbours both come from Natural Earth's India point-of-view
 * build — the same file the world map uses, where PoK, Gilgit-Baltistan and
 * Aksai Chin are already inside India. India was drawn from the Indian district
 * source here for a while, on the reasoning that its border was the trustworthy
 * one, but one source's India against another's Pakistan left hairline slivers
 * of sea along every land border and jagged ribbons where the two coastlines
 * disagreed. Only one dataset can say where the land stops.
 *
 * The district source stays for the one thing Natural Earth has no India point
 * of view of at all: the states.
 */
export type StateFeature = Feature<Geometry, { state: string }>

const objects = (t: unknown) => (t as { objects: Record<string, unknown> }).objects
const layer = (t: unknown, name: string) =>
  (feature(t as never, objects(t)[name] as never) as unknown as { features: StateFeature[] })
    .features

/** India itself, filled and outlined — the only boundary drawn through Kashmir. */
export const indiaOutline: StateFeature[] = layer(frameTopo, 'india')

/**
 * The surround, dissolved to one shape. Filled and never stroked: an outline
 * here would run a second line beside India's own, through exactly the border
 * this project cannot afford to draw twice.
 */
export const indiaLand: StateFeature[] = layer(frameTopo, 'land')

/**
 * Where the neighbours part from each other — Pakistan from Afghanistan, Nepal
 * from China. Shared edges only, so nothing here touches India's border.
 */
export const indiaDivides: StateFeature[] = layer(frameTopo, 'divides')

/**
 * The state and union-territory boundaries, dissolved from an Indian district
 * source and clipped to the same India. Ladakh reaching ~37°N is asserted at
 * build time; a neutral-POV admin-1 file stops at 35.5 and would quietly redraw
 * Kashmir. See the first non-negotiable in CLAUDE.md.
 *
 * Inner boundaries only. The coast and the national border are India's own
 * outline to draw, once.
 *
 * Drawn for context: a state is never a question here. The mountains are.
 */
export const stateLines: StateFeature[] = layer(topo, 'statelines')

/** The states as areas. Nothing draws them yet; rounds about them would. */
export const states: StateFeature[] = layer(topo, 'states')
