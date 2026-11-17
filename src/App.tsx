import { useEffect, useRef, useState } from 'react'
import { LANGS, messages, type Lang } from './i18n.ts'
import { commit, extend, removeRoute, type Node } from './route.ts'
import type { Expected } from './strategy.ts'
import type { WorkerInput } from './strategy.worker.ts'
import { key, maxLines, parseKey } from './solver.ts'
import { DEFAULT, LIMITS, derive, normalize, read, sameBoard, write, type Known, type State } from './urlState.ts'

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

// Why the board isn't what was asked for: an edit no layout agrees with, a route that
// contradicts one already traced, or a link that was cleaned up on load.
type Notice = 'impossible' | 'contradicts' | 'adjusted'
type Saved = { state: State; known: Known; notice: Notice | null }

const load = (): Saved => {
  const { state, known, dropped } = read(window.location.search)
  return { state, known, notice: dropped ? 'adjusted' : null }
}

// Put the state's saved form in the URL. On load this also rewrites a link that had
// something dropped or clamped, so reloading or copying it doesn't pass that on.
const rewrite = (s: State) => {
  const url = write(s)
  if (url !== window.location.search) window.history.replaceState(null, '', url)
}

// Only possible states are saved: an update whose routes no layout agrees with is refused
// (returns false), the board and URL stay as they were, and the notice says why. A notice
// is about the board, so it stays until the board or routes change.
function useUrlState() {
  const [saved, setSaved] = useState(load)
  useEffect(() => {
    rewrite(saved.state)
    const onPop = () => {
      const next = load()
      rewrite(next.state)
      setSaved(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const setNotice = (notice: Notice | null) => setSaved((v) => (v.notice === notice ? v : { ...v, notice }))
  const update = (s: State) => {
    const next = normalize(s)
    // edits that leave the board and routes alone (language, destination…) reuse the odds
    const same = sameBoard(next, saved.state)
    const d = same ? { state: next, known: saved.known } : derive(next)
    if (!d) {
      setNotice('impossible')
      return false
    }
    rewrite(d.state)
    setSaved({ ...d, notice: same ? saved.notice : null })
    return true
  }
  return { ...saved, update, setNotice }
}

// Edits are local until blur or Enter, so typing through intermediate values
// (e.g. clearing the field) can't shrink the board and drop lines.
function NumberField(props: {
  label: string
  min: number
  max: number
  value: number
  disabled?: boolean
  onCommit: (v: number) => boolean
}) {
  const { label, min, max, value, disabled, onCommit } = props
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  // Always report the entered value: `value` may be a capped view of a larger stored
  // value (total lines), so entering the shown number must still save it.
  const apply = () => {
    const v = parseInt(draft, 10)
    if (!Number.isFinite(v)) return setDraft(String(value))
    const clamped = Math.min(max, Math.max(min, v))
    setDraft(String(onCommit(clamped) ? clamped : value))
  }
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
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
  const { state, known, notice, update: setState, setNotice } = useUrlState()
  const { n, m, played, dest, lang, strategy } = state
  const t = messages[lang]
  const { board, lines, ends: lineEnds, traces, blocked, result } = known
  const { x } = board

  const math = strategy === 'mathematician'
  // The search can take a second on big boards, so it runs in a worker; changing the inputs
  // terminates a stale run.
  const [expected, setExpected] = useState<Expected | null>(null)
  const [computing, setComputing] = useState(false)
  useEffect(() => {
    setExpected(null)
    if (!math) return setComputing(false)
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
      played: known.played,
      dest,
      layoutCount: result.layouts,
    }
    worker.postMessage(input)
    return () => worker.terminate()
    // known (and so known.played) only changes with the board or routes, so other edits
    // (language…) don't restart the search
  }, [math, board, lines, blocked, known.played, dest, result])

  const cx = (c: number) => PAD_X + c * GX
  const cy = (r: number) => PAD_TOP + (r + 1) * GY // r = -1 start post, r = m destination post
  const toPoints = (nodes: [number, number][]) => nodes.map(([r, c]) => `${cx(c)},${cy(r)}`).join(' ')
  const width = PAD_X * 2 + (n - 1) * GX
  const height = PAD_TOP + PAD_BOTTOM + (m + 1) * GY

  // Lines and no-line dots only come from whole routes, as in the game, so gaps are only
  // clickable while building a route: they step it sideways, or, on a line the route
  // already takes, undo the route back to just before that line.
  const clickGap = (r: number, c: number) => {
    if (!click) return
    const i = click.findIndex(([r1, c1], j) => {
      const next = click[j + 1]
      return r1 === r && next?.[0] === r && Math.min(c1, next[1]) === c
    })
    if (i >= 0) return setClick(click.slice(0, i + 1))
    const last = click[click.length - 1][1]
    extendClick([r, last <= c ? c + 1 : c])
  }
  // r is the row of the segment's upper node (-1 = below the start post)
  const clickSegment = (r: number, c: number) => extendClick([r + 1, c])
  // Routes are only drawn (dragged or clicked) in full; clicking a traced start removes its
  // route and what it revealed.
  const untrace = (s: number) => played.includes(s) && setState(removeRoute(state, s))
  // There can't be fewer lines in total than are already revealed, or more than the board
  // holds. A board too small for the minimum shows its capacity, which can't be changed.
  const minX = Math.max(LIMITS.x[0], lines.size)
  const maxX = Math.min(LIMITS.x[1], maxLines(n, m))
  // Routes seen on one board shape don't carry over to another, so a new shape starts
  // empty, as a level preset does.
  const resize = (size: { n: number } | { m: number }) => {
    const next = { ...state, ...size }
    if (next.n === n && next.m === m) return true
    return setState({ ...next, lines: [], played: [] })
  }
  const resetBoard = () => {
    setClick(null)
    setState({ ...state, lines: [], played: [] })
  }

  // Dragging from a start draws a route, committed only if released on the destination row;
  // releasing without ever leaving the start untraces it. Anything else cancels.
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
  // commits it; Escape or Cancel drops it. A route that is impossible or contradicts a
  // traced one is dropped too, with a notice.
  const [click, setClick] = useState<Node[] | null>(null)
  const saveRoute = (path: Node[]) => {
    const next = commit(state, path)
    if (next) setState(next)
    else setNotice('contradicts')
  }
  const extendClick = (target: Node) => {
    const next = extend(click ?? [[-1, target[1]]], target, m)
    if (next[next.length - 1][0] !== m) return setClick(next)
    saveRoute(next)
    setClick(null)
  }
  useEffect(() => {
    if (!click) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setClick(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [click])
  // A draft is drawn on one board shape; a new shape (resize, back/forward) drops it.
  useEffect(() => {
    setClick(null)
    setDrag(null)
    pointer.current = null
  }, [n, m])

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
    if (drag[drag.length - 1][0] === m) saveRoute(drag)
    else if (!pointer.current.moved) untrace(drag[0][1])
    endDrag()
  }

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t.title
  }, [lang, t])

  const probs = result.prob.map((row) => row[dest])
  const best = probs.length ? Math.max(...probs) : 0
  const tokens = expected?.ok && !expected.reached ? expected.perStart : []
  const bestTokens = expected?.ok ? expected.best : 0
  const isTokenBest = (s: number) => tokens[s] != null && tokens[s]! - bestTokens < 1e-9
  // until the worker answers, the starts show the gambler's numbers
  const showTokens = tokens.length > 0
  const isPick = (s: number) => (showTokens ? isTokenBest(s) : probs[s] === best && best > 0)

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
              {click && <button onClick={() => setClick(null)}>{t.cancelRoute}</button>}
              <button onClick={resetBoard}>{t.reset}</button>
            </div>
            {notice && <p className="error">{t[notice]}</p>}
            <div className="presets">
              <div className="buttons" role="group" aria-label={t.presets}>
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    className={n === 6 && m === 5 && state.x === levelLines(l) ? 'on' : ''}
                    aria-pressed={n === 6 && m === 5 && state.x === levelLines(l)}
                    title={t.level(l, levelLines(l))}
                    onClick={() => {
                      setClick(null)
                      setState({ ...state, n: 6, m: 5, x: levelLines(l), lines: [], played: [] })
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="counter">
              <button
                aria-label={t.fewerLines}
                disabled={x <= minX}
                onClick={() => setState({ ...state, x: x - 1 })}
              >
                −
              </button>
              {t.linesRevealed(lines.size, x)}
              <button
                aria-label={t.moreLines}
                disabled={x >= maxX}
                onClick={() => setState({ ...state, x: x + 1 })}
              >
                +
              </button>
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

              {/* clickable vertical segments between nodes: start or extend a route */}
              {Array.from({ length: m + 1 }, (_, i) =>
                Array.from({ length: n }, (_, c) => {
                  const r = i - 1
                  const k = key(r, c)
                  return (
                    <rect
                      key={k}
                      className="hit vhit"
                      x={cx(c) - 10}
                      y={cy(r) + 10}
                      width={20}
                      height={GY - 20}
                      rx={6}
                      onClick={() => clickSegment(r, c)}
                    >
                      <title>{t.stepDown}</title>
                    </rect>
                  )
                }),
              )}

              {/* clickable gaps between dots, while building a route */}
              {click && Array.from({ length: m }, (_, r) =>
                Array.from({ length: n - 1 }, (_, c) => {
                  const k = key(r, c)
                  return (
                    <rect
                      key={k}
                      className="hit"
                      x={cx(c) + 10}
                      y={cy(r) - 18}
                      width={GX - 20}
                      height={36}
                      rx={6}
                      onClick={() => clickGap(r, c)}
                    >
                      <title>{t.stepAcross}</title>
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
                    {!showTokens && (
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
            <h2>{t.board}</h2>
            <NumberField
              label={t.columns}
              min={LIMITS.n[0]}
              max={LIMITS.n[1]}
              value={n}
              onCommit={(v) => resize({ n: v })}
            />
            <NumberField
              label={t.dotRows}
              min={LIMITS.m[0]}
              max={LIMITS.m[1]}
              value={m}
              onCommit={(v) => resize({ m: v })}
            />
            <NumberField
              label={t.totalLines}
              min={minX}
              max={maxX}
              value={x}
              disabled={maxX <= minX}
              onCommit={(v) => setState({ ...state, x: v })}
            />
            <div className="buttons">
              <button onClick={() => {
                setClick(null)
                setState({ ...DEFAULT, lang })
              }}>{t.resetAll}</button>
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)}>{t.copyLink}</button>
            </div>
          </section>

          <section>
            <h2>{t.odds(dest + 1)}</h2>
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
          </section>

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

          <section className="notes">
            <h2>{t.assumptions}</h2>
            <p>{t.assumptionsBody}</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
