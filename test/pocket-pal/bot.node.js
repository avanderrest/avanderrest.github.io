/* A bot keeps a pet for six hours of play, through the same verbs as the buttons.

   It looks after it the way a player would (feeds it when hungry, puts it to bed when
   tired, baths it when grubby, strokes and plays when it is low) and teaches every trick in
   order the Nintendogs way: draw the gesture, then say the word while the pose is held,
   saying it the way a recogniser writes it back ("Sit.", "set", "Paul") a third of the time.
   Then it asks for each trick by word and by gesture alone. The run has to end with every
   trick learned, the pet never stuck (it moves, it never leaves the floor, no NaN), and a
   cared-for pet obeying most of the time. A neglected pet is checked too: the stats fall
   but nothing dies and it still sleeps itself back to health. */
import { createPal, TRICKS, FLOOR, STATS } from '../../pocket-pal/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const MISHEARD = { sit: ['Sit.', 'set', 'Sit!'], beg: ['Beg.', 'bag'], paw: ['Paw!', 'Paul', 'pour'], spin: ['Spin.', 'Spain'], 'roll over': ['Roll over.', 'roll over!'], dance: ['Dance!', 'dense'] };

function keep(seed) {
  const rnd = mulberry32(seed), events = {};
  const pal = createPal({ name: 'Biscuit', rnd: mulberry32(seed * 7 + 1), on: (e) => { events[e] = (events[e] || 0) + 1; } });
  const S = pal.S, P = S.pet;
  const dt = 1 / 20;
  let lowest = { tummy: 100, happy: 100, energy: 100, clean: 100 }, bad = null, stuckFor = 0, lastPos = '';
  let asked = 0, obeyed = 0, lessons = 0;
  const say = (w) => (rnd() < 0.33 ? MISHEARD[w][Math.floor(rnd() * MISHEARD[w].length)] : w);
  const careFree = () => !['eat', 'sleep', 'walk', 'run', 'fetch', 'carry'].includes(P.act) && S.bath <= 0;
  for (let i = 0; i < 6 * 3600 / dt; i++) {
    pal.step(dt);
    const t = i * dt;
    for (const k of STATS) lowest[k] = Math.min(lowest[k], S.stats[k]);
    if (!Number.isFinite(P.x) || !Number.isFinite(P.y) || STATS.some((k) => !Number.isFinite(S.stats[k]))) { bad = `NaN at ${t.toFixed(0)}s`; break; }
    if (P.x < FLOOR.x0 - 1 || P.x > FLOOR.x1 + 1 || P.y < FLOOR.y0 - 1 || P.y > FLOOR.y1 + 1) { bad = `off the floor at (${P.x | 0}, ${P.y | 0})`; break; }
    const pos = `${P.act}${P.x | 0}`;
    stuckFor = pos === lastPos && P.act !== 'sleep' && P.act !== 'trick' ? stuckFor + dt : 0; lastPos = pos;
    if (stuckFor > 120) { bad = `stuck in ${P.act} for two minutes at ${t.toFixed(0)}s`; break; }
    if (i % 20) continue;   // the bot thinks once a second

    if (P.act === 'sleep') { if (S.stats.energy > 95) pal.wake(); continue; }
    if (!careFree()) {
      if (S.bath > 0 && i % 40 === 0) pal.stroke(200, 3);   // scrub
      continue;
    }
    if (S.stats.tummy < 35) { pal.feed(rnd() < 0.15 ? 'cake' : rnd() < 0.4 ? 'apple' : 'kibble'); continue; }
    if (S.stats.energy < 20) { pal.sleep(); continue; }
    if (S.stats.clean < 30) { pal.wash(); continue; }
    if (S.stats.happy < 45 || t % 600 < 1) { if (S.stats.happy < 45 && rnd() < 0.5) pal.stroke(300, 4); else pal.play(); continue; }

    // lessons: a trick at a time, in order
    const next = TRICKS.find((q) => !S.tricks[q.key].learned);
    if (next && t % 20 < 1) {
      if (!S.train) { pal.chooseTrick(next.key); lessons++; }
      if (S.train && S.train.stage === 'gesture') {
        pal.gesture(next.gesture);
        for (let j = 0; j < 30; j++) pal.step(dt);   // a moment in the pose
        pal.hear(say(S.tricks[next.key].word));
      }
      continue;
    }
    // show off what it knows now and then
    if (!next && t % 45 < 1) {
      const t2 = TRICKS[Math.floor(rnd() * TRICKS.length)];
      asked++;
      const before = S.performed;
      if (rnd() < 0.5) pal.hear(say(S.tricks[t2.key].word)); else pal.gesture(t2.gesture);
      if (S.performed > before) obeyed++;
    }
  }
  return { pal, events, lowest, bad, asked, obeyed, lessons };
}

function neglect(seed) {
  const pal = createPal({ rnd: mulberry32(seed) });
  const S = pal.S;
  let slept = 0, lowestEnergy = 100;
  for (let i = 0; i < 4 * 3600 * 10; i++) { pal.step(0.1); if (S.pet.act === 'sleep') slept++; lowestEnergy = Math.min(lowestEnergy, S.stats.energy); }
  return { S, slept: slept / 10, lowestEnergy };
}

export default function () {
  const problems = [], notes = [];
  for (const seed of [1, 2, 3]) {
    const r = keep(seed), S = r.pal.S;
    const learned = TRICKS.filter((q) => S.tricks[q.key].learned).length;
    if (r.bad) problems.push(`seed ${seed}: ${r.bad}`);
    if (learned < TRICKS.length) problems.push(`seed ${seed}: only ${learned}/${TRICKS.length} tricks learned (${r.pal.trick && JSON.stringify(Object.fromEntries(TRICKS.map((q) => [q.key, S.tricks[q.key].reps])))})`);
    if (r.asked && r.obeyed / r.asked < 0.6) problems.push(`seed ${seed}: a cared-for pet obeyed only ${r.obeyed}/${r.asked}`);
    if (!r.events.fetched) problems.push(`seed ${seed}: never brought the ball back`);
    if (!r.events.yum) problems.push(`seed ${seed}: never finished a meal`);
    notes.push(`seed ${seed}: ${learned} tricks in ${r.lessons} lessons, obeyed ${r.obeyed}/${r.asked}, lowest ${Object.entries(r.lowest).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' ')}, bond ${S.bond.toFixed(0)}`);
  }
  const n = neglect(5);
  if (n.slept < 60) problems.push(`a neglected pet slept only ${n.slept.toFixed(0)}s in four hours`);
  if (n.lowestEnergy > 10) problems.push('a neglected pet never got tired');
  notes.push(`neglected 4h: tummy ${n.S.stats.tummy.toFixed(0)}, happy ${n.S.stats.happy.toFixed(0)}, slept ${(n.slept / 60).toFixed(0)} min`);
  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') };
}
