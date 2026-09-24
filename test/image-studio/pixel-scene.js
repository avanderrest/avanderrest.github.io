// Pixel Scene has to come out as real pixel art - every block one flat colour,
// a small palette - and Autumn has to actually turn the greens, not just tint.
return (async () => {
  const S = window.__studio;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(S.state.data && window.cv && window.cv.Mat); i++) await wait(100);
  const st = S.state;
  const w = st.w, h = st.h;
  const F = S.byId('pixel-scene');
  const defaults = {};
  for (const q of F.params) defaults[q.key] = q.value;
  const problems = [];

  const run = (extra) => {
    const t = performance.now();
    const out = F.apply(new Uint8ClampedArray(st.data), w, h, Object.assign({}, defaults, extra));
    return { out, ms: performance.now() - t };
  };
  const green = (d) => {
    let g = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 12 && d[i + 1] > d[i + 2] + 12) g++;
    return g / (d.length / 4);
  };

  const plain = run({});
  const d = plain.out;
  // Same grid the filter uses: every pixel in a block matches the block's first.
  const gw = Math.max(8, Math.round(w / defaults.blockSize));
  const gh = Math.max(8, Math.round(h / defaults.blockSize));
  let mixed = 0;
  const firstOf = new Map();
  const colours = new Set();
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.floor((y * gh) / h));
    for (let x = 0; x < w; x++) {
      const gi = gy * gw + Math.min(gw - 1, Math.floor((x * gw) / w));
      const o = (y * w + x) * 4;
      const c = (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
      colours.add(c);
      if (!firstOf.has(gi)) firstOf.set(gi, c);
      else if (firstOf.get(gi) !== c) mixed++;
    }
  }
  if (mixed) problems.push(mixed + ' pixels differ from their block');
  // Each palette colour can also appear outlined.
  if (colours.size > defaults.colors * 2) problems.push(colours.size + ' colours for a ' + defaults.colors + '-colour palette');

  const autumn = run({ autumn: 90 });
  const g0 = green(d), g1 = green(autumn.out);
  if (g0 > 0.05 && g1 > g0 * 0.35) problems.push('autumn left ' + (g1 * 100).toFixed(1) + '% green of ' + (g0 * 100).toFixed(1) + '%');
  if (plain.ms > 2500) problems.push('took ' + plain.ms.toFixed(0) + 'ms');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: (problems.length ? problems.join('; ') + ' | ' : '') + w + 'x' + h + ' as ' + gw + 'x' + gh + ' blocks, ' + colours.size +
      ' colours, green ' + (g0 * 100).toFixed(1) + '% -> ' + (g1 * 100).toFixed(1) + '% with autumn, ' + plain.ms.toFixed(0) + 'ms'
  });
})();
