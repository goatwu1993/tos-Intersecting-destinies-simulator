import { useEffect, useMemo, useRef, useState } from 'react'
import { LANGS, messages, type Lang } from './i18n.ts'
import { commit, extend, removeRoute, type Node } from './route.ts'
import type { Expected } from './strategy.ts'
import type { WorkerInput } from './strategy.worker.ts'
import { analyze, key, maxLines, parseKey, trace } from './solver.ts'
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

// Counts above 2^53 aren't exact in floating point, so show them as approximate.
const formatCount = (v: number, lang: Lang) => {
  if (v <= Number.MAX_SAFE_INTEGER) return v.toLocaleString(lang)
  const [mant, exp] = v.toExponential(2).split('e')
  return `≈ ${mant} × 10^${Number(exp)}`
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

// Edits are local until blur or Enter, so typing through intermediate values
// (e.g. clearing the field) can't shrink the board and drop lines.
function NumberField(props: {
  label: string
  min: number
  max: number
  value: number
  onCommit: (v: number) => void
}) {
  const { label, min, max, value, onCommit } = props
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  // Always report the entered value: `value` may be a capped view of a larger stored
  // value (total lines), so entering the shown number must still save it.
  const apply = () => {
    const v = parseInt(draft, 10)
    if (!Number.isFinite(v)) return setDraft(String(value))
    const clamped = Math.min(max, Math.max(min, v))
    setDraft(String(clamped))
    onCommit(clamped)
  }
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && apply()}
      />
    </label>
  )
}

// Every level is a 6 × 5 board; level l has l + 4 lines (5 … 9).
const LEVELS = [1, 2, 3, 4, 5]
const levelLines = (l: number) => l + 4

export default function App() {
  const [state, setState] = useUrlState()
  const { n, m, played, dest, lang, strategy } = state
  const t = messages[lang]
  const x = Math.min(state.x, maxLines(n, m))
  const lines = useMemo(() => new Set(state.lines), [state.lines])
  const empty = useMemo(() => new Set(state.empty), [state.empty])
  const board = useMemo(() => ({ n, m, x }), [n, m, x])

  const traces = useMemo(() => played.map((s) => trace(board, lines, s)), [board, lines, played])
  const blocked = useMemo(() => new Set([...empty, ...traces.flatMap((t) => t.straight)]), [empty, traces])
  const result = useMemo(() => analyze(board, lines, blocked), [board, lines, blocked])

  const math = strategy === 'mathematician'
  // The search can take a second on big boards, so it runs in a worker; changing the inputs
  // terminates a stale run.
  const [expected, setExpected] = useState<Expected | null>(null)
  const [computing, setComputing] = useState(false)
  useEffect(() => {
    setExpected(null)
    if (!math || !result.ok) return setComputing(false)
    setComputing(true)
    const worker = new Worker(new URL('./strategy.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Expected>) => {
      setExpected(e.data)
      setComputing(false)
    }
    const input: WorkerInput = {
      board,
      lines: [...lines],
      blocked: [...blocked],
      played,
      dest,
      layoutCount: result.layouts,
    }
    worker.postMessage(input)
    return () => worker.terminate()
  }, [math, board, lines, blocked, played, dest, result])

  const lineEnds = useMemo(() => {
    const s = new Set<string>()
    for (const k of lines) {
      const [r, c] = parseKey(k)
      s.add(key(r, c)).add(key(r, c + 1))
    }
    return s
  }, [lines])

  // A new line can't touch another line's end or a dot marked as having no line. Dots a
  // traced route merely passes through are allowed: the trace reroutes through the new line.
  const lineConflict = (r: number, c: number) =>
    [key(r, c), key(r, c + 1)].some((d) => lineEnds.has(d) || empty.has(d))

  const cx = (c: number) => PAD_X + c * GX
  const cy = (r: number) => PAD_TOP + (r + 1) * GY // r = -1 start post, r = m destination post
  const toPoints = (nodes: [number, number][]) => nodes.map(([r, c]) => `${cx(c)},${cy(r)}`).join(' ')
  const width = PAD_X * 2 + (n - 1) * GX
  const height = PAD_TOP + PAD_BOTTOM + (m + 1) * GY

  const toggleLine = (r: number, c: number) => {
    if (click) {
      const last = click[click.length - 1][1]
      return extendClick([r, last <= c ? c + 1 : c])
    }
    const k = key(r, c)
    if (lines.has(k)) return setState({ ...state, lines: state.lines.filter((l) => l !== k) })
    if (lineConflict(r, c)) return
    setState({ ...state, lines: [...state.lines, k] })
  }
  // r is the row of the segment's upper node (-1 = below the start post)
  const clickSegment = (r: number, c: number) => {
    if (click || r < 0 || !empty.has(key(r, c))) return extendClick([r + 1, c])
    toggleEmpty(r, c)
  }
  const toggleEmpty = (r: number, c: number) => {
    const k = key(r, c)
    if (empty.has(k)) return setState({ ...state, empty: state.empty.filter((d) => d !== k) })
    if (lineEnds.has(k)) return
    setState({ ...state, empty: [...state.empty, k] })
  }
  // Clicking an untraced start fast-forwards it to a destination along the revealed lines;
  // click lines onto its path afterwards and it reroutes. Clicking a traced start removes
  // its route and what it revealed.
  const togglePlayed = (s: number) =>
    setState(played.includes(s) ? removeRoute(state, s) : { ...state, played: [...played, s] })
  const resetBoard = () => setState({ ...state, lines: [], empty: [], played: [] })

  // Dragging from a start draws a route; releasing without ever leaving the start toggles
  // the trace. Dragging away and back onto the start cancels instead.
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Node[] | null>(null)
  const pointer = useRef<{ id: number; moved: boolean } | null>(null)
  const nodeAt = (e: React.PointerEvent): Node => {
    const svg = svgRef.current!
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    const c = Math.min(n - 1, Math.max(0, Math.round((pt.x - PAD_X) / GX)))
    const r = Math.min(m, Math.max(-1, Math.round((pt.y - PAD_TOP) / GY) - 1))
    return [r, c]
  }
  // Clicking steps builds a route without dragging: a vertical step starts one from its
  // column's start, and further vertical steps / gaps extend it. Reaching the destination
  // commits it; Commit keeps a partial route, Escape or Cancel drops it.
  const [click, setClick] = useState<Node[] | null>(null)
  const extendClick = (target: Node) => {
    const next = extend(click ?? [[-1, target[1]]], target, m)
    if (next[next.length - 1][0] === m) {
      setState(commit(state, next))
      setClick(null)
    } else setClick(next)
  }
  const commitClick = () => {
    if (click && click.length > 1) setState(commit(state, click))
    setClick(null)
  }
  useEffect(() => {
    if (!click) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setClick(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [click])

  const onStartDown = (e: React.PointerEvent, s: number) => {
    // primary button / first finger only, one drag at a time
    if (!e.isPrimary || e.button !== 0 || pointer.current) return
    svgRef.current!.setPointerCapture(e.pointerId)
    pointer.current = { id: e.pointerId, moved: false }
    setClick(null)
    setDrag([[-1, s]])
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== pointer.current?.id) return
    const next = extend(drag, nodeAt(e), m)
    if (next.length > 1) pointer.current.moved = true
    if (next.length !== drag.length || next.some((p, i) => p !== drag[i])) setDrag(next)
  }
  const endDrag = () => {
    pointer.current = null
    setDrag(null)
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== pointer.current?.id) return
    if (drag.length > 1) setState(commit(state, drag))
    else if (!pointer.current.moved) togglePlayed(drag[0][1])
    endDrag()
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.title
  }, [lang, t])

  const probs = result.ok ? result.prob.map((row) => row[dest]) : []
  const best = probs.length ? Math.max(...probs) : 0
  const tokens = expected?.ok && !expected.reached ? expected.perStart : []
  const bestTokens = expected?.ok ? expected.best : 0
  const isTokenBest = (s: number) => tokens[s] != null && tokens[s]! - bestTokens < 1e-9
  // until the worker answers, the starts show the gambler's numbers
  const showTokens = tokens.length > 0
  const isPick = (s: number) => (showTokens ? isTokenBest(s) : result.ok && probs[s] === best && best > 0)

  return (
    <div className="app">
      <header>
        <div className="title-row">
          <h1>{t.title}</h1>
          <div className="langs" role="group" aria-label={t.language}>
            {LANGS.map((l) => (
              <button
                key={l}
                lang={l}
                className={l === lang ? 'on' : ''}
                aria-pressed={l === lang}
                onClick={() => setState({ ...state, lang: l })}
              >
                {messages[l].langName}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="layout">
        <div className="main">
          <div className="board-wrap">
            <div className="board-bar">
              {click && (
                <>
                  <button onClick={commitClick}>{t.commitRoute}</button>
                  <button onClick={() => setClick(null)}>{t.cancelRoute}</button>
                </>
              )}
              <button onClick={resetBoard}>{t.reset}</button>
            </div>
            <div className="counter">
              {t.linesRevealed(lines.size, x)}
            </div>
            <svg
              ref={svgRef}
              className={`board ${drag ? 'dragging' : ''}`}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={(e) => e.pointerId === pointer.current?.id && endDrag()}
              viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
              {/* column tracks */}
              {Array.from({ length: n }, (_, c) => (
                <line key={c} className="track" x1={cx(c)} y1={cy(-1)} x2={cx(c)} y2={cy(m)} />
              ))}

              {/* revealed lines */}
              {state.lines.map((k) => {
                const [r, c] = parseKey(k)
                return <line key={k} className="rung" x1={cx(c)} y1={cy(r)} x2={cx(c + 1)} y2={cy(r)} />
              })}

              {/* traced paths */}
              {traces.map((t, i) => (
                <polyline
                  key={played[i]}
                  className="path"
                  points={toPoints(t.points)}
                />
              ))}

              {/* route being drawn */}
              {(drag ?? click) && (
                <polyline
                  className="path draft"
                  points={toPoints((drag ?? click)!)}
                />
              )}

              {/* dots */}
              {Array.from({ length: m }, (_, r) =>
                Array.from({ length: n }, (_, c) => {
                  const k = key(r, c)
                  const cls = lineEnds.has(k) ? 'dot end' : blocked.has(k) ? 'dot empty' : 'dot'
                  return <circle key={k} className={cls} cx={cx(c)} cy={cy(r)} r={6} />
                }),
              )}

              {/* clickable vertical segments between nodes: build a route, or unmark a no-line dot */}
              {Array.from({ length: m + 1 }, (_, i) =>
                Array.from({ length: n }, (_, c) => {
                  const r = i - 1
                  const k = key(r, c)
                  const on = r >= 0 && empty.has(k)
                  return (
                    <rect
                      key={k}
                      className={`hit vhit ${on ? 'on' : ''}`}
                      x={cx(c) - 10}
                      y={cy(r) + 10}
                      width={20}
                      height={GY - 20}
                      rx={6}
                      onClick={() => clickSegment(r, c)}
                    >
                      <title>{on && !click ? t.unmark : t.markEmpty}</title>
                    </rect>
                  )
                }),
              )}

              {/* clickable gaps between dots */}
              {Array.from({ length: m }, (_, r) =>
                Array.from({ length: n - 1 }, (_, c) => {
                  const k = key(r, c)
                  const on = lines.has(k)
                  const conflict = !on && lineConflict(r, c)
                  return (
                    <rect
                      key={k}
                      className={`hit ${on ? 'on' : ''} ${conflict ? 'conflict' : ''}`}
                      x={cx(c) + 10}
                      y={cy(r) - 18}
                      width={GX - 20}
                      height={36}
                      rx={6}
                      onClick={() => toggleLine(r, c)}
                    >
                      <title>{on ? t.removeLine : conflict ? t.lineConflict : t.revealLine}</title>
                    </rect>
                  )
                }),
              )}

              {/* starts */}
              {Array.from({ length: n }, (_, s) => {
                const p = probs[s]
                const isBest = isPick(s)
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
                    {showTokens && tokens[s] != null && (
                      <text className="prob" x={cx(s)} y={cy(-1) - 54}>
                        {tokens[s]!.toFixed(2)}
                      </text>
                    )}
                    {!showTokens && result.ok && (
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
          <ul className="rules">
            {t.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          </div>

        <aside className="panel">
          <section>
            <h2>{t.strategy}</h2>
            <div className="buttons">
              {(['gambler', 'mathematician'] as const).map((k) => (
                <button
                  key={k}
                  className={strategy === k ? 'on' : ''}
                  aria-pressed={strategy === k}
                  onClick={() => setState({ ...state, strategy: k })}
                >
                  {t[k]}
                </button>
              ))}
            </div>
            <p className="meta">{math ? t.mathHint : t.gamblerHint}</p>
            {computing && <p className="meta">{t.computing}</p>}
            {expected &&
              (expected.ok ? (
                <p className="meta">{expected.reached ? t.reached : t.expectedTokens(expected.best.toFixed(2))}</p>
              ) : (
                <p className="error">{t.tooLarge}</p>
              ))}
          </section>

          <section>
            <h2>{t.presets}</h2>
            <div className="buttons">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  className={n === 6 && m === 5 && state.x === levelLines(l) ? 'on' : ''}
                  aria-pressed={n === 6 && m === 5 && state.x === levelLines(l)}
                  title={t.level(l, levelLines(l))}
                  onClick={() => setState({ ...state, n: 6, m: 5, x: levelLines(l), lines: [], empty: [], played: [] })}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>{t.board}</h2>
            <NumberField
              label={t.columns}
              min={LIMITS.n[0]}
              max={LIMITS.n[1]}
              value={n}
              onCommit={(v) => setState({ ...state, n: v })}
            />
            <NumberField
              label={t.dotRows}
              min={LIMITS.m[0]}
              max={LIMITS.m[1]}
              value={m}
              onCommit={(v) => setState({ ...state, m: v })}
            />
            <NumberField
              label={t.totalLines}
              min={0}
              max={maxLines(n, m)}
              value={x}
              onCommit={(v) => setState({ ...state, x: v })}
            />
            <div className="buttons">
              <button onClick={() => setState({ ...DEFAULT, lang })}>{t.resetAll}</button>
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>{t.copyLink}</button>
            </div>
          </section>

          <section>
            <h2>{t.odds(dest + 1)}</h2>
            {result.ok ? (
              <>
                <p className="meta">
                  {t.summary(result.remaining, result.layouts, formatCount(result.layouts, lang))}
                </p>
                <ol className="bars">
                  {probs.map((p, s) => (
                    <li key={s} className={isPick(s) ? 'best' : ''}>
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
              <p className="error">
                {result.error === 'tooManyLines' ? t.tooManyLines(lines.size, x) : t.noLayout}
              </p>
            )}
          </section>

          {result.ok && (
            <section>
              <h2>{t.fullMatrix}</h2>
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
            <h2>{t.assumptions}</h2>
            <p>{t.assumptionsBody}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
