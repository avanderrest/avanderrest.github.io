/* A saved keep comes back exactly as it was, and plays on exactly as it would have.

   Builds a village, plays three waves, saves through JSON the way localStorage does, loads
   the copy into a second game, then runs the same seeded wave in both. The two have to end
   identical: same gold, same keep, same buildings standing, same chronicle. A field the
   save forgets, or one it brings back in a different shape, shows up as the two diverging. */
import { createGame, W } from '../../hollowmarch/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const strip = (s) => JSON.stringify(s);

export default function () {
  const a = createGame({ rnd: mulberry32(5) });
  a.state.gold = 400;
  for (const [x, y, t] of [[6, 6, 'tower'], [5, 7, 'tower'], [1, 4, 'farm'], [2, 4, 'well'], [5, 5, 'barracks'], [4, 6, 'wall']]) a.place(y * W + x, t);
  for (let n = 0; n < 3; n++) { a.startWave(); while (a.sim) a.step(1); }

  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = createGame({ saved, rnd: mulberry32(99) });
  const problems = [];
  if (strip(b.serialize()) !== strip(a.serialize())) problems.push('the loaded game differs from the saved one before anything happens');

  // the same dice from here on, in both
  const ra = mulberry32(1234), rb = mulberry32(1234);
  const a2 = createGame({ saved: a.serialize(), rnd: ra });
  const b2 = createGame({ saved: b.serialize(), rnd: rb });
  for (const g of [a2, b2]) { g.startWave(); while (g.sim) g.step(1); }
  if (strip(a2.serialize()) !== strip(b2.serialize())) {
    const sa = a2.state, sb = b2.state;
    problems.push(`after a wave: gold ${sa.gold}/${sb.gold}, keep ${sa.castleHp}/${sb.castleHp}, wave ${sa.wave}/${sb.wave}`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved at wave ${saved.wave} with ${saved.gold}g and ${saved.log.length} chronicle entries; a seeded wave 4 played the same from the save as from the original (keep ${a2.state.castleHp}/20, ${a2.state.gold}g)`,
  };
}
