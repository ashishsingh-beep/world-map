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

**Greenland and Antarctica are drawn, never asked.** It is Danish, not a UN member, so it is
outside the 196 — but leaving it out put a hole in the North Atlantic beside
the Denmark Strait and Baffin Bay. `RENDER_ONLY` in the build gives it geometry
with no meta entry, and `allIsos` comes from the metadata rather than the
geometry so nothing can turn it into a question. Use `renderIsos` to draw,
`allIsos` to ask; a round's `render` carries the context, its `askable` does not.
Antarctica is there for the same reason: without it the Scotia Sea, the Drake
Passage and the Ross, Weddell and Amundsen Seas float in featureless blue with
nothing to locate them against.

**Kosovo** does not exist separately in that dataset (its territory is inside
Serbia), so the set is 196 entries, not 197. See `INCLUDE_KOSOVO` in
`scripts/build-data.mjs`.

**No question-count selector.** Every round asks its full set. The Seas &
Straits round narrows twice — a region (All, Americas, Europe, Asia), then the
notations within it — but both pick *which set*, not how many of it, and the
last notation with anything left in the chosen region cannot be unticked.

Regions are three, not six continents: Africa rides with Asia and Oceania with
the Pacific side of it. The build derives them in `REGION_OF` from the countries
along each feature, so a boundary sea belongs to both regions it touches — the
Mediterranean is European and Asian, the Bering Strait American and Asian — and
the counts deliberately do not add up to the total.

An authored `region` in the syllabus **replaces** what the coastline implies
rather than adding to it, because some of it needs overruling. Russia is filed
as European, which is right for the country rounds and wrong for every sea on
its Siberian and Pacific coast: the Sea of Japan, the Laptev and the Sea of
Okhotsk all inherited "europe" and had to be told otherwise. The White and
Barents Seas keep it, being genuinely European Arctic. The Antarctic seas name
no region and appear only under All. Region and notations narrow *practice*
only: Learn always draws the whole set, with its own legend chips.

**The typed input suggests, but only after three characters.** The list is the
round's own answers, never all 196 names, and it is there to fix spelling — not
to turn recall into multiple choice, which is what it becomes if it opens on one
or two letters. Enter submits what was *typed*; picking a suggestion is Enter
while one is highlighted, or a click, so a fully typed answer is never silently
swapped for a suggestion. An exact match closes the list, having nothing to add.

Suggestions do not replace the judge below. Someone who types the whole name and
fat-fingers it never opened the list, and that answer still has to be marked
fairly.

**Typed answers are judged by `src/game/matchName.ts`.** A misspelling that is
close enough counts as correct and shows the right spelling, but only if it is
*strictly closer to the target than to every rival* — the other places in the
round plus all 196 country names. That second bar is what stops "Uruguay"
passing as "Paraguay" or "Nigeria" as "Niger". Never relax it without running
`npm run check:names`; aliases should hold genuine alternative names, never
misspellings, or the correction note never fires.

**An area is an area; a point is a point.** An ocean or a sea is a patch, so it
is drawn as its real extent (`src/data/marine.ts`, from Natural Earth's marine
layer) and judged by `geoContains` — exactly like a country. A strait or a canal
genuinely is a chokepoint, so it stays a marker: a strait is an orange diamond
pinched by two arrowheads, a canal a purple square. That split *is* the notation,
and it is a far bigger difference than two coloured circles ever were.

Judging a sea by distance from a point was wrong, not merely ugly: the Arabian
Sea's radius was 850km and the sea is 1,200km across, so a tap off Karachi was
marked outside it. Containment has no rival check — the smallest-wins tiebreak
the circles needed is gone, because Natural Earth carves the named seas as
disjoint regions rather than nesting them.

The area's fill carries the quiz *state*, as a country's does. The authored
point survives as the label's anchor and nothing else; the build fails if it
falls outside its own sea. `KindSwatch` in `src/ui/bits.tsx` redraws the legend,
so change both or they drift apart — it shows a patch for oceans and seas now,
not a pin. Three seas have no usable polygon and fall back to their point, declaring it
with `"marine": []`: the Celtic Sea and the Gulf of Panama are absent from the
layer, and Natural Earth's "Scotia Sea" is a 50km label stub standing in for a
900km sea. The build measures every polygon against its authored `spanKm` and
refuses one under a fifth of it — drawn, a stub is invisible and unclickable;
judged, it marks every honest tap wrong.

In Learn a marker beats a containing area, never the other way round: every
strait sits inside some sea, so letting the area win would make them all
unclickable.
Country micro-state markers are switched off in that round so no stray ring
competes with the sea notation.

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
| Type input | Suggestions after 3 characters; case- and accent-insensitive; misspellings still accepted with a correction (see below) |
| Timer | 15s per question, or off |
| Wrong/timeout | Reveal correct country, drop pin, move on |
| Colours | correct green, wrong pick red, missed grey — all persist for the round |
| Micro-states | Circle markers, sized in screen px, fading out as you zoom in |
| Results | correct/total, elapsed time, tier title |

## Still to do

- Island Nations round — needs the agreed 46-country list
- Europe/continent country lists confirmed against the reference
