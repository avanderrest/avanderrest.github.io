/* Every toy played through its real verbs, in Node, on seeded dice.

   gummy     five bears settle; one is pulled by the hand and let go, and must spring back
             to its rest shape and keep its area (the shape matching keeps volume); a
             thumped table must not leave any bear torn or out of the room
   lava      a blob is sliced in two and must pull itself back into one
   sand      every shape is dropped; the volume of sand is kept exactly, a lifted cube
             leaves a print, and heavy shapes sink deeper than light ones
   pendulum  without friction the energy holds over 20s; the first ghost drifts at least
             a thousandfold from 1e-3 rad; with friction the energy falls
   sand pendulum  draws a line of coloured sand, and the volume (funnel included) holds
   ink       drops keep their area exactly, strokes feather the outlines, the water stills
   bubbles   slow waves blow fewer, bigger bubbles; they stick into foam; taps and time pop them
   curtain   hangs still; a gentle tug does not tear it, a yank does; a slash drops the
             cloth below it; a ring dragged along the rail draws the curtain open */
import { createPlayground, createLava, createGummies, createSandbox, createInk, createBubbles, createCurtain, SAND_SHAPES, STRANDS } from '../../physics-playground/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const run = (toy, s, dt = 1 / 60) => { for (let t = 0; t < s; t += dt) toy.step(dt); };

export default function () {
  const problems = [], notes = [];
  const pg = createPlayground({ rnd: mulberry32(2026) });
  const { gummy, sand, pendulum } = pg.toys;
  // the lava gets its own dice, so its layout does not hang on how many the bears used
  const lava = createLava({ rnd: mulberry32(7) });

  // ---------- gummy ----------
  run(gummy, 4);
  const rest = gummy.bears.map((b) => gummy.strain(b));
  const area0 = gummy.bears.map((b) => gummy.area(b));
  if (Math.max(...rest) > 1.2) problems.push(`bears at rest are strained ${Math.max(...rest).toFixed(2)}`);
  const b = gummy.bears[2], hand = b.p[8], hx = hand.x, hy = hand.y;
  gummy.grab(hand.x, hand.y);
  let maxArm = 0, minArmR = 99;
  const armRest = gummy.strandRadius(b, 1);
  for (let i = 0; i < 50; i++) {
    gummy.drag(hx - 150 * Math.min(1, i / 30), hy - 90 * Math.min(1, i / 30)); gummy.step(1 / 60);
    const held = gummy.bears.at(-1);
    maxArm = Math.max(maxArm, gummy.strain(held)); minArmR = Math.min(minArmR, gummy.strandRadius(held, 1));
  }
  gummy.release();
  run(gummy, 4);
  const back = gummy.bears.map((x) => gummy.strain(x));
  if (Math.max(...back) > 1.5) problems.push(`a bear did not spring back (strain ${Math.max(...back).toFixed(2)})`);
  if (minArmR > armRest * 0.8) problems.push(`the pulled arm never thinned (radius ${minArmR.toFixed(1)} from ${armRest.toFixed(1)})`);
  gummy.thump(1.4);
  run(gummy, 5);
  const ratios = gummy.bears.map((x) => gummy.area(x) / area0[gummy.bears.indexOf(x)] || 1);
  const out = gummy.bears.filter((x) => { const [x0, y0, x1, y1] = gummy.bbox(x); return x0 < gummy.x0 - 5 || x1 > gummy.x1 + 5 || y1 > gummy.FLOOR + 5 || y0 < -400; });
  if (out.length) problems.push(`${out.length} bears left the room`);
  const torn = gummy.bears.filter((x) => gummy.strain(x) > 2);
  if (torn.length) problems.push(`${torn.length} bears stayed torn after the thump`);
  // shaken hard by the head, then the hand: the candy may stretch thin but never part
  let thinnest = 99;
  for (const part of [0, 8]) {
    const sb = gummy.bears[0];
    gummy.grab(sb.p[part].x, sb.p[part].y);
    for (let i = 0; i < 120; i++) {
      gummy.drag(600 + 500 * Math.sin(i / 60 * 75), 300 + 300 * Math.cos(i / 60 * 37));
      gummy.step(1 / 60);
      const held = gummy.bears.at(-1);
      STRANDS.forEach((_, k) => { thinnest = Math.min(thinnest, gummy.strandRadius(held, k)); });
    }
    gummy.release();
    run(gummy, 4);
  }
  const shaken = Math.max(...gummy.bears.map((x) => gummy.strain(x)));
  if (thinnest < 3) problems.push(`a shaken bear came apart (a joint thinned to ${thinnest.toFixed(1)})`);
  if (shaken > 1.5) problems.push(`a shaken bear did not recover (strain ${shaken.toFixed(2)})`);
  // the walls are wherever the page puts the screen's edges
  const wide = createGummies({ rnd: mulberry32(3) });
  wide.setBounds(-300, 1500);
  const far = wide.addBear({ x: -300, y: 200 });
  let fx0 = Infinity;
  for (let i = 0; i < 180; i++) { wide.step(1 / 60); fx0 = Math.min(fx0, wide.bbox(far)[0]); }
  if (fx0 < -305) problems.push(`a bear went through the wide left wall (to ${fx0.toFixed(0)})`);
  if (fx0 > -150) problems.push(`a bear never used the room past the old wall (got to ${fx0.toFixed(0)})`);
  notes.push(`gummy: shaken hard, thinnest joint ${thinnest.toFixed(1)}, recovered to ${shaken.toFixed(2)}; a bear by the wide left wall reached x ${fx0.toFixed(0)} (wall at -300)`);
  notes.push(`gummy: rest strain ≤${Math.max(...rest).toFixed(2)}, pulled ${maxArm.toFixed(1)} with the arm thinned ${armRest.toFixed(1)} → ${minArmR.toFixed(1)}, back to ≤${Math.max(...back).toFixed(2)}; area kept ${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}`);

  // ---------- lava ----------
  lava.reset(); lava.n = 0; lava.blob(600, 560, 420); lava.lamp = false; lava.gravity = 0.5;
  run(lava, 8);
  const pool = lava.blobs();
  // slice the biggest blob down its middle, as one drag would
  let mx = 0, top = Infinity, bottom = 0;
  for (let i = 0; i < lava.n; i++) { mx += lava.x[i]; }
  mx /= lava.n;
  for (let i = 0; i < lava.n; i++) if (Math.abs(lava.x[i] - mx) < 30) { top = Math.min(top, lava.y[i]); bottom = Math.max(bottom, lava.y[i]); }
  for (let y = top - 40; y < bottom + 40; y += 12) { lava.blade(mx, y, mx, y + 12, 16); lava.step(1 / 60); }
  const cut = lava.blobs();
  run(lava, 10);
  const healed = lava.blobs();
  const fast = lava.maxSpeed();
  if (!(cut > pool)) problems.push(`slicing did not cut the blob (${pool} → ${cut})`);
  if (healed > pool) problems.push(`the sliced blob did not join back up (${healed} blobs, was ${pool})`);
  if (!(fast < 20)) problems.push(`lava particles are flying at ${fast}`);
  lava.reset(); lava.lamp = true;
  run(lava, 10);
  const ys = Array.from(lava.y.slice(0, lava.n));
  const spread = Math.max(...ys) - Math.min(...ys);
  if (spread < 150) problems.push(`the lamp is not moving the lava (spread ${spread.toFixed(0)})`);
  notes.push(`lava: pool ${pool} → sliced ${cut} → healed ${healed}; lamp spread ${spread.toFixed(0)}px`);

  // ---------- sand ----------
  const v0 = sand.volume();
  const sunkBy = {};
  Object.keys(SAND_SHAPES).forEach((k, i) => {
    const s = sand.drop(k, 14 + (i % 3) * 32, 24 + Math.floor(i / 3) * 44, { yaw: 0 });
    run(sand, 3);
    sunkBy[k] = (14 - s.y).toFixed(1);
    if (s.state !== 'rest') problems.push(`${k} never came to rest`);
  });
  const cube = sand.shapes.find((s) => s.kind === 'cube');
  const cx = Math.round(cube.x), cz = Math.round(cube.z);
  sand.lift(cube.id); run(sand, 2);
  const inside = sand.h[cz * sand.N + cx], rim = sand.heightAt(cube.x + cube.size, cube.z);
  if (!(rim - inside > 2)) problems.push(`the cube left no print (inside ${inside.toFixed(1)}, rim ${rim.toFixed(1)})`);
  const drift = Math.abs(sand.volume() - v0) / v0;
  if (drift > 1e-4) problems.push(`sand volume drifted ${(drift * 100).toFixed(3)}%`);
  const ball = sand.shapes.find((s) => s.kind === 'ball'), puck = sand.shapes.find((s) => s.kind === 'cylinder');
  if (!(ball.y < puck.y)) problems.push(`the steel ball (${ball.y.toFixed(1)}) did not sink below the puck (${puck.y.toFixed(1)})`);
  notes.push(`sand: sank ${Object.entries(sunkBy).map(([k, v]) => k + ' ' + v).join(', ')}; cube print ${(rim - inside).toFixed(1)} deep; volume drift ${(drift * 100).toExponential(1)}%`);

  // ---------- pendulum ----------
  pendulum.set('friction', 0); pendulum.set('ghosts', 3);
  pendulum.start(2.2, 2.6);
  const e0 = pendulum.energy();
  run(pendulum, 20);
  const e1 = pendulum.energy();
  const edrift = Math.abs(e1 - e0) / Math.abs(e0);
  const sepMax = Math.max(...pendulum.sep);
  if (edrift > 1e-3) problems.push(`energy drifted ${(edrift * 100).toFixed(3)}% in 20s`);
  if (!(sepMax > 0)) problems.push(`the ghost stayed within ${Math.pow(10, sepMax).toExponential(1)} rad`);
  pendulum.set('friction', 0.2); pendulum.start(2.2, 2.6);
  const f0 = pendulum.energy(); run(pendulum, 10);
  if (!(pendulum.energy() < f0 - 1)) problems.push('friction did not take energy out');
  notes.push(`pendulum: energy drift ${(edrift * 100).toExponential(1)}% over 20s; ghost drift reached 10^${sepMax.toFixed(1)} rad from 10^-3`);

  // ---------- sand pendulum ----------
  const tray = createSandbox({ rnd: mulberry32(6) });
  tray.swingHold(30, 40); tray.swingLet(10, 25);
  run(tray, 20);
  let tinted = 0; for (const t of tray.tint) if (t > 0.2) tinted++;
  const sdrift = Math.abs(tray.volume() - tray.volume0) / tray.volume0;
  if (tinted < 60) problems.push(`the sand pendulum drew only ${tinted} cells`);
  if (sdrift > 1e-4) problems.push(`with the pendulum, sand volume drifted ${(sdrift * 100).toFixed(3)}%`);
  notes.push(`sand pendulum: ${tray.swing.poured.toFixed(0)} poured over ${tinted} cells in 20s, volume drift ${(sdrift * 100).toExponential(1)}%`);

  // ---------- marbled ink ----------
  // a drop pushes the ones round it out without changing their area; one landing inside
  // another adds its own area to it; stroking feathers the outlines; the water stills
  const ink = createInk({ rnd: mulberry32(8) });
  const first = ink.drop(300, 300, 40); ink.release();
  const a0 = ink.area(first);
  ink.drop(600, 300, 40); ink.release();
  const a1 = ink.area(first);
  ink.drop(300, 300, 30); ink.release();
  const a2 = ink.area(first), want = a0 + Math.PI * 900;
  if (Math.abs(a1 - a0) / a0 > 0.005) problems.push(`a drop beside another changed its area ${a0.toFixed(0)} → ${a1.toFixed(0)}`);
  if (Math.abs(a2 - want) / want > 0.01) problems.push(`a drop inside another made it ${a2.toFixed(0)}, not ${want.toFixed(0)}`);
  const p0 = ink.perimeter(first);
  for (let i = 0; i < 60; i++) { ink.comb(100 + i * 15, 100, 100 + (i + 1) * 15, 108); ink.step(1 / 60); }
  for (let i = 0; i < 40; i++) { ink.stylus(300, 150 + i * 8, 300, 158 + i * 8); ink.step(1 / 60); }
  const a3 = ink.area(first), p1 = ink.perimeter(first);
  run(ink, 3);
  if (Math.abs(a3 - a2) / a2 > 0.05) problems.push(`stroking changed the ink's area by ${((a3 / a2 - 1) * 100).toFixed(1)}%`);
  if (!(p1 > p0 * 2)) problems.push(`stroking did not draw the ink out (outline ${p0.toFixed(0)} → ${p1.toFixed(0)})`);
  if (!ink.still) problems.push(`the water was still moving 3s after the last stroke (${ink.maxSpeed().toFixed(1)})`);
  notes.push(`ink: areas ${a0.toFixed(0)} → ${a1.toFixed(0)} → ${a2.toFixed(0)} (want ${want.toFixed(0)}), stroked ${((a3 / a2 - 1) * 100).toFixed(1)}%; outline ${p0.toFixed(0)} → ${p1.toFixed(0)}; ${ink.points} corners`);

  // ---------- soap bubbles ----------
  const bb = createBubbles({ rnd: mulberry32(4) });
  const wave = (speed, s) => {
    bb.wandDown(200, 300); let x = 200, d = 1;
    for (let i = 0; i < s * 60; i++) { x += d * speed / 60; if (x > 1000 || x < 200) d = -d; bb.wandTo(x, 300 + 40 * Math.sin(i / 20)); bb.step(1 / 60); }
    bb.wandUp();
  };
  const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  wave(150, 3); const slow = bb.bubbles.map((b) => b.r); bb.popAll();
  wave(900, 3); const quick = bb.bubbles.map((b) => b.r);
  run(bb, 6);
  const foam = bb.links.size;
  if (!(mean(slow) > mean(quick) * 1.5 && quick.length > slow.length)) problems.push(`slow waves (${slow.length}, r ${mean(slow).toFixed(0)}) are not fewer, bigger bubbles than quick ones (${quick.length}, r ${mean(quick).toFixed(0)})`);
  if (foam < 5) problems.push(`the bubbles did not stick into foam (${foam} walls)`);
  const before = bb.bubbles.length, target = bb.bubbles.at(-1);
  bb.popAt(target.x, target.y);
  if (bb.bubbles.length !== before - 1) problems.push('tapping a bubble did not pop it');
  for (let i = 0; i < 120; i++) { bb.blow(0.6); bb.step(1 / 60); }
  const made = bb.made; bb.blow(0);
  run(bb, 90);
  if (bb.bubbles.length > 3) problems.push(`${bb.bubbles.length} bubbles never popped in 90s`);
  notes.push(`bubbles: slow wave ${slow.length} at r ${mean(slow).toFixed(0)}, quick ${quick.length} at r ${mean(quick).toFixed(0)}; ${foam} foam walls; ${made} made in all`);

  // ---------- curtain ----------
  const ct = createCurtain({ rnd: mulberry32(5) });
  ct.setWind(0); run(ct, 4);
  const still = ct.maxSpeed();
  const corner = ct.at(0, 12, ct.ROWS - 1);
  ct.grab(ct.x[corner], ct.y[corner]);
  for (let k = 0; k < 60; k++) { ct.drag(ct.x[corner] + 2, ct.y[corner] + 1); ct.step(1 / 60); }
  ct.release();
  const gentle = ct.torn;
  ct.grab(ct.x[corner], ct.y[corner]);
  for (let k = 0; k < 30; k++) { ct.drag(300 - k * 20, 740); ct.step(1 / 60); }
  ct.release();
  const yanked = ct.torn;
  ct.hang(); run(ct, 2);
  const cuts = ct.slash(140, 400, 560, 410); run(ct, 3);
  let fell = 0; for (let k = 0; k < ct.COLS * ct.ROWS; k++) if (ct.y[k] > ct.FLOOR - 5) fell++;
  ct.hang(); run(ct, 1);
  const ring = ct.at(0, ct.COLS - 1, 0);
  ct.grab(ct.x[ring], ct.y[ring]);
  for (let k = 0; k < 90; k++) { ct.drag(ct.x[ring] - 5, ct.RAIL); ct.step(1 / 60); }
  ct.release();
  let inner = 0; for (let c = 0; c < ct.COLS; c++) inner = Math.max(inner, ct.x[ct.at(0, c, 0)]);
  if (still > 20) problems.push(`the curtain still moves at ${still.toFixed(0)}/s in still air`);
  if (gentle) problems.push(`a gentle tug tore ${gentle} threads`);
  if (!(yanked > gentle)) problems.push('a hard yank tore nothing');
  if (cuts < 10 || fell < 50) problems.push(`a slash cut ${cuts} threads and dropped ${fell} points to the floor`);
  if (!(inner < 330)) problems.push(`drawing the curtain open left its inner ring at ${inner.toFixed(0)}`);
  notes.push(`curtain: settles to ${still.toFixed(1)}/s; gentle tug tore ${gentle}, a yank ${yanked}; a slash cut ${cuts} and dropped ${fell}; drawn open to ${inner.toFixed(0)}`);

  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join(' · ') };
}
