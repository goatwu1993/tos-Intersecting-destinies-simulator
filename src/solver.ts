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
  return { end: c, points, straight, lines: used }
}

// Each option for a row: how many unknown lines it adds and the resulting column mapping.
export type RowOption = { k: number; map: number[] }

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
    for (const c of [...fixed, ...chosen]) {
      map[c] = c + 1
      map[c + 1] = c
    }
    out.push({ k: chosen.length, map })
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

// Bit c is set if a line in `lines` touches column c.
export const touchedColumns = (lines: Iterable<string>) => {
  let mask = 0
  for (const k of lines) {
    const c = parseKey(k)[1]
    mask |= 3 << c
  }
  return mask
}

// blocked: dots known to have no line (passed straight through by a traced route)
export function analyze(board: Board, lines: Set<string>, blocked: Set<string>): Analysis {
  const { n, m, x } = board
  const remaining = x - lines.size
  if (remaining < 0) return { ok: false, error: 'tooManyLines' }

  // Every column needs a line. By inclusion–exclusion over the columns no revealed line
  // touches yet: valid = Σ over subsets S of them, (−1)^|S| × layouts touching none of S,
  // where a layout avoids S's columns by treating all their dots as blocked. Counts stay
  // below 2^53 at these board sizes, so the alternating sum is exact.
  const free = ~touchedColumns(lines) & ((1 << n) - 1)
  const final = new Float64Array(n * n)
  for (let S = free; ; S = (S - 1) & free) {
    const avoid = new Set(blocked)
    for (let c = 0; c < n; c++) if (S & (1 << c)) for (let r = 0; r < m; r++) avoid.add(key(r, c))
    const counts = count(board, lines, avoid, remaining)
    const sign = popcount(S) % 2 ? -1 : 1
    for (let i = 0; i < n * n; i++) final[i] += sign * counts[i]
    if (S === 0) break
  }

  // every layout sends start 0 somewhere, so its row sums to the layout count
  let layouts = 0
  for (let d = 0; d < n; d++) layouts += final[d]
  if (!layouts) return { ok: false, error: 'noLayout' }
  const prob = Array.from({ length: n }, (_, s) => Array.from({ length: n }, (_, d) => final[s * n + d] / layouts))
  return { ok: true, layouts, remaining, prob }
}

const popcount = (v: number) => {
  let k = 0
  for (; v; v &= v - 1) k++
  return k
}

// counts[start * n + end]: layouts of the `remaining` hidden lines (no column rule) that take
// start to end.
function count(board: Board, lines: Set<string>, blocked: Set<string>, remaining: number): Float64Array {
  const { n, m } = board
  const rows = Array.from({ length: m }, (_, r) => rowOptions(n, r, lines, blocked))

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
