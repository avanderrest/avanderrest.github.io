/* A saved walk comes back exactly, and a seed is a coast.

   Three things, all in Node:
   - Round trip: walk a few chapters with the bot, serialize, restore into a fresh sim, and
     the state is identical, and so is every chapter still to be generated after it.
   - Same seed, same coast: two walks on one seed with different dice (different hands,
     different roads) generate the same chapters, card for card, as far as the eye can see.
     That is what makes a #seed= link worth sending.
   - Old saves: a v4 save from before seeds gets a seed on load and still plays. */
import { createWayside, ROWS } from '../../wayside/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const coast = (w, upto) => {
  w.ensureGenerated(upto);
  const out = [];
  for (const ch of w.S.chapters) {
    if (ch.start > upto) break;
    const cards = [];
    for (let c = ch.start; c <= ch.end; c++) for (let r = 0; r < ROWS; r++) {
      const cell = w.cellAt(r, c);
      if (cell && !cell.mine) cards.push(`${r},${c}:${cell.id}`);
    }
    out.push(`${ch.type}/${ch.name}/${ch.passRow}/${ch.start}-${ch.end}|${cards.join(' ')}`);
  }
  return out;
};

export default function () {
  const problems = [];

  // round trip, mid-walk
  const w1 = createWayside({ seed: 7, rnd: mulberry32(7), best: {} });
  w1.newGame('solo', null, 7);
  for (let i = 0; i < 40; i++) {
    const h = w1.S.hero;
    if (!w1.cellAt(h.r, h.c + 1)) {
      const k = w1.S.hand.findIndex((id) => !['rework', 'slip', 'cross'].includes(id));
      if (k >= 0) { w1.handPick(k); w1.placeAt(h.r, h.c + 1); }
    }
    w1.tryMove(h.r, h.c + 1);
    while (w1.dlg) w1.chooseOption(w1.dlg.options.length - 1);
    while (w1.battle) { if (w1.battle.pending) w1.battleResolve(); else w1.battleMove(0); }
  }
  const json = JSON.stringify(w1.serialize());
  const w2 = createWayside({ saved: JSON.parse(json), rnd: mulberry32(99), best: {} });
  if (JSON.stringify(w2.serialize()) !== json) problems.push('restored state differs from the save');
  const far = w1.S.gen + 60;
  const a = coast(w1, far).join('\n'), b = coast(w2, far).join('\n');
  if (a !== b) problems.push('the land generated after a restore differs from the land generated without one');

  // same seed, different dice: same coast
  const runs = [11, 12].map((d) => {
    const w = createWayside({ seed: 4242, rnd: mulberry32(d), best: {} });
    w.newGame('solo', null, 4242);
    return w;
  });
  for (let i = 0; i < 5; i++) runs[0].draw();        // knock the first walk's dice out of step
  const c0 = coast(runs[0], 400), c1 = coast(runs[1], 400);
  const differ = c0.findIndex((x, i) => x !== c1[i]);
  if (differ >= 0) problems.push(`seed 4242: chapter ${differ + 1} differs between two walks`);
  const other = coast(createWayside({ seed: 4243, rnd: mulberry32(11), best: {} }), 400);
  if (other.join() === c0.join()) problems.push('seeds 4242 and 4243 give the same coast');

  // an old save, from before seeds
  const old = JSON.parse(json);
  delete old.seed;
  const w3 = createWayside({ saved: old, rnd: mulberry32(3), best: {} });
  if (typeof w3.S.seed !== 'number') problems.push('an old save did not get a seed');
  if (w3.S.hero.c !== w1.S.hero.c) problems.push('an old save lost its place on the road');
  w3.ensureGenerated(w3.S.gen + 30);

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `round trip at mile ${w1.S.far} (${w1.S.chapters.length} chapters generated, ${json.length} bytes); ` +
      `seed 4242 gave ${c0.length} identical chapters under two sets of dice; old save got seed ${w3.S.seed}`,
  };
}
