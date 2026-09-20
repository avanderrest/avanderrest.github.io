/* The tray really is Amber's walnut case, not the fallback it paints without it.

   The reskin draws the tray from five textures cut out of her plates
   (marble-tray/assets/). If one of those is renamed, moved or never deployed,
   `paintCase` quietly falls back to flat colours in the same shapes — walnut
   brown at the rim, green in the middle — so the tray still looks broadly
   right in a screenshot and nobody notices the art has gone. That is exactly
   the kind of thing worth a case.

   Two claims:

   1. Every texture the tray asks for actually loads, at the size it was cut to.
   2. The painted result puts them where they belong: wood on the rim, baize in
      the well, a brass screw in each corner. That catches a rim thickness or a
      clip path going wrong, which would change where the tray looks playable. */
return (async () => {
  const want = {
    'walnut.jpg': [336, 200],
    'walnut-post.jpg': [26, 1040],
    'felt.jpg': [256, 256],
    'ring-blue.png': [68, 68],
    'ring-pink.png': [66, 66],
    // not used by the canvas, but the stylesheet leans on them just as hard
    'leather.jpg': [256, 240],
    'nameplate.png': [614, 128],
    'tag.png': [213, 81],
    'knob.png': [38, 38],
  };

  const loaded = await Promise.all(Object.keys(want).map((name) => new Promise((done) => {
    const img = new Image();
    img.onload = () => done({ name, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => done({ name, w: 0, h: 0 });
    img.src = '/marble-tray/assets/' + name;
  })));

  const problems = [];
  for (const got of loaded) {
    const [w, h] = want[got.name];
    if (!got.w) problems.push(`${got.name} did not load`);
    else if (got.w !== w || got.h !== h) problems.push(`${got.name} is ${got.w}x${got.h}, cut as ${w}x${h}`);
  }

  // Clear the tray so nothing is sitting on the spots about to be sampled, and
  // give the canvas a frame to be repainted without them.
  const T = window.__tray;
  T.setScene(T.SCENES.length - 1);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = document.getElementById('tray');
  const g = canvas.getContext('2d');
  const k = canvas.width / 960;                   // backing-store px per tray px
  const at = (x, y) => {
    const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  };
  // A screw head is mostly its slot, so sample the brightest pixel around it
  // rather than dead centre, which is the dark of the slot itself.
  const brightest = (x, y, n) => {
    const d = g.getImageData(Math.round((x - n) * k), Math.round((y - n) * k),
      Math.round(2 * n * k), Math.round(2 * n * k)).data;
    let best = { r: 0, g: 0, b: 0 }, top = -1;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      if (v > top) { top = v; best = { r: d[i], g: d[i + 1], b: d[i + 2] }; }
    }
    return best;
  };

  const spots = [
    ['rim, left', at(11, 310), (c) => c.r > c.g && c.g > c.b && c.r > 40 && c.r < 150, 'warm brown'],
    ['rim, top', at(480, 10), (c) => c.r > c.g && c.g > c.b && c.r > 40 && c.r < 160, 'warm brown'],
    ['baize, middle', at(480, 310), (c) => c.g > c.r * 1.3 && c.g > c.b * 1.3, 'green'],
    ['baize, near the rim', at(40, 580), (c) => c.g > c.r * 1.25 && c.g > c.b * 1.25, 'green'],
    ['screw, top left', brightest(12, 12, 5), (c) => c.r > 120 && c.g > 90 && c.b < c.r * 0.8, 'brass'],
    ['screw, bottom right', brightest(948, 608, 5), (c) => c.r > 120 && c.g > 90 && c.b < c.r * 0.8, 'brass'],
  ];
  const seen = [];
  for (const [where, c, ok, wanted] of spots) {
    seen.push(`${where} rgb(${c.r},${c.g},${c.b})`);
    if (!ok(c)) problems.push(`${where} is rgb(${c.r},${c.g},${c.b}), wanted ${wanted}`);
  }

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length
      ? problems.join('; ')
      : `${loaded.length} textures loaded at the sizes they were cut to; ${seen.join(', ')}`,
  });
})();
