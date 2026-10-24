// The freeform hanging, measured in a real browser at phone (two columns), 6-column and
// 12-column widths. The packing is JavaScript, so unlike the old flush check this looks
// at what the page actually did: every tile measured, nothing overlapping, nothing poking
// out of the wall, and no sideways scroll.
const cases = [
  { w: 390, cols: 2 },
  { w: 900, cols: 6 },
  { w: 1400, cols: 12 },
  { w: 1920, cols: 12 },
  { w: 3840, cols: 12 },
];

const measure = (c) => new Promise((resolve) => {
  const f = document.createElement('iframe');
  f.style.cssText = `position:absolute;left:-99999px;top:0;width:${c.w}px;height:1400px;border:0`;
  f.src = '/?wallcheck=' + c.w;
  f.onload = () => setTimeout(() => {
    const d = f.contentDocument;
    const win = f.contentWindow;
    const grid = d.getElementById('wall');
    const tiles = [...grid.children].filter((e) => e.classList.contains('tile'));
    const rects = tiles.map((e) => e.getBoundingClientRect());
    const g = grid.getBoundingClientRect();
    const outside = rects.filter((r) => r.left < g.left - 2 || r.right > g.right + 2).length;
    let overlaps = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 3 && iy > 3) overlaps++;
      }
    }
    const spans = tiles.filter((e) => e.style.getPropertyValue('--row-span')).length;
    const columns = win.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const sideways = d.documentElement.scrollWidth > d.documentElement.clientWidth + 1;
    const hung = grid.classList.contains('is-hung');
    f.remove();
    resolve({
      ...c, columns, overlaps, outside, spans, hung, sideways,
      total: tiles.length,
      pass: hung && spans === tiles.length && !overlaps && !outside && !sideways && columns === c.cols,
    });
  }, 1200);
  document.body.appendChild(f);
});

return (async () => {
  const out = [];
  for (const c of cases) out.push(await measure(c));
  return JSON.stringify({
    pass: out.every((o) => o.pass),
    detail: out.map((o) => `${o.w}px: ${o.columns} cols, ${o.spans}/${o.total} hung, ` +
      `${o.overlaps} overlap, ${o.outside} outside, ${o.sideways ? 'scrolls sideways' : 'no sideways scroll'}`).join('; '),
  });
})();
