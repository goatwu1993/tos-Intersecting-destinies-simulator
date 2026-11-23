// All app state lives in the query string, e.g.
//   ?n=6&m=5&x=9&l=1.0,2.1&p=0&d=0   or   ?level=5&l=1.0,2.1&p=0&d=0
// level is a preset level, which sets n, m and x (they're left out of the URL then). n columns, m dot rows, x total lines, l revealed lines ("row.col"), p played/traced starts,
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
  playable,
  prepare,
  trace,
  type Board,
  type Trace,
} from './solver.ts'

export type Strategy = 'gambler' | 'mathematician'

export type State = {
  level: number | null // the preset level the board is, if it was picked as one
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
// and level 6 has the same setup as level 1.
export const LEVELS = [1, 2, 3, 4, 5, 6]
export const levelBoard = (l: number) => ({ n: 6, m: 5, x: l === 6 ? 5 : l + 4 })
const isLevel = (l: number | null): l is number => l !== null && LEVELS.includes(l)

export const DEFAULT: State = { level: 1, n: 6, m: 5, x: 5, lines: [], played: [], dest: 0, lang: DEFAULT_LANG, strategy: 'gambler' }

const int = (v: string | null, def: number, min: number, max: number) => {
  const i = v === null ? NaN : parseInt(v, 10)
  return Number.isFinite(i) ? Math.min(max, Math.max(min, i)) : def
}

export const LIMITS = { n: [2, 10], m: [1, 12], x: [5, 9] } as const

export function normalize(s: State): State {
  // x is kept as entered even if the board is too small for it; it's capped where used,
  // so shrinking the board and growing it back doesn't lose the value.
  const { n, m, x } = s
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
  // a level only holds while the board is still that level's (changing n, m or x leaves it)
  const lb = isLevel(s.level) ? levelBoard(s.level) : null
  const level = lb && lb.n === n && lb.m === m && lb.x === x ? s.level : null
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
// crosses or that overlap, the retired `e` (no-line dots) param, out-of-range values, or
// routes that are impossible (which load as an empty board).
export type Loaded = { state: State; known: Known; dropped: boolean }

export function read(search: string): Loaded {
  const q = new URLSearchParams(search)
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean)
  // A valid level sets the board and any n, m, x given with it are ignored. With no level
  // and no n, m, x at all, the default level loads.
  const lv = q.has('level') ? parseInt(q.get('level')!, 10) : null
  const fromLevel = isLevel(lv)
  const bare = !q.has('level') && !['n', 'm', 'x'].some((k) => q.has(k))
  const level = fromLevel ? lv : bare ? DEFAULT.level : null
  const board = fromLevel
    ? levelBoard(lv)
    : {
        n: int(q.get('n'), DEFAULT.n, ...LIMITS.n),
        m: int(q.get('m'), DEFAULT.m, ...LIMITS.m),
        x: int(q.get('x'), DEFAULT.x, ...LIMITS.x),
      }
  const lines = list('l')
  const played = list('p').map(Number)
  const s = normalize({
    level,
    ...board,
    lines,
    played,
    dest: int(q.get('d'), DEFAULT.dest, 0, 99),
    lang: parseLang(q.get('lang')),
    strategy: q.get('s') === 'math' ? 'mathematician' : 'gambler',
  })
  // A board shape that can't be played even empty (every column needs a line, e.g. 5
  // columns on 1 row) loads the default board; a playable one whose routes can't happen
  // keeps its settings but loads empty.
  if (!playable(s.n, s.m, s.x)) return { ...derive({ ...DEFAULT, lang: s.lang, strategy: s.strategy })!, dropped: true }
  const d = derive(s)
  if (!d) return { ...derive({ ...s, lines: [], played: [] })!, dropped: true }
  const { state } = d
  // a number param that was out of range (or not a number) and so was clamped
  const clamped = (k: string, v: number) => !fromLevel && q.has(k) && q.get(k) !== String(v)
  const dropped =
    (q.has('level') && !fromLevel) ||
    list('e').length > 0 ||
    state.lines.length < lines.length ||
    state.played.length < played.length ||
    clamped('n', state.n) ||
    clamped('m', state.m) ||
    clamped('x', state.x) ||
    clamped('d', state.dest)
  return { ...d, dropped }
}

export function write(s: State): string {
  const q = new URLSearchParams()
  if (s.level !== null) q.set('level', String(s.level))
  else {
    q.set('n', String(s.n))
    q.set('m', String(s.m))
    q.set('x', String(s.x))
  }
  if (s.lines.length) q.set('l', s.lines.join(','))
  if (s.played.length) q.set('p', s.played.join(','))
  q.set('d', String(s.dest))
  if (s.lang !== DEFAULT_LANG) q.set('lang', s.lang)
  if (s.strategy !== 'gambler') q.set('s', 'math')
  // keep commas readable
  return '?' + q.toString().replace(/%2C/g, ',')
}
