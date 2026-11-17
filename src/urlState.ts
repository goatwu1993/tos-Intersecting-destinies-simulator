// All app state lives in the query string, e.g.
//   ?n=6&m=5&x=9&l=3.0,4.0&e=0.0,1.0,2.0&p=0&d=0
// n columns, m dot rows, x total lines, l revealed lines ("row.col"),
// e dots known to have no line ("row.col"), p played/traced starts,
// d selected destination.

import { key, parseKey } from './solver.ts'

export type State = {
  n: number
  m: number
  x: number
  lines: string[]
  empty: string[]
  played: number[]
  dest: number
}

export const DEFAULT: State = { n: 6, m: 5, x: 9, lines: [], empty: [], played: [], dest: 0 }

const int = (v: string | null, def: number, min: number, max: number) => {
  const i = v === null ? NaN : parseInt(v, 10)
  return Number.isFinite(i) ? Math.min(max, Math.max(min, i)) : def
}

export const LIMITS = { n: [2, 10], m: [1, 12] } as const

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
  // a dot can't be both a line endpoint and empty
  const empty = new Set<string>()
  for (const k of s.empty) {
    const [r, c] = parseKey(k)
    if (!(Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < m && c >= 0 && c < n)) continue
    const d = key(r, c)
    if (!ends.has(d)) empty.add(d)
  }
  const played = [...new Set(s.played.filter((p) => Number.isInteger(p) && p >= 0 && p < n))].sort((a, b) => a - b)
  return { n, m, x, lines, empty: [...empty], played, dest: Math.min(s.dest, n - 1) }
}

export function read(search: string): State {
  const q = new URLSearchParams(search)
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean)
  const n = int(q.get('n'), DEFAULT.n, ...LIMITS.n)
  const m = int(q.get('m'), DEFAULT.m, ...LIMITS.m)
  return normalize({
    n,
    m,
    x: int(q.get('x'), DEFAULT.x, 0, 999),
    lines: list('l'),
    empty: list('e'),
    played: list('p').map(Number),
    dest: int(q.get('d'), DEFAULT.dest, 0, 99),
  })
}

export function write(s: State): string {
  const q = new URLSearchParams()
  q.set('n', String(s.n))
  q.set('m', String(s.m))
  q.set('x', String(s.x))
  if (s.lines.length) q.set('l', s.lines.join(','))
  if (s.empty.length) q.set('e', s.empty.join(','))
  if (s.played.length) q.set('p', s.played.join(','))
  q.set('d', String(s.dest))
  // keep commas readable
  return '?' + q.toString().replace(/%2C/g, ',')
}
