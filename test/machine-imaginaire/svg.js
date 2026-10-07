/* Download SVG goes through a stand-in for the canvas that writes SVG instead of pixels,
   so a call it gets wrong (a transform, a clip, a blend) shows as an SVG that no longer
   looks like the picture. For every style: the SVG parses, then is drawn back into a
   small canvas next to the real picture at the same size, and the two must agree. */
return (async () => {
  const M = window.__machine;
  M.clearPhoto();
  const SW = 240, SH = 150;
  const small = (src) => {
    const c = document.createElement('canvas');
    c.width = SW; c.height = SH;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, SW, SH);
    return x.getImageData(0, 0, SW, SH).data;
  };
  const notes = [];
  let pass = true;
  for (const style of M.ORDER) {
    M.render({ seed: 'svg-check', style });
    const want = small(document.getElementById('art'));
    const text = M.svg();
    const bad = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('parsererror');
    const img = new Image();
    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    let got = null;
    // drawn at full size first: Chrome rasterises an SVG straight at the size it is
    // drawn, and thin lines come out differently at 240 wide than shrunk from 2400
    try {
      img.src = url; await img.decode();
      const full = document.createElement('canvas');
      full.width = M.W; full.height = M.H;
      full.getContext('2d').drawImage(img, 0, 0, M.W, M.H);
      got = small(full);
    } catch (e) { got = null; }
    URL.revokeObjectURL(url);
    let diff = Infinity;
    if (got) { let d = 0; for (let i = 0; i < got.length; i += 4) d += Math.abs(got[i] - want[i]) + Math.abs(got[i + 1] - want[i + 1]) + Math.abs(got[i + 2] - want[i + 2]); diff = d / (SW * SH * 3); }
    const ok = !bad && got && diff < 2;
    if (!ok) pass = false;
    notes.push(style + (ok ? '' : ' FAILED') + ' ' + (bad ? 'does not parse' : !got ? 'would not draw' : 'off by ' + diff.toFixed(1)) + ' (' + Math.round(text.length / 1024) + 'KB)');
  }
  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
