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
    'Drag from a start down the board to draw a route you saw (sideways steps become lines, straight steps mark dots as having no line).',
    'Click between two dots to toggle a line.',
    'Click a vertical segment to mark that dot as having no line.',
    'Click a start to fast-forward it to a destination, then click lines onto its path as you reveal them.',
    'Click a start that already has a route to remove that route (and the lines and no-line dots only it revealed).',
    'Click a destination to target it.',
    'Click Reset to clear all revealed lines, no-line dots and routes.',
  ],
  language: 'Language',
  reset: 'Reset',
  fewerLines: 'Fewer total lines',
  moreLines: 'More total lines',
  commitRoute: 'Commit route',
  cancelRoute: 'Cancel route',
  linesRevealed: (revealed: number, x: number) => `Lines revealed: ${revealed} / ${x}`,
  unmark: 'Unmark (unknown)',
  lineEndsHere: 'A line ends here',
  markEmpty: 'Mark: no line at this dot',
  removeLine: 'Remove line',
  lineConflict: 'Conflicts with another line or a dot marked as having no line',
  revealLine: 'Reveal line',
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
    'revealed lines, and every dot known to have no line (shown hollow) — either marked by ' +
    'you or passed straight through by a traced route. Lines join adjacent columns on the same ' +
    'row and never share a dot.',
  tooManyLines: (revealed: number, x: number) => `${revealed} lines revealed but only ${x} exist.`,
  noLayout: 'No layout of the hidden lines is consistent with this board.',
}

export type Messages = typeof en

const zh: Messages = {
  langName: '繁體中文',
  title: '路徑模擬器',
  rules: [
    '從起點往下拖曳，畫出你看到的路線（橫向移動會成為橫線，直行經過的點會標記為沒有橫線）。',
    '點擊兩點之間可新增或移除橫線。',
    '點擊直線段可將該點標記為沒有橫線。',
    '點擊起點讓它沿著已揭示的橫線直達終點，之後再把陸續揭示的橫線點到它的路徑上。',
    '點擊已畫出路線的起點可移除其路線（以及只有該路線揭示的橫線與無橫線點）。',
    '點擊終點可將它設為目標。',
    '點擊「重置」可清除所有已揭示的橫線、無橫線點與路線。',
  ],
  language: '語言',
  reset: '重置',
  fewerLines: '減少橫線總數',
  moreLines: '增加橫線總數',
  commitRoute: '確定路線',
  cancelRoute: '取消路線',
  linesRevealed: (revealed, x) => `已揭示橫線：${revealed} / ${x}`,
  unmark: '取消標記（恢復為未知）',
  lineEndsHere: '此點已連接橫線',
  markEmpty: '標記：此點沒有橫線',
  removeLine: '移除橫線',
  lineConflict: '與其他橫線或已標記為沒有橫線的點衝突',
  revealLine: '揭示橫線',
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
    '以及所有確定沒有橫線的點（以空心顯示）——不論是你手動標記的，還是被已追蹤路線直行通過的。' +
    '橫線只連接同一列上相鄰的兩條直線，且不會共用同一個點。',
  tooManyLines: (revealed, x) => `已揭示 ${revealed} 條橫線，但總共只有 ${x} 條。`,
  noLayout: '未揭示的橫線沒有任何排列能符合目前的盤面。',
}

export const messages: Record<Lang, Messages> = { 'zh-TW': zh, 'en-US': en }
