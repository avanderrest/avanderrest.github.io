/* The sandbox runs for ever and its own pieces work.

   In Node: open the sandbox (always open, even on a fresh save): with nothing hung, no
   marbles come, and a marble release will only go at the edge. Hang a contraption with a
   release, a starter slope, a paddle wheel, a motor wheel, two chimes and two buckets, release, and run 30 seconds. The
   run never ends, marbles keep coming but never more than a handful at once, the paddle
   wheel has been set turning by the marbles, the motor has turned at its own pace, the
   chimes rang and a bucket caught some. The pieces are not limited, and the layout is kept
   for the next visit. */
import { createRun, DT, MOTOR_W } from '../../marble-run/sim.js';

// a marble release at the top-left and the starter slope under it feed the rest
const CONTRAPTION = [['feeder', 0, 9], ['starter', 0, 8], ['wheel', 1, 7], ['funnel', 2, 4], ['chime', 2, 2],
  ['bucket', 2, 0], ['motor', 7, 5], ['chime', 7, 3], ['bucket', 9, 0]];

export default function () {
  const problems = [];
  const counts = {};
  const saved = {};
  const g = createRun({ saved, on: (ev) => { counts[ev] = (counts[ev] || 0) + 1; } });
  if (!g.unlocked(g.SANDBOX)) problems.push('the sandbox is locked on a fresh save');
  g.load(g.SANDBOX);
  if (!g.L.sandbox) problems.push('load(SANDBOX) did not open the sandbox');
  // no release of its own; one only goes in a cell at the edge
  g.release(); for (let i = 0; i < 300; i++) g.step(DT);
  if (g.world.spawned) problems.push(`marbles came with no release hung (${g.world.spawned})`);
  g.stop();
  if (g.place('feeder', 5, 5)) problems.push('a marble release went in the middle of the board');
  for (const [k, x, y, f] of CONTRAPTION) if (!g.place(k, x, y, !!f)) problems.push(`could not hang ${k} at ${x},${y}`);
  for (let i = 0; i < 6; i++) g.place('slope', i, 6);   // a row the contraption leaves free
  if (g.left('slope') !== Infinity) problems.push(`slopes are limited (${g.left('slope')} left)`);
  for (let i = 0; i < 6; i++) g.remove(i, 6);

  g.release();
  let most = 0, wheelTurn = 0;
  const steps = 60 * 30;
  for (let i = 0; i < steps; i++) {
    g.step(DT);
    most = Math.max(most, g.world.marbles.length);
    const wheel = g.world.pieces.find((p) => p.kind === 'wheel');
    wheelTurn = Math.max(wheelTurn, Math.abs(wheel.angle));
  }
  const W = g.world;
  const motor = W.pieces.find((p) => p.kind === 'motor');
  if (g.mode !== 'run' || W.done) problems.push(`the run ended (${g.mode}, ${W.done})`);
  if (W.spawned < 15) problems.push(`only ${W.spawned} marbles in 30 s`);
  if (most > 7) problems.push(`${most} marbles on the board at once`);
  if (wheelTurn < 1) problems.push(`the paddle wheel hardly turned (${wheelTurn.toFixed(2)} rad)`);
  if (Math.abs(motor.angle - MOTOR_W * W.t) > 0.01) problems.push(`the motor turned ${motor.angle.toFixed(2)} rad, not ${(MOTOR_W * W.t).toFixed(2)}`);
  if (!counts.bell) problems.push('no chime rang');
  if (!W.caught) problems.push('no bucket caught a marble');

  // the layout is kept
  const again = createRun({ saved: JSON.parse(JSON.stringify(saved)) });
  again.load(again.SANDBOX);
  if (again.placed.length !== CONTRAPTION.length) problems.push(`the sandbox came back with ${again.placed.length} pieces, not ${CONTRAPTION.length}`);

  return {
    pass: !problems.length,
    detail: problems.join('; ') || `30 s: ${W.spawned} marbles fed, at most ${most} at once, ${W.caught} caught, ${counts.bell} chimes, ` +
      `paddle wheel turned ${wheelTurn.toFixed(1)} rad, motor ${motor.angle.toFixed(1)} rad; layout kept`,
  };
}
