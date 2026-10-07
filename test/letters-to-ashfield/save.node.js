/* What the post office keeps, it keeps right.

   Two saves: the case in progress (letters-to-ashfield-save-v4, the whole state, written
   on every change) and the record across cases (…-meta-v4: cases run, culprits caught).
   In Node: start a case and sort part of day 1's pile; a fresh post office handed a JSON
   copy of the last save (the title's Continue) has the same culprit, day, words and the
   same pile, sorted as far as it was, and the morning carries on from there. A case's
   post is built from its seed alone: the same seed lays out the same pile for any day.
   Closing a case counts it, and catching the culprit records who. The first case is
   never the postmistress herself. */
import { createPostOffice } from '../../letters-to-ashfield/sim.js';

export default function () {
  const problems = [];
  let saved = null, metaSaves = 0;
  const meta = { runs: 0, solved: [] };
  const on = (ev, d) => { if (ev === 'save') saved = JSON.stringify(d); if (ev === 'meta') metaSaves++; };
  const po = createPostOffice({ meta, on });
  po.seedDice(4);
  const firsts = new Set();
  for (let i = 0; i < 40; i++) { po.newGame(); firsts.add(po.S.culprit); }
  if (firsts.has('beatrice')) problems.push('a first case drew the postmistress');
  po.newGame();
  po.startDay();
  const pile = po.S.pile.map((x) => x.id).join();
  for (let k = 0; k < 3; k++) { const it = po.current(); if (it.back) po.noticed(it); po.sortInto(it.to); }
  const at = po.current().id;

  const copy = JSON.parse(saved);
  const again = createPostOffice({ meta: { runs: 0, solved: [] } });
  again.S = copy;
  if (copy.culprit !== po.S.culprit || copy.day !== 1) problems.push(`continued as ${copy.culprit} on day ${copy.day}`);
  if (again.S.pile.map((x) => x.id).join() !== pile) problems.push('the continued pile is a different pile');
  if (!again.current() || again.current().id !== at) problems.push(`the continued pile is up to ${again.current() && again.current().id}, not ${at}`);
  if (JSON.stringify(again.S.words) !== JSON.stringify(po.S.words)) problems.push('the words learnt did not come back');
  const r = again.sortInto(again.current().to);
  if (r !== 'ok') problems.push(`sorting on after Continue said ${r}`);

  const twin = createPostOffice();
  twin.S = JSON.parse(JSON.stringify(po.S));
  for (const day of [2, 5, 9]) {
    if (po.buildPile(day).map((x) => x.id + x.to).join() !== twin.buildPile(day).map((x) => x.id + x.to).join()) problems.push(`day ${day}'s pile differs on the same seed`);
  }

  po.S.hall = { step: 'win' };
  po.closeCase();
  const caught = po.S.culprit;
  if (meta.runs !== 1 || meta.solved[0] !== caught || !metaSaves) problems.push(`after closing the case: ${JSON.stringify(meta)}`);
  if (po.S.phase !== 'end') problems.push(`the case closed in phase ${po.S.phase}`);

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `first cases drew ${[...firsts].sort().join(', ')}; continued day 1 at ${at} with the same pile of ${pile.split(',').length}; ` +
      `piles for days 2, 5, 9 alike on one seed; closing the case recorded ${caught}`,
  };
}
