# Map Practice

Geography practice tool. Click-the-country and type-the-name rounds over a full
country set. 100% frontend, no backend, no accounts.

## Commands

```bash
npm run dev            # local dev
npm run build          # production build -> dist/
npm run data           # regenerate src/data/* from Natural Earth
npx tsc --noEmit       # typecheck
```

Before claiming a change is done: run `npx tsc --noEmit` and `npm run build`.

## Non-negotiables

**India's borders.** The dataset is Natural Earth's **India point-of-view**
build (`ne_10m_admin_0_countries_ind`). PoK/Gilgit-Baltistan and Aksai Chin are
part of India. Never swap in the ISO/default Natural Earth file. `npm run data`
asserts India's northern extent is ~37°N and fails loudly if the wrong source
is used.

**Greenland is drawn, never asked.** It is Danish, not a UN member, so it is
outside the 196 — but leaving it out put a hole in the North Atlantic beside
the Denmark Strait and Baffin Bay. `RENDER_ONLY` in the build gives it geometry
with no meta entry, and `allIsos` comes from the metadata rather than the
geometry so nothing can turn it into a question. Use `renderIsos` to draw,
`allIsos` to ask; a round's `render` carries the context, its `askable` does not.

**Kosovo** does not exist separately in that dataset (its territory is inside
Serbia), so the set is 196 entries, not 197. See `INCLUDE_KOSOVO` in
`scripts/build-data.mjs`.

**No question-count selector.** Every round asks its full set. The Seas &
Straits round lets you choose which notations to practise — seas, straits,
canals, or any combination — but that picks *which set*, not how many of it,
and the last remaining one cannot be unticked.

**Typed answers are judged by `src/game/matchName.ts`.** A misspelling that is
close enough counts as correct and shows the right spelling, but only if it is
*strictly closer to the target than to every rival* — the other places in the
round plus all 196 country names. That second bar is what stops "Uruguay"
passing as "Paraguay" or "Nigeria" as "Niger". Never relax it without running
`npm run check:names`; aliases should hold genuine alternative names, never
misspellings, or the correction note never fires.

**Sea and strait must never look alike.** The Seas & Straits section is built
around four notations: a sea is a blue circle, a strait an orange diamond pinched
by two arrowheads, a canal a purple square, and an ocean a teal circle with a
white inner ring, drawn 1.7x larger (`SHAPE_SCALE` in `MapCanvas`) because an
ocean contains the seas inside it. The shape carries the *kind*, the fill carries
the quiz *state*, and the legend in Learn mode names all four. A sea and an ocean
are both circles, so the ocean must keep both its own colour *and* its extra
size — one alone is not enough to tell them apart at world scale. `KindSwatch` in
`src/ui/bits.tsx` redraws each marker for the legend and the setup picker, so
change both or they drift apart. Country micro-state markers are switched off in
that round so no stray ring competes with the sea notation.

**Auto-zoom fires on reveal only** — never while a question is being asked, or
the camera gives the answer away.

## Architecture

The whole app is one map engine plus configuration.

- `src/map/MapCanvas.tsx` — the engine. Takes `render` (geography to draw),
  `askable` (what's quizzable), and `view` (a bbox). Everything else is
  derived. Continent rounds are not special-cased; they are different arguments.
- `src/game/rounds.ts` — the rounds as config. A syllabus file's `section`
  decides which menu group it lands in: `places` or `water`.
- `src/game/useQuiz.ts` — round state machine.
- `src/screens/` — Play, Results, Learn.
- `src/app/route.ts` — the URL hash, which is where the current screen lives.
- `src/app/storage.ts` — everything else that survives a refresh.
- `scripts/build-data.mjs` — the only thing that touches Natural Earth.

`render` and `askable` are separate because Island Nations draws the whole
world and asks only its own subset.

**A refresh must never cost you anything.** Which screen you are on is the URL
hash (`#/europe/learn`), not component state — and the hash rather than the path,
because this deploys as static files with no server to rewrite `/europe/learn`
back to `index.html`. Settings and a round in progress go to `localStorage`.
Every read of it is defended and re-validated: it throws outright in some
private-browsing modes, and whatever is already stored may come from an older
build. A saved round resumes only when its questions are exactly the ones the
round would ask now, so unticking a notation or editing a syllabus retires the
save rather than resuming a round that no longer exists. `useQuiz` takes that
save as `initial` and hands back a `snapshot`; it never touches storage itself.

Because the hash is user-editable, anything reachable by URL must survive being
asked for out of order: `roundById` returns null rather than throwing, and a
round with nothing to ask refuses to start.

**Mnemonics live in one place: the `groups` array of a syllabus file.** A group
names its members — place ids, country ISO3s, or both — and the mnemonic then
surfaces wherever a member does: on that place's Learn card, and on the Tricks
page (`src/ui/TricksSheet.tsx`, opened from Learn mode), which lists every
mnemonic in the app with the current round's own syllabus first. Never hardcode
a mnemonic in a component.

A trick about *where* things are cannot be written as a sentence. Such a group
sets `visual`, a key into `TRICK_DIAGRAMS` in `src/ui/TrickDiagram.tsx`, and its
`mnemonic` becomes the drawing's caption. Diagrams project the real Natural
Earth geometry and the real authored points — never a freehand sketch — so a
line drawn "west of Greece" is west of Greece. `GROUP_VISUALS` in
`scripts/build-data.mjs` holds the same key set: add to both, or the build
fails.

## Traps already hit

- **d3-geo polygon winding.** `fitExtent` with a Polygon reads spherical
  winding rules; a clockwise ring means "the globe *except* this box" and
  silently fits the whole planet. Fit to a `MultiPoint` of corners instead.
- **`vectorEffect="non-scaling-stroke"`** already holds stroke width constant on
  screen. Do not also divide by the zoom scale, or borders vanish when zoomed.
- **Antimeridian.** Russia, USA, Fiji, NZ and Kiribati have wrapping bounds
  (west > east). Any new bbox maths must handle that.

## Game rules

| | |
|---|---|
| Modes | Pin (name → tap map), Type (map highlights → type name) |
| Type input | No autocomplete; case- and accent-insensitive; misspellings accepted with a correction (see below) |
| Timer | 15s per question, or off |
| Wrong/timeout | Reveal correct country, drop pin, move on |
| Colours | correct green, wrong pick red, missed grey — all persist for the round |
| Micro-states | Circle markers, sized in screen px, fading out as you zoom in |
| Results | correct/total, elapsed time, tier title |

## Still to do

- Island Nations round — needs the agreed 46-country list
- Europe/continent country lists confirmed against the reference
