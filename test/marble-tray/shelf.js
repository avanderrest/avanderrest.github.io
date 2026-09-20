/* Every icon on the shelf fits in its own cell, and the sizes still read.

   The shelf draws each thing with the game's own render at whatever scale is
   asked for, into an 88px canvas. That scale used to be fitted per icon
   against a constant that was too big for the cell, so the big marble and the
   shooter were drawn about half as wide again as the canvas and arrived as a
   cropped swoosh. Nothing throws and nothing logs — it just looks wrong, and
   only at the two biggest sizes, so it survived a long time.

   Two claims, per tab:

   1. Nothing is drawn against the edge of its canvas: the outer ring of pixels
      is empty, shadow included.
   2. Within a tab the icons are still ordered by size, so "Small marble" is
      visibly smaller than "Shooter" rather than everything being fitted to the
      same circle. */
return (async () => {
  const problems = [];
  const notes = [];
  const EDGE = 2;                       // px of margin every icon has to leave

  const tabs = [...document.querySelectorAll('#shelf-panes .items')];
  const names = [...document.querySelectorAll('#shelf-tabs .tab')].map((b) => b.textContent);

  for (let t = 0; t < tabs.length; t++) {
    const items = [...tabs[t].querySelectorAll('.item')];
    if (!items.length) { problems.push(`${names[t]} has no items`); continue; }
    const widths = [];

    for (const item of items) {
      const canvas = item.querySelector('canvas');
      const label = item.querySelector('span').textContent;
      if (!canvas) { problems.push(`${label} has no icon`); continue; }
      const { width: w, height: h } = canvas;
      const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      const lit = (x, y) => px[(y * w + x) * 4 + 3] > 8;

      let touching = 0;
      for (let x = 0; x < w; x++) {
        for (let e = 0; e < EDGE; e++) if (lit(x, e) || lit(x, h - 1 - e)) touching++;
      }
      for (let y = 0; y < h; y++) {
        for (let e = 0; e < EDGE; e++) if (lit(e, y) || lit(w - 1 - e, y)) touching++;
      }
      if (touching) problems.push(`${names[t]}/${label} runs off its cell (${touching} lit edge px)`);

      // how wide the thing itself is, for the ordering claim
      let lo = w, hi = 0;
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) if (lit(x, y)) { if (x < lo) lo = x; if (x > hi) hi = x; break; }
      }
      if (hi < lo) { problems.push(`${names[t]}/${label} drew nothing`); continue; }
      widths.push({ label, w: hi - lo + 1 });
    }

    if (widths.length > 1) {
      const spread = Math.max(...widths.map((v) => v.w)) - Math.min(...widths.map((v) => v.w));
      if (spread < 8) problems.push(`${names[t]} icons are all one size (${spread}px between smallest and largest)`);
      notes.push(`${names[t]}: ${widths.map((v) => `${v.label} ${v.w}`).join(', ')}`);
    }
  }

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join('; ') : notes.join(' | '),
  });
})();
