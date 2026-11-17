import { dotKey, lineKey, trace } from './solver.ts'
import type { State } from './urlState.ts'

// A drawn route is a list of grid nodes [row, col]; row -1 is the start post, row m the destination post.
export type Node = [number, number]

const same = (a: Node, b: Node) => a[0] === b[0] && a[1] === b[1]

// Extend a route toward the node under the pointer, one legal step at a time:
// down one row, or (on a dot row, if the last step wasn't sideways) one column across.
// Pointing back at an earlier node rewinds the route to it.
export function extend(path: Node[], target: Node, m: number): Node[] {
  const idx = path.findIndex((p) => same(p, target))
  if (idx >= 0) return path.slice(0, idx + 1)
  const out = [...path]
  for (let i = 0; i < 64; i++) {
    const last = out[out.length - 1]
    const [r, c] = last
    if (same(last, target)) break
    const prev = out[out.length - 2]
    const cameSideways = prev !== undefined && prev[0] === r
    if (target[0] === r && r >= 0 && r < m && !cameSideways && target[1] !== c) {
      out.push([r, c + Math.sign(target[1] - c)])
    } else if (target[0] > r && r < m) {
      out.push([r + 1, c])
    } else break
  }
  return out
}

const touches = (line: string, dot: string) => {
  const [r, c] = line.split('.').map(Number)
  return dotKey(r, c) === dot || dotKey(r, c + 1) === dot
}

// Apply a drawn route to the board: sideways steps become revealed lines, dots passed
// straight through become known-empty. The route is taken as truth, so anything it
// contradicts is dropped.
export function commit(state: State, path: Node[]): State {
  let lines = [...state.lines]
  const empty = new Set(state.empty)
  for (let i = 0; i < path.length; i++) {
    const [r, c] = path[i]
    if (r < 0 || r >= state.m) continue
    const prev = path[i - 1]
    const next = path[i + 1]
    if (prev && prev[0] === r) continue // far end of a line already handled
    if (next && next[0] === r) {
      const k = lineKey(r, Math.min(c, next[1]))
      const ends = [dotKey(r, c), dotKey(r, next[1])]
      lines = lines.filter((l) => l === k || !ends.some((d) => touches(l, d)))
      if (!lines.includes(k)) lines.push(k)
      ends.forEach((d) => empty.delete(d))
    } else if (next) {
      const d = dotKey(r, c)
      lines = lines.filter((l) => !touches(l, d))
      empty.add(d)
    }
  }
  const start = path[0][1]
  const played = state.played.includes(start) ? state.played : [...state.played, start]
  return { ...state, lines, empty: [...empty], played }
}

// Remove a traced route along with what it revealed: its lines and its no-line dots,
// unless another traced route still goes through them.
export function removeRoute(state: State, start: number): State {
  const lines = new Set(state.lines)
  const t = trace(state, lines, start)
  const others = state.played.filter((p) => p !== start).map((p) => trace(state, lines, p))
  const keepLines = new Set(others.flatMap((o) => o.lines))
  const keepDots = new Set(others.flatMap((o) => o.straight))
  const dropLines = new Set(t.lines.filter((l) => !keepLines.has(l)))
  const dropDots = new Set(t.straight.filter((d) => !keepDots.has(d)))
  return {
    ...state,
    lines: state.lines.filter((l) => !dropLines.has(l)),
    empty: state.empty.filter((d) => !dropDots.has(d)),
    played: state.played.filter((p) => p !== start),
  }
}
