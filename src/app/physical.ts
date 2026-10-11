/**
 * The physical map's sections still waiting for their notes. Each already has
 * its map — the world as land and water, borders on a switch — at a route of
 * its own, so filling one in is adding to that screen, not making it.
 */
export const PHYSICAL_SECTIONS = [
  { id: 'physical-rivers', title: 'Rivers', icon: 'river' },
  { id: 'physical-mountains', title: 'Mountains', icon: 'mountain' },
  { id: 'physical-deserts', title: 'Deserts', icon: 'desert' },
  { id: 'physical-grasslands', title: 'Grasslands', icon: 'grass' },
  { id: 'physical-lakes', title: 'Lakes', icon: 'lake' },
] as const

export type PhysicalSection = (typeof PHYSICAL_SECTIONS)[number]

export const physicalSection = (id: string): PhysicalSection | undefined =>
  PHYSICAL_SECTIONS.find((s) => s.id === id)
