// Board model
// - n columns (start A.. at top, destinations at bottom), m rows of dots in between.
// - A horizontal line sits on dot row r and joins column c with column c+1; key "r.c".
// - Two lines never share an endpoint (dot).
// - x lines exist in total; some are revealed, the rest are unknown.
//
// Unknown lines are assumed to be placed uniformly at random among all layouts
// consistent with what is known: the revealed lines, plus every dot known to
// have no line (marked empty, or passed straight through by a traced path).

export type Board = { n: number; m: number; x: number }

// Dots and lines share the "row.col" key; a line's key is its left dot.
export const key = (r: number, c: number) => `${r}.${c}`
export const parseKey = (k: string) => k.split('.').map(Number) as [number, number]

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
type RowOption = { k: number; map: number[] }

function rowOptions(n: number, r: number, lines: Set<string>, blocked: Set<string>): RowOption[] {
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
  | { ok: false; error: string }
  | {
      ok: true
      layouts: number // number of consistent layouts for the unknown lines
      remaining: number // unknown lines still hidden
      // prob[s][d] = P(start s ends at destination d)
      prob: number[][]
    }

// blocked: dots known to have no line (marked empty, or passed straight through by a traced route)
export function analyze(board: Board, lines: Set<string>, blocked: Set<string>): Analysis {
  const { n, m, x } = board
  const remaining = x - lines.size
  if (remaining < 0) return { ok: false, error: `${lines.size} lines revealed but only ${x} exist.` }

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

  const final = dp[R]
  // every layout sends start 0 somewhere, so its row sums to the layout count
  let layouts = 0
  for (let d = 0; d < n; d++) layouts += final[d]
  if (!layouts) return { ok: false, error: 'No layout of the hidden lines is consistent with this board.' }
  const prob = Array.from({ length: n }, (_, s) => Array.from({ length: n }, (_, d) => final[s * n + d] / layouts))
  return { ok: true, layouts, remaining, prob }
}
