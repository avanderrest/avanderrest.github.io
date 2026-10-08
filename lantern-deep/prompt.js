/* Lantern Deep: what the language-model Dungeon Master is told, and how its answer is read.

   The model never decides anything. The sim has already rolled the dice and the book
   (tell.js) has already written the page in plain words; the model is asked to retell that
   page as a Dungeon Master would, and to reword each choice without changing what it does.
   Its answer is read line by line (TITLE, STORY, CHOICES) and checked: anything missing,
   too long, that drops the creature in front of you, or that names a creature or a thing
   of value the facts do not, is replaced by the book's own words.
   No page access: dm.js does the talking to the model.

   The last page is deliberately not passed on. Phi-3 given it retold it instead of the
   new facts, and continuity is worth less than truth here. */

import { MONSTERS } from './content.js';

// ---------- constants ----------
export const MAX_STORY = 900;           // characters; a model that rambles past this is cut back to the book
const MIN_STORY = 30;
const MAX_LABEL = 64;
// words a story may only use if the facts do: things that would be game state if they were real
const THINGS = ['gem', 'gemstone', 'jewel', 'ruby', 'emerald', 'diamond', 'key', 'potion', 'scroll', 'coin', 'gold', 'treasure', 'chest', 'stair', 'staircase',
  'ring', 'amulet', 'map', 'sword', 'axe', 'dagger', 'bow', 'shield', 'wand', 'book', 'skeleton', 'corpse', 'body', 'altar', 'fountain', 'statue', 'pedlar', 'merchant', 'campfire'];
const OURS = Object.values(MONSTERS).flatMap((M) => M.name.replace(/^the /, '').split(' '))
  .filter((w) => w.length > 3 && !['swarm', 'giant', 'cave', 'hooded', 'wailing', 'green', 'ember', 'hollow'].includes(w));
const CREATURES = [...new Set([...OURS, 'rat', 'bat', 'ogre', 'king', 'goblin', 'orc', 'troll', 'dragon', 'wolf', 'zombie', 'gnoll', 'kobold', 'snake', 'centipede'])];

export const SYSTEM = [
  'You are the Dungeon Master of a dark fantasy dungeon crawl called the Lantern Deep.',
  'You retell each moment for the player in second person, present tense, in 2 to 5 vivid, plain sentences (40 to 110 words).',
  'The FACTS are the truth and are already decided. Retell only these FACTS, in order. Keep every one of them. Never add creatures, items, treasure, exits or outcomes that are not in the FACTS, and never change who hit whom. QUEST and PREMISE, when given, are background you may draw on for colour or a passing line, never something to retell at length or treat as a new fact.',
  'You may leave out exact damage numbers. Never mention dice, rules, checks or these instructions.',
  'Then reword each CHOICE as a short in-world action of at most 7 words, same meaning, same order.',
  'Answer in exactly this format and nothing else:',
  'TITLE: <3 to 6 words>',
  'STORY: <the retelling>',
  'CHOICES:',
  '1. <choice one>',
  '2. <choice two>',
].join('\n');

// One worked example, so a small model sees the shape of an answer before it writes one.
// Its creature can never appear in the game: Phi-3 borrowed the example's giant rat into
// unrelated pages, so the example uses a centipede and invents() catches any leak.
const EXAMPLE_USER = [
  'PLACE: The Cellars, floor 1 of 5, in the Wine Store.',
  'HERO: Pip, a halfling rogue (level 1), lightly wounded, wielding a shortsword.',
  'FACTS: You hit the giant centipede for 5. The giant centipede is reeling. The giant centipede bites: 3 damage.',
  'CHOICES:',
  '1. Attack with your shortsword',
  '2. Use healing potion',
  '3. Flee back to the Barrel Vault',
].join('\n');
const EXAMPLE_REPLY = [
  'TITLE: Teeth in the Dark',
  'STORY: Your blade bites into the giant centipede, and it hisses and coils, legs scrabbling at the straw. It is not finished yet: it lunges and sinks its mandibles into your calf before you can pull away.',
  'CHOICES:',
  '1. Finish the centipede with your blade',
  '2. Gulp down a healing potion',
  '3. Run back to the Barrel Vault',
].join('\n');

// facts: sim.facts(); page: the book's { title, text }; choices: sim.choices()
export function buildMessages({ facts, page, choices }) {
  const h = facts.hero, r = facts.room;
  const lines = [];
  lines.push(`PLACE: ${facts.place}, floor ${facts.floor} of 5${r ? `, in ${r.name}` : ''}.`);
  if (h) lines.push(`HERO: ${h.name}, a ${h.race.toLowerCase()} ${h.cls.toLowerCase()} (level ${h.lvl}), ${condition(h)}, wielding a ${h.weapon.toLowerCase()}.`);
  if (facts.quest) lines.push(`QUEST: ${facts.quest.why}`);
  if (facts.floorPremise) lines.push(`PREMISE: ${facts.floorPremise}`);
  lines.push(`FACTS: ${page.text}`);
  if (choices.length) {
    lines.push('CHOICES:');
    choices.forEach((c, i) => lines.push(`${i + 1}. ${c.label}`));
  }
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: EXAMPLE_USER }, { role: 'assistant', content: EXAMPLE_REPLY }, { role: 'user', content: lines.join('\n') }];
}

function condition(h) {
  const parts = [h.hurt >= 1 ? 'unhurt' : h.hurt > 0.6 ? 'lightly wounded' : h.hurt > 0.3 ? 'badly wounded' : 'close to death'];
  if (h.poisoned) parts.push('poisoned');
  if (h.blessed) parts.push('blessed');
  return parts.join(', ');
}

// The story so far while the answer is still streaming in, for the page to show as it comes.
export function partialStory(raw) {
  const m = /STORY:\s*([\s\S]*)/i.exec(raw);
  if (!m) return '';
  return clean(m[1].split(/\n\s*CHOICES:/i)[0]);
}

// Read a finished answer. Returns { title, text, labels, used } where each part is the
// model's when it passed the checks, otherwise the book's; used counts what was kept.
export function parseReply(raw, { page, choices, facts }) {
  const out = { title: page.title, text: page.text, labels: choices.map((c) => c.label), used: { title: false, text: false, labels: 0 } };
  if (!raw) return out;
  const story = partialStory(raw);
  const known = [page.text, ...choices.map((c) => c.label), facts.hero ? facts.hero.weapon : '', facts.quest ? facts.quest.why + ' ' + facts.quest.bossName : '', facts.floorPremise || ''].join(' ');
  const madeUp = invents(story, known);
  if (story.length >= MIN_STORY && story.length <= MAX_STORY && keepsTheFoe(story, facts) && !madeUp) { out.text = story; out.used.text = true; }
  // an answer that made something up is not trusted with the choices either
  if (madeUp) return out;
  // a title belongs to its story: keep it only with the story
  const title = /TITLE:\s*(.+)/i.exec(raw);
  if (title && out.used.text) {
    const t = clean(title[1]).replace(/[.:]+$/, '');
    if (t.length >= 3 && t.length <= 48 && !invents(t, known)) { out.title = t; out.used.title = true; }
  }
  const block = /CHOICES:\s*([\s\S]*)$/i.exec(raw);
  if (block) {
    for (const line of block[1].split('\n')) {
      const m = /^\s*(\d+)\s*[.):-]\s*(.+)$/.exec(line);
      if (!m) continue;
      const i = +m[1] - 1, label = clean(m[2]).replace(/[.]+$/, '');
      if (i >= 0 && i < choices.length && label.length >= 3 && label.length <= MAX_LABEL && !/^choice\b/i.test(label) && !invents(label, known) && meansTheSame(label, i, choices)) { out.labels[i] = label; out.used.labels++; }
    }
  }
  return out;
}

// A reworded choice must still read as that choice and not as one of the others: it may
// not name a direction its own choice does not, and its words must overlap its own choice
// at least as much as any other. And it needs some positive sign of being its own choice:
// a word from its own label, or one of the words that action goes by (VERB_WORDS). Phi-3,
// when it went off the rails, offered "Keep fighting the centipede" for a healing potion
// and "Take a moment's respite" for the stair down; nothing about those says they are wrong
// except that nothing says they are right.
const DIRS = { n: 'north', s: 'south', e: 'east', w: 'west' };
const STOP = new Set(['the', 'and', 'with', 'your', 'you', 'into', 'from', 'for', 'back', 'take', 'use', 'away', 'past', 'this', 'that', 'out']);
const VERB_WORDS = {
  attack: 'strike stab slash swing hit attack cut cleave smash bash finish blade blow thrust chop hack lunge',
  fight: 'fight attack strike charge engage confront draw challenge battle duel face',
  ambush: 'ambush strike attack stab surprise pounce',
  sneak: 'sneak creep slip shadow quiet silent stealth tiptoe past unseen edge',
  parley: 'talk speak parley reason bargain negotiate word convince persuade conversation plead',
  back: 'back retreat withdraw away return step',
  flee: 'flee run retreat escape bolt',
  dodge: 'dodge roll evade duck sidestep weave',
  use: 'drink quaff gulp sip throw hurl light ignite consume',
  skill: 'cast',
  take: 'take gather pick scoop collect loot grab pocket scavenge',
  open: 'open lift chest lid',
  search: 'search check inspect examine trap look',
  pray: 'pray kneel prayer bow',
  offer: 'offer offering gold coin',
  drink: 'drink sip water fountain',
  read: 'read book page study tome',
  inspect: 'inspect examine statue look study',
  rest: 'rest sit camp sleep recover respite breath fire',
  camp: 'rest sit camp sleep recover respite breath',
  trade: 'trade buy shop pedlar browse wares',
  buy: 'buy purchase',
  leave: 'leave done finish goodbye farewell',
  descend: 'descend stair down deeper',
  go: 'passage way path explore venture head proceed return walk enter door',
  boost: 'train hone sharpen bolster improve',
  new: 'begin new start again',
};
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
const near = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
export function meansTheSame(label, i, choices) {
  const own = choices[i];
  const ownDir = own.verb === 'go' ? DIRS[own.id.slice(3)] : null;
  const l = label.toLowerCase();
  for (const d of Object.values(DIRS)) if (l.includes(d) && d !== ownDir) return false;
  const lw = [...words(label)];
  const overlap = (c) => { const cw = [...words(c.label)]; return lw.filter((w) => cw.some((x) => near(w, x))).length; };
  const mine = overlap(own);
  const verbWords = [...words(VERB_WORDS[own.verb] || '')];
  const fits = mine > 0 || (ownDir && l.includes(ownDir)) || lw.some((w) => verbWords.some((x) => near(w, x)));
  return !!fits && choices.every((c, j) => j === i || overlap(c) < mine || (mine === 0 && overlap(c) === 0));
}

// The word that names a thing, or the creature, it has made up: the first one found, or null.
// A word counts as known if the facts contain it anywhere ("sword" in "shortsword"), or
// one of the same thing ("coins" for gold).
const SAME = [['gold', 'coin', 'treasure'], ['chest', 'treasure'], ['corpse', 'body', 'skeleton'], ['stair', 'staircase'], ['pedlar', 'merchant'], ['gem', 'gemstone', 'jewel']];
export function invents(story, known) {
  const s = story.toLowerCase(), k = known.toLowerCase();
  const said = (w) => new RegExp(`\\b${w}(s|es)?\\b`).test(s);
  const knows = (w) => k.includes(w) || SAME.some((set) => set.includes(w) && set.some((x) => k.includes(x)));
  return [...THINGS, ...CREATURES].find((w) => said(w) && !knows(w)) || null;
}

// A retelling that loses the creature in front of you has lost the plot; small models do.
function keepsTheFoe(story, facts) {
  const foe = facts.room && facts.room.foe;
  if (!foe || foe.state !== 'hostile') return true;
  const words = foe.name.replace(/^the /, '').split(' ').filter((w) => w.length > 2);
  const s = story.toLowerCase();
  return words.some((w) => s.includes(w.toLowerCase().replace(/s$/, '')));
}

function clean(s) {
  return s.replace(/\*\*|__|#+\s*/g, '').replace(/\s+/g, ' ').trim().replace(/^["“]([^"“”]*)["”]$/, '$1');
}

// ---------- choosing the quest ----------
// Once per delve, before floor 1: pick a boss from the allowed list and write why the hero
// is going down. Both a worked example (the format small models drift from) and a strict
// list of the only boss keys that may appear in the answer.
const QUEST_SYSTEM = [
  'You are choosing the villain for a dark fantasy dungeon crawl called the Lantern Deep, five floors under the ruins of the Gallows Inn.',
  'Pick exactly one boss from the BOSSES list and write 1 to 2 sentences, second person, present or future tense, saying why the hero is going down to find it.',
  'Use only the key given for that boss (e.g. "king", not its name). Do not mention any boss you did not pick, and do not mention dice, rules or these instructions.',
  'Answer in exactly this format and nothing else:',
  'BOSS: <key>',
  'WHY: <1 to 2 sentences>',
].join('\n');
const QUEST_EXAMPLE_USER = ['BOSSES:', '- king: the Hollow King — An undead king who never left his throne.', '- crabQueen: Ember Queen — Something enormous asleep in the embers, now awake.'].join('\n');
const QUEST_EXAMPLE_REPLY = ['BOSS: crabQueen', 'WHY: The old mine seams have glowed red for a month, and the village wants whatever woke under the hill put back to sleep.'].join('\n');

// bosses: [{ key, name, blurb }]
export function buildQuestMessages(bosses) {
  const lines = ['BOSSES:', ...bosses.map((b) => `- ${b.key}: ${b.name} — ${b.blurb}`)];
  return [{ role: 'system', content: QUEST_SYSTEM }, { role: 'user', content: QUEST_EXAMPLE_USER }, { role: 'assistant', content: QUEST_EXAMPLE_REPLY }, { role: 'user', content: lines.join('\n') }];
}
// Returns { boss, why } or null (the caller falls back to the book's chooseQuest()).
export function parseQuestReply(raw, { bosses }) {
  if (!raw) return null;
  const bossM = /BOSS:\s*([a-zA-Z]+)/i.exec(raw);
  if (!bossM || !bosses.some((b) => b.key === bossM[1])) return null;
  const whyM = /WHY:\s*([\s\S]*)/i.exec(raw);
  if (!whyM) return null;
  const why = clean(whyM[1].split(/\n\s*[A-Z]+:/)[0]);
  if (why.length < 20 || why.length > 320) return null;
  return { boss: bossM[1], why };
}

// ---------- planning a floor ----------
// Once per floor, before its first room: a one-line premise tying the floor to the quest,
// and which allowed monster or feature fills each room the dice already decided needs one.
// menu: sim.js's floorMenu(draftFloor) — { rooms: [{id,name,foe,feature,stairs}], monsters, features }.
const PLAN_SYSTEM = [
  'You are planning one floor of a dark fantasy dungeon crawl called the Lantern Deep.',
  'Which rooms need a monster or a feature is already decided — choose only WHICH one, from the MONSTERS or FEATURES list, so the floor reads as one place with a reason, not a string of unrelated rooms. Lean on the QUEST.',
  'Never invent a room, an exit, or a monster or feature not on the lists. You MUST answer every room listed, in the order given, with no line skipped and none added — do not stop early.',
  'Answer in exactly this format and nothing else, with no room name in the ROOM line, just its number:',
  'PREMISE: <one sentence, second person, tying this floor to the quest>',
  'ROOM <id>: monster=<key>',
  'ROOM <id>: feature=<key>',
  'ROOM <id>: monster=<key> feature=<key>',
].join('\n');

export function buildFloorPlanMessages({ quest, floor, theme, menu }) {
  const lines = [`QUEST: ${quest.why}`, `FLOOR: ${floor} of 5, ${theme}.`, `MONSTERS: ${menu.monsters.join(', ')}`, `FEATURES: ${menu.features.join(', ')}`, 'ROOMS:'];
  for (const r of menu.rooms) {
    const need = [r.foe ? 'monster' : null, r.feature ? 'feature' : null].filter(Boolean).join(' and ');
    lines.push(`ROOM ${r.id} (${r.name}): needs ${need}${r.stairs ? ' — guards the stair down, make it count' : ''}`);
  }
  return [{ role: 'system', content: PLAN_SYSTEM }, { role: 'user', content: lines.join('\n') }];
}
// Returns { premise, rooms: { [id]: { foe?, feature? } } }; invalid or missing parts are left
// out, and applyFloorPlan() in sim.js leaves the book's own pick standing for anything it
// does not get. A line for a room not in the menu, or a key not on its list, is dropped.
export function parseFloorPlan(raw, { menu, quest, theme }) {
  const rooms = {};
  if (!raw) return { premise: null, rooms };
  const byId = new Map(menu.rooms.map((r) => [r.id, r]));
  for (const line of raw.split('\n')) {
    // tolerate a room name copied in from the prompt's own "ROOM 3 (the Brick Cellar): needs
    // ..." wording — Llama 3 did this and a strict "digits then colon" match dropped the
    // room entirely; the id is still the only thing that has to be trusted.
    const m = /^\s*ROOM\s+(\d+)\s*(?:\([^)]*\))?\s*:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const room = byId.get(+m[1]);
    if (!room) continue;
    const foeM = /monster\s*=\s*([a-zA-Z]+)/i.exec(m[2]), featM = /feature\s*=\s*([a-zA-Z]+)/i.exec(m[2]);
    const entry = {};
    if (room.foe && foeM && menu.monsters.includes(foeM[1])) entry.foe = foeM[1];
    if (room.feature && featM && menu.features.includes(featM[1])) entry.feature = featM[1];
    if (entry.foe || entry.feature) rooms[+m[1]] = entry;
  }
  let premise = null;
  const premiseM = /PREMISE:\s*([\s\S]*?)(?:\n\s*ROOM\b|$)/i.exec(raw);
  if (premiseM) {
    const p = clean(premiseM[1]);
    const known = [menu.monsters.map((k) => MONSTERS[k].name).join(' '), menu.features.join(' '), quest ? quest.why + ' ' + (MONSTERS[quest.boss] ? MONSTERS[quest.boss].name : '') : '', theme || ''].join(' ');
    if (p.length >= 15 && p.length <= 260 && !invents(p, known)) premise = p;
  }
  return { premise, rooms };
}

// ---------- playing the hero ----------
// In the Dungeon Master's mode the player fills the rooms and the model plays the hero: it
// reads the page and picks one of the numbered choices, with a line the hero says. Only the
// enabled choices are listed, numbered as listed. The number is all that has to be trusted;
// a missing or out-of-range one hands the move to player.js, and a line that names a thing
// the page and choices do not is dropped, never the move.
const PLAY_SYSTEM = [
  'You are the hero in a dark fantasy dungeon crawl called the Lantern Deep, going down five floors to kill its boss.',
  'Read where you are and pick exactly one of the numbered CHOICES. Play to survive and to win: drink a potion or heal when badly hurt, explore rooms you have not seen, take what is lying about, and take the stair down once you have looked around.',
  'BACKGROUND, when given, is who you are and what you know: stay true to it. A creature in HERE with a name or a part (WHO) is a person to you: speak of them as you know them (say "my brother", not "the bandit"), and think twice before you fight someone you care about.',
  'A choice with a percentage can fail; that is your chance of success.',
  'Answer in exactly this format and nothing else:',
  'CHOICE: <number>',
  'SAY: <one short sentence the hero says or thinks, first person, at most 15 words>',
].join('\n');
const PLAY_EXAMPLE_USER = [
  'PLACE: The Cellars, floor 1 of 5, in the Wine Store.',
  'HERO: Pip, a halfling rogue (level 1), badly wounded (6 of 18 HP), 14 gold.',
  'PAGE: A giant centipede rears up from the straw, mandibles clicking.',
  'CHOICES:',
  '1. Fight the giant centipede',
  '2. Creep past in the shadows (DEX check, 70%)',
  '3. Drink a healing potion first',
  '4. Back away to the Barrel Vault (DEX check, 80%)',
].join('\n');
const PLAY_EXAMPLE_REPLY = ['CHOICE: 3', 'SAY: Not like this. A swig first, then we will see who bites whom.'].join('\n');

// choices: the enabled ones from sim.choices(), in order
export function buildPlayMessages({ facts, page, choices }) {
  const h = facts.hero, r = facts.room;
  const lines = [`PLACE: ${facts.place}, floor ${facts.floor} of 5${r ? `, in ${r.name}` : ''}.`];
  if (h) lines.push(`HERO: ${h.name}, a ${h.race.toLowerCase()} ${h.cls.toLowerCase()} (level ${h.lvl}), ${condition(h)} (${h.hp} of ${h.maxHp} HP).`);
  if (facts.quest) lines.push(`QUEST: ${facts.quest.why}`);
  if (facts.notes) lines.push(`BACKGROUND: ${facts.notes}`);
  const here = (r && r.foes || []).filter((f) => f.state !== 'dead' && f.state !== 'fled');
  if (here.length) {
    lines.push('HERE:');
    for (const f of here) {
      const what = f.given ? `${f.given} (${f.species})` : f.species;
      const mood = f.state === 'passed' ? 'asleep' : f.state === 'calm' ? 'not hostile' : f.temper === 'fierce' ? 'hostile, and fierce' : 'hostile';
      lines.push(`- ${what}, ${mood}${f.who ? `. WHO: ${f.who}` : ''}`);
    }
  }
  lines.push(`PAGE: ${page.text}`);
  lines.push('CHOICES:');
  choices.forEach((c, i) => {
    const odds = c.check ? ` (${c.check.stat.toUpperCase()} check, ${Math.round(c.chance * 100)}%)` : c.chance != null ? ` (${Math.round(c.chance * 100)}% to hit)` : '';
    // where a door leads: somewhere new (and what shows through it), or back where you have been
    const where = c.verb !== 'go' ? '' : c.group === 'back' ? ' — already explored, nothing new there' : c.tag && c.tag !== 'Unexplored' ? ` — not yet explored; you notice ${c.tag}` : ' — not yet explored';
    lines.push(`${i + 1}. ${c.label}${odds}${where}`);
  });
  return [{ role: 'system', content: PLAY_SYSTEM }, { role: 'user', content: PLAY_EXAMPLE_USER }, { role: 'assistant', content: PLAY_EXAMPLE_REPLY }, { role: 'user', content: lines.join('\n') }];
}
// Returns { id, say } (say may be null) or null when there is no usable number. The line is
// its first line only: Phi-3 sometimes carried on into "Follow-up question 1: ...". The
// quest counts as known, since the model is shown it ("...help me find the ogre"), and so
// does everything the Dungeon Master wrote (the background, each creature's part).
export function parsePlayReply(raw, { choices, page, facts = null }) {
  if (!raw) return null;
  const m = /CHOICE:\s*\**\s*(\d+)/i.exec(raw) || /^\s*(\d+)\b/.exec(raw);
  if (!m) return null;
  const c = choices[+m[1] - 1];
  if (!c) return null;
  let say = null;
  const sayM = /SAY:\s*([\s\S]*)/i.exec(raw);
  if (sayM) {
    const s = clean(sayM[1].trim().split('\n')[0]).replace(/^["“'‘]+|["”'’]+$/g, '');
    const quest = facts && facts.quest ? facts.quest.why + ' ' + facts.quest.bossName : '';
    // the Dungeon Master's own words count as known too: the background and who everyone is
    const told = facts ? [facts.notes || '', facts.intro || '', ...((facts.room && facts.room.foes) || []).map((f) => `${f.given || ''} ${f.species} ${f.who || ''}`)].join(' ') : '';
    const known = [page.text, quest, told, ...choices.map((x) => x.label + ' ' + (x.tag || ''))].join(' ');
    if (s.length >= 4 && s.length <= 140 && !invents(s, known)) say = s;
  }
  return { id: c.id, say };
}
