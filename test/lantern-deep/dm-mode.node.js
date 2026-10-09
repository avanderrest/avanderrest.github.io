/* The Dungeon Master's mode: the player tells the story and places what is in each room, an
   AI plays the hero.

   Checks, through the real sim: a 'dm' delve begins with the Dungeon Master's opening and the
   AI's background (mode 'prologue'), then the start room to describe, with every room bare;
   only rooms beside ones the hero has seen can be planned, and a plan keeps only what is
   allowed (this floor's monsters, nothing in the start room or beside the throne's boss, one
   pedlar a floor, nothing peaceful beside a monster, one thing a tile, inside the room);
   walking at a planned room stops at its door and "Let them in" builds exactly what was
   planned, names, parts, tempers and all; several creatures fight together and step up in
   turn; a fierce one charges, a friendly one does not fight, a sharp rat can be talked to and
   a dull bandit cannot; a chest's chosen contents and trap, a body's grubs and a fountain's
   chosen water all do what was chosen; two chests are two choices; a save from before rooms
   held lists still loads; and the hero speaks of a creature as the Dungeon Master cast it
   ("my brother Tom").

   Then whole delves, played by player.js against three Dungeon Masters (one placing at
   random, several things to a room, one cruel, one kind): none may get stuck, and what is
   placed has to matter (the kind one's hero gets deeper than the cruel one's). */
import { createDelve, upgradeSave, cleanPlan, makeFloor } from '../../lantern-deep/sim.js';
import { createPlayer, say, heroCall } from '../../lantern-deep/player.js';
import { tellPage } from '../../lantern-deep/tell.js';
import { parsePlayReply, buildPlayMessages } from '../../lantern-deep/prompt.js';
import { MONSTERS } from '../../lantern-deep/content.js';
import { mulberry32 } from '../../lib/rng.js';

const CLASSES = ['fighter', 'wizard', 'rogue', 'cleric'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// a Dungeon Master that plans every room it can see, as a real one would on the map
const dms = {
  random(menu, r) {
    const p = (xs) => xs[Math.floor(r() * xs.length)];
    const foes = [], things = [];
    if (menu.monsters.length && r() < 0.45) for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) foes.push({ kind: p(menu.monsters), temper: p(['wary', 'wary', 'fierce', 'friendly']), wits: p(menu.wits) });
    if (r() < 0.6) things.push({ kind: p(menu.features), trap: p(menu.chests), gold: p(menu.golds) });
    if (r() < 0.25) things.push({ kind: 'coins', gold: p(['some', 'lots']) });
    if (r() < 0.2) things.push({ kind: 'item', item: p(menu.loot) });
    return { foes, things };
  },
  cruel(menu) {
    const worst = [...menu.monsters].sort((a, b) => MONSTERS[b].xp - MONSTERS[a].xp)[0];
    return { foes: worst ? [{ kind: worst, temper: 'fierce' }] : [], things: [{ kind: 'chest', trap: 'needle', gold: 'none', items: [] }] };
  },
  kind(menu, r) {
    return { things: [{ kind: r() < 0.5 ? 'fountain' : 'altar', effect: 'heal' }, { kind: 'item', item: menu.floor >= 3 ? 'potion-greater' : 'potion-heal' }, { kind: 'coins', gold: 'some' }] };
  },
};

function delve(seed, cls, dmName) {
  const g = createDelve({ seed, rnd: mulberry32(seed * 7 + 1) });
  g.setRole('dm');
  const player = createPlayer(), r = mulberry32(seed * 13 + 5);
  g.act('class:' + cls);
  g.act('prologue', { intro: 'Down you go.', notes: 'You are brave.' });
  let n = 0, furnished = 0, starts = 1;   // the opening described the first floor's start
  const problems = [], planned = new Set();
  for (; n < 3000; n++) {
    if (g.S.mode === 'dead' || g.S.mode === 'won') break;
    // plan every room that has come into view, once
    for (const id of g.editable()) {
      const key = g.S.floor + ':' + id;
      if (planned.has(key)) continue;
      planned.add(key);
      const menu = { ...g.furnishMenu(id), floor: g.S.floor };
      if (!g.setPlan(id, dms[dmName](menu, r))) problems.push(`seed ${seed}: an editable room ${id} would not take a plan`);
    }
    if (g.S.mode === 'furnish') {
      const to = g.S.furnish.to, target = g.S.map.rooms[to];
      const boss = target.throne && target.foes[0] && target.foes[0].kind;
      if (target.start) starts++;
      const res = g.act('furnish', { line: 'A room, as the Dungeon Master tells it' });
      if (!res.ok) { problems.push(`seed ${seed}: furnish refused`); break; }
      if (g.S.at !== to || target.bare) problems.push(`seed ${seed}: furnishing did not let the hero into room ${to}`);
      if (boss && (!target.foes[0] || target.foes[0].kind !== boss)) problems.push(`seed ${seed}: furnishing the throne lost the ${boss}`);
      furnished++;
      continue;
    }
    const cs = g.choices();
    if (!cs.length) { problems.push(`seed ${seed}: no choices in mode ${g.S.mode}`); break; }
    const id = player.choose(g, cs);
    if (id == null) { problems.push(`seed ${seed}: the AI hero had nothing to choose in mode ${g.S.mode}`); break; }
    if (!say(g, id) && !/^(boost|buy|leave|skill|use)/.test(id)) problems.push(`seed ${seed}: the hero has nothing to say for ${id}`);
    if (!g.act(id).ok) { problems.push(`seed ${seed}: ${id} refused in ${g.S.mode}`); break; }
  }
  if (n >= 3000) problems.push(`seed ${seed} (${cls}, ${dmName}) stuck on floor ${g.S.floor}, mode ${g.S.mode}`);
  if (starts !== g.S.floor) problems.push(`seed ${seed}: reached floor ${g.S.floor} but described ${starts} start rooms`);
  return { won: g.S.mode === 'won', floor: g.S.floor, furnished, problems };
}

// a delve already through its opening and its start room, waiting in the start room
function started(seed = 4242, cls = 'fighter', dice = 9) {
  const g = createDelve({ seed, rnd: mulberry32(dice) });
  g.setRole('dm');
  g.act('class:' + cls);
  g.act('prologue', { intro: 'Down you go.' });
  return g;
}
// walk the hero from the start into a neighbouring room planned as asked; returns that room
function walkInto(g, plan, line = 'A planned room.') {
  const dir = Object.keys(g.room().exits).find((d) => g.S.map.rooms[g.room().exits[d]].bare);
  const to = g.room().exits[dir];
  g.setPlan(to, plan);
  g.act('go:' + dir);
  g.act('furnish', { line });
  return g.S.map.rooms[to];
}

export default function () {
  const problems = [], notes = [];

  // ---- the opening, then the start room
  const g = createDelve({ seed: 4242, rnd: mulberry32(9) });
  if (g.S.role !== 'hero') problems.push(`a new delve's role is ${g.S.role}, not hero`);
  g.setRole('dm');
  g.act('class:fighter');
  const rooms = g.S.map.rooms;
  if (rooms.some((rm) => (rm.foes.length && !rm.throne) || rm.things.length || !rm.bare)) problems.push('floor 1 of a dm delve is not all bare');
  if (g.S.mode !== 'prologue' || g.choices().map((c) => c.id).join() !== 'prologue') problems.push(`a dm delve began in mode ${g.S.mode}, not the opening`);
  if (g.setRole('hero') !== 'dm') problems.push('the role changed in the middle of a delve');
  // one page: the opening is what the AI knows, and the room the hero starts in (Amber: "it's
  // the same thing"); while it is written, that first room can be planned on the map
  if (g.furnishMenu(0).monsters.length) problems.push('the start room offers monsters');
  if (g.editable().join() !== '0') problems.push(`while the opening is written, the rooms that can be planned are ${g.editable().join()}, not the first one`);
  const startPlan = g.setPlan(0, { foes: [{ kind: 'rat' }], things: [{ kind: 'fountain', effect: 'plain' }] });
  if (!startPlan || startPlan.foes.length || startPlan.things.length !== 1) problems.push(`the start room's plan came out ${JSON.stringify(startPlan)}`);
  const intro = "Rainwater runs down the stair into a cracked stone basin. Pip's older brother Tom ran off with the bandits two winters ago, and Pip has never stopped looking for him";
  const res0 = g.act('prologue', { intro });
  if (g.S.mode !== 'explore' || rooms[0].bare || rooms[0].foes.length || !rooms[0].things.some((t) => t.kind === 'fountain')) problems.push(`after the opening: mode ${g.S.mode}, the first room ${rooms[0].bare ? 'still bare' : 'built'}`);
  if (!g.facts().notes || !/Tom ran off/.test(g.facts().notes)) problems.push('the opening is not what the AI is told it knows');
  const opening = tellPage(g.facts(), res0.events, mulberry32(4));
  if (opening.text !== intro + '.' || opening.title !== cap(rooms[0].name.replace(/^the /, ''))) problems.push(`the opening page reads "${opening.title}: ${opening.text.slice(0, 160)}"`);

  // ---- which rooms can be planned
  const ed = g.editable(), next = Object.values(rooms[0].exits);
  if (ed.includes(0)) problems.push('the room the hero is in can still be planned');
  if (next.some((id) => !ed.includes(id))) problems.push('a room beside the hero cannot be planned');
  const far = rooms.find((rm) => !rm.start && !Object.values(rm.exits).some((id) => rooms[id].visited));
  if (far && g.setPlan(far.id, { foes: [{ kind: 'rat' }] }) !== null) problems.push('a room nowhere near the hero took a plan');

  // ---- what a plan keeps
  const tgt = next[0], T = rooms[tgt];
  const inRoom = (x, y) => x >= T.x && x < T.x + T.w && y >= T.y && y < T.y + T.h;
  const wrongFloor = Object.keys(MONSTERS).find((k) => !MONSTERS[k].boss && MONSTERS[k].tiers[0] > 1 && k !== 'mimic');
  const p = g.setPlan(tgt, {
    foes: [{ kind: 'bandit', name: '  Tom ', who: "Pip's older brother, who ran off with the bandits", temper: 'wary', wits: 'sharp', x: T.x, y: T.y }, { kind: wrongFloor }, { kind: 'king' }, { kind: 'rat', temper: 'grumpy', wits: 'genius', x: T.x, y: T.y }],
    things: [{ kind: 'camp' }, { kind: 'throne' }, { kind: 'item', item: 'sword-of-truth' }, { kind: 'chest', trap: 'mimic', gold: 'lots', items: ['antidote', 'nonsense', 'wand-sparks', 'potion-heal', 'flask-fire'], weapon: 'axe', x: 999, y: 999 }, { kind: 'chest', weapon: 'greataxe' }],
  });
  if (!p || p.foes.length !== 2) problems.push(`a plan kept ${p && p.foes.length} creatures, wanted the bandit and the rat`);
  else {
    if (p.foes[0].name !== 'Tom' || !/brother/.test(p.foes[0].who) || p.foes[0].wits !== 'sharp') problems.push(`Tom came out ${JSON.stringify(p.foes[0])}`);
    if (p.foes[1].temper !== 'wary' || p.foes[1].wits !== 'average') problems.push(`made-up temper and wits were not set back to the usual: ${JSON.stringify(p.foes[1])}`);
    if (p.foes[0].x === p.foes[1].x && p.foes[0].y === p.foes[1].y) problems.push('two creatures were let onto one tile');
  }
  if (!p || p.things.length !== 2 || p.things[0].kind !== 'chest') problems.push(`a plan kept things ${p && JSON.stringify(p.things.map((t) => t.kind))}, wanted only the chests (no campfire beside a bandit, no made-up throne or sword)`);
  else {
    const c = p.things[0];
    if (!inRoom(c.x, c.y)) problems.push(`a chest placed outside the room landed at ${c.x},${c.y}`);
    if (c.items.join() !== 'antidote,wand-sparks,potion-heal' || c.weapon !== 'axe' || c.trap !== 'mimic' || c.gold !== 'lots') problems.push(`the chest's contents came out ${JSON.stringify(c)}`);
    if (p.things[1].weapon) problems.push('a greataxe (floor 4 and down) was let into a floor 1 chest');
  }
  // one pedlar a floor, counting plans
  const other = next[1] != null ? next[1] : null;
  if (other != null) {
    g.setPlan(other, { things: [{ kind: 'merchant' }] });
    const p2 = g.setPlan(tgt, { things: [{ kind: 'merchant' }] });
    if (p2.things.length) problems.push('a second pedlar was planned onto the floor');
    g.setPlan(other, { things: [] });
  }

  // ---- walking in builds the plan
  g.setPlan(tgt, { foes: [{ kind: 'bandit', name: 'Tom', who: "Pip's older brother, who ran off with the bandits", wits: 'sharp' }, { kind: 'rat', temper: 'friendly' }],
    things: [{ kind: 'chest', trap: 'needle', gold: 'none', items: ['antidote'], weapon: null }, { kind: 'chest', trap: 'none', gold: 'some', items: [] }, { kind: 'coins', gold: 'lots' }] });
  const dir = Object.keys(rooms[0].exits).find((d) => rooms[0].exits[d] === tgt);
  g.act('go:' + dir);
  if (g.S.mode !== 'furnish' || g.S.at !== 0) problems.push(`walking at a planned room left mode ${g.S.mode} at room ${g.S.at}`);
  const door = tellPage(g.facts(), [{ t: 'furnish', dir, stairs: false }], mulberry32(1));
  if (door.title !== 'At the Doorway' || !/doorway/.test(door.text)) problems.push(`the door page reads "${door.title}: ${door.text}"`);
  // a save at the door, from before rooms held lists, still loads
  const old = JSON.parse(JSON.stringify(g.S));
  old.v = 1; for (const rm of old.map.rooms) { rm.foe = rm.foes[0] || null; rm.feature = rm.things.find((t) => !['coins', 'item'].includes(t.kind)) || null; rm.gold = 0; rm.item = null; delete rm.foes; delete rm.things; }
  const g2 = createDelve({ saved: upgradeSave(old), rnd: mulberry32(3) });
  if (g2.S.v !== 2 || g2.S.mode !== 'furnish' || !Array.isArray(g2.S.map.rooms[0].things) || !g2.furnishMenu() || g2.furnishMenu().room !== tgt) problems.push('a save from before rooms held lists did not come back at the door');
  g.act('furnish', { line: '  Barrels   of black wine lean against the walls,\n and Tom sits on one of them. ' });
  const rm = g.room();
  if (g.S.at !== tgt || g.S.mode !== 'explore') problems.push(`after furnishing the hero is in room ${g.S.at}, mode ${g.S.mode}`);
  if (rm.foes.length !== 2 || rm.foes[0].name !== 'Tom' || rm.foes[0].state !== 'hostile' || rm.foes[1].state !== 'calm') problems.push(`the room holds ${JSON.stringify(rm.foes.map((f) => [f.kind, f.name, f.state]))}`);
  const chests = rm.things.filter((t) => t.kind === 'chest');
  if (chests.length !== 2 || !chests[0].trapped || chests[0].mimic || chests[0].gold !== 0 || chests[0].items.join() !== 'antidote' || !(chests[1].gold > 0)) problems.push(`the chests came out ${JSON.stringify(chests)}`);
  if (rm.line !== 'Barrels of black wine lean against the walls, and Tom sits on one of them.') problems.push(`the line came out as "${rm.line}"`);
  const page = tellPage(g.facts(), [{ t: 'enter', room: tgt, first: true }], mulberry32(2));
  if (!page.text.startsWith(rm.line) || /passage|underfoot|smells of/i.test(page.text)) problems.push(`the book added its own words to the Dungeon Master's room: ${page.text}`);
  // names in the choices (the rat is friendly, so Tom stands alone), and the hero's part
  const labels = g.choices().map((c) => c.label);
  if (!labels.includes('Fight Tom') || !labels.includes('Creep past Tom in the shadows') || !labels.includes('Talk your way past Tom')) problems.push(`with Tom in the way the choices read: ${labels.join(' / ')}`);
  const pip = { name: 'Pip' };
  if (heroCall({ kind: 'bandit', name: 'Tom', who: "Pip's older brother, who ran off with the bandits" }, pip) !== 'my brother Tom') problems.push(`Pip calls Tom "${heroCall({ kind: 'bandit', name: 'Tom', who: "Pip's older brother" }, pip)}"`);
  if (heroCall({ kind: 'bandit', name: 'Mags', who: "Tom's sister" }, pip) !== 'Mags') problems.push('a tie to someone else was taken as the hero\'s own');
  if (heroCall({ kind: 'bandit' }, pip) !== 'the bandit') problems.push('a nameless bandit is not "the bandit"');
  const asPip = { S: { ...g.S, hero: { ...g.S.hero, name: 'Pip' }, mode: 'explore' }, room: () => rm, foe: () => null };
  const line = say(asPip, 'sneak');
  if (!/my brother Tom/i.test(line)) problems.push(`sneaking past Tom, Pip says "${line}"`);
  const player = createPlayer();
  const move = player.choose(g, g.choices());
  if (move !== 'parley' && move !== 'sneak') problems.push(`with Tom in the way the adventurer chose ${move}, not words or slipping by`);
  // two chests are two choices
  for (const f of rm.foes) f.state = 'calm';
  const ids = g.choices().map((c) => c.id);
  const opens = ids.filter((i) => i.startsWith('open:'));
  if (opens.length !== 2 || !g.choices().some((c) => c.label === 'Open the second chest')) problems.push(`two chests gave the choices ${ids.join(', ')}`);
  const goldBefore = g.S.hero.gold;
  g.act(opens[1]);
  if (!(g.S.hero.gold > goldBefore) || chests[0].state !== 'new') problems.push('opening the second chest opened the wrong one');
  g.act('take');
  if (rm.things.some((t) => t.kind === 'coins' && t.state === 'new')) problems.push('the coins were not gathered up');

  // ---- tempers and wits
  {
    const h = started(5151, 'rogue');
    walkInto(h, { foes: [{ kind: 'bandit', temper: 'fierce' }] });
    if (h.S.mode !== 'fight' || !h.S.log[h.S.log.length - 1].events.includes('charge')) problems.push(`a fierce bandit did not charge (mode ${h.S.mode})`);
  }
  {
    const h = started(5252, 'rogue');
    walkInto(h, { foes: [{ kind: 'rat', wits: 'sharp' }] });
    if (!h.choices().some((c) => c.id === 'parley')) problems.push('a sharp rat cannot be talked to');
    const h2 = started(5353, 'rogue');
    walkInto(h2, { foes: [{ kind: 'bandit', wits: 'dull' }] });
    if (h2.choices().some((c) => c.id === 'parley')) problems.push('a dull bandit can still be talked to');
    const h3 = started(5454, 'rogue');
    walkInto(h3, { foes: [{ kind: 'bandit', wits: 'average' }] });
    const h4 = started(5454, 'rogue');
    walkInto(h4, { foes: [{ kind: 'bandit', wits: 'sharp' }] });
    const avg = h3.choices().find((c) => c.id === 'parley'), sharp = h4.choices().find((c) => c.id === 'parley');
    if (!avg || !sharp || !(sharp.chance > avg.chance)) problems.push(`a sharp bandit is not easier to reason with (${avg && avg.chance} vs ${sharp && sharp.chance})`);
  }
  // several creatures fight together, and step up in turn
  {
    const h = started(6161, 'fighter');
    walkInto(h, { foes: [{ kind: 'rat' }, { kind: 'rat' }, { kind: 'rat' }] });
    if (!h.choices().some((c) => c.label === 'Fight the giant rat and the 2 others')) problems.push(`three rats read ${h.choices()[0].label}`);
    h.act('fight');
    let joined = 0, stepped = 0;
    for (let i = 0; i < 60 && h.S.mode === 'fight'; i++) {
      const res = h.act('attack');
      joined += res.events.filter((e) => e.t === 'joins').length;
      stepped += res.events.filter((e) => e.t === 'next').length;
    }
    if (!joined) problems.push('the other rats never joined in');
    if (h.S.mode === 'explore' && (stepped !== 2 || h.room().foes.some((f) => f.state === 'hostile'))) problems.push(`three rats: ${stepped} stepped up, ${h.room().foes.filter((f) => f.state === 'hostile').length} still hostile`);
    notes.push(`three rats: ${joined} swings joined in, ${stepped} stepped up, the hero ${h.S.mode === 'dead' ? 'died' : `won with ${h.S.hero.hp} HP`}`);
  }
  // the water and the body do what was chosen
  {
    const h = started(7171, 'cleric');
    h.S.hero.hp = 3;
    walkInto(h, { things: [{ kind: 'fountain', effect: 'heal' }, { kind: 'corpse', grubs: true, gold: 'none', items: ['wand-sparks'] }] });
    h.act(h.choices().find((c) => c.verb === 'drink').id);
    if (h.S.hero.hp !== h.S.hero.maxHp) problems.push('a healing fountain did not heal');
    const res = h.act(h.choices().find((c) => c.verb === 'search').id);
    if (!res.events.some((e) => e.t === 'grubs') || !h.S.hero.bag.some((b) => b.id === 'wand-sparks')) problems.push('a body with grubs and a wand did not have both');
  }

  // ---- what only a Dungeon Master places: a note, a snare, a weapon on the floor, a sleeper, a gift
  {
    const h = started(8181, 'fighter');
    const words = 'Turn back. The thing on the throne is not the king. T.';
    walkInto(h, { foes: [{ kind: 'rat', temper: 'asleep' }], things: [{ kind: 'note', text: words }, { kind: 'weapon', weapon: 'axe' }, { kind: 'weapon', weapon: 'greataxe' }] });
    const rm2 = h.room();
    if (rm2.foes[0].state !== 'passed' || !h.choices().some((c) => c.verb === 'ambush')) problems.push('an asleep rat is not asleep');
    if (rm2.things.some((t) => t.weapon === 'greataxe')) problems.push('a floor 4 greataxe was let onto floor 1');
    rm2.foes[0].state = 'dead';
    const read = h.act(h.choices().find((c) => c.verb === 'note').id);
    const pg3 = tellPage(h.facts(), read.events, mulberry32(3));
    if (!pg3.text.includes(`The note reads: “${words}”`)) problems.push(`reading the note gave "${pg3.text}"`);
    const weaponBefore = h.S.hero.weapon, goldBefore2 = h.S.hero.gold;
    h.act('take');
    if (h.S.hero.weapon === weaponBefore && h.S.hero.gold === goldBefore2) problems.push('the axe on the floor was not picked up');
  }
  {
    let sprung = 0, spotted = 0, poisoned = 0;
    for (let k = 0; k < 60; k++) {
      const h = started(9100 + k, k % 2 ? 'fighter' : 'rogue', 300 + k);
      const hp = h.S.hero.hp;
      walkInto(h, { things: [{ kind: 'snare', snare: k % 3 === 2 ? 'gas' : k % 3 ? 'darts' : 'pit' }] });
      const evs = h.S.log[h.S.log.length - 1].events;
      if (evs.includes('snare')) sprung++;
      if (evs.includes('snareSpotted')) spotted++;
      if (evs.includes('poisoned')) poisoned++;
      if (evs.includes('snare') && k % 3 !== 2 && h.S.hero.hp >= hp) problems.push('a sprung pit or darts did no harm');
      if (h.room().things[0].state !== 'used') problems.push('a snare can go off twice');
    }
    if (!sprung || !spotted || !poisoned) problems.push(`60 snares: ${sprung} sprung, ${spotted} spotted, ${poisoned} poisoned (each should happen)`);
    notes.push(`60 snares: ${sprung} sprung, ${spotted} spotted, ${poisoned} poisoned`);
  }
  {
    const h = started(9300, 'wizard');
    walkInto(h, { foes: [{ kind: 'bandit', name: 'Tom', temper: 'friendly', gift: 'potion-greater' }, { kind: 'rat', temper: 'wary', gift: 'potion-greater' }] });
    const rm3 = h.room();
    if (rm3.foes[1].gift) problems.push('a gift was let onto a creature that is not friendly');
    rm3.foes[1].state = 'dead';
    const talk = h.choices().find((c) => c.verb === 'talk');
    if (!talk || talk.label !== 'Talk with Tom') problems.push(`a friendly Tom with a gift offers ${talk && talk.label}`);
    else {
      const res = h.act(talk.id);
      if (!h.S.hero.bag.some((b) => b.id === 'potion-greater') || h.choices().some((c) => c.verb === 'talk')) problems.push('Tom\'s gift was not handed over, once');
      const pg4 = tellPage(h.facts(), res.events, mulberry32(4));
      if (!/Tom presses a greater healing into your hands/.test(pg4.text)) problems.push(`the gift reads "${pg4.text}"`);
    }
  }

  // ---- the model's move
  const choices = [{ id: 'fight', label: 'Fight Tom' }, { id: 'sneak', label: 'Creep past Tom in the shadows', check: { stat: 'dex' }, chance: 0.6 }, { id: 'go:n', verb: 'go', label: 'Take the north passage', tag: 'Unexplored' }];
  const pg2 = { text: 'Barrels of black wine lean against the walls, and Tom sits on one of them.' };
  const facts = { quest: { why: 'The village wants the brute gone.', bossName: 'Ogre Chieftain' }, notes: 'Your brother Tom ran off with the bandits.', room: { foes: [{ given: 'Tom', species: 'bandit', who: "Pip's older brother" }] } };
  const cases = [
    ['CHOICE: 2\nSAY: Quiet now, quiet.', 'sneak', 'Quiet now, quiet.'],
    ['**CHOICE:** 1\nSAY: "Have at you!"', 'fight', 'Have at you!'],
    ['CHOICE: 3\nSAY: I will find the dragon below.', 'go:n', null],
    ['CHOICE: 1\nSAY: Aye, this could lead me to the ogre.\n\n\nFollow-up question 1: How should she', 'fight', 'Aye, this could lead me to the ogre.'],
    ['CHOICE: 2\nSAY: I will sneak past my brother, and the bandits after him.', 'sneak', 'I will sneak past my brother, and the bandits after him.'],
    ['3', 'go:n', null],
    ['CHOICE: 4\nSAY: hmm', undefined, undefined],
    ['I think I should fight.', undefined, undefined],
  ];
  for (const [raw, id, sayLine] of cases) {
    const r = parsePlayReply(raw, { choices, page: pg2, facts });
    if (id === undefined ? r !== null : !r || r.id !== id || r.say !== sayLine) problems.push(`parsePlayReply(${JSON.stringify(raw)}) gave ${JSON.stringify(r)}`);
  }
  for (const f of rm.foes) f.state = 'hostile';
  const msgs = buildPlayMessages({ facts: { ...g.facts(), notes: 'Your brother Tom ran off with the bandits.' }, page, choices: g.choices().filter((c) => !c.disabled) });
  if (!/CHOICES:\n1\. /.test(msgs[3].content) || !/BACKGROUND: Your brother Tom/.test(msgs[3].content) || !/HERE:\n- Tom \(bandit\)/.test(msgs[3].content)) problems.push(`the play prompt reads: ${msgs[3].content.slice(0, 400)}`);

  // ---- cleanPlan reads the first version's one-of-each spec
  {
    const fl = makeFloor(99, 1, 'king');
    for (const r0 of fl.rooms) { r0.bare = true; r0.plan = { foes: [], things: [] }; r0.foes = []; r0.things = []; }
    const room1 = fl.rooms.find((r0) => !r0.start);
    const c = cleanPlan(fl, room1.id, { foe: 'bandit', feature: 'chest', chest: 'trapped', gold: true, item: 'antidote' });
    if (c.foes.map((f) => f.kind).join() !== 'bandit' || c.things.map((t) => t.kind + (t.trap || '')).join() !== 'chestneedle,coins,item') problems.push(`the old one-of-each spec came out ${JSON.stringify(c)}`);
  }

  // ---- whole delves
  const tally = {};
  for (const name of Object.keys(dms)) {
    const t = tally[name] = { runs: 0, wins: 0, furnished: 0, floors: 0 };
    for (let k = 0; k < 40; k++) {
      const res = delve(5000 + k, CLASSES[k % 4], name);
      problems.push(...res.problems);
      t.runs++; t.floors += res.floor; t.furnished += res.furnished; if (res.won) t.wins++;
    }
  }
  // kindness gets the hero deeper, not to a win: with no monsters on the way it reaches the boss at level 1
  if (!(tally.kind.floors > tally.cruel.floors + 20)) problems.push(`the kind Dungeon Master's heroes got ${tally.kind.floors} floors deep in all, the cruel one's ${tally.cruel.floors}: placing things does not matter`);
  if (tally.random.furnished < 40 * 5) problems.push(`only ${tally.random.furnished} rooms furnished in 40 random delves`);
  for (const [name, t] of Object.entries(tally)) notes.push(`${name}: ${t.wins}/${t.runs} won, floor ${(t.floors / t.runs).toFixed(1)}, ${(t.furnished / t.runs).toFixed(1)} rooms a delve`);

  return { pass: !problems.length, detail: (problems.length ? problems.slice(0, 14).join(' | ') + ' -- ' : '') + notes.join('; ') };
}
