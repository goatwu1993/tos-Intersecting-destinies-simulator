// Board model
// - n columns (start A.. at top, destinations at bottom), m rows of dots in between.
// - A horizontal line sits on dot row r and joins column c with column c+1; key "r.c".
// - Two lines never share an endpoint (dot).
// - Every start changes track at least once, i.e. every column has a line touching it
//   (a start only goes straight down if no line touches its column).
// - x lines exist in total; some are revealed, the rest are unknown.
//
// Unknown lines are assumed to be placed uniformly at random among all layouts
// consistent with what is known: the revealed lines, plus every dot known to
// have no line (passed straight through by a traced route).

export type Board = { n: number; m: number; x: number }

// Dots and lines share the "row.col" key; a line's key is its left dot.
export const key = (r: number, c: number) => `${r}.${c}`
export const parseKey = (k: string) => k.split('.').map(Number) as [number, number]
// The two dots a line joins.
export const lineDots = (line: string) => {
  const [r, c] = parseKey(line)
  return [key(r, c), key(r, c + 1)]
}

// Lines can't share a dot, so each row fits at most floor(n / 2).
export const maxLines = (n: number, m: number) => m * Math.floor(n / 2)

export type Trace = {
  start: number
  end: number
  // polyline in grid coords: row -1 = start post, row m = destination post
  points: [number, number][]
  // dots passed straight through (proven to have no line)
  straight: string[]
  // lines the path crossed
  lines: string[]
}

export function trace(board: Board, lines: Set<string>, start: number): Trace {
  const { m } = board
  let c = start
  const points: [number, number][] = [[-1, c]]
  const straight: string[] = []
  const used: string[] = []
  for (let r = 0; r < m; r++) {
    if (c > 0 && lines.has(key(r, c - 1))) {
      points.push([r, c], [r, c - 1])
      used.push(key(r, c - 1))
      c -= 1
    } else if (lines.has(key(r, c))) {
      points.push([r, c], [r, c + 1])
      used.push(key(r, c))
      c += 1
    } else {
      straight.push(key(r, c))
    }
  }
  points.push([m, c])
  return { start, end: c, points, straight, lines: used }
}

// Each option for a row: how many unknown lines it adds, the resulting column mapping, and
// (bit c) the columns a line in the row touches, revealed or not.
export type RowOption = { k: number; map: number[]; moved: number }

export function rowOptions(n: number, r: number, lines: Set<string>, blocked: Set<string>): RowOption[] {
  const used = new Array<boolean>(n).fill(false)
  const fixed: number[] = []
  for (let c = 0; c < n - 1; c++) {
    if (lines.has(key(r, c))) {
      fixed.push(c)
      used[c] = used[c + 1] = true
    }
  }
  const free: number[] = []
  for (let c = 0; c < n - 1; c++) {
    if (lines.has(key(r, c))) continue
    if (used[c] || used[c + 1]) continue
    if (blocked.has(key(r, c)) || blocked.has(key(r, c + 1))) continue
    free.push(c)
  }
  const out: RowOption[] = []
  const chosen: number[] = []
  const emit = () => {
    const map = Array.from({ length: n }, (_, i) => i)
    let moved = 0
    for (const c of [...fixed, ...chosen]) {
      map[c] = c + 1
      map[c + 1] = c
      moved |= 3 << c
    }
    out.push({ k: chosen.length, map, moved })
  }
  // enumerate subsets of free edges with no shared endpoint
  const rec = (i: number, last: number) => {
    if (i === free.length) return emit()
    rec(i + 1, last)
    const c = free[i]
    if (last !== c - 1) {
      chosen.push(c)
      rec(i + 1, c)
      chosen.pop()
    }
  }
  rec(0, -2)
  return out
}

export type Analysis =
  | { ok: false; error: 'tooManyLines' | 'noLayout' } // translated by the UI
  | {
      ok: true
      layouts: number // number of consistent layouts for the unknown lines
      remaining: number // unknown lines still hidden
      // prob[s][d] = P(start s ends at destination d)
      prob: number[][]
    }

// Every column needs a line, which the board can only hold if its (capped) x lines can cover
// all n columns: ceil(n / 2) lines, e.g. not 5 columns on a single row. Any x from there up
// to the board's capacity can then cover them.
export const playable = (n: number, m: number, x: number) => Math.min(x, maxLines(n, m)) >= Math.ceil(n / 2)

// What the counts below share: each row's options, the columns no revealed line touches yet
// (bit c), and how many hidden lines are left to place.
export type Prepared = { n: number; rows: RowOption[][]; free: number; remaining: number }

export function prepare(board: Board, lines: Set<string>, blocked: Set<string>): Prepared {
  const { n, m, x } = board
  const rows = Array.from({ length: m }, (_, r) => rowOptions(n, r, lines, blocked))
  // revealed lines are in every option of their row, including the first (no hidden lines)
  const revealed = rows.reduce((a, opts) => a | opts[0].moved, 0)
  return { n, rows, free: ~revealed & ((1 << n) - 1), remaining: x - lines.size }
}

// Every column needs a line. By inclusion–exclusion over the columns no revealed line
// touches yet: valid = Σ over subsets S of them, (−1)^|S| × layouts touching none of S,
// i.e. using only row options that touch no column in S. Counts stay below 2^53 at these
// board sizes, so the alternating sum is exact.
function sumOverSubsets(p: Prepared, term: (rows: RowOption[][]) => Float64Array): Float64Array {
  let total: Float64Array | undefined
  for (let S = p.free; ; S = (S - 1) & p.free) {
    const v = term(p.rows.map((opts) => opts.filter((o) => !(o.moved & S))))
    const sign = popcount(S) % 2 ? -1 : 1
    total ??= new Float64Array(v.length)
    for (let i = 0; i < v.length; i++) total[i] += sign * v[i]
    if (S === 0) return total
  }
}

// Number of layouts of the hidden lines consistent with the board; 0 when it's impossible.
// Cheap (no start-to-end matrix), so it can check every edit on the main thread.
export function countLayouts(p: Prepared): number {
  if (p.remaining < 0) return 0
  return sumOverSubsets(p, (rows) => {
    let dp = new Float64Array(p.remaining + 1)
    dp[0] = 1
    for (const opts of rows) {
      const next = new Float64Array(p.remaining + 1)
      for (const o of opts) for (let u = 0; u + o.k <= p.remaining; u++) next[u + o.k] += dp[u]
      dp = next
    }
    return dp.subarray(p.remaining)
  })[0]
}

// Rough work for analyze(), to decide whether it can run without stalling the page.
export const oddsCost = (p: Prepared) => (1 << popcount(p.free)) * p.rows.length * p.n * p.n

// blocked: dots known to have no line (passed straight through by a traced route)
export const analyze = (board: Board, lines: Set<string>, blocked: Set<string>) =>
  analyzePrepared(prepare(board, lines, blocked))

export function analyzePrepared(p: Prepared): Analysis {
  const { n } = p
  if (p.remaining < 0) return { ok: false, error: 'tooManyLines' }
  const final = sumOverSubsets(p, (rows) => count(n, rows, p.remaining))

  // every layout sends start 0 somewhere, so its row sums to the layout count
  let layouts = 0
  for (let d = 0; d < n; d++) layouts += final[d]
  if (!layouts) return { ok: false, error: 'noLayout' }
  const prob = Array.from({ length: n }, (_, s) => Array.from({ length: n }, (_, d) => final[s * n + d] / layouts))
  return { ok: true, layouts, remaining: p.remaining, prob }
}

const popcount = (v: number) => {
  let k = 0
  for (; v; v &= v - 1) k++
  return k
}

// counts[start * n + end]: layouts of the `remaining` hidden lines built from the given row
// options (no column rule) that take start to end.
function count(n: number, rows: RowOption[][], remaining: number): Float64Array {
  // dp[used][start * n + pos] = number of partial layouts using `used` hidden lines
  // that take `start` to column `pos`; all starts advance together, row by row.
  const R = remaining
  let dp = Array.from({ length: R + 1 }, () => new Float64Array(n * n))
  for (let s = 0; s < n; s++) dp[0][s * n + s] = 1
  for (const opts of rows) {
    const next = Array.from({ length: R + 1 }, () => new Float64Array(n * n))
    for (let u = 0; u <= R; u++) {
      const cur = dp[u]
      if (!cur.some(Boolean)) continue
      for (const o of opts) {
        if (u + o.k > R) continue
        const out = next[u + o.k]
        for (let s = 0; s < n; s++) {
          for (let pos = 0; pos < n; pos++) out[s * n + o.map[pos]] += cur[s * n + pos]
        }
      }
    }
    dp = next
  }

  return dp[R]
}
