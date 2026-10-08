/* A patient rower tidies the whole lake.

   A bot plays three lakes in Node through the real verbs: row() with the two oars and
   help() held down, nothing else. It steers by a distance map over the water the boat can
   reach (so islands and bays are rowed round, not through), drifts in under its own glide
   to the young and the rafts so as not to startle them, waits beside the young until they
   trust it, keeps to a pace they can follow, empties the boat at the jetty when
   it is full, and leads the young home once none of their kind is left lost.

   The bar: every lake finished (all the litter in the crate, every duckling and cygnet
   with its mother, every friend home and every bird freed) inside an hour of game time.
   A lake that cannot be finished is the one failure that would never show on screen. */
import { createMere, GENTLE, HOLD_CAP, LITTER, YOUNG, CELL, wrapAngle } from '../../willow-mere/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const DT = 1 / 30, LIMIT = 3600;

function distanceMap(lake, tx, ty) {
  const { gw, gh, reach } = lake, d = new Float32Array(gw * gh).fill(1e9);
  let ti = Math.floor(tx / CELL), tj = Math.floor(ty / CELL);
  // a target in the reeds can sit just off the reachable water: start from the nearest cell that is
  if (!reach[tj * gw + ti]) {
    let best = null, bd = 1e9;
    for (let j = tj - 8; j <= tj + 8; j++) for (let i = ti - 8; i <= ti + 8; i++) {
      if (i < 0 || j < 0 || i >= gw || j >= gh || !reach[j * gw + i]) continue;
      const e = (i - ti) ** 2 + (j - tj) ** 2; if (e < bd) { bd = e; best = [i, j]; }
    }
    if (best) [ti, tj] = best;
  }
  const q = [tj * gw + ti]; d[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], i = k % gw, j = (k - i) / gw;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      const nk = nj * gw + ni; if (!reach[nk] || d[nk] < 1e9) continue;
      d[nk] = d[k] + 1; q.push(nk);
    }
  }
  return d;
}

// Walk downhill on the map a good way, then take the furthest point on that walk the boat
// can row to in a straight line.
function waypoint(m, map, x, y) {
  const { gw, gh } = m.lake;
  let i = Math.floor(x / CELL), j = Math.floor(y / CELL);
  const pts = [];
  for (let s = 0; s < 40; s++) {
    let bi = i, bj = j, bv = map[j * gw + i];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      if (map[nj * gw + ni] < bv) { bv = map[nj * gw + ni]; bi = ni; bj = nj; }
    }
    if (bi === i && bj === j) break;
    i = bi; j = bj; pts.push({ x: (i + 0.5) * CELL, y: (j + 0.5) * CELL });
  }
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k], n = Math.ceil(Math.hypot(p.x - x, p.y - y) / 8);
    let clear = true;
    for (let s = 1; s <= n && clear; s++) clear = m.sdAt(x + (p.x - x) * s / n, y + (p.y - y) * s / n) > 16;
    if (clear) return p;
  }
  return pts[0] || null;
}

function play(seed) {
  const log = { left: 0, startles: 0, bumps: 0, strokes: 0, rhythm: 0, trips: 0, full: 0 };
  const m = createMere({ seed, rnd: mulberry32(seed * 7 + 1), on: (ev, d) => {
    if (ev === 'startle') log.startles++;
    if (ev === 'bump') log.bumps++;
    if (ev === 'left') log.left++;
    if (ev === 'stroke') { log.strokes++; if (d.rhythm) log.rhythm++; }
    if (ev === 'full') log.full++;
  } });
  const S = m.S, lake = m.lake;
  let map = null, mapKey = '', stuck = 0, lastPos = { x: S.boat.x, y: S.boat.y }, backT = 0, wasDropping = false;
  let press = 0;   // a counter, so the bot lets go of a key now and then and presses again in time

  function choose() {
    const b = S.boat, near = (p) => Math.hypot(p.x - b.x, p.y - b.y);
    const aboard = S.friends.find((f) => f.state === 'aboard');
    if (aboard) return { ...lake.homes[aboard.kind].anchor, why: 'home ' + aboard.kind };
    const loose = S.litter.filter((l) => l.state === 'water');
    if (m.holdWeight() >= HOLD_CAP - 1 || (S.hold.length && !loose.length) || (S.hold.length && wasDropping)) return { ...lake.jetty.end, why: 'jetty', stop: true };
    if (S.chain.length) {
      const kind = S.young[S.chain[0]].kind;
      const lost = S.young.filter((y) => y.kind === kind && (y.state === 'lost' || y.state === 'startle'));
      if (!lost.length || S.chain.length >= 4) return { ...lake.nests[YOUNG[kind].mother].anchor, why: 'mother' };
    }
    const options = [];
    for (const l of loose) if (m.holdWeight() + LITTER[l.kind].w <= HOLD_CAP) options.push({ x: l.x, y: l.y, why: 'litter', d: near(l) });
    for (const y of S.young) if (y.state === 'lost') options.push({ x: y.x, y: y.y, why: 'young', gentle: true, d: near(y) * 0.9 });
    for (const f of S.friends) if (f.state === 'adrift') options.push({ x: f.rx, y: f.ry, why: 'raft', gentle: true, d: near({ x: f.rx, y: f.ry }) });
    for (const t of S.tangled) if (t.state === 'tangled') options.push({ x: t.x, y: t.y, why: 'tangled', stop: true, d: near(t) });
    if (!options.length) return S.hold.length ? { ...lake.jetty.end, why: 'jetty', stop: true } : null;
    options.sort((a, c) => a.d - c.d);
    return options[0];
  }

  let target = null;
  for (let t = 0; t < LIMIT && !S.done; t += DT) {
    const b = S.boat;
    if (Math.round(t / DT) % 15 === 0) {
      target = choose();
      if (target) {
        const key = Math.floor(target.x / 24) + ',' + Math.floor(target.y / 24);
        if (key !== mapKey) { map = distanceMap(lake, target.x, target.y); mapKey = key; }
      }
    }
    wasDropping = S.hold.length > 0 && Math.hypot(b.x - lake.jetty.end.x, b.y - lake.jetty.end.y) < 120;
    let L = false, R = false, back = false, helping = false;
    if (target) {
      const d = Math.hypot(target.x - b.x, target.y - b.y), v = m.speed();
      const wp = d < 90 ? target : (waypoint(m, map, b.x, b.y) || target);
      const err = wrapAngle(Math.atan2(wp.y - b.y, wp.x - b.x) - b.a);
      // anything lost nearby: come in on the glide
      const youngNear = S.young.some((y) => y.state === 'lost' && Math.hypot(y.x - b.x, y.y - b.y) < 190);
      let row = true;
      if ((target.gentle || youngNear) && d < 200 && v > GENTLE * 0.55) row = false;
      // beside a lost one: sit still and let it decide
      if (target.why === 'young' && d < 55) row = false;
      // coming in too quick: back water to brake, as a person would
      if (target.why === 'young' && d < 130 && v > 26) { row = false; back = true; }
      // with little ones behind, a steady pace they can keep up with
      if (S.chain.length && v > 62) row = false;
      if (target.stop && d < 70) { row = v > 25 && Math.abs(err) > 2.4; back = v > 25 && Math.abs(err) < 1; if (target.why === 'tangled') helping = true; }
      if (row) {
        if (Math.abs(err) > 0.35) { if (err > 0) L = true; else R = true; }
        else { L = true; R = true; }
      }
      if (backT > 0) { backT -= DT; L = R = false; back = true; }
      press++;
      if (press % 70 === 0) { L = R = false; }   // let go now and then: the next press lands in time
    }
    if (m.oars.L.ph < 0 && m.oars.R.ph < 0 && !L && !R) void 0;
    m.row({ L, R, back });
    m.help(helping);
    m.step(DT);
    if (Math.round(t / DT) % 120 === 0) {
      if (Math.hypot(b.x - lastPos.x, b.y - lastPos.y) < 10 && target && !(target.stop && Math.hypot(target.x - b.x, target.y - b.y) < 80) && !target.gentle) { stuck++; if (stuck >= 2) { backT = 1.2; stuck = 0; } }
      else stuck = 0;
      lastPos = { x: b.x, y: b.y };
    }
  }
  const p = m.progress();
  return { seed, done: S.done, t: Math.round(S.clock), p, log, lake: `${lake.bays.length} bays, ${lake.islands.length} island${lake.islands.length > 1 ? 's' : ''}` };
}

export default function () {
  const runs = [11, 404, 2026].map(play);
  const problems = runs.filter((r) => !r.done).map((r) => `seed ${r.seed} unfinished after ${r.t}s: litter ${r.p.tidied}/${r.p.litter}, ducklings ${r.p.ducklings}/${r.p.ducklingsOf}, cygnets ${r.p.cygnets}/${r.p.cygnetsOf}, helped ${r.p.helped}/${r.p.helpOf}`);
  const strokes = runs.reduce((s, r) => s + r.log.strokes, 0), rhythm = runs.reduce((s, r) => s + r.log.rhythm, 0);
  if (!rhythm) problems.push('no stroke was ever in time: the rhythm press never lands');
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed} (${r.lake}): ${r.done ? 'finished' : 'not finished'} in ${Math.floor(r.t / 60)}m${r.t % 60}s, ${r.log.startles} startles, ${r.log.left} left behind, ${r.log.bumps} bumps`).join('; ') +
      `; ${strokes} strokes, ${rhythm} in time`,
  };
}
