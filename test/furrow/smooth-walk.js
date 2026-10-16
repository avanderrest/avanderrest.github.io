/* Walking as someone looks smooth (Amber, 2026-10-16: "when you live as someone and walk
   around it feels a little jittery"). Walk left for two seconds at 60 frames a second and
   watch two things on screen, in screen pixels: where the walker is drawn (once the camera has
   caught up it should hold still, not wobble by a zoomed pixel), and how far the ground moves
   each frame (even steps, not 0, 5, 5, 0, 5). */
const F = window.furrow;
F.seed(3);
F.newGame(4242);
F.quickStart();
const S = F.S, T = 16;
F.hours(23.2);                                   // day 2, 06:15
const nell = F.V.find((v) => v.name === 'Nell');
F.liveAs(nell);
F.render();
const x0 = nell.x;
F.press('left');
const me = [], ground = [];
let lastG = null;
for (let i = 0; i < 120; i++) {
  F.step(1 / 60); F.render();
  const z = F.zoom, sh = F.shown, cx = Math.floor(sh.x);
  // as drawPerson places her, then shifted by the blit
  const px = Math.round(nell.x * T - cx) * z - Math.round(sh.fx * z);
  const g = -sh.x * z;
  if (i >= 60) { me.push(px); if (lastG !== null) ground.push(Math.round(g) - Math.round(lastG)); }
  lastG = g;
}
F.release('left');
const moved = Math.abs(nell.x - x0);
// the camera may still drift a little (path to grass changes the pace); jitter is a jump back and forth
const jumps = me.slice(1).map((p, i) => Math.abs(p - me[i]));
const wobble = Math.max(...jumps);
const stepSpread = Math.max(...ground) - Math.min(...ground);
const ok = moved > 2 && wobble <= 2 && stepSpread <= 2;
return JSON.stringify({ pass: ok, detail: 'walked ' + moved.toFixed(1) + ' tiles at zoom ' + F.zoom + '; walker moves at most ' + wobble.toFixed(1) + 'px a frame on screen; ground steps ' + [...new Set(ground)].join('/') + 'px a frame' });
