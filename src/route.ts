import { key, parseKey, trace } from './solver.ts'
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
  const [r, c] = parseKey(line)
  return key(r, c) === dot || key(r, c + 1) === dot
}

// Apply a route drawn down to the destination row: sideways steps become revealed lines,
// and the route replaces what was known along it, including an earlier route from the same
// start. Its start is marked as traced, which already implies the dots it passes straight
// through. Routes traced from other starts were seen too: if the new route would change any
// of them it contradicts them, and null is returned instead.
export function commit(state: State, path: Node[]): State | null {
  let lines = [...state.lines]
  for (let i = 0; i < path.length; i++) {
    const [r, c] = path[i]
    if (r < 0 || r >= state.m) continue
    const prev = path[i - 1]
    const next = path[i + 1]
    if (prev && prev[0] === r) continue // far end of a line already handled
    if (next && next[0] === r) {
      const k = key(r, Math.min(c, next[1]))
      const ends = [key(r, c), key(r, next[1])]
      lines = lines.filter((l) => l === k || !ends.some((d) => touches(l, d)))
      if (!lines.includes(k)) lines.push(k)
    } else if (next) {
      const d = key(r, c)
      lines = lines.filter((l) => !touches(l, d))
    }
  }
  const start = path[0][1]
  const others = state.played.filter((p) => p !== start)
  const before = new Set(state.lines)
  const after = new Set(lines)
  const route = (ls: Set<string>, p: number) => trace(state, ls, p).points.join(' ')
  if (others.some((p) => route(before, p) !== route(after, p))) return null
  const played = state.played.includes(start) ? state.played : [...state.played, start]
  return { ...state, lines, played }
}

// Remove a traced route. Saving the state drops the lines no remaining route crosses,
// so whatever only this route revealed goes with it.
export function removeRoute(state: State, start: number): State {
  return { ...state, played: state.played.filter((p) => p !== start) }
}
