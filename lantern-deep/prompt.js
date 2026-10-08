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
  'The FACTS are the truth and are already decided. Retell only these FACTS, in order. Keep every one of them. Never add creatures, items, treasure, exits or outcomes that are not in the FACTS, and never change who hit whom.',
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
  const known = [page.text, ...choices.map((c) => c.label), facts.hero ? facts.hero.weapon : ''].join(' ');
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
