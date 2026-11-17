import { useEffect, useMemo, useRef, useState } from 'react'
import { commit, extend, removeRoute, type Node } from './route.ts'
import { analyze, dotKey, lineKey, trace } from './solver.ts'
import { DEFAULT, LIMITS, normalize, read, write, type State } from './urlState.ts'

const GX = 64
const GY = 56
const PAD_X = 40
const PAD_TOP = 64
const PAD_BOTTOM = 64

const letter = (i: number) => String.fromCharCode(65 + i)
const pct = (p: number) => {
  const v = p * 100
  if (v === 0 || v === 100) return `${v}%`
  return v < 0.1 ? '<0.1%' : v > 99.9 ? '>99.9%' : `${v.toFixed(1)}%`
}

function useUrlState(): [State, (s: State) => void] {
  const [state, setState] = useState(() => read(window.location.search))
  useEffect(() => {
    const onPop = () => setState(read(window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const update = (s: State) => {
    const next = normalize(s)
    window.history.replaceState(null, '', write(next))
    setState(next)
  }
  return [state, update]
}

export default function App() {
  const [state, setState] = useUrlState()
  const { n, m, x, played, dest } = state
  const lines = useMemo(() => new Set(state.lines), [state.lines])
  const empty = useMemo(() => new Set(state.empty), [state.empty])
  const board = { n, m, x }

  const traces = useMemo(() => played.map((s) => trace(board, lines, s)), [n, m, lines, played])
  const blocked = useMemo(() => new Set([...empty, ...traces.flatMap((t) => t.straight)]), [empty, traces])
  const result = useMemo(() => analyze(board, lines, played, empty), [n, m, x, lines, played, empty])

  const lineEnds = useMemo(() => {
    const s = new Set<string>()
    for (const k of lines) {
      const [r, c] = k.split('.').map(Number)
      s.add(dotKey(r, c)).add(dotKey(r, c + 1))
    }
    return s
  }, [lines])

  const cx = (c: number) => PAD_X + c * GX
  const cy = (r: number) => PAD_TOP + (r + 1) * GY // r = -1 start post, r = m destination post
  const width = PAD_X * 2 + (n - 1) * GX
  const height = PAD_TOP + PAD_BOTTOM + (m + 1) * GY

  const toggleLine = (r: number, c: number) => {
    const k = lineKey(r, c)
    if (lines.has(k)) return setState({ ...state, lines: state.lines.filter((l) => l !== k) })
    if (lineEnds.has(dotKey(r, c)) || lineEnds.has(dotKey(r, c + 1))) return
    const ends = [dotKey(r, c), dotKey(r, c + 1)]
    setState({ ...state, lines: [...state.lines, k], empty: state.empty.filter((d) => !ends.includes(d)) })
  }
  const toggleEmpty = (r: number, c: number) => {
    const k = dotKey(r, c)
    if (empty.has(k)) return setState({ ...state, empty: state.empty.filter((d) => d !== k) })
    if (lineEnds.has(k)) return
    setState({ ...state, empty: [...state.empty, k] })
  }
  // Clicking a traced start removes its route and what it revealed; clicking an untraced one traces it.
  const togglePlayed = (s: number) =>
    setState(played.includes(s) ? removeRoute(state, s) : { ...state, played: [...played, s] })
  const resetBoard = () => setState({ ...state, lines: [], empty: [], played: [] })

  // Dragging from a start draws a route; releasing without moving toggles the trace.
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Node[] | null>(null)
  const nodeAt = (e: React.PointerEvent): Node => {
    const svg = svgRef.current!
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    const c = Math.min(n - 1, Math.max(0, Math.round((pt.x - PAD_X) / GX)))
    const r = Math.min(m, Math.max(-1, Math.round((pt.y - PAD_TOP) / GY) - 1))
    return [r, c]
  }
  const onStartDown = (e: React.PointerEvent, s: number) => {
    svgRef.current!.setPointerCapture(e.pointerId)
    setDrag([[-1, s]])
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const next = extend(drag, nodeAt(e), m)
    if (next.length !== drag.length || next.some((p, i) => p !== drag[i])) setDrag(next)
  }
  const onUp = () => {
    if (!drag) return
    if (drag.length === 1) togglePlayed(drag[0][1])
    else setState(commit(state, drag))
    setDrag(null)
  }

  const probs = result.ok ? result.prob.map((row) => row[dest]) : []
  const best = probs.length ? Math.max(...probs) : 0

  return (
    <div className="app">
      <header>
        <h1>Intersecting Destinies Simulator</h1>
        <p className="sub">
          Drag from a start down the board to draw a route you saw (sideways steps become lines,
          straight steps mark dots as having no line). Or click between two dots to toggle a line,
          click a vertical segment to mark that dot as having no line, click a traced start to remove its route (and the lines and
          no-line dots only it revealed), click an untraced start to trace it, and click a destination to target it.
        </p>
      </header>

      <div className="layout">
        <div className="board-wrap">
          <div className="board-bar">
            <button onClick={resetBoard}>Reset</button>
          </div>
          <div className="counter">
            Lines revealed: {lines.size} / {x}
          </div>
          <svg
            ref={svgRef}
            className={`board ${drag ? 'dragging' : ''}`}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
            viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
            {/* column tracks */}
            {Array.from({ length: n }, (_, c) => (
              <line key={c} className="track" x1={cx(c)} y1={cy(-1)} x2={cx(c)} y2={cy(m)} />
            ))}

            {/* revealed lines */}
            {state.lines.map((k) => {
              const [r, c] = k.split('.').map(Number)
              return <line key={k} className="rung" x1={cx(c)} y1={cy(r)} x2={cx(c + 1)} y2={cy(r)} />
            })}

            {/* traced paths */}
            {traces.map((t, i) => (
              <polyline
                key={played[i]}
                className="path"
                points={t.points.map(([r, c]) => `${cx(c)},${cy(r)}`).join(' ')}
              />
            ))}

            {/* route being drawn */}
            {drag && (
              <polyline
                className="path draft"
                points={drag.map(([r, c]) => `${cx(c)},${cy(r)}`).join(' ')}
              />
            )}

            {/* dots */}
            {Array.from({ length: m }, (_, r) =>
              Array.from({ length: n }, (_, c) => {
                const k = dotKey(r, c)
                const cls = lineEnds.has(k) ? 'dot end' : blocked.has(k) ? 'dot empty' : 'dot'
                return <circle key={k} className={cls} cx={cx(c)} cy={cy(r)} r={6} />
              }),
            )}

            {/* clickable vertical segments: mark a dot as having no line */}
            {Array.from({ length: m }, (_, r) =>
              Array.from({ length: n }, (_, c) => {
                const k = dotKey(r, c)
                const on = empty.has(k)
                const conflict = !on && lineEnds.has(k)
                return (
                  <rect
                    key={k}
                    className={`hit vhit ${on ? 'on' : ''} ${conflict ? 'conflict' : ''}`}
                    x={cx(c) - 10}
                    y={cy(r) - GY / 2 + 2}
                    width={20}
                    height={GY - 4}
                    rx={6}
                    onClick={() => toggleEmpty(r, c)}
                  >
                    <title>{on ? 'Unmark (unknown)' : conflict ? 'A line ends here' : 'Mark: no line at this dot'}</title>
                  </rect>
                )
              }),
            )}

            {/* clickable gaps between dots */}
            {Array.from({ length: m }, (_, r) =>
              Array.from({ length: n - 1 }, (_, c) => {
                const k = lineKey(r, c)
                const on = lines.has(k)
                const conflict = !on && (lineEnds.has(dotKey(r, c)) || lineEnds.has(dotKey(r, c + 1)))
                return (
                  <rect
                    key={k}
                    className={`hit ${on ? 'on' : ''} ${conflict ? 'conflict' : ''}`}
                    x={cx(c) + 8}
                    y={cy(r) - 12}
                    width={GX - 16}
                    height={24}
                    rx={6}
                    onClick={() => toggleLine(r, c)}
                  >
                    <title>
                      {on ? 'Remove line' : conflict ? 'Would share an endpoint with another line' : 'Reveal line'}
                    </title>
                  </rect>
                )
              }),
            )}

            {/* starts */}
            {Array.from({ length: n }, (_, s) => {
              const p = probs[s]
              const isBest = result.ok && p === best && best > 0
              return (
                <g
                  key={s}
                  className={`badge start ${played.includes(s) ? 'played' : ''} ${isBest ? 'best' : ''}`}
                  onPointerDown={(e) => onStartDown(e, s)}
                >
                  <circle cx={cx(s)} cy={cy(-1) - 26} r={18} />
                  <text x={cx(s)} y={cy(-1) - 26} dy="0.35em">
                    {letter(s)}
                  </text>
                  {result.ok && (
                    <text className="prob" x={cx(s)} y={cy(-1) - 54} style={{ opacity: 0.45 + 0.55 * p }}>
                      {pct(p)}
                    </text>
                  )}
                  <circle className="post" cx={cx(s)} cy={cy(-1)} r={7} />
                </g>
              )
            })}

            {/* destinations */}
            {Array.from({ length: n }, (_, d) => (
              <g
                key={d}
                className={`badge dest ${d === dest ? 'selected' : ''}`}
                onClick={() => setState({ ...state, dest: d })}
              >
                <circle className="post" cx={cx(d)} cy={cy(m)} r={7} />
                <rect x={cx(d) - 18} y={cy(m) + 16} width={36} height={36} rx={6} />
                <text x={cx(d)} y={cy(m) + 34} dy="0.35em">
                  {d + 1}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <aside className="panel">
          <section>
            <h2>Board</h2>
            <label>
              Columns (n)
              <input
                type="number"
                min={LIMITS.n[0]}
                max={LIMITS.n[1]}
                value={n}
                onChange={(e) => {
                  const v = Math.min(LIMITS.n[1], Math.max(LIMITS.n[0], +e.target.value || LIMITS.n[0]))
                  setState({ ...state, n: v })
                }}
              />
            </label>
            <label>
              Dot rows (m)
              <input
                type="number"
                min={LIMITS.m[0]}
                max={LIMITS.m[1]}
                value={m}
                onChange={(e) => {
                  const v = Math.min(LIMITS.m[1], Math.max(LIMITS.m[0], +e.target.value || LIMITS.m[0]))
                  setState({ ...state, m: v })
                }}
              />
            </label>
            <label>
              Total lines (x)
              <input
                type="number"
                min={0}
                max={m * (n - 1)}
                value={x}
                onChange={(e) => setState({ ...state, x: Math.max(0, +e.target.value || 0) })}
              />
            </label>
            <div className="buttons">
              <button onClick={() => setState(DEFAULT)}>Reset all</button>
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy link</button>
            </div>
          </section>

          <section>
            <h2>Odds to reach destination {dest + 1}</h2>
            {result.ok ? (
              <>
                <p className="meta">
                  {result.remaining} hidden line{result.remaining === 1 ? '' : 's'} ·{' '}
                  {result.layouts.toLocaleString()} consistent layout{result.layouts === 1 ? '' : 's'}
                </p>
                <ol className="bars">
                  {probs.map((p, s) => (
                    <li key={s} className={p === best && best > 0 ? 'best' : ''}>
                      <span className="name">{letter(s)}</span>
                      <span className="bar">
                        <span style={{ width: `${p * 100}%` }} />
                      </span>
                      <span className="val">{pct(p)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="error">{result.error}</p>
            )}
          </section>

          {result.ok && (
            <section>
              <h2>Full matrix</h2>
              <table className="matrix">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: n }, (_, d) => (
                      <th key={d} className={d === dest ? 'sel' : ''}>
                        {d + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.prob.map((row, s) => (
                    <tr key={s}>
                      <th>{letter(s)}</th>
                      {row.map((p, d) => (
                        <td
                          key={d}
                          className={d === dest ? 'sel' : ''}
                          style={{ background: `rgba(56, 214, 255, ${p * 0.55})` }}
                        >
                          {Math.round(p * 100)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="notes">
            <h2>Assumptions</h2>
            <p>
              Hidden lines are equally likely to be any layout consistent with what you know: the
              revealed lines, and every dot known to have no line (shown hollow) — either marked by
              you or passed straight through by a traced route. Lines join adjacent columns on the same row and never share a dot.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
