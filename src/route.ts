import { key, lineDots, trace } from './solver.ts'
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

// A route built by clicking pieces: a path (top to bottom) grown from the first vertical
// segment clicked, whose upper node is `origin`. It grows at either end, so it can be drawn
// top-down or bottom-up, and is complete once it runs from a start (row -1) to a destination
// (row m). Both ends are always reached by a vertical step, so a line can be taken there.
export type Draft = { path: Node[]; origin: Node }

const column = (r0: number, r1: number, c: number): Node[] =>
  Array.from({ length: r1 - r0 + 1 }, (_, i) => [r0 + i, c])

// Index of the piece from path[i] to path[i + 1] matching `is`, or -1.
const pieceAt = (path: Node[], is: (a: Node, b: Node) => boolean) =>
  path.findIndex((a, i) => i + 1 < path.length && is(a, path[i + 1]))

// Undo the piece at i and everything added beyond it, away from the first segment; a line
// that would be left at the new end goes too. Undoing the first segment drops the draft.
function undo(d: Draft, i: number): Draft | null {
  const { path } = d
  const o = pieceAt(path, (a) => same(a, d.origin))
  if (i === o) return null
  const sideways = (a: Node, b: Node) => a[0] === b[0]
  if (i > o) return { ...d, path: path.slice(0, sideways(path[i - 1], path[i]) ? i : i + 1) }
  return { ...d, path: path.slice(sideways(path[i + 1], path[i + 2]) ? i + 2 : i + 1) }
}

export const complete = (d: Draft, m: number) => d.path[0][0] === -1 && d.path[d.path.length - 1][0] === m

// Click the vertical segment from (r, c) down to (r + 1, c), r = -1 … m - 1. It undoes a
// segment in the draft, extends an end straight along its column, or starts a new draft.
export function clickSegment(d: Draft | null, r: number, c: number): Draft | null {
  const fresh = { path: [[r, c], [r + 1, c]] as Node[], origin: [r, c] as Node }
  if (!d) return fresh
  const { path } = d
  const i = pieceAt(path, (a, b) => same(a, [r, c]) && same(b, [r + 1, c]))
  if (i >= 0) return undo(d, i)
  const [rb, cb] = path[path.length - 1]
  if (c === cb && r >= rb) return { ...d, path: [...path, ...column(rb + 1, r + 1, c)] }
  const [rt, ct] = path[0]
  if (c === ct && r + 1 <= rt) return { ...d, path: [...column(r, rt - 1, c), ...path] }
  return fresh
}

// Click the line on dot row r joining columns c and c + 1. It undoes a line in the draft, or
// takes it from an end in its column (going straight there first if needed). Two lines can't
// share a dot, so a line taken is always followed by the vertical step past it: down at the
// bottom end, up at the top. Lines that can't join either end are ignored.
export function clickLine(d: Draft, r: number, c: number): Draft | null {
  const { path } = d
  const i = pieceAt(path, (a, b) => a[0] === r && b[0] === r && Math.min(a[1], b[1]) === c)
  if (i >= 0) return undo(d, i)
  const other = (col: number) => (col === c ? c + 1 : c)
  const touches = (col: number) => col === c || col === c + 1
  const [rb, cb] = path[path.length - 1]
  if (touches(cb) && r >= rb) {
    return { ...d, path: [...path, ...column(rb + 1, r, cb), [r, other(cb)], [r + 1, other(cb)]] }
  }
  const [rt, ct] = path[0]
  if (touches(ct) && r <= rt) {
    return { ...d, path: [[r - 1, other(ct)], [r, other(ct)], ...column(r, rt - 1, ct), ...path] }
  }
  return d
}

const touches = (line: string, dot: string) => lineDots(line).includes(dot)

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
