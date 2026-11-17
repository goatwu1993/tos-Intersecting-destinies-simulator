// Runs the expected-token search off the main thread so the board stays responsive.

import { expectedTokens } from './strategy.ts'

export type WorkerInput = {
  board: { n: number; m: number; x: number }
  lines: string[]
  blocked: string[]
  played: number[]
  dest: number
  layoutCount: number
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { board, lines, blocked, played, dest, layoutCount } = e.data
  self.postMessage(expectedTokens(board, new Set(lines), new Set(blocked), played, dest, layoutCount))
}
