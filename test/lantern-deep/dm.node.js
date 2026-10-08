/* The Dungeon Master can reword the page but never change the game.

   No model runs here: these are real answers recorded from Phi-3 mini and SmolLM2 360M in
   the page on 2026-10-08, fed to parseReply() against the facts they were given. The
   checks: a faithful retelling is kept, with its title and its reworded choices; a story
   that invents a "bloodstained gemstone" is thrown back to the book, title and all; a
   story that forgets the rat in front of you is thrown back; the 360M model's habit of
   giving each choice another choice's words ("Take the north passage" for the healing
   potion) is caught label by label; a half-finished or empty answer leaves the book's
   page standing; and the prompt carries the facts and every choice, in order. */
import { parseReply, buildMessages, meansTheSame, invents, partialStory } from '../../lantern-deep/prompt.js';
import { createDelve } from '../../lantern-deep/sim.js';
import { tellPage } from '../../lantern-deep/tell.js';
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

  return { pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + seen.join('; ') };
}
