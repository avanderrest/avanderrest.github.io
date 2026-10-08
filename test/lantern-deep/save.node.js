/* What Lantern Deep keeps, it keeps right; and a seed is a dungeon.

   Pick a class and play forty choices (the first one offered that is not a disabled
   button, rotating through them), save, restore into a fresh sim, save again: the two
   saves are identical, and both sims then play on alike under the same dice. One seed lays
   out the same five floors (rooms, passages, what is in each room) every time, and another
   seed lays out different ones. A finished delve keeps its record into the next. */
import { createDelve, makeFloor } from '../../lantern-deep/sim.js';
import { FLOORS } from '../../lantern-deep/content.js';
import { mulberry32 } from '../../lib/rng.js';

const play = (g, n, k0 = 0) => {
  for (let i = 0; i < n; i++) {
    const cs = g.choices().filter((c) => !c.disabled);
    if (!cs.length) break;
    g.act(cs[(i + k0) % cs.length].id);
  }
};
const print = (seed) => {
  const parts = [];
  for (let f = 1; f <= FLOORS; f++) for (const r of makeFloor(seed, f).rooms)
    parts.push(`${f}:${r.gx},${r.gy}:${r.x},${r.y},${r.w}x${r.h}:${Object.entries(r.exits).join('')}:${r.foe ? r.foe.kind + r.foe.hp : '-'}:${r.feature ? r.feature.kind : '-'}:${r.stairs ? 'S' : ''}`);
  return parts.join('|');
};

export default function () {
  const problems = [];
  const a = createDelve({ seed: 515, rnd: mulberry32(1) });
  a.act('class:cleric');
  play(a, 40);
  a.note({ title: 'Somewhere', text: 'A page of the story.' });
  const saved = JSON.parse(JSON.stringify(a.S));
  const b = createDelve({ saved: JSON.parse(JSON.stringify(saved)), rnd: mulberry32(1) });
  if (JSON.stringify(b.S) !== JSON.stringify(saved)) problems.push('restoring changed the save');
  if (JSON.stringify(b.choices()) !== JSON.stringify(a.choices())) problems.push('a restored delve offers different choices');
  const a2 = createDelve({ saved: JSON.parse(JSON.stringify(saved)), rnd: mulberry32(9) });
  const b2 = createDelve({ saved: JSON.parse(JSON.stringify(saved)), rnd: mulberry32(9) });
  play(a2, 60, 1); play(b2, 60, 1);
  if (JSON.stringify(a2.S) !== JSON.stringify(b2.S)) problems.push('two restored delves played apart');

  const p1 = print(4242), p2 = print(4242), p3 = print(4243);
  if (p1 !== p2) problems.push('seed 4242 laid out two different dungeons');
  if (p1 === p3) problems.push('seeds 4242 and 4243 laid out the same dungeon');

  // a dead hero's record carries into the next delve
  const c = createDelve({ seed: 9, rnd: mulberry32(3) });
  c.act('class:wizard');
  c.S.hero.hp = 1; c.S.mode = 'explore';
  for (let i = 0; i < 400 && c.S.mode !== 'dead'; i++) { const cs = c.choices().filter((x) => !x.disabled); c.act((cs.find((x) => x.id === 'attack' || x.id === 'fight') || cs[cs.length - 1]).id); }
  const deadRecord = JSON.stringify(c.S.record);
  if (c.S.mode === 'dead') c.act('new');
  if (c.S.mode !== 'create' || c.S.record.runs !== 1 || JSON.stringify(c.S.record) !== deadRecord) problems.push(`new delve after a death: mode ${c.S.mode}, record ${JSON.stringify(c.S.record)}`);

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `saved on floor ${saved.floor}, room ${saved.at}, mode ${saved.mode}, ${saved.hero.hp}/${saved.hero.maxHp} HP, ${saved.hero.gold} gold; restore identical, plays on alike for 60 choices; seed 4242 the same ${p1.split('|').length} rooms twice`,
  };
}
