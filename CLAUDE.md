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

**Kosovo** does not exist separately in that dataset (its territory is inside
Serbia), so the set is 196 entries, not 197. See `INCLUDE_KOSOVO` in
`scripts/build-data.mjs`.

**No question-count selector.** Every round asks the full country set.

**Typed answers are judged by `src/game/matchName.ts`.** A misspelling that is
close enough counts as correct and shows the right spelling, but only if it is
*strictly closer to the target than to every rival* — the other places in the
round plus all 196 country names. That second bar is what stops "Uruguay"
passing as "Paraguay" or "Nigeria" as "Niger". Never relax it without running
`npm run check:names`; aliases should hold genuine alternative names, never
misspellings, or the correction note never fires.

**Auto-zoom fires on reveal only** — never while a question is being asked, or
the camera gives the answer away.

## Architecture

The whole app is one map engine plus configuration.

- `src/map/MapCanvas.tsx` — the engine. Takes `render` (geography to draw),
  `askable` (what's quizzable), and `view` (a bbox). Everything else is
  derived. Continent rounds are not special-cased; they are different arguments.
- `src/game/rounds.ts` — the 8 rounds as config.
- `src/game/useQuiz.ts` — round state machine.
- `src/screens/` — Play, Results, Learn.
- `scripts/build-data.mjs` — the only thing that touches Natural Earth.

`render` and `askable` are separate because Island Nations draws the whole
world and asks only its own subset.

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
