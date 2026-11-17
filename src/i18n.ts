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
    'Click a traced start again to remove its route (and the lines and no-line dots only it revealed).',
    'Click a destination to target it.',
  ],
  language: 'Language',
  reset: 'Reset',
  linesRevealed: (revealed: number, x: number) => `Lines revealed: ${revealed} / ${x}`,
  unmark: 'Unmark (unknown)',
  lineEndsHere: 'A line ends here',
  markEmpty: 'Mark: no line at this dot',
  removeLine: 'Remove line',
  lineConflict: 'Conflicts with another line or a dot marked as having no line',
  revealLine: 'Reveal line',
  board: 'Board',
  columns: 'Columns (n)',
  dotRows: 'Dot rows (m)',
  totalLines: 'Total lines (x)',
  resetAll: 'Reset all',
  copyLink: 'Copy link',
  odds: (dest: number) => `Odds to reach destination ${dest}`,
  // `count` is the layout count already formatted for display
  summary: (remaining: number, layouts: number, count: string) =>
    `${remaining} hidden line${remaining === 1 ? '' : 's'} · ${count} consistent layout${layouts === 1 ? '' : 's'}`,
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
    '再次點擊已追蹤的起點可移除其路線（以及只有該路線揭示的橫線與無橫線點）。',
    '點擊終點可將它設為目標。',
  ],
  language: '語言',
  reset: '重置',
  linesRevealed: (revealed, x) => `已揭示橫線：${revealed} / ${x}`,
  unmark: '取消標記（恢復為未知）',
  lineEndsHere: '此點已連接橫線',
  markEmpty: '標記：此點沒有橫線',
  removeLine: '移除橫線',
  lineConflict: '與其他橫線或已標記為沒有橫線的點衝突',
  revealLine: '揭示橫線',
  board: '盤面',
  columns: '直線數 (n)',
  dotRows: '點的列數 (m)',
  totalLines: '橫線總數 (x)',
  resetAll: '全部重置',
  copyLink: '複製連結',
  odds: (dest) => `抵達終點 ${dest} 的機率`,
  summary: (remaining, _layouts, count) => `${remaining} 條未揭示橫線 · ${count} 種符合的排列`,
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
