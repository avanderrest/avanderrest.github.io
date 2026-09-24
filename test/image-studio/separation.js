// The Subject separation on the demo photo (a bee on the one sharp chive
// flower, in a field of blurred ones) takes the sharp flower and nothing much
// else: a modest share of the frame, centred where that flower is. The old
// dominant-colour flood took every flower, sharp or not, at about 21%.
return (async () => {
  const S = window.__studio;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(S.state.data && window.cv && window.cv.Mat); i++) await wait(100);
  const st = S.state;
  const m = window.BackgroundSep.modes.subject.compute(st.data, st.w, st.h, { tolerance: 46 });
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0, p = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++, p++) {
      if (m[p] < 128) { n++; sx += x; sy += y; }
    }
  }
  const share = n / (st.w * st.h);
  const cx = n ? sx / n / st.w : 0;
  const cy = n ? sy / n / st.h : 0;
  // The sharp flower sits at about (0.46, 0.40) of the frame.
  const off = Math.hypot(cx - 0.46, cy - 0.40);
  const pass = share > 0.03 && share < 0.15 && off < 0.08;
  return JSON.stringify({ pass, detail: 'subject ' + (share * 100).toFixed(1) + '% of frame, centred (' + cx.toFixed(2) + ', ' + cy.toFixed(2) + '), ' + off.toFixed(3) + ' from the sharp flower' });
})();
