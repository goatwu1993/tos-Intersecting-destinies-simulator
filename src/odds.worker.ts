// Works out the odds off the main thread, for boards too big to do it while handling an edit.

import { analyze } from './solver.ts'

export type OddsInput = {
  board: { n: number; m: number; x: number }
  lines: string[]
  blocked: string[]
}

self.onmessage = (e: MessageEvent<OddsInput>) => {
  const { board, lines, blocked } = e.data
  const result = analyze(board, new Set(lines), new Set(blocked))
  self.postMessage(result.ok ? result.prob : null)
}
