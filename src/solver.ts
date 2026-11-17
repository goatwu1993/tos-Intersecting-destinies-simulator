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

export const lineKey = (r: number, c: number) => `${r}.${c}`
export const dotKey = (r: number, c: number) => `${r}.${c}`

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
    if (c > 0 && lines.has(lineKey(r, c - 1))) {
      points.push([r, c], [r, c - 1])
      used.push(lineKey(r, c - 1))
      c -= 1
    } else if (lines.has(lineKey(r, c))) {
      points.push([r, c], [r, c + 1])
      used.push(lineKey(r, c))
      c += 1
    } else {
      straight.push(dotKey(r, c))
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
    if (lines.has(lineKey(r, c))) {
      fixed.push(c)
      used[c] = used[c + 1] = true
    }
  }
  const free: number[] = []
  for (let c = 0; c < n - 1; c++) {
    if (lines.has(lineKey(r, c))) continue
    if (used[c] || used[c + 1]) continue
    if (blocked.has(dotKey(r, c)) || blocked.has(dotKey(r, c + 1))) continue
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

export function analyze(board: Board, lines: Set<string>, played: number[], empty: Set<string>): Analysis {
  const { n, m, x } = board
  const remaining = x - lines.size
  if (remaining < 0) return { ok: false, error: `${lines.size} lines revealed but only ${x} exist.` }

  const blocked = new Set(empty)
  for (const s of played) for (const d of trace(board, lines, s).straight) blocked.add(d)

  const rows = Array.from({ length: m }, (_, r) => rowOptions(n, r, lines, blocked))

  // dp[pos * (R+1) + used] = number of partial layouts
  const R = remaining
  const prob: number[][] = []
  let layouts = 0
  for (let s = 0; s < n; s++) {
    let dp = new Float64Array(n * (R + 1))
    dp[s * (R + 1)] = 1
    for (const opts of rows) {
      const next = new Float64Array(n * (R + 1))
      for (let pos = 0; pos < n; pos++) {
        for (let u = 0; u <= R; u++) {
          const w = dp[pos * (R + 1) + u]
          if (!w) continue
          for (const o of opts) {
            if (u + o.k > R) continue
            next[o.map[pos] * (R + 1) + u + o.k] += w
          }
        }
      }
      dp = next
    }
    const ends = Array.from({ length: n }, (_, d) => dp[d * (R + 1) + R])
    const total = ends.reduce((a, b) => a + b, 0)
    layouts = total
    prob.push(ends.map((e) => (total ? e / total : 0)))
  }
  if (!layouts) return { ok: false, error: 'No layout of the hidden lines is consistent with this board.' }
  return { ok: true, layouts, remaining, prob }
}
