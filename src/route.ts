import { countLayouts, key, lineDots, prepare, trace, type Board } from './solver.ts'
import type { State } from './urlState.ts'

// A drawn route is a list of grid nodes [row, col]; row -1 is the start post, row m the destination post.
export type Node = [number, number]

const same = (a: Node, b: Node) => a[0] === b[0] && a[1] === b[1]

const sideways = (a: Node, b: Node) => a[0] === b[0]

// Extend a dragged route (from a start, top-down) toward the node under the pointer, with the
// same steps as a clicked one: down one row, or across a line on a dot row, which brings the
// step past it. Pointing back at an earlier node rewinds the route to it, keeping the step
// past a line (a route can't end on a line).
export function extend(path: Node[], target: Node, m: number): Node[] {
  const idx = path.findIndex((p) => same(p, target))
  if (idx >= 0) return path.slice(0, idx > 0 && sideways(path[idx - 1], path[idx]) ? idx + 2 : idx + 1)
  let d: Draft = { path, origin: path[0] }
  for (let i = 0; i < 64; i++) {
    const [r, c] = d.path[d.path.length - 1]
    if (r === target[0] && c === target[1]) break
    let next: Draft | null = d
    if (target[0] === r && r >= 0 && r < m) next = clickLine(d, r, target[1] > c ? c : c - 1)
    else if (target[0] > r && r < m) next = clickSegment(d, r, c)
    if (!next || next === d) break
    d = next
  }
  return d.path
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
  if (i > o) return { ...d, path: path.slice(0, sideways(path[i - 1], path[i]) ? i : i + 1) }
  return { ...d, path: path.slice(sideways(path[i + 1], path[i + 2]) ? i + 2 : i + 1) }
}

export const complete = (d: Draft, m: number) => d.path[0][0] === -1 && d.path[d.path.length - 1][0] === m

// Click the vertical segment from (r, c) down to (r + 1, c), r = -1 … m - 1. With no draft
// it starts one; otherwise it undoes a segment in the draft or extends an end straight along
// its column. Segments that can't join either end are ignored (the draft is returned as is),
// so a stray click doesn't lose the draft.
export function clickSegment(d: Draft | null, r: number, c: number): Draft | null {
  if (!d) return { path: [[r, c], [r + 1, c]], origin: [r, c] }
  const { path } = d
  const i = pieceAt(path, (a, b) => same(a, [r, c]) && same(b, [r + 1, c]))
  if (i >= 0) return undo(d, i)
  const [rb, cb] = path[path.length - 1]
  if (c === cb && r >= rb) return { ...d, path: [...path, ...column(rb + 1, r + 1, c)] }
  const [rt, ct] = path[0]
  if (c === ct && r + 1 <= rt) return { ...d, path: [...column(r, rt - 1, c), ...path] }
  return d
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
  const joins = (col: number) => col === c || col === c + 1
  const [rb, cb] = path[path.length - 1]
  if (joins(cb) && r >= rb) {
    return { ...d, path: [...path, ...column(rb + 1, r, cb), [r, other(cb)], [r + 1, other(cb)]] }
  }
  const [rt, ct] = path[0]
  if (joins(ct) && r <= rt) {
    return { ...d, path: [[r - 1, other(ct)], [r, other(ct)], ...column(r, rt - 1, ct), ...path] }
  }
  return d
}

const touches = (line: string, dot: string) => lineDots(line).includes(dot)

// What a draft says about the board: the lines it takes, and the dots it passes straight
// through (its two ends are still open).
function implied(path: Node[], m: number) {
  const lines: string[] = []
  const straight: string[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [r, c] = path[i]
    const next = path[i + 1]
    if (next[0] === r) lines.push(key(r, Math.min(c, next[1])))
    else if (i > 0 && r >= 0 && r < m && path[i - 1][1] === c) straight.push(key(r, c))
  }
  return { lines, straight }
}

// Take every step that is forced: while an open end of the draft (on a dot row) has only one
// way on that some layout of the lines allows (across a line to the left, to the right, or
// straight on), take it. So a route follows a revealed line, goes straight past a no-line dot,
// or past a dot every other way out of is ruled out, without being clicked. Stops at a start /
// destination, or where there's a real choice. lines / blocked: what the traced routes show.
export function autoExtend(d: Draft, board: Board, lines: Set<string>, blocked: Set<string>): Draft {
  const { n, m } = board
  for (let i = 0; i < 4 * (m + 2); i++) {
    const own = implied(d.path, m)
    const L = new Set([...lines, ...own.lines])
    const B = new Set([...blocked, ...own.straight])
    const possible = (ls: Set<string>, bs: Set<string>) => countLayouts(prepare(board, ls, bs)) > 0
    const lineOk = (r: number, c: number) => {
      if (c < 0 || c >= n - 1) return false
      const k = key(r, c)
      const dots = lineDots(k)
      if (dots.some((x) => B.has(x))) return false
      if ([...L].some((l) => l !== k && dots.some((x) => touches(l, x)))) return false
      return L.has(k) || possible(new Set([...L, k]), B)
    }
    const straightOk = (r: number, c: number) => {
      const dot = key(r, c)
      if ([...L].some((l) => touches(l, dot))) return false
      return B.has(dot) || possible(L, new Set([...B, dot]))
    }
    // the one way on from an open end at node (r, c), or null when there's a choice (or none)
    const forced = (r: number, c: number, onStraight: () => Draft | null, onLine: (c: number) => Draft | null) => {
      const ways = [
        straightOk(r, c) && onStraight,
        lineOk(r, c - 1) && (() => onLine(c - 1)),
        lineOk(r, c) && (() => onLine(c)),
      ].filter((w): w is () => Draft | null => !!w)
      return ways.length === 1 ? ways[0]() : null
    }
    let next: Draft | null = null
    const [rb, cb] = d.path[d.path.length - 1]
    if (rb >= 0 && rb < m) next = forced(rb, cb, () => clickSegment(d, rb, cb), (c) => clickLine(d, rb, c))
    const [rt, ct] = d.path[0]
    if (!next && rt >= 0 && rt < m) next = forced(rt, ct, () => clickSegment(d, rt - 1, ct), (c) => clickLine(d, rt, c))
    if (!next || next.path.length <= d.path.length) return d
    d = next
  }
  return d
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
