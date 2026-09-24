/* The fog: see clearly only as far as the old phone screen reached, and past that nothing
   but light, blurred, and blurrier the further out it is.

   Every part of that can go wrong while the game still plays fine. A mask built for the
   wrong canvas size puts the clear view off-centre or the size of a stamp; a glow layer
   that is composited without its mask draws a second copy of every lamp in the middle of
   the view; one that is drawn at full resolution is just the scene again, sharp, so the fog
   hides nothing. So this reads real pixels off a rendered frame rather than asking the code
   what it meant to do:

     - a lamp far out in the fog shows as a glow, and fog with no light in it is black;
     - the far glow has no hard edges, where a lamp in the clear view does;
     - put the far lamp out and its glow goes with it, so the glow is the lamp and not
       something painted where the lamp happens to be;
     - the clear view is still about the size of the old 176x196 screen. */
const B = window.__blackout;
const C = B.consts;
const notes = [];
const checks = [];
const check = (name, got) => { checks.push(got); notes.push(name + ' ' + (got ? 'ok' : 'FAILED')); };

B.newGame();
B.start();
// nothing else lit: no guards, no cameras, and only the two lamps placed here
B.guards.forEach((g) => { g.x = -100; });
B.state.cameras.forEach((c) => { c.alive = false; });
B.state.lamps.forEach((l) => { l.on = false; });
B.teleport(8, 15);
B.state.msgT = 0;
B.state.shake = 0;

const view = B.view();
const near = B.state.lamps[0], far = B.state.lamps[1];
near.x = 11; near.y = 11.2; near.on = true;                // a few tiles off, in plain sight
far.x = 8 + 13; far.y = 11.2; far.on = true;              // well out in the fog, same height
B.tick(1 / 60, 1);
B.renderNow();

const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');
const bright = (x, y) => {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return Math.max(d[0], d[1], d[2]);
};
// the biggest jump in brightness between neighbouring pixels in a small patch
const edge = (cx, cy, r) => {
  const x0 = Math.round(cx) - r, y0 = Math.round(cy) - r, n = 2 * r + 1;
  const d = ctx.getImageData(x0, y0, n, n).data;
  const at = (i, j) => { const k = (j * n + i) * 4; return Math.max(d[k], d[k + 1], d[k + 2]); };
  let most = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (i + 1 < n) most = Math.max(most, Math.abs(at(i, j) - at(i + 1, j)));
    if (j + 1 < n) most = Math.max(most, Math.abs(at(i, j) - at(i, j + 1)));
  }
  return most;
};

const nearS = B.screenOf(near.x, near.y), farS = B.screenOf(far.x, far.y);
const farDepth = B.fogAt(farS.x, farS.y), nearDepth = B.fogAt(nearS.x, nearS.y);
const onCanvas = farS.x > 10 && farS.x < view.w - 10;
check('the far lamp is out in the fog, and on the canvas', onCanvas && farDepth > 1.3);
check('the near lamp is in the clear view', nearDepth < 0.8);

const farGlow = bright(farS.x, farS.y);
const nearGlow = bright(nearS.x, nearS.y - 1);
// the same distance out on the other side: past the end of the map, nothing lit
const emptyFog = bright(2 * view.cx - farS.x, farS.y);
// A hint, not a light: at full strength a lamp in the fog was nearly as bright as
// one in the view and pulled the eye out of the game. It has to be there, and faint.
check('a lamp out in the fog shows through it', farGlow > 12);
check('but only as a hint', farGlow < nearGlow * 0.4);
check('fog with no light in it is black', emptyFog < 8);

const farEdge = edge(farS.x, farS.y, 3), nearEdge = edge(nearS.x, nearS.y - 1, 3);
check('out in the fog it is blurred', farEdge < 25);
check('in the clear view it is sharp', nearEdge > 60);

far.on = false;
B.tick(1 / 60, 1);
B.renderNow();
const farAfter = bright(farS.x, farS.y);
check('put the lamp out and the glow goes', farAfter < farGlow * 0.3);

// the size: the old screen's edges sit in the fade band, its middle is clear
const halfW = C.T * 5.5, halfH = 196 / 2;                 // 176 x 196, the old view
const sideDepth = B.fogAt(view.cx + halfW, view.cy);
const topDepth = B.fogAt(view.cx, view.cy - halfH);
check('the clear view is about the old screen\'s size',
  B.fogAt(view.cx, view.cy) === 0 && sideDepth > 0.8 && sideDepth < 1.12 && topDepth > 0.8 && topDepth < 1.12);

const pass = checks.every(Boolean);
return JSON.stringify({
  pass,
  detail: notes.join(' | ') + ' | canvas ' + view.w + 'x' + view.h
    + ', near lamp ' + nearGlow + ', far lamp at depth ' + farDepth.toFixed(2) + ' glow ' + farGlow + ' -> ' + farAfter
    + ', empty fog ' + emptyFog + ', edges near ' + nearEdge + ' far ' + farEdge
    + ', old screen edge at depth ' + sideDepth.toFixed(2) + '/' + topDepth.toFixed(2),
});
