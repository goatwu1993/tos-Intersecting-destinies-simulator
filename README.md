# tos-Intersecting-destinies-simulator

Static React emulator for the TOS "Intersecting Destinies" ladder mini-game. Reveal lines, trace starts,
and see each start's probability of reaching the selected destination. All state lives in the URL query.

```sh
npm install
npm run dev     # local dev server
npm run build   # static site in dist/ (relative paths, host anywhere)
```

URL params: `n` columns, `m` dot rows, `x` total lines, `l` revealed lines as `row.col` (0-based, line joins
col and col+1), `e` dots known to have no line as `row.col`, `p` traced starts (0-based), `d` selected
destination (0-based).
Example (the screenshot's state): `?n=6&m=5&x=9&l=3.0,4.0&e=0.0,1.0,2.0&p=0&d=0`
