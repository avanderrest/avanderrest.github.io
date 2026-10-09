/* Lantern Deep: a sensible adventurer. Plays the hero when the player is the Dungeon Master
   (and is the bot in test/lantern-deep/bot.node.js, which balanced the game against it).
   It only ever picks an id from choices(), the same list the buttons are made from: it
   explores the nearest unexplored room first, drinks a potion when it is hurt, talks or
   sneaks when its class is good at that, searches a chest before opening it, rests at a camp
   when it is worn down, buys potions from the pedlar, and takes the stair once the floor is
   mostly explored. A creature the Dungeon Master has given a name or a part in the story is
   somebody, not something: it would rather talk to them, or slip past, than fight.

   say(g, id) is what the hero says as they make that move, in character, using the names and
   parts the Dungeon Master gave ("I'll creep past my brother."). No page access; it reads the
   sim and nothing else. */

import { ITEMS, MONSTERS } from './content.js';
import { pick, mulberry32 } from '../lib/rng.js';

// The next step towards the nearest room not yet visited, or towards the stair once the
// floor is mostly done (or there is nowhere new left).
function nextStep(g) {
  const S = g.S, rm = g.room(), rooms = S.map.rooms;
  // breadth-first over visited rooms to the nearest unvisited one (or the stair)
  const prev = new Map([[S.at, null]]), q = [S.at];
  let target = null;
  for (let i = 0; i < q.length && target == null; i++) {
    const r = rooms[q[i]];
    for (const d of 'nesw') {
      const to = r.exits[d]; if (to == null || prev.has(to)) continue;
      prev.set(to, q[i]);
      if (!rooms[to].visited) { target = to; break; }
      q.push(to);
    }
  }
  const explored = rooms.filter((r) => r.visited).length / rooms.length;
  if (target == null || (explored > 0.75 && rm.stairs)) {
    const stair = rooms.find((r) => r.stairs || r.throne);
    if (rm.stairs) return 'descend';
    target = stair.id;
    // walk known rooms to it; the stair room is always reachable through visited ones by now
    const p2 = new Map([[S.at, null]]), q2 = [S.at];
    for (let i = 0; i < q2.length; i++) for (const d of 'nesw') { const to = rooms[q2[i]].exits[d]; if (to != null && !p2.has(to)) { p2.set(to, q2[i]); q2.push(to); } }
    let step = target; while (p2.get(step) !== S.at && p2.get(step) != null) step = p2.get(step);
    return 'go:' + 'nesw'.split('').find((d) => rm.exits[d] === step);
  }
  let step = target; while (prev.get(step) !== S.at) step = prev.get(step);
  return 'go:' + 'nesw'.split('').find((d) => rm.exits[d] === step);
}

// somebody, not something: the Dungeon Master gave it a name or a part in the story
const somebody = (f) => !!(f && (f.name || f.who));

// One adventurer for one delve: it remembers which pedlars it has already traded with.
// choose(g, cs) returns a choice id, or null when there is nothing for the hero to decide
// (the delve is over, or the Dungeon Master is writing).
export function createPlayer() {
  const traded = new Set();
  function choose(g, cs) {
    const S = g.S, H = S.hero, live = cs.filter((c) => !c.disabled), ids = new Set(live.map((c) => c.id));
    const pick1 = (...xs) => xs.find((x) => ids.has(x));
    // the first choice of any of these verbs, in the order given
    const byVerb = (...verbs) => { for (const v of verbs) { const c = live.find((x) => x.verb === v); if (c) return c.id; } return null; };
    const hurt = H ? H.hp / H.maxHp : 1;
    const heals = H ? H.bag.filter((b) => ITEMS[b.id].use === 'heal').map((b) => 'use:' + b.id) : [];
    if (S.mode === 'create') return [...ids][0];
    if (S.mode === 'dead' || S.mode === 'won' || S.mode === 'furnish' || S.mode === 'prologue') return null;
    const boost = cs.find((c) => c.verb === 'boost'); if (boost) return boost.id;
    if (S.mode === 'shop') {
      const n = H.bag.filter((b) => ITEMS[b.id].use === 'heal').reduce((a, b) => a + b.n, 0);
      return (n < 4 && pick1('buy:potion-greater', 'buy:potion-heal')) || (H.armour < 2 && pick1('buy:shield-rune', 'buy:shield-iron')) || 'leave';
    }
    if (S.mode === 'fight') {
      const f = g.foe();
      if (hurt < 0.4) { const h = pick1(...heals, 'skill:heal', 'skill:second-wind'); if (h) return h; }
      if (hurt < 0.25 && f.hp / f.maxHp > 0.4) { const r = pick1('skill:smoke', 'flee'); if (r && (r !== 'flee' || cs.find((c) => c.id === 'flee').chance > 0.5)) return r; }
      if (f.hp > 6) { const big = pick1('skill:turn', 'skill:backstab', 'skill:magic-missile', 'skill:smite', 'skill:cleave', 'use:wand-sparks', 'use:flask-fire'); if (big) return big; }
      return pick1('skill:firebolt') || 'attack';
    }
    // exploring
    const rm = g.room(), f = rm.foes.find((x) => x.state === 'hostile');
    if (f) {
      if (hurt < 0.55) { const h = pick1(...heals); if (h) return h; }
      const by = (v) => cs.find((c) => c.id === v);
      // somebody in the way: try words first, then slipping by, before steel
      if (somebody(f)) {
        if (by('parley') && by('parley').chance >= 0.3) return 'parley';
        if (by('sneak') && by('sneak').chance >= 0.4) return 'sneak';
      }
      if (by('parley') && by('parley').chance >= 0.55) return 'parley';
      if (by('sneak') && by('sneak').chance >= 0.6 && (MONSTERS[f.kind].xp > 25 || hurt < 0.6)) return 'sneak';
      if (hurt < 0.3 && by('back')) return 'back';
      return 'fight';
    }
    if (hurt < 0.5) { const h = pick1('skill:heal', 'skill:second-wind'); if (h) return h; }
    if (hurt < 0.35) { const h = pick1(...heals); if (h) return h; }
    if (H.poison) { const a = pick1('use:antidote'); if (a) return a; }
    const trade = live.find((c) => c.verb === 'trade' && !traded.has(S.floor + ':' + S.at + ':' + c.id));
    if (trade) { traded.add(S.floor + ':' + S.at + ':' + trade.id); return trade.id; }
    // what the Dungeon Master left: a friend's gift, a note to read, then everything else
    const a = byVerb('talk', 'note', 'take', 'search', 'open', 'read', 'inspect', 'pray');
    if (a) return a;
    if (byVerb('offer') && H.gold > 60) return byVerb('offer');
    if (byVerb('drink') && hurt < 0.8) return byVerb('drink');
    if (byVerb('rest') && hurt < 0.7) return byVerb('rest');
    if (ids.has('camp') && hurt < 0.45) return 'camp';
    if (ids.has('use:potion-mana') && H.pool < g.poolMax() / 2) return 'use:potion-mana';
    return nextStep(g);
  }
  return { choose };
}

// ---------- what the hero says ----------
// The part the Dungeon Master wrote for a creature, as the hero would put it: "my brother"
// from "Pip's older brother, who ran off with the bandits". Null if it names no tie.
const TIES = ['brother', 'sister', 'mother', 'father', 'mum', 'dad', 'son', 'daughter', 'uncle', 'aunt', 'cousin', 'friend', 'wife', 'husband', 'love', 'sweetheart', 'mentor', 'master', 'apprentice', 'teacher', 'rival', 'twin', 'grandmother', 'grandfather', 'old partner', 'partner'];
export function tieTo(f, hero) {
  if (!f || !f.who) return null;
  const who = f.who.toLowerCase(), me = hero.name.toLowerCase();
  // only a tie to this hero: "Pip's brother", "my brother", "her brother", or the tie alone
  const tie = TIES.find((t) => new RegExp(`\\b${t}\\b`).test(who));
  if (!tie) return null;
  if (new RegExp(`\\b(${me}'?s?|my|his|her|their|the hero'?s)\\b[^,.;]*\\b${tie}\\b`).test(who) || new RegExp(`^\\s*(an? |the )?(old |older |younger |little |big |long-lost |lost )?${tie}\\b`).test(who)) return 'my ' + tie;
  return null;
}
// how the hero calls a creature: "my brother Tom", "Tom", or "the bandit"
export function heroCall(f, hero) {
  const tie = tieTo(f, hero);
  if (tie && f.name) return `${tie} ${f.name}`;
  if (tie) return tie;
  return f.name || ('the ' + MONSTERS[f.kind].name.replace(/^the /, ''));
}
const LINES = {
  fight: ['Have at you, {who}!', 'No way round {who}. Steel it is.', 'Come on then, {who}.'],
  sneak: ["I'll creep past {who}.", 'Quiet now. {Who} need never know I was here.', 'Softly, softly, past {who}.'],
  parley: ["{Who}! Wait. Let's talk.", 'Easy, {who}. I mean no harm.', "Hold, {who}. There's no need for this."],
  ambush: ['{Who} is asleep. Now or never.'],
  back: ['Not this one. Back the way I came.'],
  attack: ['Again!', 'Take that, {who}!', 'Stand still, {who}!'],
  flee: ['I have to get out of here!'],
  dodge: ['Not today, {who}.'],
  open: ["Let's see what's inside."], search: ['Careful now. Let me look first.'], take: ["I'll have that."],
  pray: ['Whoever listens down here, hear me.'], offer: ['A little gold for a little grace.'], drink: ['Here goes nothing.'],
  read: ['Old books. Maybe they know the way.'], inspect: ['Something about this statue…'], rest: ['A warm fire. Just for a moment.'],
  camp: ['I need to catch my breath.'], trade: ["Let's see what you've got."], descend: ['Down we go.'],
  go: ["Let's see what's {way}.", 'This way, then: {way}.'], back2: ['Back the way I came.'],
  use: ['I need this now.'], skill: ['Now!'], leave: ['That will do.'], buy: ['I could use that.'],
  note: ['Someone left a note. Let me read it.'], talk: ['{Who}! It is good to see a friendly face.', 'Hello, {who}. Have you something for me?'],
};
export function say(g, id) {
  const S = g.S, [verb, arg] = id.split(':'), rm = g.room();
  const f = (S.mode === 'fight' ? g.foe() : null) || (verb === 'talk' && rm ? rm.foes[+arg] : null) || (rm && rm.foes.find((x) => x.state === 'hostile')) || (rm && rm.foes.find((x) => x.state === 'passed'));
  let key = verb;
  if (verb === 'go') { const to = rm.exits[arg]; key = S.map.rooms[to].visited ? 'back2' : 'go'; }
  const lines = LINES[key];
  if (!lines) return null;
  const r = mulberry32(((S.seed ^ (S.acts * 2654435761)) >>> 0) + id.length);
  const who = f ? heroCall(f, S.hero) : 'it';
  const way = { n: 'north', e: 'east', s: 'south', w: 'west' }[arg] || 'ahead';
  return pick(r, lines).replace(/\{who\}/g, who).replace(/\{Who\}/g, who.charAt(0).toUpperCase() + who.slice(1)).replace(/\{way\}/g, way);
}
