/* The young are collected, not handed over.

   No duckling or cygnet starts anywhere near the boat (over 300 lakes). A lost duckling
   does not follow a boat gliding past it, only one that waits nearly still beside it for
   a moment; once following, rowing gently keeps it, and racing off flat out leaves it
   behind, lost again where it stopped. */
import { createMere, TRUST_TIME } from '../../willow-mere/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const DT = 1 / 60;
export default function () {
  const problems = [];
  let closest = 1e9;
  for (let seed = 1; seed <= 300; seed++) {
    const m = createMere({ seed });
    for (const y of m.S.young) closest = Math.min(closest, Math.hypot(y.x - m.lake.start.x, y.y - m.lake.start.y));
  }
  if (closest < 400) problems.push(`a young one started ${closest | 0}px from the boat`);

  // open water, one duckling, the boat gliding past at a gentle 45 px/s
  const fresh = () => {
    const m = createMere({ seed: 515, rnd: mulberry32(3) }), S = m.S;
    let best = null;
    for (let y = 300; y < 1500; y += 20) for (let x = 300; x < 2100; x += 20) { const d = m.sdAt(x, y); if (!best || d > best.d) best = { x, y, d }; }
    for (const o of S.young) { o.x = o.hx = 100; o.y = o.hy = 100; o.state = 'home'; }
    const y = S.young[0]; y.state = 'lost'; y.x = y.hx = best.x; y.y = y.hy = best.y;
    return { m, S, y, best };
  };
  let { m, S, y, best } = fresh();
  Object.assign(S.boat, { x: best.x - 150, y: best.y + 30, a: 0, vx: 45, vy: 0, w: 0 });
  for (let i = 0; i < 6 * 60; i++) { m.row({}); m.step(DT); if (m.speed() < 44) { const k = 45 / Math.max(1, m.speed()); S.boat.vx *= k; S.boat.vy *= k; } }
  if (y.state !== 'lost') problems.push(`gliding past at 45 px/s, the duckling ${y.state === 'follow' ? 'followed anyway' : 'was ' + y.state}`);

  // waiting beside it
  ({ m, S, y, best } = fresh());
  Object.assign(S.boat, { x: best.x - 50, y: best.y, a: 0, vx: 0, vy: 0, w: 0 });
  let waited = 0;
  while (y.state === 'lost' && waited < 5) { m.row({}); m.step(DT); waited += DT; }
  if (y.state !== 'follow') problems.push('waiting beside it for 5s did not win it over');
  else if (waited < TRUST_TIME * 0.9) problems.push(`it followed after only ${waited.toFixed(2)}s`);

  // a gentle row keeps it; flat out loses it
  ({ m, S, y, best } = fresh());
  Object.assign(S.boat, { x: best.x - 50, y: best.y, a: 0, vx: 0, vy: 0, w: 0 });
  for (let i = 0; i < 3 * 60; i++) { m.row({}); m.step(DT); }
  let gentleKept = true;
  for (let i = 0; i < 8 * 60; i++) { m.row({ L: i % 90 < 30, R: i % 90 < 30 }); m.step(DT); if (y.state !== 'follow') gentleKept = false; }
  if (!gentleKept) problems.push(`rowing gently (top ${m.speed().toFixed(0)} px/s) still lost it`);
  let lostAfter = null;
  for (let i = 0; i < 20 * 60 && lostAfter == null; i++) {
    m.row({ L: true, R: true }); m.step(DT);
    if (m.sdAt(S.boat.x + Math.cos(S.boat.a) * 120, S.boat.y + Math.sin(S.boat.a) * 120) < 40) S.boat.a += 0.03;   // keep off the banks
    if (y.state === 'lost') lostAfter = i * DT;
  }
  if (lostAfter == null) problems.push('20s rowing flat out never left the duckling behind');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `closest start ${closest | 0}px; glided past at 45 px/s: stayed lost; trusted after ${waited.toFixed(2)}s; gentle rowing kept it; flat out left it behind after ${lostAfter == null ? '-' : lostAfter.toFixed(1)}s`,
  };
}
