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

The Indian map's **state** outlines have the same rule and a harder problem:
Natural Earth publishes no India point-of-view admin-1 file at all. Its ISO
build stops Indian territory at 35.5°N, carves out a separate "Kashmir" and
hands Pakistan "Azad Kashmir" — using it would redraw Kashmir on our own map.
States come from an Indian district source instead (`INDIA_URL`), dissolved to
36 states, and the build asserts Ladakh reaches ~37°N before writing
`india.topo.json`. Only their *inner* lines are drawn, and they are drawn for
context: a state is never a question.

**The Indian map's land comes from one source, not two.** India, Pakistan,
China and the rest of the frame are all the India-POV country file, welded in a
single mapshaper job into `india-frame.topo.json`: `india`, a dissolved `land`
for the surround, and `divides` for where the neighbours part from each other.
The surround is filled and never stroked — an outline there would run a second
line beside India's own, through the one border this project cannot afford to
draw twice.

India was drawn from the district source for a while, on the reasoning that its
border was the trustworthy one. It cost a day: one source's India against
another's Pakistan leaves hairline slivers of sea along every land border —
measurably a *gap*, not an overlap, so erasing cannot close it and snapping only
narrowed it — plus jagged ribbons wherever the two coastlines disagree. Only one
dataset can say where the land stops, and the India-POV file already puts PoK
and Aksai Chin inside India, which is the whole reason this project insists on
it. The district source stays for the one thing Natural Earth has no India point
of view of at all.

Two settings there are load-bearing. The state lines are taken **before** the
clip to India, because clipping one source's coast against another's leaves a
thread of slivers whose shared edges come back as a state line a few kilometres
inland. And India is simplified by an **absolute interval** (500m), not a
percentage: a percentage thins every ring by the same proportion, which turns
the Andaman and Nicobar Islands into needles, and at 3km it erases Lakshadweep
— 36 islets, most under a square kilometre — from the map entirely.

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
last notation with anything left in the chosen region cannot be unticked. A
places round (North America, South America, Asia) narrows once, the same way:
Capitals or Other places, in Learn and in Practice alike, both backed by the
one `placeKinds` preference so the choice carries over between them. "Other" is
deliberately everything a capital is not — cities, ports, islands, island
groups, peninsulas, zones, territories, country facts — not a third bucket,
because the choice on offer is capitals, other places, or both, never a longer
list. `placeKindOf` in `src/data/places.ts` is the one function that decides
which places a capital is; nothing else may re-derive it.

A capital is coloured apart from every other point on a places round's map —
gold, the cartographic convention, the one colour nothing else already used.
`SHAPE_FILLS.capital` in `MapCanvas` is exported so `PlaceKindSwatch` in
`src/ui/bits.tsx` can draw the exact colour the map does, the same discipline
`KindSwatch` already keeps for the water notations. The area/point split is
untouched by this: a peninsula with real geometry is still a patch, still
orange, still never a capital — this only reaches the *dot* markers, coloured
by which of the two sections they belong to rather than left uniformly white.

**A country does not belong in the places section, even as a fact.** A places
round is about specific sites inside a country — its capital, a port, an
island — never the country itself; the World Map's country round is already
the place a whole country is the answer. A fact that is genuinely about the
country as a whole (Laos is the only landlocked country in South East Asia,
Uzbekistan is doubly landlocked) still belongs, but as a `note` on that
country's capital, not as its own `type: "country"` place with a marker
floating at the centroid. Thirteen of these existed across Asia and South
America before this rule was written down; all thirteen were folded into
their capital's `notes`, keeping the fact and losing only the stray pin.

Regions are three, not six continents: Africa rides with Asia and Oceania with
the Pacific side of it. The build derives them in `REGION_OF` from the countries
along each feature, so a boundary sea belongs to both regions it touches — the
Mediterranean is European and Asian, the Bering Strait American and Asian — and
the counts deliberately do not add up to the total.

An authored `region` in the syllabus **replaces** what the coastline implies
rather than adding to it, because the coastline lies in two ways and both need
overruling. A country can span regions: Russia is filed as European, right for
the country rounds and wrong for every sea on its Siberian and Pacific coast, so
the Sea of Japan, the Laptev and the Sea of Okhotsk had to be told otherwise.
And a country can be listed for a coast on the far side of the world: Baffin Bay
borders Denmark only because Greenland is Danish, which dragged it, the Labrador
Sea and the Davis and Nares Straits into Europe. A country can also *be* the
boundary: Turkey owns both shores of the Sea of Marmara and of the Bosporus and
the Dardanelles, so the one country they border decided all three were Asian
alone — the Bosporus, which is the line between the continents, included. The White and Barents Seas keep
Europe, being genuinely European Arctic, as do the Baltic and the Danish Straits,
which are Denmark proper. The Antarctic seas name no region and appear only
under All. Region and notations narrow *practice*
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

**A peninsula is an area too — the same rule, on land.** A peninsula is a
patch, not a pin: Baja California is 1,200km long, and a point-and-radius
marker for it was the same "within 850km of a point" mistake the marine layer
above already fixed for seas. Its real extent comes from `src/data/land.ts`,
Natural Earth's physical-regions layer, the same way a sea's comes from
`marine.ts` — and `src/data/areas.ts` is the one thing judging and marker-
suppression code actually imports, since a sea and a peninsula never share an
id and the two are interchangeable to everything except the renderer.

The renderer is the one place they are not interchangeable, and for the
opposite reason a sea and land differ: a sea's polygon is drawn *under* the
country layer, because it runs up to the coast and beyond in places and the
coastline has to stay what you read. A peninsula's polygon is solid ground, so
the same trick would bury the highlight completely — it is drawn *over* the
country layer instead. `MapCanvas` imports `marine.ts` and `land.ts` directly
for this reason, not the combined `areaOf`.

Natural Earth draws a peninsula as the physical landform, which can run past
the political border the syllabus means: its "Malay Peninsula" reaches deep
into Thailand, while "West Malaysia" is only Malaysia's own share. A place
that needs the political share, not the landform, sets `"clip": true`, and the
build cuts the polygon to its own `country` before anything else touches it —
a peninsula genuinely shared between countries, like Yucatan (Mexico, Belize
and Guatemala), stays unclipped, because the whole landform is exactly what
its own significance describes. Clipping done through raw GeoJSON output
found a live instance of the winding trap below — mapshaper's `-clip` handed
back a ring wound the opposite way from its input, and only going through
TopoJSON (as the rest of this build already does) reads it correctly.

**A range is a line with width.** The Himalayan ranges are the one thing here
that is neither a point nor a polygon, so they are drawn as a band along a
ridgeline and answered by tapping anywhere near it (`distanceToLineKm`, against
the range's own `spanKm`). The band carries its own name along its path, so a
range emits no marker and no second label. A peak is a brown triangle.

**The belt is the colour.** Four parallel ranges in one brown were a single
smear, so `BELT_BAND` in `MapCanvas` gives each belt a band colour and a label
ink: Trans brown, Greater sky blue, Lesser purple, Shiwalik green. `BeltSwatch`
in `src/ui/bits.tsx` draws the Learn legend from the same values — change one
and change the other, or the legend stops describing the map. A quiz state still
overrides the belt colour, because in a round the fill has to mean right, wrong
or missed.

The band is wide enough that a belt's peaks sit inside their own band, and faint
enough (0.38) that where two belts overlap both still read. Widening it is not
the way to reach a peak that is nowhere near its crest: when Bandarpunch and
Kedarnath sat 70-90km off the Greater Himalaya, the ridgeline through Garhwal
was wrong — it cut the corner from Lahaul to Nanda Devi — and the fix was to
trace it through them. The furthest any peak now sits from its belt is
Rakaposhi's 26km, which is where Rakaposhi actually is.

Those ridgelines are **hand-traced**, and they are the only geometry in this
project not taken from a published dataset. That is not laziness: Natural Earth
has `HIMALAYAS` as one coarse blob, plus Karakoram and Shiwalik, and carries
nothing at all for the Zaskar, the Ladakh Range, the Pir Panjal, the Dhauladhar,
the Mahabharat, Nag Tibba, Mussoorie or Kumaon — which is most of what the notes
teach. They live in the syllabus as `line`, and the build derives each range's
label anchor from the middle of it.

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
- `src/data/india.ts` — the Indian map's land: India, the surround, the
  neighbours' dividing lines, and India's own state lines.
- `src/data/marine.ts` / `src/data/land.ts` — real extents for area-type
  places, water and land respectively; `src/data/areas.ts` is the combined
  lookup everything except `MapCanvas` should import.
- `scripts/build-data.mjs` — the only thing that touches Natural Earth.

`render` and `askable` are separate because Island Nations draws the whole
world and asks only its own subset.

**There are two atlases.** The home screen picks between the World Map, which
holds everything built so far, and the India Map, which starts with the
Himalaya. A syllabus declares which one it belongs to with `atlas`, a round
carries it, and `MapCanvas` draws the state outlines when it is `india`. The
hashes are `#/world-map` and `#/india-map` — not `#/world`, which is already the
World Map country round.

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
  The same trap sprang on mapshaper's `-clip` when building a peninsula's
  political-border patch (see below): its raw GeoJSON output came back with a
  ring wound opposite to its input, geoArea read it as the whole sphere minus
  a sliver, and every containment check passed everywhere except the peninsula
  itself. Piping the clip through TopoJSON instead — as the rest of this build
  already does — reads correctly; `topojson-client`'s arc reconstruction does
  not care which way the source ring was wound.
- **`vectorEffect="non-scaling-stroke"`** already holds stroke width constant on
  screen. Do not also divide by the zoom scale, or borders vanish when zoomed.
- **Antimeridian.** Russia, USA, Fiji, NZ and Kiribati have wrapping bounds
  (west > east). Any new bbox maths must handle that. It has bitten twice.
  Fitting Oceania to its members gave a 356°-wide box — Tonga at -176, Tuvalu
  at 179 — so the round drew at world scale with Australia against one edge and
  Samoa, Tonga and Kiribati against the other. Its view is hand-set instead and
  crosses the antimeridian, written as an east past 180 (110°E to 210°E);
  `MapCanvas` turns the globe to that view's middle meridian, and only when a
  view asks for it, so every other round keeps the map it always drew. And a
  country's on-screen size is measured from its **largest piece**, not its
  whole bounds: a feature with parts either side of the line has bounds as wide
  as the map, which put Fiji at 1,336px on the world map and so denied a marker
  ring to the one country that most needed one.
  Its marker and label *position* are the opposite: the whole-country centroid
  is right, even in open water, because the ring then encloses the archipelago.
  Centring on the largest island was tried and put Vanuatu at its northern tip
  and Kiribati on Kiritimati. Only a nation split into groups an ocean apart
  needs an authored anchor — `CENTROID_OVERRIDES` in the build (Kiribati at
  Tarawa, Micronesia midway along Yap–Kosrae).

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
