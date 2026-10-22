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
2019 file (`LADAKH_URL`), its ends snapped onto DataMeet's outline.

The states are areas as well as lines, so the map can colour them, and the
lines are those areas' shared edges, so a colour always meets its dashed line.
The areas are built from *every* edge DataMeet draws, not only the shared ones —
its polygons do not quite meet in places (300m at Delhi and Uttar Pradesh, 4km
where Punjab meets Rajasthan), and with inner lines alone Punjab, Tripura and
Mizoram leaked into their neighbours — plus India's drawn outline, and each
inner line that ends at DataMeet's coast carried on to the drawn one, so the
strip between the two coastlines is cut at every state line instead of letting
one state's colour creep along its neighbour's shore. Each face takes the
DataMeet state its inside falls in; a face in none goes to the neighbour it
shares the most edge with. The build holds each state to DataMeet's own area
(8%) and gives each a `colour` so that no two neighbours share one (DSatur; four
colours today, fails above five). `state-lines.topo.json` carries both,
`statefills` and `statelines`, and is loaded only when an India map opens: at
that precision it is the heaviest file the app has. A state is never a question
— this is context. The States button on the India map cycles Coloured → Lines →
Off, remembered like Lat/Long (`loadStates`/`saveStates`, coloured by default;
someone who had switched the old lines-only toggle off stays off). The colours
(`STATE_TINTS` in `MapCanvas`) are warm and pale — yellow, peach, pink, lime,
tan — never blue or teal, so the rivers stay the strongest thing on the map.

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
round.** The World Map menu is the Political Map, the Physical Map and
Phenomena, nothing else. The Physical Map holds Seas & Straits, with Rivers,
Mountains, Deserts, Grasslands and Lakes beside it (`PHYSICAL_SECTIONS` in
`src/app/physical.ts`), each already a map at a route of its own
(`#/physical-rivers/learn`, `PhysicalScreen`) waiting for its notes. A physical
map (`physical` on `MapCanvas`) draws the land as one mass — no borders, only
the coast (`coastline()` in `src/data/countries.ts`: the topology's arcs that
belong to one country alone, less Natural Earth's cut along the 180th) — and a
Borders switch lays the countries' borders and names over it, off by default
and remembered like Lat/Long (`loadBorders`/`saveBorders`). There a country's
name shows only once its largest piece is wide enough on screen to hold it
(across, not along — Chile is long, not wide) and the name has room: the
largest countries by area are placed first, and a name that would touch one
already placed waits for more zoom (`physicalNamed`).

A name is written at the country's `label` point when it has one, not its
centroid. The build gives one wherever the centroid falls off the country's own
land and its largest piece is most of it — Croatia's crescent put the centroid
in Bosnia, Greece's islands in the Aegean, French Guiana dragged France's into
the Atlantic, Svalbard Norway's — at that piece's pole of inaccessibility
(`labelPoint`), and prints the list on every run. A small island nation keeps
its centroid: its name belongs with the ring drawn round its islands. Markers
stay on the centroid; the pin dropped on a revealed country goes on the label
point, on land. The home screen
and both atlas menus are built from one card and one section
(`MenuCard`, `MenuSection`, `ComingSoonCard` in `src/ui/Menu.tsx`): an icon in
its own tint, the title, a line on what is inside and a count at the foot, the
whole card the tap target — so a new section is a new card, never a new layout. A Political Map round (`political-<scope>`, scope `world` or a continent)
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
left of the far south.

**Learn opens on what the setup has chosen.** The setup's choices are not
practice-only: Learn starts from them too — the Political Map's sections, the
Seas & Straits region (only that region's features) and notations, the rivers'
systems (their context rivers with them) — so a learner who ticked Capitals and
Other places sees just those. `App` hands them to `LearnScreen` as `initial`
and narrows its round; Learn's own legend chips then turn things on and off from
there, for that visit only, never writing back to the setup. With Countries off,
the micro-state rings go too. Only the question count, mode and timer are
practice's alone.

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
or two letters. The first suggestion is highlighted as soon as the list opens,
so Enter takes it without a click — asked for, to save reaching for the mouse;
the arrows move the highlight, a click picks any. An exact match closes the
list, having nothing to add, so a fully spelt answer is still submitted as
typed; so is anything while the list is closed, or after Escape puts it away.

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
range emits no marker and no second label. A peak is a little snow-capped mountain (`PeakGlyph` in `MapCanvas`, `PeakSwatch` in `src/ui/bits.tsx` for the legend: slate-blue faces, white snow, green foothills and pines), and so is a river's origin; in a round its faces take the quiz colour and the snow stays.
Nothing on the map pins a summit down, so a peak or an origin is answered by a
tap anywhere within 150km of it or 48px on screen (`PEAK_REACH_KM`,
`PEAK_TOLERANCE_PX` in `useQuiz`).

**A point is answered roughly, not exactly.** Every point place in Pin — a
capital, a city, a port, a pass, a lake, a confluence, a strait's or canal's
marker — counts within 100km of the tap (`POINT_REACH_KM`, or its own `spanKm`
if larger), or within 28px on screen where 100km is a speck on a zoomed-out
map (`PIN_TOLERANCE_PX`). There is no rival check, on request: where points
overlap, one tap among them answers whichever is being asked, so a cluster —
three Garhwal peaks, Santos and São Paulo — is a matter of answering in the
right order, not of hitting each pin. It used to demand the tap be nearer this
point than any other the round could ask; that is gone. Areas (countries, seas,
patches), ranges and line choices (currents, rivers) are judged as before.

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

**A local wind is an arrow too.** Phenomena's second round is the local
winds (`src/data/syllabus/local-winds.json`, type `wind`), from the notes: the
hot winds — Chinook, Foehn, Zonda, Harmattan, Brickfielder, Shamal, Black
Roller, Sirocco, Khamsin, Santa Ana — and the cold — Mistral, Bora, Blizzard,
Levanter, Pampero, Buran, Norte — 17 in all, each a hand-traced `line` the way
it blows and a `temp`, with the notes' facts and the standard UPSC ones on its
card. The warm/cold split is the notes', even where a wind is both: the
Levanter, "warm during summers, cold during winters", is filed cold, as they
file it. A wind is a current in all but name — `isFlow` in
`src/data/places.ts` is the one test, and everything a current does a wind does
(drawn red or blue by `CURRENT_INK`, picked as the nearest arrow on screen,
named warm-or-cold-then-name in Name mode) — except three things: it blows over
land, so it has no `ocean` and is never held to the sea; it has a Why mode,
because its clue ("the snow eater") is worth naming it from, and the name alone
answers there; and in Name mode its arrow is zoomed to when it is small (the
Foehn, the Bora are a few pixels at world scale), as a sea is. The Purga is not
a wind of its own: it is the Blizzard's Siberian name, in the Blizzard's notes,
not an alias, since the arrow is in North America.

 The isotherms are a Learn-only
screen (`#/isotherms`, `src/screens/IsothermScreen.tsx`, no round behind it, so
`App` answers it before anything that needs one) with three maps — January,
July and the January–July range — at the textbook figures' own levels
(−25, −12.5, 0, 10, 20, 30°C; 0–30°C; 3–60°C). The lines are contoured at build
time by `scripts/isotherms.mjs` from NOAA's 1991–2020 long-term means, the
record the figures are generalised from: January and July from the NCEP/NCAR
reanalysis (2.5°), reduced to sea level at 6.5°C a kilometre — or Tibet and the
Andes are cold islands — except over the Greenland and Antarctic ice, which the
figures leave cold (Greenland is July's 0°C loop). The range takes GHCN-CAMS
station temperatures (0.5°) over land: on the 2.5° grid Siberia peaks at 53°C,
the stations reach Verkhoyansk's 62°C, the figure's 60°C core. Each field is
smoothed (3° for the months, 1.25° for the range's bands, 0.4° for its 50 and
60°C cores) and contoured by marching squares wrapping round the globe; short
loops of the broad bands are dropped as noise, the hot cores keep theirs. The
thermal equator is the warmest latitude within the tropics on each meridian,
smoothed along the parallel. `npm run data` fails unless the figures' features
come out: the thermal equator dipping over South America and Australia in
January and riding north over Africa and India in July, Greenland's July 0°C,
the Sahara's July 30°C and range 30°C, Canada's 40°C and Siberia's 60°C range.
One figure feature the data does not bear out: the southern continents' 20°C
range loops — Australia peaks at 19°C, southern Africa at 16°C — so they show
as the 10°C loops. Lines are coloured on the currents' own blue-to-red
(`CURRENT_INK`), lowest level to highest; the thermal equator is dashed navy.
`MapCanvas` draws them through `isolines`, a plain line layer with labels.

**Climates are Köppen's, unless a reference map is.** Phenomena's climate entry is a
Learn-only climate map (`#/climate`, `src/screens/ClimateScreen.tsx`, answered
in `App` like the isotherms): the equatorial, tropical monsoon, Mediterranean,
hot desert, cold desert and Sudan-type climates as patches over a physical world map, a legend chip each to
put it away, and a card of the textbook's account on a tap. The regions are the
Köppen-Geiger classes of Beck et al. (2023), *Scientific Data* 10, 724 (CC BY
4.0) — its present-day map, 1991–2020, at 0.1° — made into polygons at build
time by `scripts/climate.mjs`: Mediterranean is Csa + Csb, hot desert BWh,
cold desert BWk, Sudan type Aw (Leong's "Savanna or Sudan climate"), equatorial
Af (the hot, wet equatorial climate: at least 60mm of rain even in the driest
month). The equatorial patch carries its regions' names as the textbook's map
writes them — Amazon Basin, Congo Basin, Indo-Malaysian (`EQUATORIAL_LABELS`
in `ClimateScreen`) — and the build checks each label sits on the patch. Each class
is a mask contoured by marching squares (`d3-contour`), specks under 20 cells
dropped, simplified by an absolute 3km and clipped to the drawn land, into
`src/data/climate.topo.json`, loaded only when the map opens. Köppen also classes
a few tropical highlands Cs — Ethiopia, Kenya — and those are tropical highland
climates, not the Mediterranean of the west coasts at 30°–45°, so Mediterranean
is taken outside the tropics only. Köppen's Aw also covers peninsular India,
Myanmar, Thailand and Indochina, which the textbook classes as the Tropical
Monsoon climate, not the Sudan type — so Aw is not taken in monsoon Asia, north
of the Equator between 60°E and 150°E (`MONSOON_ASIA`); Timor's savanna
stays, and northern Australia's did until the monsoon patch (below) took it. `npm run data` fails unless 54 places whose
climate is not in doubt fall inside their own region and no other (Rome, Cape
Town, Perth; Riyadh, the Thar, Alice Springs; the Gobi, the Taklamakan,
Patagonia; Bamako, the Campos; Mumbai, Darwin, Lagos, Houston…), and six — Nagpur, Hyderabad, Kolkata, Yangon, Bangkok,
Ho Chi Minh City — fall outside the Sudan type. Af is Köppen's strict
rainforest class, so it is narrower than a textbook's "equatorial rainforest"
sketch: the southern and eastern Amazon (Santarém, Porto Velho), most of the
Guinea coast (Freetown, Abidjan, Douala) and Myanmar's coast are Am, monsoon
rainforest with a short dry season, and Thailand and southern Vietnam Aw, so
none of them is in the patch. `MapCanvas` draws them through `patches` (with `onPatch`
and a `credit` line at the foot), over the land and under the coast; with
Borders on, the borders are drawn again over the patches.

A climate asked for from a reference map is drawn as that map draws it, not as
Köppen does, and **it overwrites the Mediterranean and Sudan-type patches
wherever they meet** — those two are Köppen's only until a reference replaces
them too. **The hot and cold deserts are Köppen's BWh and BWk exactly**, as
asked: a reference gives way to them, as it does to the equatorial patch
(`KEEP` in `scripts/climate.mjs`). The tropical monsoon (Am) is the first: traced from the
reference "Distribution of monsoon climate area" by `scripts/trace-climate.mjs`
into `scripts/climate-reference/monsoon.geojson`, which `scripts/climate.mjs`
(`REFERENCE`, `OVERWRITTEN`) fills onto the Köppen grid and cuts out of the
two before they are contoured. So it reaches the US Gulf coast and north-east
Mexico, which Köppen calls humid subtropical; it takes the Llanos, so they are
no longer the Sudan type's check; and Darwin is monsoon, no longer Sudan type.
The reference paints the eastern Thar and Karachi yellow too, but they are BWh,
so they stay desert, and the build checks they do. The equatorial patch and the
deserts are not overwritten: they keep their ground and the monsoon is cut out
of them, specks too small to draw excepted, or they would leave holes. The tracer fits the picture's projection against the Köppen
raster's land (a Miller map stretched north–south, 96% of pixels agreeing),
grows the colour across the grey fringe the reference leaves at each coast and
a few pixels out to sea — never across land it left grey, so its inland edges
stand — and leaves out Sri Lanka, which the reference leaves out and growth off
India's tip would reach. Each new reference is an entry in its `REFERENCES`.

The climate map also has a Pressure belts switch and a Trade winds switch, and
a month both follow — January, March, July and September: the north-east
trades crossing the Equator, the north-east monsoon over India and the
north-west monsoon in northern Australia; blowing towards an ITCZ near the
Equator at the spring equinox; the south-east trades crossing it to become the
south-west monsoon; and the autumn equinox, when over South Asia that monsoon
is still blowing, only beginning to retreat. Each is one month, never an
average: March and September were once averaged as "the equinoxes", and over
South Asia they are opposites — September still has the south-west monsoon,
March the last north-easterlies and its rain belt south of the Equator — so
the panel drew September's south-westerlies blowing away from March's ITCZ.
They are separate months now, and September's caption says it is not the
mirror of March.
`npm run data` now checks that in each month the wind over the Arabian Sea,
the Bay of Bengal, off Sri Lanka, the Andaman Sea and off Somalia blows towards
the side the ITCZ lies on; the averaged panel failed four of the five.

Nothing is traced: `scripts/winds.mjs` takes NOAA's 1991–2020 means. The
subtropical highs are each month's ridge of sea-level pressure in the oceans'
own anticyclones — the North Pacific and Azores highs, and the South Pacific,
St Helena and Mascarene highs — averaged per hemisphere (28°N in January to
35°N in July and September), not the pressure averaged round the whole
parallel, which in September is flat from 35° to 42.5°N and was lifted to
40.5°N by the Siberian high building over Asia and pressure reduced to sea
level from Central Asia's plateaus. The subpolar lows are the trough of
pressure averaged round the parallel, the same all the way round. Both are
drawn as a band 5° either side; the polar highs are the zone poleward of 80°, not traced, because
pressure over the ice caps cannot be read reliably. The ITCZ is where the
trades meet — surface convergence (weight 1) and lowest sea-level pressure
(0.75), with GPCP rainfall (0.25) a light third. Rain cannot lead: July's
heaviest falls on the Bay of Bengal's coast at 20°N, south of the monsoon
trough where the winds actually meet, and the Sahara's and Arabia's heat lows,
where July's line rides north, are dry. Nor can pressure alone: reduced to sea
level from southern Africa's plateau, it misses January's meeting over Zambia.
It is traced as one continuous path round the globe, or the South Pacific's own
convergence zone breaks it up. The arrows are the near-surface wind between the
month's two subtropical ridges, on a 7.5° by 5° grid that `MapCanvas` thins as
the map zooms out (`winds`). They were audited, every arrow of every month,
against ICOADS — the winds ships and buoys measured, 1° monthly means averaged
over 1991–2020, observation where the reanalysis is a model — and `npm run
data` now repeats that audit on every run: each month's ~300 sea arrows must be
95% within 30° of the ships and none past 60° (they come out median 3°–4°,
worst 32°–36°), compared where both winds reach 1.5 m/s. The audit is why two
kinds of point get no arrow: calm under 1.5 m/s (`CALM` — the doldrums, where
agreement with the ships fell to 82%; from 3 m/s it is 99–100%, and the
textbook draws them calm) and ground the reanalysis puts over 1,500m
(`HIGHLAND` — Tibet and the Himalaya, the Altiplano, the Mexican plateau, where
the air on a plateau is no trade wind). Over land there are no ships; there
the check is the textbook's, region by region, and all held. One that looked
wrong and is not: southern Arabia in March blows from the south-east, light and
onshore, which the ships off Oman confirm.

The Trade winds switch has two siblings, Westerlies and Polar easterlies, each
its own switch and ink (`WIND_BELTS` in `ClimateScreen`: navy, forest green,
violet). The arrows run from 82.5°N to 82.5°S, each tagged in the build with
the belt it stands in — trades between the subtropical ridges, westerlies out
to the subpolar troughs, polar beyond — never with the way it points: an arrow
shows what the wind does there, and in places that is not what its belt's name
says. Rows within 2.5° of a ridge (the horse latitudes) or 1.25° of a trough
(the polar front, which round Antarctica lies only a few degrees off the coast)
are left calm; the pressure belts mark them. What the averages show, and the
build holds them to: the southern westerlies blow from the west on every
meridian in every month and outblow the North Atlantic's; the northern ones
blow hardest in January, and north of about 47.5°N in the Pacific the winds
circle the Aleutian low instead, north-easterly over the Bering Sea; the polar
easterlies blow from the east along East Antarctica's coast (80% or more), but
the Amundsen and Bellingshausen Seas have westerlies, the Amundsen Sea Low
pulling the trough south. The Arctic's are patchy: north-easterly over the
Chukchi Sea in January and March, where they are named, while the Siberian
Arctic's winter air pours north off Siberia's cold high and the Atlantic's
south-westerlies reach past Norway; in summer the Arctic is too light to show.
Against the ships the westerlies come out median 6°–8° off and are held to 90%
within 30° — they are an average of passing storms, which ships steer round —
and the polar belt, with few ships in the ice, to 85% within 45°; its worst,
78°, is the Denmark Strait's January barrier wind down Greenland's coast. each named wind is written where `npm run data`
checks it blows from the quarter its name says, and the build fails unless the
ITCZ rides north over India (to the monsoon trough, past 21°N), West Africa and
Arabia in July, lies south of the Equator over the Indian Ocean in March, is
still north of 12°N over India in September, and dips over southern Africa
and northern Australia in January. The belts are
`patches` drawn in quarters (a ring all the way round closes on itself), so
they are picked by fill alone (`outline: false`) and their edges drawn as
dashed `isolines`; names go through `notes`, placed in order and dropped where
they would touch one already placed.

**A river is its real course, from OpenStreetMap.** The India map's Rivers
round (`src/data/syllabus/rivers.json`, section `rivers`, type `river`) has the
Godavari, Mahanadi, Krishna, Kaveri, Brahmaputra, Ganga, Indus, Narmada, Tapi,
Mahi, Sabarmati and Luni systems from the notes — each with exactly the
tributaries its map names, no more: each river a `role` — `main`,
`tributary` or `distributary` — a `basin`, the river it `joins` (a tributary
flows into it, a distributary leaves it), and an `osm` id. Natural Earth has
the two main rivers and almost none of their tributaries, so the courses come
from OSM through `scripts/osm-rivers.mjs`, by the OSM API only (the Overpass
mirrors were found refusing for an afternoon): a relation (`R…`) gives its
main-stream ways; a river nobody has made a relation for is walked from a seed
way (`W…`) through the ways that share one of its `osmNames`, kept inside an
`osmBox` where a branch is named after its parent (the Vasishta's head is
tagged plain "Godavari"), with `osmExtra` ways for a stretch left unnamed (the
Kinnarsani above its dam) or left out of a relation (the Nira above Vir dam).
A relation is read by its `main_stream` members, unless `osmAllRoles` says
those cover only a stretch — the Malaprabha tags two ways of nineteen — and
then by every member but its side streams — the Kaveri's own main stream
stops at the Grand Anicut, 100km short of the sea at Poompuhar. A river OSM
tags as a canal along its length, the Thirumanimuthar through Salem, sets
`osmCanal` so its name walk takes canal ways too. A walk matches `name` or
`name:en` — the Raidak's way over the Bhutan border has only the English —
and `osmExtra` may name a whole relation as well as a way: the Teesta is the
Lachen Chu above Chungthang. A seed walk and a relation combine the same way:
the Indus is walked by its Chinese names from Tibet to Demchok, where OSM's
relation for it begins, with that relation as its `osmExtra`. `osmSkip` drops
ways a relation runs above where the notes say the river rises: the Jhelum's
climbs the Sandran past Verinag's spring.

A river may run abroad only where it says: `through` lists the countries
besides India its course may cross — the Brahmaputra's CHN and BGD, from
Chemayungdung to the Padma — and anywhere else is a wrong course. A braided
parent sets `braidKm`, how far from its drawn channel a tributary may end (the
Brahmaputra's 5km in Assam), and a tributary whose own last stretch is a braid
may carry one too (the Gangadhar's 16km into the Jamuna). The pieces are joined on shared nodes, gaps under
40km bridged, and the course is the shortest path between the ends, so a
braided stretch gives one channel. Then held to the notes: a main river must
rise within 30km of its authored `source` (its marker is moved to where the
line begins); a tributary must end on its parent; a distributary is cut to
where it leaves its parent and must reach the sea, or a branch that does (the
Kathajodi feeds the Devi); `endsAt` stops a main river early — the Godavari at
the Dowleswaram barrage, where it divides into the Gautami and the Vasishta.
Simplified to 150m and stored as `line` in `places.json`.

The Ganga has no source of its own: the Bhagirathi and the Alaknanda make it at
Devprayag. So it sets `startsAt` (Devprayag) in place of a `source`, and those
two are `headstream` tributaries, which must end where it begins — the
Bhagirathi carries the Gangotri Glacier as its origin, the Alaknanda the
Satopanth. Learn says "Formed by the Bhagirathi and the Alaknanda" on the
Ganga's card and "Forms the Ganga" on theirs. Its course runs on through the
Padma and the lower Meghna to the Bay (`through` BGD). The Kali is drawn from
Kalapani, below the Lipulekh pass, as India's map has it: OSM carries its
"Kali" up the Kuthi Yankti to Limpiyadhura, which is Nepal's claim, so the
name walk is boxed south of it and the Lipu Gad and Kalapani stretches are
`osmExtra`. Rivers wholly in Nepal (the Karnali's Seti, Tila and Bheri, the
Trishuli, the Kosi's three) are filed under NPL with `through` NPL; the
Ghaghra rises in Tibet, so its Mapchachungo Glacier is filed under China.

Where two rivers meet is a question too — the five prayags of the Alaknanda and
the confluences the Ganga map marks with a dot: Prayagraj, Bhareh, Hamirpur,
Chilla, Kaithi, Chhapra, Sonepur, Khagaria. A `type: "confluence"` place
`meets` two rivers, the one that ends there first, and the build puts it
exactly at that river's drawn mouth — after checking it lies on the second
river and within 15km of the authored point — so the marker always sits on the
junction it names. Drawn orange with a white heart (`SHAPE_FILLS.confluence`,
`ConfluenceSwatch` in `src/ui/bits.tsx`), judged like any point, with its own
Confluences chip in Learn and its own tally on setup; the card says "Meeting
of the X and the Y".

Where a river rises is a question too, beside its tributaries — a main
river's always, a tributary's where the notes mark it (the Teesta's Tso Lhamo,
Zemu Glacier accepted), and abroad where it is abroad (`source.country`: the
Brahmaputra's Chemayungdung Glacier is filed under China): "Find the
origin: Trambakeshwar", or its marker painted and the name typed. It is
authored on the river as `source` — name, aliases (Trimbakeshwar), the notes'
point and a significance — and the build makes it a place of its own, `type:
"origin"` with `river` naming its river, once the course has moved the point to
where the line begins; authored there, the two cannot drift apart. It is drawn
as a peak's mountain, filtered with its river system on setup, and has its own
Origins chip in Learn. The Pin prompt says only "origin", never whose: the
river is drawn on the map, and naming it would make the tap a give-away. A
source may carry `near`, the place the notes write beside it — the Gangotri
Glacier's Gaumukh, the Yamunotri's Bandarpunch, the Chorabari's Kedarnath, the
Satopanth's Badrinath — which the Learn map sets in brackets after the name, in
a heavier hand. It is the map's label only; the answer is still the name. Any
rivers place may carry `near` the same way: the confluence Bhareh is labelled
"Bhareh (Etawah)". The Ravi rises 6km from the Beas, so its source sets
`labelBelow` and "Bara Bangal" is written under its marker, clear of "Rohtang
Pass" above the Beas's.

A rivers map can ask about a place on a river's course too — Majuli, the
largest river island, and Namcha Barwa, the peak the Brahmaputra bends round —
filed with its system's `basin` like any river. The Indus map's are Pangong Tso
and Tso Moriri (`type: "lake"`) and Shipki La, where the Sutlej enters India
(`type: "pass"`). Learn calls them Landmarks,
with their own chip; setup counts them apart from rivers and origins.

A note may set words in **bold** (the Brahmaputra's **Jamuna** and
**Meghna**) or, between `!!` marks, in bold red (the Ghaghra's Karnali
line) — the only two markups notes take — and a note that starts with a number
keeps it in place of the bullet, for facts that run in order — the
Brahmaputra's are by stretch, Tibet to Bangladesh.

Two rivers the notes do not name are there to join the network up: the
Pranhita (the Wardha and Wainganga combined, into the Godavari) and the
Kathajodi (the Devi's way out of the Mahanadi), plus the Godavari's own delta
branches, the Gautami and the Vasishta. They are ordinary questions. The
Kanhan was one too and was taken out of the questions on request, but the
Pench then stopped in mid-air 48km short of the Wainganga, so it is back as
`context`: drawn, finer and fainter, never labelled, never counted and never
asked — `Round.context` keeps it out of `places` and in the drawing. The
Tungabhadra is the same for the Krishna: the notes name the Tunga and the
Bhadra, which meet at Koodli some 550km short of the Krishna, so the river they
make is drawn as context to carry them there; and the Gangadhar for the
Brahmaputra, the Sankosh and the Raidak combined into Bangladesh. The Ganga has
three: the upper Meghna, carrying the Surma to the Padma at Chandpur; the
Harohar, carrying the Phalgu out of the Mokama Tal; and the Ganga's old Patna
channel, past the city's ghats, which is where the Punpun comes in (OSM's main
channel runs 10km north of it). The Gambhir joins the Shipra, not the Chambal
directly, as OSM and the ground have it. A tributary
that ends within its allowance (2km, or the braid's) is carried the rest of the
way onto its parent's drawn channel, so it never stops visibly short — in a
braid the two meet through channels OSM leaves unconnected. Beyond that a river
is never stretched to meet a parent it does not reach; `via` remains for a
river whose connector is not drawn at all (under 80km), and it alone keeps
stopping short. The Dibang joins the Lohit, as OSM has it, just above the main
stream. The Dras runs on to the Indus at Marol through the stretch OSM calls
the Shingo, so the Suru, which meets it at Kargil, is not needed to join it up.
The five rivers of the Punjab join as they do on the ground: the Jhelum and the
Ravi into the Chenab, the Beas into the Sutlej at Harike, the Sutlej into the
Chenab, and the Chenab — the Panjnad, by then — into the Indus at Panchnad.

Drawn by role (`RIVER_INK` in `MapCanvas`, `RiverSwatch` in `src/ui/bits.tsx`):
a main river bold blue (the Luni, which dries into the Rann of Kutch, sets
`thin` and is drawn at a tributary's width), a tributary finer, and a distributary teal and dashed
with arrowheads to the sea, labelled "(distributary)" — it must read at a
glance as water leaving a river. A river's *name* is set by its `rank`, which the
build counts from the main river (0) down the `joins` chain — a tributary 1, a
tributary of a tributary 2, and so on — each step lighter and smaller
(`RIVER_NAME_WEIGHT`), so the main river reads first and the Gambhir last. A
context `channel` of its parent (the Ganga's Patna channel) counts as that
river, not a branch of it. A name sits at the middle of its course unless the
river sets `labelAt`, a fraction of the way from its source: the Alaknanda's
middle was Karnaprayag and the Ganga's Prayagraj, each under a confluence's
label, so they are named near Badrinath and above Kanpur. Every river of the chosen system is on the map
in Pin and Type alike, as the currents are, and a tap answers the nearest on
screen; a practice of misses still draws the whole system (`Round.backdrop`).
Setup narrows by river system, several at once (the `basins` pref, none meaning
all): the chips toggle like the Political Map's continents — All stands alone,
ticking every system is All, and the last one ticked cannot be tapped away; a
stored single `basin` from before carries over. Learn narrows by role and system.
Credit for OSM's rivers and DataMeet's state lines sits at the map's foot.

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
Seas round still focuses seas only, never a strait's marker. The Rivers map
zooms on every Type question, whatever its size (`focusAlways`): a river is
framed by its whole course with room around it, a peak, origin or landmark
(Majuli) by its point with at least 4° of map, because a tributary is one thin
line among twenty and finding which is painted at India's scale is a hunt. Each such question starts from the
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

**Every Learn map can be cleared down to the map.** A Hide switch tops the
map's own buttons (`bare` on `MapCanvas`, `useBare` in `src/app/useBare.ts`) on
every Learn screen and the isotherm maps: on, it puts away the screen's legends,
chips, Show all names, Tricks and ✕, and the map's States and Lat/Long, leaving
the map, the switch (now Show) and Reset. A card still opens on a tap — that is
asked for. One setting for every map, remembered like Lat/Long (`loadBare`/
`saveBare`). Play has no switch: its prompt is the question.

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
- `scripts/build-data.mjs` — the only thing that touches Natural Earth;
  `scripts/osm-rivers.mjs` fetches and joins the river courses from OSM.

`render` and `askable` are separate because Island Nations draws the whole
world and asks only its own subset.

**There are two atlases.** The home screen picks between the World Map — the
Political Map, the Physical Map and Phenomena — and the India Map, which starts with the
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
| Type input | Suggestions off (default): taken once spelt exactly, case- and accent-insensitive, ⏭ to skip. Suggestions on: list after 3 characters with the first highlighted, Enter takes it (or what was typed when the list is closed), misspellings accepted with a correction (see below) |
| Timer | 15s per question, or off |
| Wrong/timeout | Reveal correct country, drop pin, move on |
| Colours | correct green, wrong pick red, missed grey — all persist for the round |
| Micro-states | Circle markers, sized in screen px, fading out as you zoom in. Fiji, the Solomons and Vanuatu keep theirs until their largest island is 48px, not 9 (`ARCHIPELAGO_THRESHOLD_PX`), as the reference does |
| Results | correct/total, elapsed time, tier title, over the round's own map as it ended. Misses (wrong or skipped) are listed; tapping one flies the map to it and names it. One button, "Practise the N you missed", replays only those in the same mode and timer, and its own results offer the same for what is still missed |

## Still to do

- Island Nations round — needs the agreed 46-country list
- Europe/continent country lists confirmed against the reference
