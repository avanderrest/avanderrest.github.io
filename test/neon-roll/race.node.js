/* Race: the rubber band keeps two players close without handing it to the one behind.

   Amber (2026-10-14): two balls on one track; nudge the one behind faster and the one ahead
   slower, by different amounts depending on the gap, so they stay on the same screen, but
   never so much that the one behind is simply carried past. Two sims on the same seed, as
   the page runs them: a good player (pumps every descent, dives when the ring says) against
   a careless one (never presses). On three tracks, with the band and without: the band has
   to close the gap, and the good player still has to win every time. */
import { createRoll } from '../../neon-roll/sim.js';

const RANK = { perfect: 3, good: 2, slam: 1 };
function player(nr, good) {
  const { S, Q } = nr, b = S.ball;
  if (!good) { S.held = false; return; }
  if (b.on && S.track.ground(b.x, Q)) S.held = b.s >= 0 ? Q.dy < 0 : Q.dy > 0;
  else if (!b.on && b.air > 0.35) {
    const d = nr.predictLanding(true), g = nr.predictLanding(false);
    S.held = !!d && (!g || RANK[d.grade] > RANK[g.grade]);
  } else S.held = false;
}

function race(seed, band) {
  const mk = () => createRoll({ save: { shards: 0, skin: 'cyan', best: {} }, pickSeed: () => seed });
  const a = mk(), b = mk();
  for (const nr of [a, b]) { nr.selectMode('race'); nr.resetWorld(seed); nr.startRun(); }
  let widest = 0;
  for (let t = 0; t < 200 && a.S.phase === 'run' && b.S.phase === 'run'; t += a.STEP * 4) {
    player(a, true); player(b, false);
    for (let i = 0; i < 4; i++) {
      const gap = (a.S.ball.x - b.S.ball.x) / a.PX_PER_M;
      a.S.buff = band ? a.rubberBand(gap) : 1;
      b.S.buff = band ? b.rubberBand(-gap) : 1;
      if (a.S.phase === 'run') a.tick(a.STEP);
      if (b.S.phase === 'run') b.tick(b.STEP);
    }
    widest = Math.max(widest, Math.abs(a.S.ball.x - b.S.ball.x) / a.PX_PER_M);
  }
  const won = a.S.overReason === 'finish' ? 'good' : b.S.overReason === 'finish' ? 'careless' : 'nobody';
  return { seed, band, won, widest: Math.round(widest), t: +a.S.clock.toFixed(1) };
}

export default function () {
  const rows = [], problems = [];
  for (const seed of [11, 404, 9001]) {
    const off = race(seed, false), on = race(seed, true);
    rows.push(`seed ${seed}: without the band ${off.won} by up to ${off.widest} m apart; with it ${on.won}, at most ${on.widest} m apart, ${on.t}s`);
    if (on.won !== 'good') problems.push(`seed ${seed}: with the band the ${on.won === 'careless' ? 'careless player won' : 'race never ended'}`);
    if (!(on.widest < off.widest)) problems.push(`seed ${seed}: the band did not keep them closer (${on.widest} m vs ${off.widest} m)`);
  }
  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + rows.join('; ') };
}
