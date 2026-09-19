/* Every crash site has to be workable.

   Twice during the build a change to map generation quietly produced colonies that could
   not do anything: once the nose cone came down in a 29-tile pocket, and once `openUp`
   cleared away the very growth the first day's timber has to come from. Neither showed up
   on screen — the game looked fine and simply never got anywhere.

   So: roll twenty maps and insist each one can be started from. */

const K = window.__keelfall;
const N = K.COLS * K.ROWS;
const MIN_REACH = 60, MIN_GROWTH = 8, MIN_WRECK = 5;

const rows = [];
for (let n = 0; n < 20; n++) {
  K.wipe(); K.newState();
  for (const k of Object.keys(K.CLAIMS)) delete K.CLAIMS[k];
  const S = K.S;
  const reach = K.reachable();

  let open = 0, growth = 0, wreck = 0;
  for (let i = 0; i < N; i++) {
    if (reach[i]) open++;
    const kind = S.kind[i];
    if (kind !== 1 && kind !== 2) continue;
    // only counts if somebody could actually stand next to it and work
    const x = i % K.COLS, y = Math.floor(i / K.COLS);
    let touchable = false;
    for (const j of K.beside(x, y)) if (reach[j]) { touchable = true; break; }
    if (!touchable) continue;
    if (kind === 1) growth++; else wreck++;
  }

  const ok = open >= MIN_REACH && growth >= MIN_GROWTH && wreck >= MIN_WRECK;
  rows.push({ n, open, growth, wreck, ok });
}

const bad = rows.filter((r) => !r.ok);
const worst = rows.reduce((a, b) => (a.open < b.open ? a : b));
return JSON.stringify({
  pass: bad.length === 0,
  detail: bad.length
    ? `${bad.length}/20 unworkable, e.g. ` + bad.slice(0, 3).map((r) => `#${r.n} reach=${r.open} growth=${r.growth} wreck=${r.wreck}`).join('; ')
    : `20/20 workable; tightest was reach=${worst.open}, growth=${worst.growth}, wreck=${worst.wreck} `
      + `(floors ${MIN_REACH}/${MIN_GROWTH}/${MIN_WRECK})`,
});
