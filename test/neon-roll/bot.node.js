/* A good player gets somewhere in every mode.

   A bot plays each mode in Node through the real physics: on the track it holds on every
   descent and lets go on every rise; in the air it lets the flight get going, then dives
   whenever the game's own landing prediction (the ring and the diamond on screen) says a
   dive lands better than letting go. Two tracks a mode, Sprint's being its fixed course.

   Endless: stay ahead of the blackout for 1000 m. Air Time: at least 60 s of the two
   minutes in the air. Sprint: finish, with no falls. Gaps: clear 1000 m. The in-page
   mechanic case already compares this player against one who never presses; this one
   checks the whole run, start to result, in every mode. */
import { createRoll } from '../../neon-roll/sim.js';

const RANK = { perfect: 3, good: 2, slam: 1 };
const LIMIT = 240;               // seconds of game time before the bot calls it a day

function play(mode, seed) {
  const save = { shards: 0, skin: 'cyan', mode, best: { endless: { score: 0, dist: 0 }, airtime: { air: 0 }, sprint: { time: 0 }, gaps: { dist: 0 } } };
  const nr = createRoll({ save, pickSeed: () => seed });
  const { S, STEP, Q } = nr;
  nr.selectMode(mode);
  nr.startRun();
  let topFlow = 0;
  while (S.phase === 'run' && S.t < LIMIT) {
    const b = S.ball;
    let hold;
    if (b.on && S.track.ground(b.x, Q)) hold = b.s >= 0 ? Q.dy < 0 : Q.dy > 0;
    else if (!b.on && b.air > 0.35) {
      const dive = nr.predictLanding(true), glide = nr.predictLanding(false);
      hold = !!dive && (!glide || RANK[dive.grade] > RANK[glide.grade]);
    } else hold = false;
    S.held = hold;
    for (let i = 0; i < 4 && S.phase === 'run'; i++) nr.tick(STEP);
    topFlow = Math.max(topFlow, S.flow);
  }
  return {
    mode, seed, phase: S.phase, reason: S.overReason, dist: Math.round(S.dist), t: Math.round(S.t),
    air: +(S.airSec || 0).toFixed(1), clock: +(S.clock + S.penalty).toFixed(1), falls: S.falls, gaps: S.gaps,
    perfects: S.perfects, slams: S.slams, topFlow,
  };
}

export default function () {
  const runs = [];
  for (const mode of ['endless', 'airtime', 'sprint', 'gaps']) for (const seed of [11, 404]) runs.push(play(mode, seed));
  const problems = [];
  for (const r of runs) {
    const tag = `${r.mode} ${r.mode === 'sprint' ? '' : `seed ${r.seed} `}`;
    if (r.mode === 'endless' && r.dist < 1000) problems.push(`${tag}caught at ${r.dist} m`);
    if (r.mode === 'airtime' && r.air < 60) problems.push(`${tag}only ${r.air}s in the air`);
    if (r.mode === 'sprint' && (r.reason !== 'finish' || r.falls)) problems.push(`${tag}${r.reason === 'finish' ? `${r.falls} falls` : `did not finish (${r.reason || 'still rolling'})`}`);
    if (r.mode === 'gaps' && r.dist < 1000) problems.push(`${tag}fell in after ${r.dist} m`);
  }
  const say = (r) => r.mode === 'endless' ? `${r.dist} m${r.phase === 'run' ? ' and still ahead' : ` (${r.reason})`}`
    : r.mode === 'airtime' ? `${r.air}s in the air`
      : r.mode === 'sprint' ? `${r.clock}s, ${r.falls} falls`
        : `${r.dist} m over ${r.gaps} gaps${r.phase === 'run' ? '' : ` (${r.reason})`}`;
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `${r.mode}${r.mode === 'sprint' ? '' : ' ' + r.seed}: ${say(r)}, ${r.perfects}P/${r.slams}S, flow ${r.topFlow}`).join('; '),
  };
}
