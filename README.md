# tos-Intersecting-destinies-simulator

Static React emulator for the TOS "Intersecting Destinies" ladder mini-game. Reveal lines, trace starts,
and see each start's probability of reaching the selected destination. All state lives in the URL query.

```sh
npm install
npm run dev     # local dev server
npm run build   # static site in dist/ (relative paths, host anywhere)
```

URL params: `level` preset level (1–6; sets the board, so `n`, `m`, `x` are left out — a plain link loads
level 1), `n` columns, `m` dot rows, `x` total lines, `l` revealed lines as `row.col` (0-based, line joins
col and col+1), `p` traced starts (0-based), `d` selected destination (0-based), `lang` UI language
(`zh-TW` by default, or `en-US`). Only lines a traced route crosses are kept, dots a route passes straight
through are known to have no line, and a state no layout of the `x` lines agrees with is never saved
(such a link keeps its settings but loads an empty board, or the default board if its shape can't be played at
all: every column needs a line, so n columns need at least ⌈n / 2⌉ lines).
Example: `?level=5&l=1.0,2.1&p=0&d=0` or `?n=6&m=5&x=9&l=1.0,2.1&p=0&d=0`
