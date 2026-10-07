# Map Practice

Geography practice tool. Click-the-country and type-the-name rounds over a full
country set. 100% frontend, no backend, no accounts.

## Commands

```bash
npm run dev            # local dev
npm run build          # production build -> dist/
npm run data           # regenerate src/data/* from Natural Earth
npx tsc -b             # typecheck
```

Before claiming a change is done: run `npx tsc -b` and `npm run build`. Not
`npx tsc --noEmit`: the root tsconfig only references the app and node configs,
so without `-b` it checks no files at all and passes whatever is wrong.

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
The state polygons come from an Indian district source instead (`INDIA_URL`),
dissolved to 36 states, and the build asserts Ladakh reaches ~37°N before
writing `india.topo.json`. The state *lines* drawn on the map come from
DataMeet's India point-of-view state file (`STATE_LINES_URL`), some fourteen
times the detail — the build asserts its Jammu & Kashmir takes in
Gilgit-Baltistan and Aksai Chin — simplified only by a 30m interval. It
predates 2019, so the one line between Jammu & Kashmir and Ladakh comes from a
2019 file (`LADAKH_URL`), its ends snapped onto DataMeet's outline. Inner lines
only, clipped as lines (not polygons, so no coastal slivers) to the drawn
India, into `state-lines.topo.json`, which is loaded only when an India map
opens: at that precision it is the heaviest file the app has. They are drawn
dashed, for context — a state is never a question — and the States button on
the India map switches them off and on, remembered like Lat/Long
(`loadStateLines`/`saveStateLines`, on by default).

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
Antarctica is there for the same reason: without it the Southern Ocean and the
Drake Passage float in featureless blue with nothing to locate them against. The Faroe Islands, Danish too, are drawn because
the Europe places round asks about them and a marker needs land under it, and
Gibraltar because the Africa round asks about it beside Ceuta. Bir Tawil, which
neither Egypt nor Sudan claims, is its own feature in the source and was a hole
in the desert on the 22nd parallel. Abyei, between Sudan and South Sudan, is
still one: the India point-of-view file has no feature there at all, and
filling it would mean borrowing another worldview's geometry.

**Kosovo** does not exist separately in that dataset (its territory is inside
Serbia), so the set is 196 entries, not 197. See `INCLUDE_KOSOVO` in
`scripts/build-data.mjs`.

**An islet Natural Earth leaves out can be added to its country's outline**,
from OpenStreetMap by way id (`ISLETS` in the build), when the outline is wrong
without it. One so far: Ilhéu das Rolas, where the Equator crosses São Tomé and
Príncipe — Natural Earth's São Tomé stops 3km north of the line. It is the
country's land, not a place of its own and never a question; the build fails
unless it reaches the latitude it is there for and adds no more than an islet.

**The question count picks how many; everything else picks which.** Every
round's setup offers 10, 30, 50, 100 or All, as the reference does, drawn at
random from whatever the other choices leave — a new draw each round, the first
N of the shuffle. A count the round cannot fill is not offered (Oceania's 14
countries show 10 and All), and a stored one it cannot fill plays as All. The
count is part of what a saved round must match, so choosing another retires it.
The Seas &
Straits round narrows twice — a region (All, Americas, Europe, Asia), then the
notations within it — and both pick *which set*, not how many of it, and the
last notation with anything left in the chosen region cannot be unticked. The
Political Map narrows once, the same way, by section: Countries, Capitals,
Regions and Other places, in Learn and in Practice alike, all backed by the one
`placeKinds` preference so the choice carries over between scopes. A round
shows only the sections it has — Regions is Oceania's alone (Melanesia,
Micronesia, Polynesia, Australia, New Zealand) — and because one preference
backs every scope, a scope none of whose own sections is ticked asks all of
them rather than nothing. The first visit ticks Countries and Capitals: the
whole world with everything on is over 500 questions. "Other" is deliberately
everything that is neither a country, a capital nor a region — cities, ports,
islands, states, peninsulas, zones, territories — not a bucket per type.
`placeKindOf` in `src/data/places.ts` is the one function that decides which
section a place is in; nothing else may re-derive it.

**The Political Map is one round per scope, not a country round and a places
round.** The World Map menu is the Political Map, Seas & Straits and
Phenomena, nothing else. A Political Map round (`political-<scope>`, scope `world` or a continent)
carries the scope's countries as `askable` and its places as `places`, and a
question is a country or a place inside the same round: "Find the country:
Kenya" beside "Find the capital: Nairobi". The old country and places rounds
still exist in `rounds.ts` as its ingredients, and their links (`#/europe`,
`#/places-europe`) redirect to the scope through `canonicalRoundId`. Its frame
fits what is asked: `view` reaches the places (Oceania's runs to Easter Island
for Polynesia), `countryView` is the tighter one used when no place is ticked.

Continents combine: `political-africa+europe` is a round built on demand from
the two, in menu order whatever order it was asked in (`politicalIdFor`), and
the world beside any continent is just the world. The setup's scope chips
toggle continents in and out; World stands alone, and the last continent of a
mix cannot be tapped away. A mix's frame is the union of its continents' frames
(`unionFrames`), tried with longitudes as written and again counted east from
Greenwich, the narrower winning: Africa with Europe is the usual map, Asia with
Oceania or with North America one frame across the Pacific, written past 180 so
the map turns to it, and a mix neither holds together — Africa with Oceania —
the whole world.

In Pin mode the map switches with the question. A country question answers to
a tap on the country — its polygon or its micro-state ring, so Tuvalu stays
answerable — and a place question to the marker or patch under the tap, so a
tap on Italy never answers "Rome". In Learn both are on screen; a marker wins
a tap, then the smallest patch under it, the country counting as one patch:
Fiji beats Melanesia and Sinai beats Egypt, and a country entirely covered by
smaller patches — Australia by its states — is reached by putting Other places
away in the legend.

A prompt in a mixed round names its kind ("country", "capital", "region"),
because a name can be both: Australia and New Zealand are countries and
Oceania regions. Singapore's capital is "Singapore City" for the same reason.

Why mode asks a country by its capital — "Country with capital Nairobi", or
all of them where there are several (South Africa's three, Bolivia's two), from
`countryClue` in `src/data/places.ts`. A state's or constituent country's
capital is marked `subnational` (Perth, Edinburgh) and never named in its
country's clue. A country whose capital no syllabus names yet has no clue and
sits Why mode out; the setup screen says how many.

A capital is coloured apart from every other point on a places round's map —
gold, the cartographic convention, the one colour nothing else already used.
`SHAPE_FILLS.capital` in `MapCanvas` is exported so `PlaceKindSwatch` in
`src/ui/bits.tsx` can draw the exact colour the map does, the same discipline
`KindSwatch` already keeps for the water notations. The area/point split is
untouched by this: a peninsula with real geometry is still a patch, still
orange, still never a capital — this only reaches the *dot* markers, coloured
by which of the two sections they belong to rather than left uniformly white.

**A significance says why a place matters, never just where it is.** It is
the line on every Learn card and the whole clue in Why mode, so "Town in the
heart of the outback" taught nothing: Alice Springs is the gateway to Uluru and
the Ghan's halfway stop, and that is what the clue says now. Nor may it name its
own answer, whole or in part — "Capital of Djibouti", "cut off by the Gulf of
California" for Baja California, "the Korean Peninsula" for the Korea Strait —
and the build refuses a clue containing any distinctive word of the name or an
alias (`GENERIC_WORDS` lists the ones that give nothing away: Gulf, Peninsula,
City…). A clue word that starts with a name word of five letters or more counts
as naming it; a four-letter one (Suez, Java) has to appear whole, so "Dhar" does
not catch Dharamshala.

The one exception is a capital named for its own country — Mexico City, Kuwait
City, Djibouti City, Luxembourg City, Singapore City, Guatemala City, Panama
City, San Salvador, Tunis. The country already gives it away, so a riddle about
it is wasted effort: its clue is exactly "Capital of Mexico", which the build
requires, and whatever else is worth knowing about it sits in its `notes`.

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

A constituent country is not that. England, Scotland, Wales and Northern Ireland
are never a question in any country round, so the Europe places round asks them
itself, as `type: "constituent"` patches — an area, like a peninsula, drawn over
the country layer. Their outlines come from Natural Earth's map units
(`MAP_UNITS_URL`), used for those four and nothing else; every border the map
draws still comes from the India point-of-view country file. Edinburgh, Cardiff
and Belfast are capitals of their countries, so they sit under Capitals with
London and Dublin.

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
which are Denmark proper. The Antarctic seas — Ross, Weddell, Amundsen, Scotia —
are not in the set at all; the Southern Ocean and the Drake Passage are what is
left of the far south. Region and notations narrow *practice*
only: Learn always draws the whole set, with its own legend chips.

**The typed input has two behaviours, chosen by "Show suggestions" on setup.**
Off — the default, and the reference's way — there is no list and no Enter: the
answer is taken the moment the field spells it (the name or an alias, ignoring
case, accents, spaces and punctuation), a wrong spelling just waits, and ⏭ skips
it as missed. It must be spelt exactly; the misspelling judge below cannot run
there, because it would accept "Canad" before the name was finished.

On, the input suggests, but only after three characters. The list is the
round's own answers, never all 196 names — the whole round's, though, not just
the ten a short round drew, or a ten-question round's list would be multiple
choice — and it is there to fix spelling — not
to turn recall into multiple choice, which is what it becomes if it opens on one
or two letters. Enter submits what was *typed*; picking a suggestion is Enter
while one is highlighted, or a click, so a fully typed answer is never silently
swapped for a suggestion. An exact match closes the list, having nothing to add.

Suggestions do not replace the judge below. Someone who types the whole name and
fat-fingers it never opened the list, and that answer still has to be marked
fairly.

**Typed answers are judged by `src/game/matchName.ts`.** A misspelling that is
close enough counts as correct and shows the right spelling, but only if it is
*strictly closer to the target than to every rival* — every other place the
round could ask (not only the ones this draw did) plus all 196 country names.
This is the suggestions-on mode only. That second bar is what stops "Uruguay"
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
not a pin. Two seas have no usable polygon and fall back to their point, declaring it
with `"marine": []`: the Celtic Sea and the Gulf of Panama are absent from the
layer. (Natural Earth's "Scotia Sea" was the same, a 50km label stub standing in
for a 900km sea, before the Antarctic seas were taken out.) The build measures every polygon against its authored `spanKm` and
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

A region is an area too when there is a polygon to be had. The physical layer
has no Sinai and no Afar, so a place can instead name admin-1 provinces within
its own country (`admin1`: Sinai is Egypt's North and South Sinai governorates)
or whole countries (`countries`: the Horn of Africa is the notes' SEED four,
merged from the drawn country topology so it has one outline, on their
borders), or — for a territory whose border with the rest of its country is a
parallel — everything its country holds south of it (`south`: Western Sahara is
Morocco's land below 27°40′N, filed under Morocco, which holds most of it and
whose outline in the India point-of-view file already contains it; Natural
Earth has no one shape for the whole territory, calling only the Polisario's
eastern strip "W. Sahara"). A `zone` with none of `land`, `admin1` or `countries` stays a marker —
Nagorno-Karabakh has no polygon anywhere. Patches may nest (Afar lies inside the
Horn), which is why the land layer is cleaned with `allow-overlaps`: plain
`-clean` handed the overlap to the Horn and erased Afar. It is simplified by an
absolute 2km interval, not a percentage, because a percentage ranks every vertex
in the layer together and each new patch re-thinned the old ones.

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

**Oceania's regions are drawn, and held to their members.** Melanesia,
Micronesia and Polynesia are a convention, not a coastline: no dataset
publishes them, and as the union of their islands they would be invisible specks
in the sea. So each is a `ring` of corners as the notes draw it, with Australia
and New Zealand beside them — the one place outside the Himalayan ridgelines
where geometry is authored by hand. The build keeps them honest: every country
in a region's `members` must fall inside its ring and inside no other ring. The
edges are cut into sub-degree steps so they come out straight on the map, as
drawn, rather than bowing along great circles; a ring the wrong way round is
turned, since d3-geo would read it as the whole globe but the region. They go to
`regions.json`, not through mapshaper, because Polynesia runs east past 180 to
Easter Island and a planar clean would not survive that. Any other area that is
a convention defined by its corners takes a `ring` the same way: the Bermuda
Triangle is a zone whose ring is Miami, Bermuda and San Juan, and the Lithium
Triangle one whose ring is the salt flats of Uyuni, Atacama and Hombre Muerto.
The Lithium Triangle lies wholly on land, where a patch drawn under the
countries would be hidden by them, so it sets `onLand` and is drawn over them in
its own tint, as a peninsula is. `land.ts` serves them
with the other land patches. On the map a region is drawn *under* the countries,
like a sea, in the notes' own colour (`tint`) over a pale wash — straight onto
the cyan sea, red read as grey — so the islands and Australia's states stay on
top of it.

**Oceans, seas, straits and canals live in the Seas & Straits round only.** A
places round is about sites on land; none carries a water feature, even one its
notes mention, and the build refuses one in a places syllabus. A reef is not one
of these: the Great Barrier Reef stays in Oceania's places.

Patches still nest on water: the reef lies inside the Coral Sea. The marine
layer is cleaned with `allow-overlaps` for that reason; a plain `-clean` handed
each overlap to one feature, which once left the Seas round's Alboran Sea with
no polygon at all, when a places round carried a copy of it. Natural Earth also names the reef twice, once with no extent, so
a repeated marine name keeps its largest polygon.

**A range is a line with width.** The Himalayan ranges are the one thing here
that is neither a point nor a polygon, so they are drawn as a band along a
ridgeline and answered by tapping anywhere near it (`distanceToLineKm`, against
the range's own `spanKm`). The band carries its own name along its path, so a
range emits no marker and no second label. A peak is a brown triangle.

**An ocean current is an arrow.** The third World Map category, Phenomena,
starts with the currents (`src/data/syllabus/currents.json`, section
`phenomena`, type `current`): 35 of them across the four oceans, each a `line`
in the direction it flows, a `temp` (warm or cold) and an `ocean`. Drawn red
warm, blue cold (`CURRENT_INK` in `MapCanvas`, which `CurrentSwatch` in
`src/ui/bits.tsx` redraws for the legend), with an arrowhead at the end and
every ~2,600km along a long one — never closer than ~110px on screen — so a
current the world map's edge cuts in two still shows its way on both sides.
These lines are hand-traced like the Himalayan ridgelines: no dataset carries
ocean currents. The build rounds their corners (Chaikin, three passes, ends
kept), walks them in sub-degree steps so they draw as authored, and fails if any
point lands on drawn land. A line crossing the Pacific is written east past 180
(the North Equatorial runs 250°E to 128°E), never wrapped.

Every arrow is on the map from the start, in both modes. Pin is choosing the
right arrow out of all of them: a tap answers the arrow nearest it *on screen*,
within 24px, so the Florida Current and the Gulf Stream are as far apart as the
zoom makes them. Name is the Type mode with a second half: the arrows are drawn
slate, not red or blue, the asked one fuchsia, and the answer is a tap on one
of two buttons, Warm or Cold, *and* the name — both right to count. The buttons
keep the caret in the name field; a name spelt out before either is tapped
waits for it, and Enter without one makes them glow rather than submit. There is no Why mode. Three oceans each
have a North Equatorial, a South Equatorial and an Equatorial Counter Current:
the name alone is the typed answer, but wherever one is shown — the Pin prompt,
a label, a miss — `displayName` adds its ocean. The Somali Current is warm
because the notes' map draws it so; its note says the summer upwelling is cold.

**A coast is a line with width too.** The Grain, Ivory, Gold and Slave Coasts
are stretches of shoreline, so they are `type: "coast"` bands answered like a
range, not pins and not whole countries. Their lines are not traced: the build
takes them from the drawn country topology (`coastOf`), where an arc belonging
to one country alone is shore, drops islands, and chains the runs west to east
so the Slave Coast (Togo and Benin) is one line. A band with no belt is a coast,
amber (`COAST_BAND`), and its name sits upright at the middle of the shore —
along the path, a short kinked coast ran its text off the end.

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

**Auto-zoom fires on reveal only** — never while a Pin-mode question is being
asked, or the camera gives the answer away. The one exception is Type mode, where
the thing is painted and its place is the clue, not the answer: a sea, country or
place under 30px on the unzoomed map (`SMALL_SEA_PX` — the Gulf of Kutch is 6px,
Eswatini a few, a capital's dot none at all) is zoomed to while asked, with four
times its own size and at least 20° of map around it so there are coasts and
neighbours to know it by. On the Political Map a country is measured by its
bounds, so Madagascar stays where it is and an archipelago spread over 25° —
the Federated States of Micronesia — keeps its ring rather than a zoom; the
Seas round still focuses seas only, never a strait's marker. Each such question starts from the
whole map, so the last reveal's zoom is undone first. A wrong tap is framed with the answer so you
see how far off it was, except on water: a tap in the Caribbean for the Arabian
Sea framed half the world and the sea never came into view. A sea is framed by
its whole extent, walked in steps under 90° so a box that wraps the 180th (the
Pacific) or crosses the world map's own edge (the Bering Sea) still reads as one
piece. `MapCanvas` keys the reveal on its points' *values*: the round re-renders
many times a second, and keyed on a fresh array the zoom restarted each time and
never arrived.

**Latitude and longitude are one switch for every map.** The Lat/Long button
sits on the map itself, at its right edge, on every screen and both atlases,
and is remembered (`loadGrid`/`saveGrid`, its own storage key, not a round
pref). On, it draws a faint graticule — spaced so its lines stay ~48px apart,
30° on a phone's world map down to a degree or two over India — with its
degrees along the left and foot of whatever is on screen, and picks out five
lines by name (`REFERENCE_LINES` in `src/map/grid.ts`): the Equator, both
Tropics at 23°26′ (not Natural Earth's 23.56°), the Prime Meridian and the
International Date Line. The Date Line is the one that is not straight, so it
alone is data: `npm run data` chains Natural Earth's five pieces into one line
pole to pole, unwrapped east past 180 (the Kiribati bulge is 210°E), and fails
unless each of fourteen islands lands on its own side — Kiritimati, Samoa,
Tokelau, Tonga and Big Diomede on Asia's date, Little Diomede, American Samoa,
Niue, the Cooks and the Aleutians on America's.

**Zoom goes to 400×** (`MAX_ZOOM` in `MapCanvas`), deep enough that Ilhéu das
Rolas and Tuvalu's atolls are shapes rather than specks; automatic zooms keep
their own lower caps. A Reset button under Lat/Long flies back to the round's
own frame from anywhere, greyed when the map is already there. A pinch never
reaches the browser while a map is on screen: d3-zoom lets a trackpad pinch
(a ctrl+wheel) through untouched once the map is at its limit, and the browser
zoomed the whole UI with it. `MapCanvas` holds ctrl+wheel and Safari's gesture
events on the document, pins the viewport's scale on phones, puts all three
back when the map leaves, and says "Maximum zoom" when pushed past it. Two things follow from that depth. The country topology
is quantized at 1e6, not 1e5: at 1e5 a coordinate snaps to a 400m grid, and at
full zoom every small island came out as a staircase of pixels. And under a
degree the graticule goes to minutes (30′, 15′, 6′) and is built for the cells
on screen only — a tenth-of-a-degree graticule of the whole globe is half a
million points.

## Architecture

The whole app is one map engine plus configuration.

- `src/map/MapCanvas.tsx` — the engine. Takes `render` (geography to draw),
  `askable` (what's quizzable), and `view` (a bbox). Everything else is
  derived. Continent rounds are not special-cased; they are different arguments.
- `src/game/rounds.ts` — the rounds as config: the Political Map's scopes,
  built from the country rounds and the places syllabi, and the Seas & Straits
  and India rounds. A syllabus file's `section` decides which it feeds:
  `places` (the Political Map), `water`, `mountains` or `phenomena`.
- `src/game/useQuiz.ts` — round state machine.
- `src/screens/` — Play, Results, Learn.
- `src/app/route.ts` — the URL hash, which is where the current screen lives.
- `src/app/storage.ts` — everything else that survives a refresh.
- `src/data/india.ts` — the Indian map's land: India, the surround, the
  neighbours' dividing lines, and India's own state lines (fetched on demand).
- `src/data/marine.ts` / `src/data/land.ts` — real extents for area-type
  places, water and land respectively (land: peninsulas, states, islands, the
  UK's constituent countries, and Oceania's drawn regions from
  `regions.json`); `src/data/areas.ts` is the combined
  lookup everything except `MapCanvas` should import.
- `src/map/grid.ts` — the Lat/Long switch's lines; the Date Line is
  `src/data/dateline.json`, written by the build.
- `scripts/build-data.mjs` — the only thing that touches Natural Earth.

`render` and `askable` are separate because Island Nations draws the whole
world and asks only its own subset.

**There are two atlases.** The home screen picks between the World Map — the
Political Map, Seas & Straits and Phenomena — and the India Map, which starts with the
Himalaya. A syllabus declares which one it belongs to with `atlas`, a round
carries it, and `MapCanvas` draws the state outlines when it is `india`. The
hashes are `#/world-map` and `#/india-map` — not `#/world`, which is already the
World Map country round.

**A refresh must never cost you anything.** Which screen you are on is the URL
hash (`#/political-europe/learn`), not component state — and the hash rather than the path,
because this deploys as static files with no server to rewrite `/europe/learn`
back to `index.html`. Settings and a round in progress go to `localStorage`.
Every read of it is defended and re-validated: it throws outright in some
private-browsing modes, and whatever is already stored may come from an older
build. A saved round resumes only when its questions are exactly the ones the
round would ask now, so unticking a notation or editing a syllabus retires the
save rather than resuming a round that no longer exists. `useQuiz` takes that
save as `initial` and hands back a `snapshot`; it never touches storage itself.
A practice of misses stores its ids in the save as `drill`, so a refresh mid-
practice resumes that practice, not the full round. The drill holds only on the
play screen: every way into play goes through `begin`, which says afresh whether
it is one, so the back button cannot leak a drill into the setup screen.

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
  view asks for it. The world view asks too: `WORLD_VIEW` is cut at 168.75°W,
  not the 180th, so Samoa and Tonga sit beside Fiji rather than alone at the far
  left. East of Samoa every longitude hits St Lawrence Island, the Aleutians or
  Alaska; 168.75°W is where the nearest two end within a kilometre either side.
  `fitAround` keeps such a frame whole (a point west of it moves 360° east).
  Turning the map exposes Natural Earth's own cut: Chukotka, Fiji, Antarctica
  and the Bering, Ross and Pacific patches are pieces that meet along the 180th,
  and their outline drew a line down the middle of the map. `outlineWithoutSeam`
  in `src/map/seam.ts` strokes them without those edges; the fill still uses
  them to close. And a
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
  An anchor needs land under it. The 6% simplification thinned every country to
  its largest ring, and `keep-shapes` protects only that one, so Kiribati was
  drawn as Kiritimati alone and its Tarawa ring sat over empty sea. A nation of
  several pieces under 30,000 km² now keeps every vertex (`SMALL_NATION_KM2`);
  any lesser percentage still erases atolls. Single-piece nations stay at 6%
  under `keep-shapes`: the Vatican's outline is a border shared with Italy, and
  given full detail of its own it vanished. The build fails if any country
  comes out with no geometry.

## Game rules

| | |
|---|---|
| Modes | Pin (name → tap map), Type (map highlights → type name) |
| Type input | Suggestions off (default): taken once spelt exactly, case- and accent-insensitive, ⏭ to skip. Suggestions on: list after 3 characters, Enter submits, misspellings accepted with a correction (see below) |
| Timer | 15s per question, or off |
| Wrong/timeout | Reveal correct country, drop pin, move on |
| Colours | correct green, wrong pick red, missed grey — all persist for the round |
| Micro-states | Circle markers, sized in screen px, fading out as you zoom in. Fiji, the Solomons and Vanuatu keep theirs until their largest island is 48px, not 9 (`ARCHIPELAGO_THRESHOLD_PX`), as the reference does |
| Results | correct/total, elapsed time, tier title, over the round's own map as it ended. Misses (wrong or skipped) are listed; tapping one flies the map to it and names it. One button, "Practise the N you missed", replays only those in the same mode and timer, and its own results offer the same for what is still missed |

## Still to do

- Island Nations round — needs the agreed 46-country list
- Europe/continent country lists confirmed against the reference
