/* Watch it draw and Set it moving both paint through the same scene. For every style:
   painting at t=0 with everything in place is the still picture exactly; at t=3 the
   picture has moved; coming back to t=0 gives the still picture again, so movement is a
   function of time and nothing leaks between frames; half drawn is neither blank nor
   finished. Frame times are the cost of one moving frame at full size. */
const M = window.__machine;
M.clearPhoto();
const notes = [];
let pass = true;
const art = document.getElementById('art');
const inkShare = () => {
  const d = art.getContext('2d').getImageData(0, 0, M.W, M.H).data;
  const seen = new Map();
  let n = 0;
  for (let y = 10; y < M.H; y += 30) for (let x = 10; x < M.W; x += 30) {
    const k = (y * M.W + x) * 4, key = (d[k] >> 4) + ',' + (d[k + 1] >> 4) + ',' + (d[k + 2] >> 4);
    seen.set(key, (seen.get(key) || 0) + 1); n++;
  }
  return 1 - Math.max(...seen.values()) / n;
};
for (const style of M.ORDER) {
  M.render({ seed: 'moving-test', style });
  const still = M.fingerprint();
  M.paintAt(0);
  const again = M.fingerprint();
  M.paintAt(3);
  const moved = M.fingerprint();
  const times = [];
  for (let t = 4; t <= 8; t++) { const t0 = performance.now(); M.paintAt(t); M.fingerprint(); times.push(performance.now() - t0); }
  M.paintAt(0);
  const back = M.fingerprint();
  M.paintAt(0, Math.floor(M.play.scene.total / 2));
  const half = M.fingerprint(), halfInk = inkShare();
  M.paintAt(0, 0);
  const none = inkShare();
  const ms = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const problems = [];
  if (again !== still) problems.push('t=0 is not the still picture');
  if (moved === still) problems.push('nothing moved by t=3');
  if (back !== still) problems.push('back at t=0 it differs');
  if (half === still || halfInk === 0) problems.push('half drawn looks ' + (half === still ? 'finished' : 'blank'));
  if (ms > 400) problems.push(ms + 'ms a frame');
  if (problems.length) pass = false;
  notes.push(style + (problems.length ? ' FAILED (' + problems.join(', ') + ')' : ' ok') + ' ' + ms + 'ms/frame, half drawn ' + Math.round(halfInk * 100) + '% ink, empty ' + Math.round(none * 100) + '%');
}
M.render({ seed: 'moving-test', style: 'kelly' });
return JSON.stringify({ pass, detail: notes.join('; ') });
