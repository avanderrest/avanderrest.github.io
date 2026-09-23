/* The Sprint track is the same every time, so it has to be finishable.

   Unlike Endless it is one fixed seed, which means one bad kicker would sit in
   every player's run forever. A player who times the button well has to reach
   the finish without falling in a gap, and a ball that never presses must not
   fall in one either (it may stall — that's a slow time, not a broken track).
   The case also checks the finish is recorded as a best time. */
return (async () => {
  const N = window.__neonRoll, C = N.constants;
  const S = () => N.state;
  N.freeze(true);
  const problems = [];

  function landing(p, dive) {
    let { x, y, vx, vy } = p;
    const g = C.AIR_G * (dive ? C.DIVE_G : 1), dt = 1 / 60;
    for (let i = 0; i < 300; i++) {
      const sp = Math.hypot(vx, vy);
      vx -= vx * C.DRAG * sp * dt; vy -= (g + vy * C.DRAG * sp) * dt;
      const was = N.ground(x);
      x += vx * dt; y += vy * dt;
      const gr = N.ground(x);
      if (gr && !was && y < gr.y - C.R) return 999;
      if (gr && y <= gr.y) {
        const vt = (vx + vy * gr.dy) / Math.hypot(1, gr.dy);
        return Math.acos(Math.max(-1, Math.min(1, vt / Math.hypot(vx, vy)))) * 180 / Math.PI;
      }
      if (!gr && y < p.y - 2500) return 999;
    }
    return 999;
  }

  function run(pump, limit) {
    N.start('sprint');
    const DT = 1 / 60;
    for (let t = 0; t < limit && S().phase === 'run'; t += DT) {
      const p = N.probe();
      let hold = false;
      if (pump && p.on) hold = p.s >= 0 ? p.dy < 0 : p.dy > 0;
      else if (pump) hold = p.air > 0.35 && landing(p, true) < landing(p, false) - 1;   // a player lets a flight get going before diving
      N.hold(hold);
      N.step(DT);
    }
    N.hold(false);
    return { phase: S().phase, reason: S().overReason, time: S().clock + S().penalty, falls: S().falls, dist: Math.floor(S().dist), perfects: S().perfects };
  }

  localStorage.removeItem('neon-roll-save-v1');
  const good = run(true, 240);
  if (good.reason !== 'finish') problems.push(`a good player did not finish (${good.dist} m, phase ${good.phase})`);
  if (good.falls) problems.push(`a good player fell in ${good.falls} gap(s)`);
  const best = N.save.best.sprint.time;
  if (good.reason === 'finish' && Math.abs(best - good.time) > 0.01) problems.push(`best time not recorded (${best} vs ${good.time.toFixed(2)})`);
  const idle = run(false, 240);
  if (idle.falls) problems.push(`a ball that never pressed fell in ${idle.falls} gap(s)`);
  N.freeze(false);
  N.setMode('endless');

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${problems.join('; ') || 'ok'} | good: ${good.reason || good.phase} in ${good.time.toFixed(1)}s, ${good.perfects} Perfects, ${good.falls} falls | idle: ${idle.reason || idle.phase} at ${idle.dist} m after ${idle.time.toFixed(0)}s, ${idle.falls} falls`,
  });
})();
