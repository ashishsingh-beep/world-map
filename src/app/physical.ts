/**
 * The physical map's sections. Each is a map at a route of its own — the
 * world as land and water, borders on a switch — until its notes arrive; then
 * its syllabus (`syllabus`, a syllabus file's `continent`) makes it a round,
 * and the section's card opens that round's setup instead.
 */
export const PHYSICAL_SECTIONS = [
  { id: 'physical-rivers', title: 'Rivers', icon: 'river', syllabus: 'World Rivers' },
  { id: 'physical-mountains', title: 'Mountains', icon: 'mountain', syllabus: 'World Mountains' },
  { id: 'physical-plateaus', title: 'Plateaus', icon: 'plateau', syllabus: 'World Plateaus' },
  { id: 'physical-deserts', title: 'Deserts', icon: 'desert', syllabus: 'World Deserts' },
  { id: 'physical-grasslands', title: 'Grasslands', icon: 'grass', syllabus: 'World Grasslands' },
  { id: 'physical-lakes', title: 'Lakes', icon: 'lake', syllabus: 'World Lakes' },
] as const

export type PhysicalSection = (typeof PHYSICAL_SECTIONS)[number]

export const physicalSection = (id: string): PhysicalSection | undefined =>
  PHYSICAL_SECTIONS.find((s) => s.id === id)
