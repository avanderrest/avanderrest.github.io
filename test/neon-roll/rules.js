/* The landing rules have to do what the help card says.

   Every run in mechanic.js exercises these, but only in aggregate: if a
   Perfect stopped adding speed, or three of them stopped setting the ball
   alight, the distances would shift a little and still pass. So this sets up
   single landings by hand on a known slope and reads the result of each:

   - along the slope: a Perfect, faster than it came in;
   - 50 degrees off it, or head-on into an upslope: a slam — well under half the
     speed, but still rolling forward (SLAM_MIN), never stopped dead;
   - flow: a Perfect raises it a level, a near miss keeps it, a slam drops it
     to 0 and the ball to plain cruising speed;
   - two Perfects in a row: the ball glides (falls gently with the button up),
     holding still dives, and a near miss ends it;
   - three Perfects in a row: on fire, with shards counting double;
   - a skip under HOP_AIR: no verdict at all, and the streak untouched. */
return (async () => {
  const N = window.__neonRoll, C = N.constants;
  const S = () => N.state;
  N.freeze(true);
  const problems = [], notes = [];

  N.start('endless', { seed: 4242, noChase: true });
  // the steepest point of a long descent, well down the track
  const T = N.track;
  const o = { y: 0, dy: 0, ddy: 0 };
  const y0 = (s) => { s.f(s.x0, o); return o.y; };
  let X = null;
  N.track.extend(40000);
  for (let x = 1500; x < 40000 && X === null; x += 5) {
    const a = N.ground(x - 10), g = N.ground(x), c = N.ground(x + 10);
    // not on a curve falling away (a jump's rounded top): a ball placed there floats off before landing
    const seg = N.track.at(x);
    if (seg && seg.f) seg.f(x, o);
    if (a && g && c && g.dy < -0.45 && g.dy > -0.8 && c.dy < -0.45 && a.dy > -0.8 && o.ddy >= 0) X = x;
  }
  if (X === null) return JSON.stringify({ pass: false, detail: 'no steep descent to land on' });

  // drop the ball just above the slope at X, flying at `deg` off the tangent, in the air for `air` s
  function land(speed, deg, air) {
    const g = N.ground(X), b = S().ball;
    const t = Math.atan(g.dy) - deg * Math.PI / 180;
    Object.assign(b, { on: false, x: X - 2, y: N.ground(X - 2).y + 1, vx: speed * Math.cos(t), vy: speed * Math.sin(t), air });
    const before = { perfects: S().perfects, slams: S().slams, streak: S().streak, fever: S().fever };
    for (let i = 0; i < 480 && !b.on; i++) N.step(C.STEP);   // a hill that curves away can take a moment to meet
    return { on: b.on, s: b.s, ...before };
  }
  const reset = () => { S().streak = 0; S().fever = 0; S().flow = 0; };

  reset();
  const p = land(900, 0, 1);
  if (!p.on) problems.push('the ball never came down');
  if (S().perfects !== p.perfects + 1) problems.push('a landing along the slope was not a Perfect');
  if (!(p.s > 900)) problems.push(`a Perfect did not add speed (${p.s.toFixed(0)} from 900)`);
  notes.push(`Perfect 900->${p.s.toFixed(0)}`);

  // flow: a Perfect raises it, a near miss keeps it, a slam takes it all
  reset(); S().flow = 3;
  land(900, 0, 1);
  if (S().flow !== 4) problems.push(`a Perfect took flow 3 to ${S().flow}, not 4`);
  land(900, (C.PERFECT_DEG + C.GOOD_DEG) / 2, 1);
  if (S().flow !== 4) problems.push(`a near miss changed flow 4 to ${S().flow}; it should keep it`);
  S().flow = 5;
  const flowSlam = land(900, 50, 1);
  if (S().flow !== 0) problems.push(`a slam left flow at ${S().flow}`);
  if (Math.abs(flowSlam.s - C.CRUISE) > 1) problems.push(`a slam left ${flowSlam.s.toFixed(0)} px/s, not plain cruising (${C.CRUISE})`);
  notes.push('flow 3->4, near miss keeps 4, slam->0');

  reset();
  const sl = land(900, 50, 1);
  if (S().slams !== sl.slams + 1) problems.push('landing 50 degrees off the slope was not a slam');
  if (!(sl.s <= C.CRUISE + 1)) problems.push(`a slam kept ${sl.s.toFixed(0)} of 900 — it should drop the ball to plain cruising (${C.CRUISE})`);
  if (!(sl.s >= C.SLAM_MIN)) problems.push(`a slam left the ball at ${sl.s.toFixed(0)} — slowed, but it should still be going`);
  // head-on into an upslope: still rolling forward, not stopped or thrown back
  reset();
  const saved = X;
  for (let x = saved + 50; x < saved + 40000; x += 20) {
    const a = N.ground(x - 10), g = N.ground(x), c = N.ground(x + 10);
    if (a && g && c && g.dy > 0.4 && g.dy < 0.8 && a.dy > 0.4 && c.dy < 0.8) { X = x; break; }
  }
  const up = land(900, 75, 1);
  X = saved;
  if (!(up.s >= C.SLAM_MIN)) problems.push(`slamming into an upslope left ${up.s.toFixed(0)} px/s`);
  notes.push(`upslope slam 900->${up.s.toFixed(0)}`);
  if (S().streak !== 0) problems.push('a slam did not break the streak');
  notes.push(`slam 900->${sl.s.toFixed(0)}`);

  // gliding: two Perfects in a row and the ball falls gently while the button is up
  reset();
  const fall = (streak, held) => {
    S().streak = streak; N.hold(held);
    const b = S().ball;
    Object.assign(b, { on: false, x: X - 2, y: N.ground(X - 2).y + 2000, vx: 600, vy: 0, air: 1 });
    N.step(0.2);
    N.hold(false);
    return -b.vy;
  };
  const plain = fall(0, false), glide = fall(C.GLIDE_STREAK, false), dive = fall(C.GLIDE_STREAK, true);
  if (!(glide < plain * 0.7)) problems.push(`a glide fell as fast as a plain flight (${glide.toFixed(0)} vs ${plain.toFixed(0)} px/s after 0.2s)`);
  if (!(dive > plain)) problems.push(`holding while gliding did not dive (${dive.toFixed(0)} vs ${plain.toFixed(0)})`);
  reset();
  land(900, 0, 1); land(900, 0, 1);
  if (!(S().streak >= C.GLIDE_STREAK)) problems.push(`two Perfects did not start a glide (streak ${S().streak})`);
  land(900, (C.PERFECT_DEG + C.GOOD_DEG) / 2, 1);
  if (S().streak >= C.GLIDE_STREAK) problems.push('a near miss did not end the glide');
  notes.push(`glide falls ${Math.round(glide / plain * 100)}% as fast, dive ${Math.round(dive / plain * 100)}%`);

  reset();
  for (let i = 0; i < C.FEVER_STREAK; i++) land(900, 0, 1);
  if (!(S().fever > 0)) problems.push(`${C.FEVER_STREAK} Perfects in a row did not set the ball on fire (streak ${S().streak})`);
  // a shard right where the ball is, while burning
  const b = S().ball, before = S().runShards;
  T.shards.push({ x: b.x + b.offx, y: b.y + b.offy, got: false });
  N.step(C.STEP);
  const got = S().runShards - before;
  if (got !== 2) problems.push(`a shard on fire was worth ${got}, not 2`);
  notes.push(`on fire for ${S().fever.toFixed(1)}s, shard +${got}`);

  reset();
  S().streak = 2;
  const hop = land(900, 40, 0.05);
  if (S().slams !== hop.slams || S().perfects !== hop.perfects) problems.push('a skip under HOP_AIR was judged');
  if (S().streak !== 2) problems.push(`a skip changed the streak (${S().streak})`);

  N.freeze(false);
  N.setMode('endless');
  return JSON.stringify({ pass: problems.length === 0, detail: `${problems.join('; ') || 'ok'} | ${notes.join('; ')}` });
})();
