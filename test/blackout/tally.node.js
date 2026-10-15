/* The end-of-mission tally: times seen, close calls, knocked out, killed.

   On mission 1, the player is set down beside a guard's cone, on a tile nobody watches,
   and stays one move (too few for the world to tick, so the cones hold still): one close
   call. Staying again on the same tile is the same close call, not a second. Away from
   every cone and back again is a second. Stepping into a watched tile (and looked for, as
   a step does) is a time seen, and not a close call. */
import { createBlackout } from '../../blackout/sim.js';

export default function () {
  const bo = createBlackout({ on: () => {} });
  bo.seedDice(3);
  bo.newGame('normal', 0);
  bo.begin();
  const st = () => bo.state, bad = [], out = [];
  const N = bo.W * bo.H;
  // tiles on the ground floor: watched, unwatched beside a watched one, and far from any
  const lv = 0, near = [], far = [], seen = [];
  for (let y = 0; y < bo.H; y++) for (let x = 0; x < bo.W; x++) {
    if (!bo.passable(x, y, lv, 'player') || bo.guardAt?.(x, y, lv)) continue;
    if (st().guards.some((g) => g.x === x && g.y === y && g.lv === lv)) continue;
    if (bo.watchedAt(x, y, lv)) { seen.push([x, y]); continue; }
    let by = false, clear = true;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      if (!bo.passable(x + dx, y + dy, lv, 'player') || !bo.watchedAt(x + dx, y + dy, lv)) continue;
      clear = false;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) by = true;
    }
    if (by) near.push([x, y]); else if (clear) far.push([x, y]);
  }
  out.push(`${seen.length} watched, ${near.length} close, ${far.length} clear tiles of ${N}`);
  if (!near.length || !far.length || !seen.length) return { pass: false, detail: out.join(' · ') + ' -- no tiles to test on' };

  const put = ([x, y]) => { const p = st().player; p.x = x; p.y = y; p.lv = lv; st().pace = 0; };
  const stay = () => { bo.stay(); bo.flush(); };
  put(far[0]); stay();
  if (st().closeCalls !== 0) bad.push(`close calls ${st().closeCalls} on a clear tile`);
  put(near[0]); stay();
  if (st().closeCalls !== 1) bad.push(`close calls ${st().closeCalls} after stopping beside a cone`);
  st().pace = 0; stay();
  if (st().closeCalls !== 1) bad.push(`staying put beside the same cone counted again (${st().closeCalls})`);
  put(far[0]); stay(); put(near[0]); stay();
  if (st().closeCalls !== 2) bad.push(`coming back to the cone did not count a second (${st().closeCalls})`);
  out.push(`close calls ${st().closeCalls}`);

  const before = st().closeCalls;
  put(seen[0]); bo.tickBegin(); bo.detect(); stay();
  out.push(`stepped into a watched tile: seen ${st().timesSeen}, seen bar ${st().seen}`);
  if (st().timesSeen < 1) bad.push('being seen was not counted');
  if (st().closeCalls !== before) bad.push('being seen counted as a close call');
  if (st().kills !== 0 || st().takedowns !== 0) bad.push('kills or knockouts counted with nothing done');

  return { pass: !bad.length, detail: (bad.length ? bad.join(' | ') + ' -- ' : '') + out.join(' · ') };
}
