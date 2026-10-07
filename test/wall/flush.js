// The bottom of the real wall, measured in a real browser at 1100, 1920 and 3840 wide (4, 6
// and 12 columns). The layout check in layout.node.js simulates the grid; this is the one that
// would catch the simulation and style.css disagreeing. Each width is a same-origin iframe, so
// the page's own media queries apply exactly as they would on that screen.
const widths = [1100, 1920, 3840];
const measure = (w) => new Promise((resolve) => {
  const f = document.createElement('iframe');
  f.style.cssText = `position:absolute;left:-99999px;top:0;width:${w}px;height:1200px;border:0`;
  f.src = '/?wallcheck=' + w;
  f.onload = () => setTimeout(() => {
    const d = f.contentDocument;
    const grid = d.getElementById('wall');
    const g = grid.getBoundingClientRect();
    const tiles = [...grid.children].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
    const bottom = Math.max(...tiles.map((b) => b.bottom));
    const last = tiles.filter((b) => Math.abs(b.bottom - bottom) < 2);
    const cols = d.defaultView.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const gap = parseFloat(d.defaultView.getComputedStyle(grid).columnGap) || 0;
    const covered = last.reduce((n, b) => n + b.width, 0) + gap * (last.length - 1);
    f.remove();
    resolve({ w, cols, lastRowTiles: last.length, flush: Math.abs(covered - g.width) < 3, covered: Math.round(covered), width: Math.round(g.width) });
  }, 400);
  document.body.appendChild(f);
});
return (async () => {
  const out = [];
  for (const w of widths) out.push(await measure(w));
  return JSON.stringify({
    pass: out.every((o) => o.flush),
    detail: out.map((o) => `${o.w}px: ${o.cols} columns, last row ${o.flush ? 'flush' : `covers ${o.covered} of ${o.width}px`}`).join('; '),
  });
})();
