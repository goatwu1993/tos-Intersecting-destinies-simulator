// Expected-token analysis for the mathematician strategy.
//
// Tracing a route from one start costs one token and reveals every line and no-line dot on
// its path. Enumerating all layouts consistent with the board, the fewest tokens needed on
// average to land on the target destination follows from a game-tree search: pick a start,
// split the layouts by the path it revealed, and recurse on the groups that missed.

import { rowOptions, trace, type Board } from './solver.ts'

export const MAX_LAYOUTS = 200_000

export type Expected =
  | { ok: false; error: 'tooLarge' }
  // reached: a traced route already ends at the destination.
  // perStart[s]: expected tokens in total if s is traced next and the best choices follow
  // (null for starts already traced).
  | { ok: true; reached: boolean; perStart: (number | null)[]; best: number }

const popcount = (v: number) => {
  let k = 0
  for (; v; v &= v - 1) k++
  return k
}

export function expectedTokens(
  board: Board,
  lines: Set<string>,
  blocked: Set<string>,
  played: number[],
  dest: number,
  layoutCount: number,
): Expected {
  const { n, m } = board
  const remaining = board.x - lines.size
  if (layoutCount > MAX_LAYOUTS) return { ok: false, error: 'tooLarge' }
  if (played.some((s) => trace(board, lines, s).end === dest)) {
    return { ok: true, reached: true, perStart: new Array(n).fill(null), best: 0 }
  }

  const rows = Array.from({ length: m }, (_, r) => rowOptions(n, r, lines, blocked))
  // most hidden lines the rows from r on can still take, the columns their lines could touch,
  // and the columns their revealed lines touch anyway (a row's first option has no hidden lines)
  const capacity = new Array<number>(m + 1).fill(0)
  const reach = new Array<number>(m + 1).fill(0)
  const revealed = new Array<number>(m + 1).fill(0)
  for (let r = m - 1; r >= 0; r--) {
    capacity[r] = capacity[r + 1] + Math.max(...rows[r].map((o) => o.k))
    reach[r] = rows[r].reduce((a, o) => a | o.moved, reach[r + 1])
    revealed[r] = revealed[r + 1] | rows[r][0].moved
  }

  // Per layout and start: the column it ends in and a base-3 signature of its path
  // (left / straight / right per row). Equal signatures mean the same revealed path.
  const end = new Int8Array(layoutCount * n)
  const sig = new Int32Array(layoutCount * n)
  let count = 0
  // touched: columns some line touches; every column needs one
  const all = (1 << n) - 1
  const rec = (r: number, used: number, touched: number, cur: number[], sg: number[]) => {
    if (r === m) {
      if (used !== remaining || touched !== all) return
      for (let s = 0; s < n; s++) {
        end[count * n + s] = cur[s]
        sig[count * n + s] = sg[s]
      }
      count++
      return
    }
    if (used + capacity[r] < remaining) return
    // every column needs a line: give up once the rows left can't reach an untouched column,
    // or have too few hidden lines left (each covers two columns) for the ones only they can
    if ((touched | reach[r]) !== all) return
    if (2 * (remaining - used) < popcount(all & ~(touched | revealed[r]))) return
    for (const o of rows[r]) {
      if (used + o.k > remaining) continue
      rec(
        r + 1,
        used + o.k,
        touched | o.moved,
        cur.map((c) => o.map[c]),
        sg.map((v, s) => v * 3 + (o.map[cur[s]] - cur[s] + 1)),
      )
    }
  }
  // revealed lines are in every option of their row, so they mark their columns as they go
  rec(0, 0, 0, Array.from({ length: n }, (_, i) => i), new Array(n).fill(0))

  // set: layouts still consistent; mask: starts already traced.
  const value = (set: number[], mask: number, s: number, unplayed: number): number => {
    const groups = new Map<number, number[]>()
    for (const l of set) {
      const g = groups.get(sig[l * n + s])
      if (g) g.push(l)
      else groups.set(sig[l * n + s], [l])
    }
    let total = 1
    for (const g of groups.values()) {
      if (end[g[0] * n + s] === dest) continue
      total += (g.length / set.length) * best(g, mask | (1 << s), unplayed - 1)
    }
    return total
  }
  const best = (set: number[], mask: number, unplayed: number): number => {
    // with one start left it must reach the destination
    if (unplayed <= 1) return 1
    let min = Infinity
    for (let s = 0; s < n; s++) if (!(mask & (1 << s))) min = Math.min(min, value(set, mask, s, unplayed))
    return min
  }

  const layouts = Array.from({ length: count }, (_, i) => i)
  const mask = played.reduce((a, s) => a | (1 << s), 0)
  const unplayed = n - played.length
  const perStart = Array.from({ length: n }, (_, s) => (mask & (1 << s) ? null : value(layouts, mask, s, unplayed)))
  const finite = perStart.filter((v): v is number => v !== null)
  return { ok: true, reached: false, perStart, best: finite.length ? Math.min(...finite) : 0 }
}
