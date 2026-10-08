/* The Dungeon Master can reword the page but never change the game — and, since 2026-10-08,
   can plan a whole floor (which allowed monster or feature fills a slot the dice already
   decided needs one) and choose the quest (a boss plus why), neither of which can touch the
   floor's shape or add a boss not on the list.

   No model runs here: these are real answers recorded from Phi-3 mini and SmolLM2 360M in
   the page on 2026-10-08, fed to parseReply() against the facts they were given. The
   checks: a faithful retelling is kept, with its title and its reworded choices; a story
   that invents a "bloodstained gemstone" is thrown back to the book, title and all; a
   story that forgets the rat in front of you is thrown back; the 360M model's habit of
   giving each choice another choice's words ("Take the north passage" for the healing
   potion) is caught label by label; a half-finished or empty answer leaves the book's
   page standing; and the prompt carries the facts and every choice, in order. Synthetic
   (not model-recorded) answers check floor planning and quest choosing the same way: a
   good plan is kept whole, a plan that names a monster not on that room's list is dropped
   for that room alone, a premise that invents an unlisted creature is dropped, and
   applyFloorPlan() only ever touches the rooms a valid pick named. */
import { parseReply, buildMessages, meansTheSame, invents, partialStory, buildQuestMessages, parseQuestReply, buildFloorPlanMessages, parseFloorPlan } from '../../lantern-deep/prompt.js';
import { createDelve, floorMenu, applyFloorPlan, chooseQuest, makeFloor } from '../../lantern-deep/sim.js';
import { tellPage } from '../../lantern-deep/tell.js';
import { MONSTERS, BOSSES } from '../../lantern-deep/content.js';
import { mulberry32 } from '../../lib/rng.js';

const ch = (id, label, verb = id.split(':')[0], tag = '') => ({ id, label, verb, tag });
const fightChoices = [ch('attack', 'Attack with your shortsword', 'attack', 'Attack · 1d6'), ch('skill:smoke', 'Smoke Bomb', 'skill'), ch('use:potion-heal', 'Use healing potion', 'use'), ch('use:flask-fire', 'Use alchemist’s fire', 'use'), ch('dodge', 'Dodge and roll', 'dodge'), ch('flee', 'Flee back to the Dripping Passage', 'flee')];
const fightFacts = { hero: { weapon: 'Shortsword' }, room: { foe: { name: 'giant rat', state: 'hostile' } } };

export default function () {
  const problems = [], seen = [];

  // 1. faithful: kept whole
  const good = parseReply('TITLE: Rat Scare\nSTORY: The giant rat leaps towards you, snapping its jaws dangerously close, but you duck just in time. It pants heavily, clearly surprised.\nCHOICES:\n1. Strike with your shortsword\n2. Deploy a smoke bomb\n3. Consume a healing potion\n4. Light an alchemist’s fire\n5. Perform a dodge roll\n6. Retreat to the Dripping Passage',
    { page: { title: 'Fight: Giant rat', text: 'You miss. The giant rat lunges, but you twist away.' }, choices: fightChoices, facts: fightFacts });
  if (!good.used.text || !good.used.title || good.used.labels !== 6) problems.push(`a faithful answer was not kept whole: ${JSON.stringify(good.used)}`);
  seen.push(`faithful kept ${good.used.labels}/6 labels`);

  // 2. the made-up gemstone
  const gem = parseReply('TITLE: Shadow in the Cellars\nSTORY: The rat, sensing your approach, braces and rears up. In the dimness, a glimmer catches your eye: a bloodstained gemstone, its crimson hue oddly alluring.\nCHOICES:\n1. Stab with your sword',
    { page: { title: 'Fight: Giant rat', text: 'You ready your shortsword and close in.' }, choices: fightChoices, facts: fightFacts });
  if (gem.used.text || gem.used.title) problems.push('the invented gemstone got onto the page');
  if (gem.used.labels) problems.push(`an answer that invented a gemstone was still trusted with ${gem.used.labels} choices`);
  seen.push(`gemstone caught as "${invents('a bloodstained gemstone', 'You ready your shortsword')}"`);

  // 3. forgets the rat
  const lost = parseReply('TITLE: Glittering Peril\nSTORY: The chest’s lock clicks open under your decisive swing, and the treasure tumbles forth. Beyond, a narrow passage yawns eastward into darkness.\nCHOICES:',
    { page: { title: 'Ale Pantry', text: 'A wide chamber opens up around you. Red eyes catch your lantern: a giant rat, bristling. An iron-bound chest sits against the far wall.' }, choices: [], facts: fightFacts });
  if (lost.used.text) problems.push('a story without the rat in it was kept');

  // 4. shuffled labels (SmolLM2 360M)
  const explore = [ch('use:potion-heal', 'Use healing potion', 'use'), ch('camp', 'Rest here a while', 'camp', 'Heal · once a floor · risky'), ch('go:n', 'Take the north passage', 'go'), ch('go:e', 'Take the east passage', 'go'), ch('go:s', 'Back to the Coal Undercroft', 'go')];
  const shuffled = parseReply('TITLE: Coal Undercroft\nSTORY: Click. A needle springs from the lock! It hurts. The lid creaks open and you find gold.\nCHOICES:\n1. Take the north passage\n2. Take the east passage\n3. Take the east passage\n4. Take the west passage\n5. Take the west passage',
    { page: { title: 'Coal Undercroft', text: 'Click. A needle springs from the lock! It hurts: 4 damage. The lid creaks open. You find 13 gold.' }, choices: explore, facts: { hero: { weapon: 'Shortsword' }, room: { foe: null } } });
  const wrong = shuffled.labels.filter((l, i) => l !== explore[i].label);
  if (wrong.length) problems.push(`shuffled labels got through: ${wrong.join(', ')}`);
  if (!shuffled.used.text) problems.push('a faithful story was dropped along with the shuffled labels');
  if (!meansTheSame('Gulp down a healing potion', 0, explore) || meansTheSame('Rest by the north door', 1, explore)) problems.push('meansTheSame misjudged the obvious');

  // 4b. labels that name nothing of their own (Phi-3 off the rails; SmolLM2 1.7B)
  const stair = [ch('use:potion-heal', 'Use healing potion', 'use'), ch('camp', 'Rest here a while', 'camp', 'Heal · once a floor · risky'), ch('descend', 'Take the stair down to The Old Workings', 'descend', 'Floor 2')];
  const drift = parseReply('TITLE: Smugglers’ Pantry\nSTORY: You are back in the pantry. A cold draught rises from the stair leading down.\nCHOICES:\n1. Keep fighting the foe\n2. Drink some healing tonic\n3. Take a moment\'s respite',
    { page: { title: 'Smugglers’ Pantry', text: 'You are back in the Smugglers’ Pantry. A cold draught rises from a stair leading down.' }, choices: stair, facts: { hero: { weapon: 'Shortsword' }, room: { foe: null } } });
  if (drift.used.labels) problems.push(`labels that fit no choice got through: ${drift.labels.join(' / ')}`);
  const fine = ['Gulp a healing draught', 'Sit and catch your breath', 'Descend into the dark'].every((l, i) => meansTheSame(l, i, stair));
  if (!fine) problems.push('good rewordings of the stair-room choices were refused');
  if (meansTheSame('Die, as is your will', 1, stair)) problems.push('"Die, as is your will" passed for resting');
  seen.push('drifted labels refused, good ones kept');

  // 5. nothing usable
  const none = parseReply('', { page: { title: 'T', text: 'Book text.' }, choices: explore, facts: {} });
  const half = parseReply('TITLE: The Dark\nSTO', { page: { title: 'T', text: 'Book text.' }, choices: explore, facts: {} });
  if (none.text !== 'Book text.' || half.text !== 'Book text.' || half.title !== 'T') problems.push('an empty or cut-off answer did not leave the book standing');
  if (partialStory('TITLE: x\nSTORY: You step in') !== 'You step in') problems.push('partialStory did not stream the story');

  // 6. the prompt: built from a real page
  const g = createDelve({ seed: 31, rnd: mulberry32(2) });
  const res = g.act('class:wizard');
  const facts = g.facts(), page = tellPage(facts, res.events, mulberry32(1)), cs = g.choices();
  const msgs = buildMessages({ facts, page, choices: cs });
  const user = msgs[msgs.length - 1].content;
  if (!user.includes(page.text)) problems.push('the prompt did not carry the facts');
  cs.forEach((c, i) => { if (!user.includes(`${i + 1}. ${c.label}`)) problems.push(`the prompt lost choice ${i + 1}`); });
  if (msgs[0].role !== 'system' || msgs.length !== 4) problems.push(`prompt shape: ${msgs.map((m) => m.role).join(',')}`);
  seen.push(`prompt ${user.length + msgs[0].content.length} chars with ${cs.length} choices`);

  // 7. choosing the quest: a good answer is kept, an unlisted boss or a too-short why is not
  const bosses = BOSSES.map((key) => ({ key, name: MONSTERS[key].name, blurb: MONSTERS[key].blurb }));
  const qmsgs = buildQuestMessages(bosses);
  if (qmsgs[0].role !== 'system' || !qmsgs.some((m) => m.content.includes('crabQueen'))) problems.push('the quest prompt lost a boss key');
  const goodQuest = parseQuestReply('BOSS: ogreChief\nWHY: A bounty on his head drew you down here, and you mean to collect it.', { bosses });
  if (!goodQuest || goodQuest.boss !== 'ogreChief') problems.push('a good quest answer was not kept');
  if (parseQuestReply('BOSS: dragon\nWHY: Because dragons.', { bosses })) problems.push('a boss not on the list got through');
  if (parseQuestReply('BOSS: king\nWHY: Gold.', { bosses })) problems.push('a one-word why got through');
  seen.push(`quest kept "${goodQuest && goodQuest.boss}", rejected an unlisted boss and a too-short why`);

  // 8. planning a floor: floorMenu only lists rooms the dice gave a slot to, never the start
  // or the throne; a plan naming an allowed kind is applied; one naming a kind not on that
  // slot's list, or for a room with no such slot, is dropped and the book's own pick stands.
  const draft = makeFloor(4242, 2, 'king');
  const menu = floorMenu(draft);
  if (menu.rooms.some((r) => r.id === draft.rooms[0].id)) problems.push('floorMenu listed the start room');
  if (!menu.rooms.length) problems.push('floorMenu found no slots on a real floor');
  const foeRoom = menu.rooms.find((r) => r.foe), noFoeRoom = draft.rooms.find((r) => !r.start && !r.throne && !r.foe);
  if (foeRoom) {
    const before = draft.rooms[foeRoom.id].foe.kind;
    const other = menu.monsters.find((k) => k !== before) || menu.monsters[0];
    const plan = { premise: null, rooms: { [foeRoom.id]: { foe: other } } };
    if (noFoeRoom) plan.rooms[noFoeRoom.id] = { foe: menu.monsters[0] }; // a room with no foe slot: must be refused
    applyFloorPlan(4242, draft, plan);
    if (draft.rooms[foeRoom.id].foe.kind !== other) problems.push(`a valid monster pick was not applied: wanted ${other}, got ${draft.rooms[foeRoom.id].foe.kind}`);
    if (noFoeRoom && draft.rooms[noFoeRoom.id].foe) problems.push('a monster was added to a room with no foe slot');
  } else problems.push('seed 4242 floor 2 had no foe slot to test with');
  const badKindDraft = makeFloor(4242, 2, 'king');
  const badKindMenu = floorMenu(badKindDraft);
  const badFoeRoom = badKindMenu.rooms.find((r) => r.foe);
  if (badFoeRoom) {
    const before = badKindDraft.rooms[badFoeRoom.id].foe.kind;
    applyFloorPlan(4242, badKindDraft, { rooms: { [badFoeRoom.id]: { foe: 'ogreChief' } } }); // a boss, never a valid slot pick
    if (badKindDraft.rooms[badFoeRoom.id].foe.kind !== before) problems.push('a boss kind got through as an ordinary room pick');
  }
  seen.push(`floorMenu: ${menu.rooms.length} slots, ${menu.monsters.length} monsters, ${menu.features.length} features allowed`);

  // 9. the floor-plan prompt and reply: a full, valid plan is parsed whole; an invented
  // premise creature is dropped; a room not in the menu is ignored.
  const quest = chooseQuest(9001);
  const pmsgs = buildFloorPlanMessages({ quest, floor: 2, theme: 'The Old Workings', menu });
  if (!pmsgs[1].content.includes(menu.monsters[0]) || !pmsgs[1].content.includes('ROOMS:')) problems.push('the floor-plan prompt lost the monster list or the rooms');
  let raw = `PREMISE: ${quest.premises[1]}\n`;
  for (const r of menu.rooms) { const bits = []; if (r.foe) bits.push('monster=' + menu.monsters[0]); if (r.feature) bits.push('feature=' + menu.features[0]); raw += `ROOM ${r.id}: ${bits.join(' ')}\n`; }
  const fullPlan = parseFloorPlan(raw, { menu, quest, theme: 'The Old Workings' });
  if (fullPlan.premise !== quest.premises[1]) problems.push('a faithful floor-plan premise was not kept');
  if (Object.keys(fullPlan.rooms).length !== menu.rooms.length) problems.push(`a full plan only kept ${Object.keys(fullPlan.rooms).length}/${menu.rooms.length} rooms`);

  // 9b. Llama 3, live on 2026-10-08, copied the room's own "(name)" from the prompt into its
  // answer line ("ROOM 1 (the Ale Pantry): feature=shelf") instead of a bare id; that line
  // must still parse.
  const namedRoom = menu.rooms.find((r) => r.feature);
  if (namedRoom) {
    const named = parseFloorPlan(`PREMISE: ${quest.premises[1]}\nROOM ${namedRoom.id} (${namedRoom.name}): feature=${menu.features[0]}`, { menu, quest, theme: 'The Old Workings' });
    if (!named.rooms[namedRoom.id] || named.rooms[namedRoom.id].feature !== menu.features[0]) problems.push('a ROOM line with its name copied in (Llama 3’s habit) was dropped');
  }
  const invented = parseFloorPlan(`PREMISE: A sleeping dragon has claimed this floor for its hoard.\nROOM ${menu.rooms[0].id}: monster=${menu.monsters[0]}`, { menu, quest, theme: 'The Old Workings' });
  if (invented.premise) problems.push('a premise naming an unlisted dragon got through');
  const strayRoom = parseFloorPlan(`PREMISE: ${quest.premises[1]}\nROOM 999: monster=${menu.monsters[0]}`, { menu, quest, theme: 'The Old Workings' });
  if (Object.keys(strayRoom.rooms).length) problems.push('a room id not in the menu got through');
  seen.push(`floor plan: full plan kept ${Object.keys(fullPlan.rooms).length} rooms, invented premise and stray room both dropped`);

  // 10. one seed is one dungeon, book path: the quest and every floor are identical twice,
  // and changing only the throne's monster (via questBoss) touches no other room.
  const sameQuest1 = chooseQuest(777), sameQuest2 = chooseQuest(777);
  if (JSON.stringify(sameQuest1) !== JSON.stringify(sameQuest2)) problems.push('seed 777 chose two different quests');
  const kingFloor = makeFloor(777, 5, 'king'), ogreFloor = makeFloor(777, 5, 'ogreChief');
  const stripThrone = (f) => f.rooms.map((r) => (r.throne ? null : JSON.stringify(r))).join('|');
  if (stripThrone(kingFloor) !== stripThrone(ogreFloor)) problems.push('swapping the quest boss changed a room other than the throne');
  if (kingFloor.rooms.find((r) => r.throne).foe.kind !== 'king' || ogreFloor.rooms.find((r) => r.throne).foe.kind !== 'ogreChief') problems.push('the throne room did not use the quest boss');
  seen.push('seed 777 the same quest twice; swapping the boss touches only the throne');

  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + seen.join('; ') };
}
