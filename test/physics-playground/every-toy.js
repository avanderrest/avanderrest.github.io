/* Every tab opens, runs and draws something, in the real page. Each flat toy's canvas
   is sampled for how many colours it holds (a blank or one-colour canvas fails); the
   sand tray waits for three.js and checks its WebGL canvas the same way. The runner fails the case on any
   console error too. */
const P = window.__playground;
const out = [], bad = [];
function colours(canvas) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 40;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0, 64, 40);
  const d = g.getImageData(0, 0, 64, 40).data, set = new Set();
  for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
  return set.size;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const toy of ['gummy', 'lava', 'pendulum']) {
  P.show(toy);
  await wait(400);
  P.run(1.5);
  const n = colours(document.getElementById('c2d'));
  out.push(`${toy} ${n}`);
  if (n < 12) bad.push(`${toy} drew only ${n} colours`);
}
P.show('sand');
await P.sandReady();
const sand = P.pg.toys.sand;
sand.drop('cube', 40, 48); sand.drop('ball', 62, 40);
await wait(1200);
const ns = colours(document.getElementById('c3d'));
out.push(`sand ${ns}`);
if (ns < 12) bad.push(`the sand tray drew only ${ns} colours`);
P.show('gummy');
return JSON.stringify({ pass: !bad.length, detail: (bad.length ? bad.join(' | ') + ' -- ' : '') + out.join(' · ') });
