import { useMemo } from 'react'
import { placeGroups, type Place, type PlaceGroup, groupsFor } from '../data/places'
import { TrickDiagram } from './TrickDiagram'

/**
 * Every mnemonic in the app on one page, opened and dismissed from Learn mode.
 * The tricks for whatever is on screen come first; the rest are kept below
 * rather than hidden, so this stays the one place to find any of them.
 */
export function TricksSheet({
  subject,
  isos = [],
  onClose,
}: {
  subject: Place[]
  /** Country rounds have no places, so their tricks are found by ISO. */
  isos?: string[]
  onClose: () => void
}) {
  const { here, elsewhere } = useMemo(() => {
    // A trick can be reached from a round it was not written for — the Panama
    // Canal pulls in Central America's mnemonic — so the round's own syllabus
    // sorts to the top rather than whatever the file order happened to be.
    const home = subject[0]?.continent
    const mine = groupsFor(subject, isos)
      .filter((g) => g.mnemonic)
      .sort((a, b) => Number(b.continent === home) - Number(a.continent === home))
    const ids = new Set(mine.map((g) => g.id))
    return {
      here: mine,
      elsewhere: placeGroups.filter((g) => g.mnemonic && !ids.has(g.id)),
    }
  }, [subject, isos])

  return (
    <div className="absolute inset-0 z-20 flex justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-2xl font-extrabold text-slate-900">Tricks</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tricks"
            className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 text-lg font-bold text-slate-700 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {here.map((g) => (
            <Trick key={g.id} group={g} />
          ))}

          {elsewhere.length > 0 && (
            <>
              <h3 className="mt-6 mb-1 text-xs font-bold tracking-widest text-slate-400 uppercase">
                From other rounds
              </h3>
              {elsewhere.map((g) => (
                <Trick key={g.id} group={g} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Trick({ group }: { group: PlaceGroup }) {
  return (
    <div className="mt-3 rounded-xl bg-yellow-50 px-4 py-3 first:mt-0">
      <div className="text-xs font-bold tracking-wide text-slate-500 uppercase">{group.name}</div>
      {group.visual && (
        <div className="mt-2">
          <TrickDiagram visual={group.visual} />
        </div>
      )}
      <p className="mt-1 font-bold text-slate-800">{group.mnemonic}</p>
    </div>
  )
}
