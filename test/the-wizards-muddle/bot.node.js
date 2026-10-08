/* A bot clears five messes through the same verbs as the page.

   For each riddle it searches like a player with a metal detector: pings on a coarse grid
   until something is warm, then closes in on whichever neighbour pings hotter, waiting for
   the detector to recharge when it runs dry. On "under" it digs: lifts whatever is on top
   at that spot and drops it on the floor further along, then taps again. After the eighth
   find it puts every thing on the floor away, side by side along whichever shelf or desk
   still has room, the way a tidy player would.

   Checks: every riddle is answerable (found within a sane number of pings), the heat words
   get hotter as the tap gets nearer, a buried answer reports "under" rather than a find,
   no mess (forty seeds) is ever more than three things deep, every thing in the mess is
   inside the room, a thing let go of in mid-air lands on a surface, all of them off the
   floor means "spotless", and the owl can read most riddles back. */
import { createStudy, THINGS, THING, HUNT, W, H, FLOOR, SURFACES, DEPTH, centre, contains, guess, scatter, deepest, onFloor } from '../../the-wizards-muddle/sim.js';

const RANK = { cold: 0, cool: 1, warm: 2, hot: 3, here: 4 };

function clear(seed) {
  const ev = {};
  const s = createStudy({ seed, on: (e) => { ev[e] = (ev[e] || 0) + 1; } });
  const problems = [];
  let pings = 0, digs = 0, buried = 0, waits = 0;
  // every thing in the room
  for (const it of s.S.items) {
    const t = THING[it.kind];
    if (it.x - t.w / 2 < 0 || it.x + t.w / 2 > W || it.y > H || it.y - t.h < 0) problems.push(`${it.kind} out of the room at (${it.x | 0}, ${it.y | 0})`);
  }
  const tap = (x, y) => {
    let r = s.ping(x, y);
    while (r.result === 'resting') { s.step(0.5); waits++; r = s.ping(x, y); }
    if (r.result === 'heat') pings++;
    return r;
  };
  for (let n = 0; n < HUNT; n++) {
    const c = s.next();
    if (!c) { problems.push(`no riddle ${n + 1}`); break; }
    const T = s.byKind(c.kind);
    // grid until warm
    let best = null;
    outer: for (let y = 120; y < H; y += 160) for (let x = 100; x < W; x += 200) {
      const r = tap(x, y);
      if (r.result === 'found') { best = { found: true }; break outer; }
      if (r.result === 'under' || (r.result === 'heat' && RANK[r.level] >= 2)) { best = { x, y, r }; break outer; }
      if (!best || (r.result === 'heat' && r.d < best.r.d)) best = { x, y, r };
    }
    if (!best.found) {
      // close in: step towards whichever neighbour is hotter
      let { x, y } = best, step = 60, found = false;
      for (let k = 0; k < 40 && !found; k++) {
        const m = centre(T);
        if (Math.hypot(x - m.x, y - m.y) < 20 || contains(T, x, y)) {
          const r = tap(m.x, m.y);
          if (r.result === 'found') { found = true; break; }
          if (r.result === 'under') {
            buried++;
            for (let g = 0; g < 12; g++) {
              const top = s.topAt(m.x, m.y);
              if (!top || top === T) break;
              s.lift(top); s.drop(top, (top.x + 260) % (W - 80) + 40, FLOOR.y0 + 40); digs++;
            }
            const r2 = tap(m.x, m.y);
            if (r2.result === 'found') { found = true; break; }
            problems.push(`${c.kind}: dug and still ${r2.result}`); break;
          }
        }
        let bestN = null;
        for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx > W || ny > H) continue;
          const r = tap(nx, ny);
          if (r.result === 'found') { found = true; break; }
          if (r.result === 'heat' && (!bestN || r.d < bestN.d)) bestN = { x: nx, y: ny, d: r.d };
          if (r.result === 'under') { bestN = { x: centre(T).x, y: centre(T).y, d: 0 }; break; }
        }
        if (found) break;
        if (bestN) { x = bestN.x; y = bestN.y; }
        step = Math.max(20, step * 0.8);
        if (Math.hypot(x - centre(T).x, y - centre(T).y) < 40) { x = centre(T).x; y = centre(T).y; }
      }
      if (!found) problems.push(`${c.kind} never found (seed ${seed})`);
    }
  }
  if (s.S.hunt.done.length !== HUNT) problems.push(`found ${s.S.hunt.done.length} of ${HUNT}`);
  if (!ev['hunt-done']) problems.push('no hunt-done');

  // let go of something in mid-air over a shelf: it lands on the shelf
  const any = s.S.items[0];
  s.lift(any);
  const sh = SURFACES[3];
  s.drop(any, (sh.x0 + sh.x1) / 2 + 30, sh.y - 40);
  if (Math.abs(any.y - sh.y) > 0.5 && !any.home) problems.push(`dropped over a shelf, landed at y ${any.y}`);
  s.lift(any); s.drop(any, 600, 200);
  if (!(any.y === FLOOR.y0 + 6 || SURFACES.some((q) => q.y === any.y))) problems.push(`dropped in mid-air, stuck at y ${any.y}`);

  // put everything away: side by side where there is room, squeezed in where there is not
  const used = SURFACES.map((q) => s.S.items.filter((it) => it.y === q.y && it.x >= q.x0 && it.x <= q.x1).map((it) => [it.x - THING[it.kind].w / 2, it.x + THING[it.kind].w / 2]));
  let squeezed = 0;
  for (const it of s.S.items.filter(onFloor).sort((a, b) => THING[b.kind].w - THING[a.kind].w)) {
    const w = THING[it.kind].w;
    let at = null;
    for (let i = 0; i < SURFACES.length && !at; i++) {
      const q = SURFACES[i];
      for (let x = q.x0 + w / 2 + 2; x <= q.x1 - w / 2 - 2; x += 4) if (!used[i].some(([a, b]) => x + w / 2 > a && x - w / 2 < b)) { at = { i, x }; break; }
    }
    if (!at) { squeezed++; const i = squeezed % SURFACES.length; at = { i, x: (SURFACES[i].x0 + SURFACES[i].x1) / 2 + (squeezed % 5) * 9 }; }
    used[at.i].push([at.x - w / 2, at.x + w / 2]);
    s.lift(it); s.drop(it, at.x, SURFACES[at.i].y - 30);
    if (onFloor(it)) problems.push(`${it.kind} let go of over a surface ended on the floor`);
  }
  if (s.putAway() !== THINGS.length) problems.push(`put away ${s.putAway()} of ${THINGS.length}`);
  if (ev.spotless !== 1) problems.push(`spotless came ${ev.spotless || 0} times`);
  return { problems, pings, digs, buried, waits, squeezed, stars: s.S.stars };
}

export default function () {
  const problems = [], notes = [];
  // never more than three deep, and the cat really does spread things about
  let worst = 0, floorShare = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const items = scatter(seed);
    worst = Math.max(worst, deepest(items));
    floorShare += items.filter(onFloor).length / items.length / 40;
  }
  if (worst > DEPTH) problems.push(`a mess was ${worst} deep`);
  notes.push(`40 messes: deepest ${worst}, ${(floorShare * 100).toFixed(0)}% on the floor`);
  // heat gets hotter as you near
  const s = createStudy({ seed: 3 });
  const c = s.next(), m = centre(s.byKind(c.kind));
  let last = -1, mono = true;
  for (const d of [600, 400, 250, 150, 80]) {
    const x = m.x + d < W ? m.x + d : m.x - d;
    s.S.charge = 5;
    const r = s.ping(x, m.y);
    if (r.result !== 'heat') continue;
    if (RANK[r.level] < last) mono = false;
    last = RANK[r.level];
  }
  if (!mono) problems.push('heat did not rise as the tap neared');

  let pings = 0, digs = 0, buried = 0, waits = 0, squeezed = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = clear(seed);
    problems.push(...r.problems);
    pings += r.pings; digs += r.digs; buried += r.buried; waits += r.waits; squeezed += r.squeezed;
  }
  notes.push(`5 messes: ${(pings / 40).toFixed(1)} pings a riddle, ${buried} answers buried (${digs} things moved to dig them out), ${waits} recharge waits; putting away, ${(squeezed / 5).toFixed(1)} a mess had to overlap for want of room`);

  // the owl reads the riddles back
  let top1 = 0, top3 = 0, n = 0;
  for (const t of THINGS) {
    if (!t.clue) continue; n++;
    const g = guess(t.clue).map((x) => x.kind);
    if (g[0] === t.kind) top1++;
    if (g.slice(0, 3).includes(t.kind)) top3++;
  }
  if (top3 / n < 0.85) problems.push(`the owl only gets ${top3} of ${n} riddles in three`);
  // and the way players describe things: by what they look like and what they want.
  // (Amber thought of the rubber duck as a duck: "something that loves food".)
  const SAID = [
    ['something that loves food', 'duck', 4], ['something that loves bread', 'duck', 1], ['something that quacks', 'duck', 1],
    ['something that looks like a duck', 'duck', 1], ['something that loves honey', 'teddy', 1], ['a horse that loves carrots', 'knight', 1],
    ['something that keeps time, but has no hands', 'hourglass', 1], ['something a horse would wear', 'horseshoe', 1],
    ['a potion that will not stop bubbling', 'potion-green', 1],
  ];
  for (const [said, kind, within] of SAID) {
    const g = guess(said).map((x) => x.kind);
    if (!g.slice(0, within).includes(kind)) problems.push(`"${said}" did not find the ${kind} in ${within} (${g.slice(0, 4).join(', ')})`);
  }
  const eat = guess('something you would like to eat').slice(0, 4).filter((x) => !THING[x.kind].tags.includes('eat'));
  if (eat.length) problems.push(`"you would like to eat" guessed ${eat.map((x) => x.kind).join(', ')}`);
  if (guess('something that loves food').slice(0, 4).some((x) => ['apple', 'bread', 'cheese', 'cupcake'].includes(x.kind))) problems.push('"loves food" guessed a food');
  notes.push(`owl reads riddles: ${top1}/${n} first guess, ${top3}/${n} in three`);
  return { pass: !problems.length, detail: (problems.length ? problems.slice(0, 8).join(' | ') + ' -- ' : '') + notes.join('; ') };
}
