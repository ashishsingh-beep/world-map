#!/usr/bin/env node --experimental-strip-types
/**
 * Regression check for the typed-answer judge.
 *
 * Every continent added brings new near-twins, and the cost of getting this
 * wrong is silent: an answer marked right that was really a different place.
 * Run it with `npm run check:names`.
 */
import { judgeName, type Candidate } from '../src/game/matchName.ts'
import { readFileSync } from 'node:fs'

const here = new URL('.', import.meta.url).pathname
const read = (f: string) => JSON.parse(readFileSync(here + '../' + f, 'utf8'))
const { places } = read('src/data/places.json')
const meta = read('src/data/countries.meta.json')

const countries: Candidate[] = Object.values(meta).map((m: any) => ({
  id: m.iso,
  name: m.name,
  aliases: m.aliases ?? [],
}))
const cand = (p: any): Candidate => ({ id: p.id, name: p.name, aliases: p.aliases })
const roundOf = (continent: string) => places.filter((p: any) => p.continent === continent).map(cand)
const SA = roundOf('South America')
const NA = roundOf('North America')

const find = (round: Candidate[], name: string) => {
  const c = round.find((x) => x.name === name)
  if (!c) throw new Error(`no such place: ${name}`)
  return c
}

let pass = 0
let fail = 0
function check(round: Candidate[], target: string, typed: string, want: 'exact' | 'typo' | 'no') {
  const t = find(round, target)
  const r = judgeName(typed, t, [...round, ...countries])
  const got = !r.correct ? 'no' : r.corrected ? 'typo' : 'exact'
  const ok = got === want
  ok ? pass++ : fail++
  if (!ok) console.log(`  FAIL  asked ${target.padEnd(18)} typed ${JSON.stringify(typed).padEnd(20)} want ${want}, got ${got}`)
}

console.log('\n== Right answer, right spelling (must be exact) ==')
for (const [t, s] of [
  ['Brasília', 'Brasilia'], ['Brasília', 'brasília'], ['Asunción', 'Asuncion'],
  ['São Paulo', 'sao paulo'], ['Galápagos Islands', 'Galapagos'], ['Carajás', 'Carajas'],
  ['Bogotá', 'BOGOTA'],
] as const) check(SA, t, s, 'exact')
for (const [t, s] of [
  ['Washington DC', 'Washington'], ['Los Angeles', 'LA'], 
  ["St John's", 'St John'], ['Ellesmere Island', 'Ellesmere'], ['Havana', 'La Habana'], ['San José', 'san jose'],
] as const) check(NA, t, s, 'exact')

console.log('\n== Right answer, wrong spelling (must be accepted + corrected) ==')
for (const [t, s] of [
  ['Chuquicamata', 'Chukikamata'], ['Chuquicamata', 'Chuqicamata'], ['Montevideo', 'Montivideo'],
  ['Georgetown', 'Georgtown'], ['Paramaribo', 'Paramarybo'], ['Maracaibo', 'Maracaybo'],
  ['Quito', 'Kito'], ['Sucre', 'Sukre'], ['Santiago', 'Santiego'],
  ['Buenos Aires', 'Buenos Aries'], ['São Paulo', 'Sao Paolo'], ['Asunción', 'Asunsion'],
  ['Brasília', 'Brazilia'], ['Bolivia', 'Bolivai'],
] as const) check(SA, t, s, 'typo')
for (const [t, s] of [
  ['Tegucigalpa', 'Tegusigalpa'], ['Port-au-Prince', 'Port au Prins'], ['Havana', 'Havanna'],
  ['Pittsburgh', 'Pitsburg'], ['Pittsburgh', 'Pittsburg'], ['Los Angeles', 'Los Angelas'],
  ['Belmopan', 'Belmopen'], ['Nassau', 'Nasau'], ['Ellesmere Island', 'Elesmere Island'],
  ['Tegucigalpa', 'Tegucigalpah'], ['Kingston', 'Kingstown'],  ['San Francisco', 'San Fransisco'], ['Havana', 'Havanna'], ['Santo Domingo', 'Santo Domigo'], ['Managua', 'Managwa'],
] as const) check(NA, t, s, 'typo')

console.log('\n== Near-twins and other real places (must be rejected) ==')
for (const [t, s] of [
  ['Santos', 'Santiago'], ['Santiago', 'Santos'], ['Caracas', 'Carajas'],
  ['Paraguay', 'Uruguay'], ['Brasília', 'Brazil'], ['Bolivia', 'Colombia'],
  ['French Guiana', 'Guyana'], ['Lima', 'Kingston'], ['Santos', 'Sao Paulo'],
  ['Bogotá', 'Bolivia'], ['Peru', 'Ecuador'],
] as const) check(SA, t, s, 'no')
for (const [t, s] of [
  ['San Juan', 'San Jose'], ['San José', 'San Juan'], ['San José', 'San Salvador'],
  ['Panama City', 'Panama'], ['Guatemala City', 'Guatemala'], ['Mexico City', 'Mexico'],
  ['San Salvador', 'El Salvador'], ['Ottawa', 'Toronto'], ['Halifax', 'Vancouver'],
  ['San Diego', 'San Francisco'], ['Bermuda', 'Bahamas'],
  ['Havana', 'Kingston'], ['Detroit', 'Toronto'],
] as const) check(NA, t, s, 'no')

console.log('\n== Gibberish and empties (must be rejected) ==')
for (const s of ['', '   ', 'x', 'asdfgh', 'qwertyuiop', '12345', 'the answer']) {
  check(SA, 'Santiago', s, 'no')
}

const WORLD: Candidate[] = countries

console.log('\n== Country rounds: the classic confusions must still be rejected ==')
for (const [t, s] of [
  ['Niger', 'Nigeria'], ['Nigeria', 'Niger'], ['Austria', 'Australia'],
  ['Slovakia', 'Slovenia'], ['Iran', 'Iraq'], ['Mali', 'Malawi'],
  ['Sweden', 'Switzerland'], ['Chad', 'China'],
] as const) check(WORLD, t, s, 'no')

console.log('\n== Country rounds: real typos must still be accepted ==')
for (const [t, s] of [
  ['Kyrgyzstan', 'Kyrgistan'], ['Philippines', 'Phillipines'], ['Mozambique', 'Mozambiqe'],
  ['Netherlands', 'Netherlads'], ['Liechtenstein', 'Lichtenstein'], ['Azerbaijan', 'Azerbaizan'],
] as const) check(WORLD, t, s, 'typo')

console.log(`\n${pass} passed, ${fail} failed\n`)
if (fail) process.exit(1)
