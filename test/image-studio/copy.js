// Foreground and Background split every pixel exactly, and Copy to... puts a
// single layer, or a whole stack with its colour map, onto another region as
// an independent copy.
return (async () => {
  const S = window.__studio;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(S.state.data && window.cv && window.cv.Mat && S.state.regionW); i++) await wait(100);
  const st = S.state;
  const n = st.w * st.h;
  const W = st.regionW;
  const problems = [];

  let worst = 0;
  let fg = 0;
  for (let p = 0; p < n; p += 7) {
    worst = Math.max(worst, Math.abs(W.fg[p] + W.bg[p] - 255));
    fg += W.fg[p];
  }
  fg /= 255 * Math.ceil(n / 7);
  if (worst > 1) problems.push('weights off 255 by up to ' + worst);
  if (fg < 0.03 || fg > 0.15) problems.push('foreground share ' + (fg * 100).toFixed(1) + '%');

  const countStyles = (key) => st[key].filter((l) => l.kind === 'style').length;
  S.applyPreset(null);
  S.setRegion('fg');
  S.addStyleLayer('saturate');
  S.addStyleLayer('vignette');
  const one = S.copyLayers('fg', 'bg', false);
  if (one !== 1 || countStyles('bgLayers') !== 1) problems.push('single copy gave ' + countStyles('bgLayers') + ' layers');
  const cm = st.fgLayers.find((l) => l.kind === 'colormap');
  cm.enabled = true;
  st.colorMaps.fg = { shadow: '#102030', mid: '#808080', high: '#f0e0d0' };
  const all = S.copyLayers('fg', 'both', true);
  if (countStyles('bothLayers') !== 2) problems.push('whole-stack copy gave ' + countStyles('bothLayers') + ' styles');
  if (!st.bothLayers.find((l) => l.kind === 'colormap' && l.enabled) || st.colorMaps.both.shadow !== '#102030') problems.push('colour map not copied');
  st.fgLayers.find((l) => l.kind === 'style').params.amount = 5;
  if (st.bgLayers.find((l) => l.kind === 'style').params.amount === 5) problems.push('copy shares params with the original');
  if (S.copyLayers('fg', 'fg', true) !== 0) problems.push('copied a region onto itself');
  S.applyPreset(null);
  S.setRegion('both');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: (problems.length ? problems.join('; ') + ' | ' : '') + 'foreground ' + (fg * 100).toFixed(1) + '%, weights within ' + worst + ' of 255; copied ' + one + ' then ' + all
  });
})();
