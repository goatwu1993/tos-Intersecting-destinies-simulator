// UI strings. Languages are BCP 47 tags so they double as the <html lang> value and
// the locale for number formatting.

export const LANGS = ['zh-TW', 'en-US'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'zh-TW'

// Anything starting with "en" (en, en-US, EN-us) is English; everything else is the default.
export const parseLang = (v: string | null): Lang => (v?.toLowerCase().startsWith('en') ? 'en-US' : DEFAULT_LANG)

const en = {
  langName: 'English',
  title: 'Intersecting Destinies Simulator',
  rules: [
    'Drag from a start down to the destination row to draw a route you saw (sideways steps become lines, straight steps mark dots as having no line).',
    'Or click a vertical segment to start a route and grow it from either end, top-down or bottom-up: click segments to go straight, or click between two dots to take a line (the step past it is added for you, since two lines can’t meet). Click a piece of the route to undo it and what you added beyond it (undoing the step past a line undoes the line too; undoing the first segment drops the route). Only pieces that change the route are clickable. It is saved once it joins a start to a destination.',
    'Draw a route again from a traced start to correct it. A route that contradicts another traced route, or that no layout of the lines allows, is not saved.',
    'Click a start that already has a route to remove that route (and the lines only it revealed).',
    'Click a destination to target it.',
    'Click Reset to clear all revealed lines, no-line dots and routes.',
  ],
  language: 'Language',
  reset: 'Reset',
  fewerLines: 'Fewer total lines',
  moreLines: 'More total lines',
  cancelRoute: 'Cancel route',
  linesRevealed: (revealed: number, x: number) => `Lines revealed: ${revealed} / ${x}`,
  startRoute: 'Route: start here',
  stepStraight: 'Route: go straight',
  undoStep: 'Route: undo from here',
  stepAcross: 'Route: take this line',
  impossible: 'Not saved: no layout of the lines agrees with that.',
  contradicts: 'Not saved: this route contradicts a route already traced.',
  shape: 'Not saved: every column needs a line, and this board can’t hold enough lines for that (n columns need at least ⌈n / 2⌉ lines).',
  drawRoute: 'To trace a start, drag from it all the way to a destination, or click its route out segment by segment.',
  adjusted:
    'This link had parts that couldn’t be kept (lines no traced route crosses or that overlap, no-line dots, out-of-range values, or impossible routes); they were removed or corrected.',
  board: 'Board',
  presets: 'Presets',
  level: (l: number, x: number) => `Level ${l} · ${x} lines`,
  columns: 'Columns (n)',
  dotRows: 'Dot rows (m)',
  totalLines: 'Total lines (x)',
  resetAll: 'Reset all',
  copyLink: 'Copy link',
  odds: (dest: number) => `Odds to reach destination ${dest}`,
  // `count` is the layout count already formatted for display
  summary: (remaining: number, layouts: number, count: string) =>
    `${remaining} hidden line${remaining === 1 ? '' : 's'} · ${count} consistent layout${layouts === 1 ? '' : 's'}`,
  strategy: 'Strategy',
  gambler: 'I am a gambler',
  mathematician: 'I am a mathematician',
  gamblerHint: 'Greedy: trace the start most likely to reach the destination right now.',
  mathHint:
    'Each traced route costs one token. Picks the start that minimizes the expected total tokens to reach the destination, looking ahead over every outcome.',
  computing: 'Calculating…',
  expectedTokens: (v: string) => `Expected tokens: ${v}`,
  tokensIfFirst: 'Tokens if traced next',
  reached: 'A traced route already reaches the destination.',
  tooLarge: 'Too many layouts to compute expected tokens; reveal more lines or shrink the board.',
  fullMatrix: 'Full matrix',
  assumptions: 'Assumptions',
  assumptionsBody:
    'Hidden lines are equally likely to be any layout consistent with what you know: the ' +
    'revealed lines, and every dot known to have no line (shown hollow) because a traced ' +
    'route passes straight through it. Lines join adjacent columns on the same ' +
    'row and never share a dot, and every start changes track at least once (every column has a line).',
}

export type Messages = typeof en

const zh: Messages = {
  langName: '繁體中文',
  title: '路徑模擬器',
  rules: [
    '從起點往下拖曳到終點列，畫出你看到的路線（橫向移動會成為橫線，直行經過的點會標記為沒有橫線）。',
    '或點擊直線段開始建立路線，可從任一端往上或往下延伸：點擊直線段直行，或點擊兩點之間走橫線（兩條橫線不能相連，所以會自動補上橫線後的一步）。點擊路線上的一段可撤銷該段及其後加上的部分（撤銷橫線後的一步會連同橫線一起撤銷；撤銷第一段則取消整條路線）。只有會改變路線的地方可以點擊。路線連接起點與終點時即儲存。',
    '從已追蹤的起點重畫路線即可修正。與其他已追蹤路線矛盾、或沒有任何橫線排列允許的路線不會被儲存。',
    '點擊已畫出路線的起點可移除其路線（以及只有該路線揭示的橫線）。',
    '點擊終點可將它設為目標。',
    '點擊「重置」可清除所有已揭示的橫線、無橫線點與路線。',
  ],
  language: '語言',
  reset: '重置',
  fewerLines: '減少橫線總數',
  moreLines: '增加橫線總數',
  cancelRoute: '取消路線',
  linesRevealed: (revealed, x) => `已揭示橫線：${revealed} / ${x}`,
  startRoute: '路線：從這裡開始',
  stepStraight: '路線：直行',
  undoStep: '路線：從這裡撤銷',
  stepAcross: '路線：走這條橫線',
  impossible: '未儲存：沒有任何橫線排列符合此狀態。',
  contradicts: '未儲存：此路線與已追蹤的路線矛盾。',
  shape: '未儲存：每條直線都需要至少一條橫線，但此盤面放不下足夠的橫線（n 條直線至少需要 ⌈n / 2⌉ 條橫線）。',
  drawRoute: '要追蹤起點，請從起點一路拖曳到終點，或逐段點擊畫出路線。',
  adjusted: '此連結含有無法保留的內容（沒有路線經過或彼此重疊的橫線、無橫線點、超出範圍的數值或不可能的路線），已移除或修正。',
  board: '盤面',
  presets: '預設關卡',
  level: (l, x) => `關卡 ${l} · ${x} 條橫線`,
  columns: '直線數 (n)',
  dotRows: '點的列數 (m)',
  totalLines: '橫線總數 (x)',
  resetAll: '全部重置',
  copyLink: '複製連結',
  odds: (dest) => `抵達終點 ${dest} 的機率`,
  summary: (remaining, _layouts, count) => `${remaining} 條未揭示橫線 · ${count} 種符合的排列`,
  strategy: '策略',
  gambler: '我是賭鬼',
  mathematician: '我是數學家',
  gamblerHint: '貪心：這一步選目前最可能抵達終點的起點。',
  mathHint: '每追蹤一條路線需花費一個代幣。考慮所有可能的結果，選擇讓抵達終點的期望代幣數最少的起點。',
  computing: '計算中…',
  expectedTokens: (v) => `期望代幣數：${v}`,
  tokensIfFirst: '下一步走此起點的期望代幣數',
  reached: '已追蹤的路線已抵達終點。',
  tooLarge: '排列數過多，無法計算期望代幣數；請揭示更多橫線或縮小盤面。',
  fullMatrix: '完整機率矩陣',
  assumptions: '假設',
  assumptionsBody:
    '未揭示的橫線會以相同機率出現在任何與已知資訊相符的排列中：已知資訊包含已揭示的橫線，' +
    '以及所有確定沒有橫線的點（以空心顯示）——即被已追蹤路線直行通過的點。' +
    '橫線只連接同一列上相鄰的兩條直線，且不會共用同一個點；每個起點至少會轉換一次軌道（每條直線都至少連著一條橫線）。',
}

export const messages: Record<Lang, Messages> = { 'zh-TW': zh, 'en-US': en }
