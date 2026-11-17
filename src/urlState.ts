// All app state lives in the query string, e.g.
//   ?n=6&m=5&x=9&l=1.0,2.1&p=0&d=0
// n columns, m dot rows, x total lines, l revealed lines ("row.col"), p played/traced starts,
// d selected destination, s=math for the mathematician strategy (gambler when omitted). lang is the UI language (zh-TW when omitted, or en-US).

import { DEFAULT_LANG, parseLang, type Lang } from './i18n.ts'
import { analyze, key, maxLines, parseKey, trace } from './solver.ts'

export type Strategy = 'gambler' | 'mathematician'

export type State = {
  n: number
  m: number
  x: number
  lines: string[]
  played: number[]
  dest: number
  lang: Lang
  strategy: Strategy
}

export const DEFAULT: State = { n: 6, m: 5, x: 5, lines: [], played: [], dest: 0, lang: DEFAULT_LANG, strategy: 'gambler' }

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
    const a = key(r, c)
    const b = key(r, c + 1)
    if (ends.has(a) || ends.has(b)) continue // shares an endpoint: invalid
    ends.add(a).add(b)
    lines.push(a)
  }
  const played = [...new Set(s.played.filter((p) => Number.isInteger(p) && p >= 0 && p < n))].sort((a, b) => a - b)
  // Lines are only known from traced routes, so keep just the ones some route crosses. A line
  // no route crosses never touches a route's dots, so dropping it leaves every route as is.
  const all = new Set(lines)
  const used = new Set(played.flatMap((p) => trace(s, all, p).lines))
  return {
    n,
    m,
    x,
    lines: lines.filter((l) => used.has(l)),
    played,
    dest: Math.min(s.dest, n - 1),
    lang: s.lang,
    strategy: s.strategy,
  }
}

// Whether the traced routes are possible: some layout of the x lines agrees with them.
export function possible(s: State): boolean {
  const board = { n: s.n, m: s.m, x: Math.min(s.x, maxLines(s.n, s.m)) }
  const lines = new Set(s.lines)
  const blocked = new Set(s.played.flatMap((p) => trace(board, lines, p).straight))
  return analyze(board, lines, blocked).ok
}

export function read(search: string): State {
  const q = new URLSearchParams(search)
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean)
  const n = int(q.get('n'), DEFAULT.n, ...LIMITS.n)
  const m = int(q.get('m'), DEFAULT.m, ...LIMITS.m)
  const s = normalize({
    n,
    m,
    x: int(q.get('x'), DEFAULT.x, ...LIMITS.x),
    lines: list('l'),
    played: list('p').map(Number),
    dest: int(q.get('d'), DEFAULT.dest, 0, 99),
    lang: parseLang(q.get('lang')),
    strategy: q.get('s') === 'math' ? 'mathematician' : 'gambler',
  })
  // a link whose routes can't happen keeps its settings but loads an empty board
  return possible(s) ? s : { ...s, lines: [], played: [] }
}

export function write(s: State): string {
  const q = new URLSearchParams()
  q.set('n', String(s.n))
  q.set('m', String(s.m))
  q.set('x', String(s.x))
  if (s.lines.length) q.set('l', s.lines.join(','))
  if (s.played.length) q.set('p', s.played.join(','))
  q.set('d', String(s.dest))
  if (s.lang !== DEFAULT_LANG) q.set('lang', s.lang)
  if (s.strategy !== 'gambler') q.set('s', 'math')
  // keep commas readable
  return '?' + q.toString().replace(/%2C/g, ',')
}
