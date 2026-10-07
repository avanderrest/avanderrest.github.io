/* What Neon Roll keeps, it keeps right; and a seed is a track.

   Neon Roll saves the player, not the run: shards, the balls bought, the skin, sound, the
   last mode and a best for each mode. In Node: a run that beats the best writes it into
   the save, a worse one leaves it alone, and the save survives JSON. Then two tracks built
   from one seed are the same hill for hill out to 30 km, and another seed is not: that is
   what makes a #seed= link worth sending. */
import { createRoll } from '../../neon-roll/sim.js';

const fresh = () => ({ v: 1, shards: 0, owned: ['cyan'], skin: 'cyan', sound: false, mode: 'endless', best: { endless: { score: 0, dist: 0 }, airtime: { air: 0 }, sprint: { time: 0 }, gaps: { dist: 0 } } });

function sample(nr, seed) {
  nr.resetWorld(seed);
  const T = nr.S.track, out = [];
  T.extend(30000 * nr.PX_PER_M);
  for (let x = 0; x < 30000 * nr.PX_PER_M; x += 997) out.push(T.ground(x, nr.Q) ? Math.round(nr.Q.y * 100) : 'gap');
  return out.join(',');
}

export default function () {
  const problems = [];
  const save = fresh();
  const nr = createRoll({ save, pickSeed: () => 77 });
  nr.selectMode('endless');
  nr.startRun();
  for (let i = 0; i < 240 * 20 && nr.S.phase === 'run'; i++) nr.tick(nr.STEP);
  nr.S.dist = 500; nr.S.bonus = 120;
  nr.finish('caught');
  if (save.best.endless.dist !== 500 || save.best.endless.score !== 620) problems.push(`a first run did not set the best (${JSON.stringify(save.best.endless)})`);
  const shards = save.shards;

  nr.resetWorld(78); nr.startRun();
  nr.S.dist = 300; nr.S.bonus = 10;
  nr.finish('caught');
  if (save.best.endless.dist !== 500) problems.push('a worse run overwrote the best');
  if (nr.S.newBest.dist || nr.S.newBest.score) problems.push('a worse run was called a new best');

  const back = JSON.parse(JSON.stringify(save));
  if (JSON.stringify(back) !== JSON.stringify(save)) problems.push('the save does not survive JSON');

  const a = sample(createRoll({ save: fresh() }), 4242), b = sample(createRoll({ save: fresh() }), 4242), c = sample(createRoll({ save: fresh() }), 4243);
  if (a !== b) problems.push('seed 4242 built two different tracks');
  if (a === c) problems.push('seeds 4242 and 4243 built the same track');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `best kept at ${save.best.endless.dist} m / ${save.best.endless.score}, ${shards} shards banked on the way; seed 4242 the same track twice over 30 km`,
  };
}
