/* The working / waiting / backed-up shares, and the machine they point at.

   The first order's line (mixer, press, fryer, counter) runs for a minute. The fryer is the
   slow one at 4s, so it should be busy nearly all the time, the press backed up behind it,
   the counter's side never counted, and slowest() should name the fryer, also at 40s,
   before the queue has reached the press (the mixer is flat out then too). Then the fryer is
   tuned up to the top (4s -> 1.7s) and the mixer (2.5s) becomes what limits the line: no
   one backs up, the fryer waits for it, and the mixer is named instead. A line run into a wall is all backed up and
   nothing working, which is a stuck line, not a slow one: nothing is pointed at either. */
import { createFactory, MAX_LVL } from '../../donut-works/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const pct = (u) => (u ? `work ${Math.round(u.work * 100)}% wait ${Math.round(u.wait * 100)}% full ${Math.round(u.full * 100)}%` : 'none');

export default function () {
  const bad = [], out = [];
  const f = createFactory({ rnd: mulberry32(3) });
  f.cash = 50000;
  const R = 3;
  [f.placeMachine(0, R, 'mixer', 0), f.placeBelt(1, R, 0), f.placeMachine(2, R, 'press', 0), f.placeBelt(3, R, 0),
    f.placeMachine(4, R, 'fryer', 0), f.placeBelt(5, R, 0), f.placeBelt(6, R, 0), f.placeMachine(7, R, 'counter', 0)]
    .forEach((ok, i) => { if (!ok) bad.push(`placing piece ${i} failed`); });
  if (f.usage(4, R) !== null) bad.push('usage before anything ran');
  f.step(40);
  const early = f.slowest();
  out.push(`at 40s slowest ${early ? `${early.c},${early.r}` : 'none'}`);
  if (!early || early.c !== 4) bad.push('at 40s slowest() does not name the fryer');
  f.step(50);
  const mix = f.usage(0, R), press = f.usage(2, R), fry = f.usage(4, R);
  out.push(`mixer ${pct(mix)}`, `press ${pct(press)}`, `fryer ${pct(fry)}`);
  if (!fry || fry.work < 0.9) bad.push('the fryer is not shown flat out');
  if (!press || press.full < 0.3) bad.push('the press is not shown backed up behind the fryer');
  if (f.usage(7, R) !== null) bad.push('the counter has shares; it is a sink');
  for (const u of [mix, press, fry]) if (u && Math.abs(u.work + u.wait + u.full - 1) > 1e-9) bad.push('shares do not add to 1');
  const s = f.slowest();
  out.push(`slowest ${s ? `${s.c},${s.r}` : 'none'}`);
  if (!s || s.c !== 4) bad.push('slowest() does not name the fryer');

  for (let i = 0; i < MAX_LVL; i++) f.upgrade(f.grid[R][4]);
  f.step(120);
  const s2 = f.slowest();
  out.push(`fryer tuned up: fryer ${pct(f.usage(4, R))}, mixer ${pct(f.usage(0, R))}, slowest ${s2 ? `${s2.c},${s2.r}` : 'none'}`);
  if (!s2 || s2.c !== 0) bad.push('with the mixer the limit, slowest() does not name the mixer');

  const g = createFactory({ rnd: mulberry32(4) });
  g.cash = 50000;
  g.placeMachine(0, R, 'mixer', 0); g.placeBelt(1, R, 0); g.placeMachine(2, R, 'press', 0); g.placeBelt(3, R, 0); g.placeMachine(4, R, 'fryer', 0);
  g.step(90);
  out.push(`dead end: fryer ${pct(g.usage(4, R))}, slowest ${g.slowest() ? 'named' : 'none'}`);
  if (g.slowest()) bad.push('a dead-ended line is pointed at as slow');
  if (!(g.usage(4, R).full > 0.5)) bad.push('the dead-ended fryer is not shown backed up');

  return { pass: !bad.length, detail: (bad.length ? bad.join(' | ') + ' -- ' : '') + out.join(' · ') };
}
