/* A saved run comes back as it was, and a seed is a mat.

   In Node: start a run, lay a line, run a day, then save it the way the page does (the
   RUN_FIELDS of the state, the bridges, the stations, lines and trains), resume it in a
   fresh copy, and save again: the two must match. Then both run on under the same dice
   and must stay matched. Two new games on one seed lay out the same river, neighbourhoods
   and trees whatever the dice; another seed does not. */
import { createRouteBuilder } from '../../route-builder/sim.js';

const snapshot = (rb) => {
  const out = {};
  rb.RUN_FIELDS.forEach((k) => { out[k] = rb.state[k]; });
  out.bridges = [...rb.state.bridges];
  return JSON.stringify({ state: out, stations: rb.stations, lines: rb.lines, trains: rb.trains });
};
const mat = (rb) => JSON.stringify([rb.state.river, rb.state.neighborhoods, rb.state.trees]);

export default function () {
  const problems = [];
  const a = createRouteBuilder({});
  a.seedDice(3);
  a.newGame('survival', 31337);
  a.state.inv.track = 99; a.state.inv.bridges = 9;
  const s1 = a.createStation({ x: 500, y: 250 }), s2 = a.createStation({ x: 1300, y: 250 });
  a.beginDraft(s1.id); a.tryAppendDraft(s2.id); a.commitDraft();
  a.placeTrain(a.lines[0]);
  for (let i = 0; i < 20 * 32; i++) a.step(1 / 20);
  const saved = snapshot(a);

  const b = createRouteBuilder({});
  b.resumeGame(JSON.parse(saved));
  const again = snapshot(b);
  if (again !== saved) problems.push(`resumed run saves differently (${again.length} vs ${saved.length} chars)`);

  a.resumeGame(JSON.parse(saved));
  a.seedDice(8); b.seedDice(8);
  for (let i = 0; i < 20 * 32; i++) { a.step(1 / 20); b.step(1 / 20); }
  if (snapshot(a) !== snapshot(b)) problems.push('two copies of one save drifted apart under the same dice');

  const m1 = createRouteBuilder({}), m2 = createRouteBuilder({}), m3 = createRouteBuilder({});
  m1.seedDice(1); m2.seedDice(2); m3.seedDice(1);
  m1.newGame('calm', 4242); m2.newGame('calm', 4242); m3.newGame('calm', 4243);
  if (mat(m1) !== mat(m2)) problems.push('seed 4242 laid out two different mats');
  if (mat(m1) === mat(m3)) problems.push('seeds 4242 and 4243 gave the same mat');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `run saved on day ${JSON.parse(saved).state.day} with ${a.state.houses.length} houses and ${a.state.stats.delivered} delivered (${saved.length} chars); seed 4242 gave the same mat twice`,
  };
}
