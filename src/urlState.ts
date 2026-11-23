// All app state lives in the query string, e.g.
//   ?level=5&l=1.0,2.1&p=0&d=0
// level is the preset level, which sets the board (n columns, m dot rows, x total lines; only
// presets are played). l revealed lines ("row.col"), p played/traced starts,
// d selected destination, s=math for the mathematician strategy (gambler when omitted). lang is the UI language (zh-TW when omitted, or en-US).

import { DEFAULT_LANG, parseLang, type Lang } from './i18n.ts'
import {
  analyzePrepared,
  countLayouts,
  key,
  lineDots,
  maxLines,
  oddsCost,
  parseKey,
  prepare,
  trace,
  type Board,
  type Trace,
} from './solver.ts'

export type Strategy = 'gambler' | 'mathematician'

export type State = {
  level: number
  // the level's board, kept alongside it
  n: number
  m: number
  x: number
  lines: string[]
  played: number[]
  dest: number
  lang: Lang
  strategy: Strategy
}

// Every level is a 6 × 5 board; levels 1 … 5 have l + 4 lines (5 … 9),
// and levels 6 … 10 and 11 … 15 have the same setup as levels 1 … 5.
const LEVEL_LINES = [5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9]
export const LEVELS = LEVEL_LINES.map((_, i) => i + 1)
export const levelBoard = (l: number) => ({ n: 6, m: 5, x: LEVEL_LINES[l - 1] })
const isLevel = (l: number) => LEVELS.includes(l)

export const DEFAULT: State = { level: 1, n: 6, m: 5, x: 5, lines: [], played: [], dest: 0, lang: DEFAULT_LANG, strategy: 'gambler' }

const int = (v: string | null, def: number, min: number, max: number) => {
  const i = v === null ? NaN : parseInt(v, 10)
  return Number.isFinite(i) ? Math.min(max, Math.max(min, i)) : def
}

export function normalize(s: State): State {
  const level = isLevel(s.level) ? s.level : DEFAULT.level
  const { n, m, x } = levelBoard(level)
  const lines: string[] = []
  const ends = new Set<string>()
  for (const k of s.lines) {
    const [r, c] = parseKey(k)
    if (!(Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < m && c >= 0 && c < n - 1)) continue
    const k2 = key(r, c)
    const dots = lineDots(k2)
    if (dots.some((d) => ends.has(d))) continue // shares an endpoint: invalid
    dots.forEach((d) => ends.add(d))
    lines.push(k2)
  }
  // a fixed order, so the same lines always save (and compare) the same
  lines.sort((a, b) => {
    const [ra, ca] = parseKey(a)
    const [rb, cb] = parseKey(b)
    return ra - rb || ca - cb
  })
  const played = [...new Set(s.played.filter((p) => Number.isInteger(p) && p >= 0 && p < n))].sort((a, b) => a - b)
  return {
    level,
    n,
    m,
    x,
    lines,
    played,
    dest: Math.min(s.dest, n - 1),
    lang: s.lang,
    strategy: s.strategy,
  }
}

// What a state's traced routes prove, and the odds they leave for the hidden lines.
export type Known = {
  board: Board // x capped to what the board can hold
  lines: Set<string>
  traces: Trace[]
  ends: Set<string> // dots a line joins
  blocked: Set<string> // dots a route passes straight through, so they have no line
  layouts: number // layouts of the hidden lines consistent with the board (at least 1)
  remaining: number // hidden lines still to place
  // prob[s][d] = P(start s ends at destination d); null when it's too slow to work out here,
  // and the page computes it in a worker instead
  prob: number[][] | null
}

// Above this oddsCost the odds are left to a worker (about 10 ms of work at this level).
const ODDS_SYNC_COST = 200_000

// null when the routes are impossible: no layout of the x lines agrees with them.
// Lines are only known from traced routes, so the returned state keeps just the lines some
// route crosses. A line no route crosses never touches a route's dots, so dropping it leaves
// every route as is, and the traces made with it still hold.
export function derive(s: State): { state: State; known: Known } | null {
  const board = { n: s.n, m: s.m, x: Math.min(s.x, maxLines(s.n, s.m)) }
  const all = new Set(s.lines)
  const traces = s.played.map((p) => trace(board, all, p))
  const used = new Set(traces.flatMap((t) => t.lines))
  const state = used.size === s.lines.length ? s : { ...s, lines: s.lines.filter((l) => used.has(l)) }
  const lines = new Set(state.lines)
  const ends = new Set(state.lines.flatMap(lineDots))
  const blocked = new Set(traces.flatMap((t) => t.straight))
  const p = prepare(board, lines, blocked)
  const layouts = countLayouts(p)
  if (!layouts) return null
  const odds = oddsCost(p) <= ODDS_SYNC_COST ? analyzePrepared(p) : null
  const prob = odds?.ok ? odds.prob : null
  return { state, known: { board, lines, traces, ends, blocked, layouts, remaining: p.remaining, prob } }
}

// Whether two states have the same board and routes, so the same Known.
export const sameBoard = (a: State, b: State) =>
  a.n === b.n &&
  a.m === b.m &&
  a.x === b.x &&
  a.lines.join() === b.lines.join() &&
  a.played.join() === b.played.join()

// `dropped` is set when the link held something that isn't kept as given: lines no route
// crosses or that overlap, the retired `e` (no-line dots) and n, m, x (board) params, an unknown
// level or out-of-range values, or
// routes that are impossible (which load as an empty board).
export type Loaded = { state: State; known: Known; dropped: boolean }

export function read(search: string): Loaded {
  const q = new URLSearchParams(search)
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean)
  // Only preset levels are played: a link with no level loads the default one, and one with
  // an unknown level (or the retired n, m, x board params) loads it as a changed link.
  const lv = q.has('level') ? parseInt(q.get('level')!, 10) : DEFAULT.level
  const lines = list('l')
  const played = list('p').map(Number)
  const s = normalize({
    ...DEFAULT,
    level: lv,
    lines,
    played,
    dest: int(q.get('d'), DEFAULT.dest, 0, 99),
    lang: parseLang(q.get('lang')),
    strategy: q.get('s') === 'math' ? 'mathematician' : 'gambler',
  })
  // routes that can't happen load as an empty board of the same level
  const d = derive(s)
  if (!d) return { ...derive({ ...s, lines: [], played: [] })!, dropped: true }
  const { state } = d
  // a number param that was out of range (or not a number) and so was clamped
  const clamped = (k: string, v: number) => q.has(k) && q.get(k) !== String(v)
  const dropped =
    clamped('level', state.level) ||
    ['n', 'm', 'x', 'e'].some((k) => q.has(k)) ||
    state.lines.length < lines.length ||
    state.played.length < played.length ||
    clamped('d', state.dest)
  return { ...d, dropped }
}

export function write(s: State): string {
  const q = new URLSearchParams()
  q.set('level', String(s.level))
  if (s.lines.length) q.set('l', s.lines.join(','))
  if (s.played.length) q.set('p', s.played.join(','))
  q.set('d', String(s.dest))
  if (s.lang !== DEFAULT_LANG) q.set('lang', s.lang)
  if (s.strategy !== 'gambler') q.set('s', 'math')
  // keep commas readable
  return '?' + q.toString().replace(/%2C/g, ',')
}
