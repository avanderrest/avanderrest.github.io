/* The sparrow mark keeps what it should, and a closed page picks up from it.

   Tithe saves one thing (tithe-save-v1): a snapshot taken at each sparrow mark, of the
   run (silver, items, the tally) and the level (the mark, the guards, the rooms). In
   Node: start the first contract, take a few things, put one guard down for good and
   another to sleep, and touch a sparrow mark. Then spend silver and get killed: a death
   puts the run back as it was at the mark, with the deaths still counted and full hearts.
   A fresh game built from a JSON copy of the save (the title's Continue) stands at the
   same mark with the same run, the dead guard still dead, the sleeper still asleep, the
   searched spots still searched. The ending clears the save. */
import { createTithe } from '../../tithe/sim.js';

export default function () {
  const problems = [];
  let stored = null, cleared = 0, card = null;
  const on = (ev, d) => {
    if (ev === 'save') stored = JSON.stringify(d);
    if (ev === 'clear-save') { stored = null; cleared++; }
    if (ev === 'card') card = d;
  };
  const ti = createTithe({ load: () => (stored ? JSON.parse(stored) : null), on });
  const { S } = ti;
  ti.newGame(); card.actions[0].fn();
  if (S.mode !== 'ext' || !stored) problems.push(`the first contract did not start with a save (mode ${S.mode})`);

  S.run.silver = 25; S.run.items.push('coffer-key'); S.run.inv.pebbles = 2;
  S.guards[0].state = 'dead'; S.guards[1].state = 'ko';
  const room = Object.keys(ti.LEVELS[0].rooms)[0];
  ti.roomState(room).done[0] = true;
  const P = S.player;
  ti.checkpoint(P.x, P.y, P.f);
  const at = { ...S.lv.cp };

  S.run.silver = 0; S.run.items.length = 0;
  ti.die('A test fall.');
  if (!card || card.title !== 'Wren falls') problems.push('dying showed no card');
  card.actions[0].fn();
  if (S.run.silver !== 25 || !ti.has('coffer-key')) problems.push(`after a death the run is silver ${S.run.silver}, items ${S.run.items}`);
  if (S.run.stats.deaths !== 1 || S.run.hearts !== 3) problems.push(`after a death: ${S.run.stats.deaths} deaths, ${S.run.hearts} hearts`);
  if (S.guards[0].state !== 'dead' || S.guards[1].state !== 'ko') problems.push(`after a death the guards are ${S.guards[0].state}, ${S.guards[1].state}`);

  // Continue, on a fresh page
  const saved = JSON.parse(stored);
  const again = createTithe({ load: () => saved });
  const T = again.S;
  T.run = JSON.parse(JSON.stringify(saved.run)); T.lv = JSON.parse(JSON.stringify(saved.lv)); T.snap = saved;
  again.startLevel(saved.li, true);
  const same = T.lv.cp.x === at.x && T.lv.cp.y === at.y && T.player.x === at.x;
  if (!same) problems.push(`continued at ${T.lv.cp.x},${T.lv.cp.y}, not ${at.x},${at.y}`);
  if (T.run.silver !== 25 || T.run.inv.pebbles !== 2 || !again.has('coffer-key')) problems.push('the continued run lost its silver, pebbles or key');
  if (T.guards[0].state !== 'dead' || T.guards[1].state !== 'ko') problems.push(`continued guards are ${T.guards[0].state}, ${T.guards[1].state}`);
  if (!again.roomState(room).done[0]) problems.push('a searched spot came back unsearched');

  ti.ending();
  if (stored !== null || cleared !== 1) problems.push('the ending did not clear the save');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `mark at ${at.x},${at.y}; after a death: ${S.run.silver} silver, ${S.run.stats.deaths} death, ${S.run.hearts} hearts; ` +
      `continued at ${T.player.x},${T.player.y} with ${T.run.silver} silver, guards ${T.guards[0].state}/${T.guards[1].state}; ending cleared the save`,
  };
}
