# tos-Intersecting-destinies-simulator

Static React emulator for the TOS "Intersecting Destinies" ladder mini-game. Reveal lines, trace starts,
and see each start's probability of reaching the selected destination. All state lives in the URL query.

```sh
npm install
npm run dev     # local dev server
npm run build   # static site in dist/ (relative paths, host anywhere)
```

URL params: `level` preset level (1–15, each a 6 × 5 board with its own number of lines; only presets are played,
and a link without one loads level 1), `l` revealed lines as `row.col` (0-based, line joins col and col+1), `p` traced
starts (0-based), `d` selected destination (0-based), `lang` UI language (`zh-TW` by default, or `en-US`). Only
lines a traced route crosses are kept, dots a route passes straight through are known to have no line, and a state
no layout of the level's lines agrees with is never saved (such a link loads that level's empty board).
Example: `?level=5&l=1.0,2.1&p=0&d=0`

Analytics: set the repository variable `GA_MEASUREMENT_ID` (Settings → Secrets and variables → Actions → Variables)
to a GA4 measurement ID such as `G-XXXXXXXXXX` and the deploy build includes Google Analytics. Without it, and in
`npm run dev`, no analytics is loaded.
