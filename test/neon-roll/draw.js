/* What the camera shows has to include the track and the ball.

   Everything is painted on one canvas and nothing about a bad frame throws:
   a camera that zooms or pans the wrong way, a track drawn in the sky's
   colour, a ball drawn off-screen all render without an error. This lets a
   real run go for a few seconds, then reads pixels back: the tube must be lit
   where the track passes under the middle of the screen, the ball must be lit
   where it is, and the sky well above the track must stay dark. */
return (async () => {
  const N = window.__neonRoll;
  const problems = [], notes = [];
  const frames = (n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });

  N.start('endless', { seed: 777, noChase: true });
  N.freeze(true);
  N.step(4);
  N.freeze(false);
  N.freeze(true);                          // hold the world still; drawing carries on
  await frames(4);

  const cv = document.getElementById('screen'), g = cv.getContext('2d');
  const { W, H, DPR } = N.view, cam = N.cam;
  const sx = (X) => (X - cam.x) * cam.s + W / 2, sy = (Y) => H / 2 - (Y - cam.y) * cam.s;
  // brightest pixel in a small square around a screen point
  function lum(x, y, r = 4) {
    const px = Math.round(x * DPR), py = Math.round(y * DPR), rr = Math.round(r * DPR);
    if (px < rr || py < rr || px >= cv.width - rr || py >= cv.height - rr) return -1;
    const d = g.getImageData(px - rr, py - rr, rr * 2 + 1, rr * 2 + 1).data;
    let best = 0;
    for (let i = 0; i < d.length; i += 4) best = Math.max(best, 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    return Math.round(best);
  }

  // the tube under the middle of the screen (or the nearest solid bit of it)
  let tube = -1, X0 = cam.x;
  for (let k = 0; k < 40 && tube < 0; k++) {
    const X = cam.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 20;
    const gr = N.ground(X);
    if (gr) { tube = lum(sx(X), sy(gr.y)); X0 = X; }
  }
  const b = N.state.ball;
  const ball = lum(sx(b.x + b.offx), sy(b.y + b.offy), 6);
  const gr0 = N.ground(X0);
  const skyY = Math.min(sy(gr0.y), sy(b.y + b.offy)) - 160;
  const sky = skyY > 60 ? lum(sx(X0), skyY, 2) : null;

  if (tube < 180) problems.push(`the tube is not lit where the track is (${tube})`);
  if (ball < 150) problems.push(`the ball is not lit where it is (${ball})`);
  if (sky !== null && sky > 120) problems.push(`the sky above the track is bright (${sky})`);
  notes.push(`tube ${tube}, ball ${ball}, sky ${sky === null ? 'n/a' : sky}, zoom ${cam.s.toFixed(2)}`);

  N.freeze(false);
  N.setMode('endless');
  return JSON.stringify({ pass: problems.length === 0, detail: `${problems.join('; ') || 'ok'} | ${notes.join('; ')}` });
})();
