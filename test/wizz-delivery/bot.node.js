/* A courier who drives the routes makes money in a shift, and stacking pays.

   A bot drives a whole five-minute shift in Node through the real car: the same input a
   player gives (gas, brake, left, right), on the same roads, in the same traffic. It takes
   the best-paying order on the boards whenever its bag has room, asks the game's own route
   finder (the arrow on screen) for the way to the nearest stop, and steers for a point a
   couple of tiles along it, easing off for sharp turns, stopping at red lights, and a level
   faster than the traffic on the straights. If it has not moved for a few seconds it backs
   out and tries again. A second order has to be going the same way as the bag (restaurant
   and house within a dozen tiles of one already in it).

   Two shifts, different dice, once carrying one order at a time and once carrying two. Each
   has to deliver at least five orders and end with more money than it started, and carrying
   two has to earn more than carrying one: stacking is the premise, so it must pay (see
   PLAN.md for the numbers before the stack bonus and the late part-fare). */
import { createWizz } from '../../wizz-delivery/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const DT = 1 / 30;

export function run(seed, carry = 1) {
  let over = null;
  // the dice go in at the start: the traffic is placed as the town is built
  const wz = createWizz({ rnd: mulberry32(seed), on: (ev, d) => { if (ev === 'shift-over') over = d; } });
  wz.startShift();
  const { car, input, bag, REST, G, ST } = wz;
  let stuckT = 0, backT = 0, lastX = car.x, lastY = car.y, unsticks = 0;
  const steerFor = (tx, ty) => {
    const fx = Math.sin(car.h), fy = -Math.cos(car.h);
    const dx = tx - car.x, dy = ty - car.y;
    const ang = Math.atan2(fx * dy - fy * dx, fx * dx + fy * dy);
    input.left = ang < -0.12; input.right = ang > 0.12;
    const sharp = Math.abs(ang) > 1.3 && car.v > 0.6;
    // stop at a red the way the traffic does; a level over the traffic on the straights
    const red = wz.heldAtSignal(car.x, car.y, fx, fy);
    input.gas = !sharp && !red; input.brake = sharp || red;
    if (!sharp && !red && Math.abs(ang) < 0.3 && car.level < 2) wz.shiftLevel(1);
  };
  while (!over) {
    // the board: best pay per second of limit, anywhere, one order at a time
    if (bag.length < carry) {
      let best = null, bv = 0;
      for (const r of REST) for (const o of r.offers) {
        const d = Math.hypot(r.x + 0.5 - car.x, r.y + 0.5 - car.y);
        // a second order wants to be going the same way as the ones in the bag
        const off = bag.length ? Math.min(...bag.map((b) => Math.hypot(b.hm.x - o.hm.x, b.hm.y - o.hm.y) + Math.hypot(b.r.x - r.x, b.r.y - r.y))) : 0;
        if (bag.length && off > 12) continue;
        const v = o.base / (o.limit + d + off);
        if (v > bv) { bv = v; best = o; }
      }
      if (best) wz.acceptOffer(best);
    }
    const target = wz.closestAccepted();
    if (backT > 0) {
      backT -= DT; input.gas = false; input.brake = true; input.left = false; input.right = (unsticks % 2) === 1;
    } else if (target) {
      const path = wz.routePath(target);
      if (path && path.length > 1) {
        const p = path[Math.min(2, path.length - 1)];
        steerFor(p.x + 0.5, p.y + 0.5);
      } else {
        const d = wz.destinationOf(target);
        steerFor(d.x, d.y);
      }
    } else { input.gas = input.left = input.right = false; input.brake = true; }
    wz.step(DT);
    // stuck: nudged by nothing for four seconds while wanting to go
    if (Math.hypot(car.x - lastX, car.y - lastY) > 0.3) { lastX = car.x; lastY = car.y; stuckT = 0; }
    else if (target && backT <= 0) { stuckT += DT; if (stuckT > 4) { stuckT = 0; backT = 1.2; unsticks++; } }
    if (G.ms > 400000) break;    // a safety net; the shift is 300 s
  }
  return { seed, carry, over, done: ST.done, bonus: ST.bonus, late: ST.late, expired: ST.expired, earned: G.earned, money: G.money, red: ST.redLights, unsticks };
}

export default function () {
  const runs = [1, 2].flatMap((s) => [run(s, 1), run(s, 2)]);
  const problems = [];
  for (const r of runs) {
    if (!r.over) problems.push(`seed ${r.seed}: the shift never ended`);
    if (r.done < 5) problems.push(`seed ${r.seed}: only ${r.done} delivered`);
    if (r.earned <= 0) problems.push(`seed ${r.seed}: earned ${r.earned.toFixed(2)}`);
  }
  const mean = (c) => runs.filter((r) => r.carry === c).reduce((a, r) => a + r.earned, 0) / 2;
  if (mean(2) <= mean(1)) problems.push(`carrying two earned £${mean(2).toFixed(0)}, not more than one at a time (£${mean(1).toFixed(0)})`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed} carry ${r.carry}: ${r.done} delivered (${r.bonus} fast, ${r.late} late), £${r.earned.toFixed(2)} earned, ${r.red} red lights, ${r.unsticks} backed out`).join('; '),
  };
}
