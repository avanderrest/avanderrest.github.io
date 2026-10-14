/* A note left out entirely shows when the timeline plays back.

   Amber (2026-10-14): if a note is missing altogether, playing back should say so: the
   column at that step goes red. A near miss (a step out) or a wrong button on the right
   step is not a gap; those already colour the note itself. This scores a few drafts of a
   made-up part and checks which steps come back as gaps. */
import { scoreTimeline } from '../../backing-band/sim.js';

export default function () {
  const part = { length: 16, events: [{ step: 0, b: 0 }, { step: 4, b: 1 }, { step: 8, b: 2 }, { step: 12, b: 0 }] };
  const draft = (list) => new Map(list.map(([step, b]) => [step + '|' + b, { step, b }]));
  const cases = [
    ['all placed', [[0, 0], [4, 1], [8, 2], [12, 0]], []],
    ['step 8 left out', [[0, 0], [4, 1], [12, 0]], [8]],
    ['step 8 a step late', [[0, 0], [4, 1], [9, 2], [12, 0]], []],
    ['step 8 wrong button', [[0, 0], [4, 1], [8, 0], [12, 0]], []],
    ['nothing at all', [], [0, 4, 8, 12]],
  ];
  const out = [], problems = [];
  for (const [name, list, want] of cases) {
    const got = [...scoreTimeline(part, draft(list)).gaps].sort((a, b) => a - b);
    out.push(`${name}: [${got}]`);
    if (got.join() !== want.join()) problems.push(`${name}: gaps [${got}], wanted [${want}]`);
  }
  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + out.join('; ') };
}
