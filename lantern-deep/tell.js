/* Lantern Deep: the book. The storyteller that needs no download: it turns what the sim
   says happened (its events) and where you are now (its facts) into a page of prose, from
   word banks and sentence templates. dm.js gives a language model the same pages as plain
   facts to retell, and falls back to these when the model is slow or says something odd.
   No page access: rnd comes in, words go out. */

import { MONSTERS, THEMES, STAT_NAME } from './content.js';
import { pick } from '../lib/rng.js';

// ---------- constants ----------
const INTROS = {
  rat: ['A giant rat the size of a hound looks up from a gnawed bone, whiskers twitching.', 'Red eyes catch your lantern: a giant rat, bristling, between you and the far door.'],
  bat: ['The ceiling seethes. A swarm of bats unfolds from the dark and starts to circle.', 'Something leathery brushes your cheek. The roof is thick with bats, and they are waking.'],
  slime: ['What you took for a puddle heaves itself up: a green slime, quivering with interest.', 'A green slime slides across the floor towards your warmth, dissolving a boot as it goes.'],
  bandit: ['A bandit sits on an upturned crate, cudgel across her knees. “Well, well. Toll’s due, friend.”', 'A bandit steps out from behind a pillar, knife already drawn. “Pockets. Now.”'],
  spider: ['Webs hang in grey sheets, and in the middle of them a cave spider as wide as a cartwheel is watching you.', 'A cave spider drops from the ceiling on a silk line, fangs glistening.'],
  ghost: ['The air turns to frost. A wailing spirit drifts up through the floor, its mouth a hole.', 'A pale figure stands with its back to you. It turns, and it has no face, only grief.'],
  cultist: ['A hooded cultist kneels at a chalk circle, chanting. The chanting stops.', 'Three candles, a curved knife, and a hooded cultist who very much did not want company.'],
  crab: ['An ember crab clacks out of a crack in the wall, its shell glowing like a coal.', 'The heat hits you first: an ember crab, big as a barrel, claws raised.'],
  boneRat: ['A bone gnawer rattles out of a heap of skulls, all ribs and teeth.', 'Something made of other creatures’ bones is chewing on a femur. It stops chewing.'],
  ogre: ['A cave ogre squats by a fire, roasting something you hope was a goat. It looks up, slowly.', 'A cave ogre fills the far end of the room, club in one fist, and sniffs the air.'],
  mimic: ['The chest has teeth. The chest has a tongue. The chest is a mimic.'],
  king: ['On a throne of black glass sits the Hollow King, a crown rusted to his skull. “Another one,” he says, and rises.'],
  ogreChief: ['The Ogre Chieftain rises from a heap of bones and broken shields, dwarfing every ogre you fought to get here.'],
  cultLeader: ['At the centre of a ring of dead candles stands the Cult Matriarch, and the ring brightens as she turns to you.'],
  crabQueen: ['The Ember Queen unfolds from the deepest coals in the mine, claws glowing white-hot.'],
};
const FEATURE_NEW = {
  chest: ['An iron-bound chest sits against the far wall.', 'A sturdy chest waits in an alcove, its lock green with age.'],
  altar: ['A stone altar stands at the centre, its candles burnt to stubs.', 'An altar to some forgotten saint leans in the corner, its offering bowl empty.'],
  fountain: ['A carved fountain trickles into a mossy basin.', 'Water spills from a gargoyle’s mouth into a cracked stone bowl.'],
  corpse: ['An adventurer lies slumped against the wall, long past help, pack still on.', 'A body in rusted mail lies face down, one hand still reaching for the door.'],
  shelf: ['Shelves of mouldering books lean against one wall.', 'A bookcase stands here, improbably, its spines swollen with damp.'],
  statue: ['A statue of a forgotten knight watches the door with blank stone eyes.', 'A weathered statue stands on a plinth, one hand held out as if asking for something.'],
  camp: ['Someone made camp here: a ring of stones round cold embers, a bedroll, a dented pot.', 'A sheltered corner holds the remains of a campfire, and dry wood stacked beside it.'],
  merchant: ['A pedlar has set up shop on an upturned crate, lantern hooked on a nail. “Customer!” comes the bright call. “Don’t mind the dark, mind the prices.”', 'A pedlar sits among bundles and bottles, counting coins. “Buying or dying? Ha. Buying, I hope.”'],
};
const FEATURE_USED = {
  chest: 'The chest stands open and empty.', altar: 'The altar is quiet now.', fountain: 'The fountain still trickles.',
  corpse: 'The body lies where you left it, pockets turned out.', shelf: 'The books lie where you dropped them.',
  statue: 'The statue keeps its blank watch.', camp: 'The campfire is ash again.', merchant: 'The pedlar waves you over.',
};

const DIR_WAY = { n: 'north', e: 'east', s: 'south', w: 'west' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const the = (kind) => { const n = MONSTERS[kind] ? MONSTERS[kind].name : kind; return n.startsWith('the ') ? n : 'the ' + n; };
const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

// ---------- the room ----------
export function describeRoom(f, rnd, first = true) {
  const r = f.room, out = [];
  // a room the Dungeon Master filled is theirs to describe: the first time in, their words
  // are the whole room (what is in it, the way on), and the book only says how you are
  if (first && r.line) out.push(sentence(r.line));
  else {
    if (first) out.push(sketchRoom(f.floor, r, rnd));
    else {
      out.push(pick(rnd, [`You are back in ${r.name}.`, `${cap(r.name)} again.`]));
      if (r.start) out.push(f.floor === 1 ? 'Behind you the stair climbs back up to the ruined inn and the daylight.' : 'The stair you came down rises behind you into the dark.');
      for (const t of featuresIn(r)) out.push(t.state === 'new' ? pick(rnd, FEATURE_NEW[t.kind]) : FEATURE_USED[t.kind]);
      for (const g of foesIn(r)) out.push(foeLine(g, rnd, first));
      if (r.loot) out.push(pick(rnd, ['Coins glint among the rubble.', 'Something catches the light on the floor.']));
      if (r.stairs) out.push(pick(rnd, ['In the far corner a stair winds down into deeper dark.', 'A cold draught rises from a stair leading down.']));
    }
    out.push(exitsLine(r.exits, rnd));
  }
  if (f.hero.hurt < 0.3) out.push(pick(rnd, ['Your wounds throb. You will not last long like this.', 'You are bleeding, and the dark knows it.']));
  if (f.hero.poisoned) out.push('The poison burns in your veins.');
  return out.join(' ');
}

// The book's own picture of a room seen for the first time: its size, walls and smells,
// what lies about, and what is in it. No exits and nothing about the hero, so the Dungeon
// Master's "Roll the dice for me" can offer it as a draft to rewrite.
// r: { name, size, props, start?, stairs?, loot?, things? or feature?: { kind, state }, foes? or foe?: { kind, state, name? } }
export function sketchRoom(floor, r, rnd) {
  const T = THEMES[floor - 1], out = [];
  out.push(r.size === 'large' ? pick(rnd, ['A wide chamber opens up around you.', 'The passage gives onto a great, echoing room.']) :
    r.size === 'small' ? pick(rnd, ['You squeeze into a cramped little room.', 'The room is barely more than a widening of the passage.']) :
      pick(rnd, ['You step into ' + r.name + '.', 'Your lantern finds the edges of ' + r.name + '.']));
  out.push(`${cap(pick(rnd, T.walls))}; underfoot, ${pick(rnd, T.floors)}. The air smells of ${pick(rnd, T.smells)}, and you can hear ${pick(rnd, T.sounds)}.`);
  if (r.props && r.props.length) out.push(`${cap(list(r.props))} lie about.`);
  if (r.start) out.push(floor === 1 ? 'Behind you the stair climbs back up to the ruined inn and the daylight.' : 'The stair you came down rises behind you into the dark.');
  for (const t of featuresIn(r)) out.push(t.state === 'new' ? pick(rnd, FEATURE_NEW[t.kind]) : FEATURE_USED[t.kind]);
  for (const g of foesIn(r)) out.push(foeLine(g, rnd, true));
  if (r.loot) out.push(pick(rnd, ['Coins glint among the rubble.', 'Something catches the light on the floor.']));
  if (r.stairs) out.push(pick(rnd, ['In the far corner a stair winds down into deeper dark.', 'A cold draught rises from a stair leading down.']));
  return out.join(' ');
}

// what a room holds, from facts (lists) or from a draft (one of each)
const LOOSE = ['coins', 'item', 'weapon'];
// only the features the book has words for: a note or a snare is the Dungeon Master's to tell
const featuresIn = (r) => (r.things ? r.things.filter((t) => !LOOSE.includes(t.kind) && FEATURE_NEW[t.kind]) : r.feature ? [r.feature] : []);
const foesIn = (r) => r.foes || (r.foe ? [r.foe] : []);
const sentence = (s) => (/[.!?"”]$/.test(s) ? s : s + '.');
// a creature by the name the Dungeon Master gave it, or "the bandit"; a named one gets no
// stock introduction, which was written for a nameless one
function foeLine(foe, rnd, first) {
  const nm = foe.given || (foe.name && !/^the /.test(foe.name) ? foe.name : null) || the(foe.kind);
  if (foe.state === 'hostile') return first ? (nm !== the(foe.kind) ? `${cap(nm)} is here.` : pick(rnd, INTROS[foe.kind] || [`${cap(nm)} is here.`])) : `${cap(nm)} is still here, and still angry.`;
  if (foe.state === 'passed') return `${cap(nm)} dozes, unaware of you.`;
  if (foe.state === 'calm') return `${cap(nm)} watches you, ${foe.temper === 'friendly' ? 'and means you no harm' : 'keeping to the bargain'}.`;
  if (foe.state === 'fled') return `There is no sign of ${nm} now.`;
  return `${cap(nm)} lies dead where ${nm === the(foe.kind) ? 'it' : 'they'} fell.`;
}

// The book's own opening for a delve; also the draft a Dungeon Master may start from.
export function openingFor(hero, boss, why) {
  const bossName = MONSTERS[boss] ? the(boss) : 'the Hollow King';
  return `The Lantern Deep lies under the ruins of the Gallows Inn, five floors down to ${bossName}'s own throne. ${why || 'They say no one who goes looking for the hoard down there comes back up.'} You are ${hero.name}, ${hero.race.toLowerCase()} ${hero.cls.toLowerCase()}, and you mean to find out. You light your lantern and start down the stair.`;
}

function exitsLine(exits, rnd) {
  const clues = exits.filter((e) => e.clue), plain = exits.filter((e) => !e.clue && !e.visited), back = exits.filter((e) => e.visited);
  const parts = clues.map((e) => pick(rnd, [`To the ${e.way}: ${e.clue}.`, `By the ${e.way} passage you notice ${e.clue}.`, `At the ${e.way} doorway, ${e.clue}.`]));
  if (plain.length) parts.push(`${plain.length === 1 ? 'A passage leads' : 'Passages lead'} ${list(plain.map((e) => e.way))} into the unknown.`);
  if (back.length && !parts.length) parts.push(`The way ${list(back.map((e) => e.way))} leads back.`);
  return parts.join(' ');
}

// ---------- what just happened ----------
// One short sentence per event, in order. Rolls are shown on the page as dice, not in words.
export function describeEvents(events, f, rnd) {
  const out = [];
  const foeName = (k, name) => name || the(k);
  for (const e of events) {
    switch (e.t) {
      case 'begin':
        // a Dungeon Master's own opening is the start room's description, told when it is entered;
        // otherwise the book's opening, and the floor's premise
        if (e.intro) break;
        out.push(openingFor(f.hero, e.boss, e.why));
        if (e.premise) out.push(e.premise);
        break;
      case 'prologue': break;
      case 'next': out.push(pick(rnd, [`${cap(foeName(e.foe, e.fname))} steps up to take its place.`, `There is no time to breathe: ${foeName(e.foe, e.fname)} comes at you next.`])); break;
      case 'charge': out.push(pick(rnd, [`${cap(foeName(e.foe, e.fname))} does not wait to be asked. It rushes you!`, `${cap(foeName(e.foe, e.fname))} goes for you the moment you step in!`])); break;
      case 'joins': break;
      case 'descend':
        out.push(pick(rnd, [`You catch your breath on the stair, then go down into ${e.name}.`, `The stair turns and turns, and lets you out into ${e.name}.`]));
        if (e.premise) out.push(e.premise);
        break;
      case 'fight':
        if (e.how === 'fight') out.push(pick(rnd, [`You ready your ${f.hero.weapon.toLowerCase()} and close in.`, 'No way round it. You attack.']));
        if (e.how === 'ambush') out.push(`You strike from the dark before ${foeName(e.foe, e.fname)} can wake.`);
        break;
      case 'furnish':
        if (e.here) break;   // at the foot of a stair: the begin or descend line already says where
        out.push(pick(rnd, [`You stop at the ${DIR_WAY[e.dir]} doorway and lift your lantern.`, `At the ${DIR_WAY[e.dir]} doorway you pause, and listen.`]));
        out.push(e.stairs ? 'Beyond it the dark goes down: there is a stair in there somewhere.' : 'Beyond it the dark waits to be told what it holds.');
        break;
      case 'mimic': out.push('The lid yawns open on rows of teeth. The chest is a mimic, and it is hungry!'); break;
      case 'mimicFound': out.push('As you lean in, the “chest” licks its lips. A mimic! It knows you know.'); break;
      case 'spotted': out.push(`A stone shifts under your boot. ${cap(foeName(e.foe, e.fname))} whirls round!`); break;
      case 'sneaked': if (e.n > 1) { out.push(pick(rnd, ['You keep to the shadows, and not one of them sees you.', 'Step by careful step you slip past them all.'])); break; }
        out.push(pick(rnd, [`You keep to the shadows. ${cap(foeName(e.foe, e.fname))} never sees you.`, `Step by careful step you slip past ${foeName(e.foe, e.fname)}.`])); break;
      case 'insulted': out.push(`${cap(foeName(e.foe, e.fname))} is in no mood to talk.`); break;
      case 'calmed': out.push(`Words work where steel might not. ${cap(foeName(e.foe, e.fname))} lets you pass.`); break;
      case 'toll': out.push(`It costs you ${e.n} gold, mind.`); break;
      case 'hit':
        if (e.by !== 'hero') break;
        if (e.how === 'crit') out.push(`A perfect blow! You hit ${foeName(e.foe, e.fname)} for ${e.n}.`);
        else if (e.how === 'weapon') out.push(pick(rnd, [`You hit ${foeName(e.foe, e.fname)} for ${e.n}.`, `Your blow lands: ${e.n} damage.`, `You catch ${foeName(e.foe, e.fname)} hard, for ${e.n}.`]));
        else out.push(`${e.how} hits ${foeName(e.foe, e.fname)} for ${e.n}.`);
        if (e.hp > 0 && e.hp / e.maxHp < 0.35) out.push(`${cap(foeName(e.foe, e.fname))} is reeling.`);
        break;
      case 'miss':
        if (e.by === 'hero') out.push(pick(rnd, ['You miss.', 'Your swing goes wide.', `${cap(foeName(e.foe, e.fname))} slips aside.`]));
        else out.push(`${cap(foeName(e.foe, e.fname))} ${pick(rnd, MONSTERS[e.foe].verbs)}, but you twist away.`);
        break;
      case 'hurt':
        if (MONSTERS[e.source]) out.push(`${cap(foeName(e.source, e.fname))} ${pick(rnd, MONSTERS[e.source].verbs)}: ${e.n} damage.`);
        else if (e.source === 'trap') out.push(`It hurts: ${e.n} damage.`);
        else if (e.source === 'poison') out.push(`The poison bites: ${e.n} damage.`);
        else if (e.source === 'grubs') out.push(`Rot grubs burrow out of the body and into your hand: ${e.n} damage.`);
        else if (e.source === 'pit') out.push(`You land hard at the bottom: ${e.n} damage.`);
        else if (e.source === 'darts') out.push(`The darts find you: ${e.n} damage.`);
        break;
      case 'kill':
        out.push(e.how === 'fled' ? `${cap(foeName(e.foe, e.fname))} flees before your holy light.` : pick(rnd, [`${cap(foeName(e.foe, e.fname))} falls and does not get up.`, `${cap(foeName(e.foe, e.fname))} is dead.`]));
        break;
      case 'level': out.push(`You feel stronger, and your wounds close. You are now level ${e.lvl}!`); break;
      case 'boost': out.push(`Your ${STAT_NAME[e.stat]} rises to ${e.to}.`); break;
      case 'gold': out.push(e.from === 'floor' ? `You scoop up ${e.n} gold.` : `You find ${e.n} gold.`); break;
      case 'item': out.push(`You take ${/^[aeiou]/i.test(e.name) ? 'an' : 'a'} ${e.name.toLowerCase()}.`); break;
      case 'equip': out.push(e.weapon ? `You trade up to a ${e.name.toLowerCase()} (${e.dice}).` : `You strap on the ${e.name.toLowerCase()}.`); break;
      case 'trap': out.push('Click. A needle springs from the lock!'); break;
      case 'opened': out.push('The lid creaks open.'); break;
      case 'disarmed': out.push('There, behind the lock: a needle trap. You jam it with a splinter.'); break;
      case 'safe': out.push('You find no traps. It is just a chest.'); break;
      case 'nothingFound': out.push('You poke about the lock and find nothing. Probably.'); break;
      case 'searched': break;
      case 'blessed': out.push('Warmth runs through you. You feel watched over.'); break;
      case 'silence': out.push('You pray. Nothing answers.'); break;
      case 'offered': out.push(`You leave ${e.n} gold in the bowl.`); break;
      case 'drank': out.push('You cup your hands and drink.'); break;
      case 'heal':
        if (e.source === 'fountain') out.push('The water is sweet and cold, and your wounds close.');
        else if (e.source === 'rest') out.push(`You rest a while and feel better (+${e.n} HP).`);
        else if (e.source === 'stair') { if (e.n) out.push(`You get your breath back (+${e.n} HP).`); }
        else if (e.n) out.push(`${e.source === 'altar' ? 'The light' : cap(e.source)} heals ${e.n} HP.`);
        break;
      case 'hardier': out.push('The water tastes of iron. You feel tougher for it.'); break;
      case 'pool': break;
      case 'poisoned': out.push(e.foe === 'fountain' ? 'The water is foul. Your stomach knots: poisoned!' : e.foe === 'gas' ? 'You breathe it in before you can stop yourself. Poisoned!' : 'The bite burns. You are poisoned!'); break;
      case 'snare': out.push({ pit: 'The floor gives way beneath you!', darts: 'Click. Darts hiss out of the wall!', gas: 'Glass crunches underfoot, and a sickly green gas billows up!' }[e.snare]); break;
      case 'snareSpotted': out.push({ pit: 'The floor here is too smooth. You prod it, and the crust over a pit falls away. You step round.', darts: 'A tripwire glints at ankle height. You step over it.', gas: 'A cracked glass bulb is wedged under a loose flagstone. You leave it well alone.' }[e.snare]); break;
      case 'note': out.push(e.text ? `The note reads: “${e.text.replace(/[“”]/g, '"')}”` : 'The note is blank.'); break;
      case 'gift': out.push(`${cap(foeName(e.foe, e.fname))} presses ${/^[aeiou]/i.test(e.name) ? 'an' : 'a'} ${e.name.toLowerCase()} into your hands.`); break;
      case 'retch': out.push('The water is foul. You spit it out in time.'); break;
      case 'plain': out.push('It is water. Just water.'); break;
      case 'cured': out.push('The poison ebbs away.'); break;
      case 'mapped': out.push('Among the rot you find a surveyor’s plan of this floor. You know the way now.'); break;
      case 'lore': out.push('You learn a little of who built this place, and why.'); break;
      case 'crumbled': out.push('The pages crumble to dust in your fingers.'); break;
      case 'cache': out.push('There is a seam at the plinth. Behind it: a hidden cache!'); break;
      case 'stone': out.push('It is just stone.'); break;
      case 'rested': out.push(e.short ? 'You sit with your back to the wall and close your eyes for a little while.' : 'You build up the fire and sleep beside it.'); break;
      case 'wanderer': out.push(`You wake to a sound close by. ${cap(foeName(e.foe, e.fname))} has found you!`); break;
      case 'shop': out.push('“Have a look, have a look. Everything’s guaranteed, more or less.”'); break;
      case 'bought': out.push(`You hand over ${e.n} gold.`); break;
      case 'leftShop': out.push('“Mind how you go.”'); break;
      case 'escape': out.push(e.how === 'flee' ? 'You run, and you do not look back.' : 'A burst of smoke, and you are gone.'); break;
      case 'cornered': out.push(`You try to run, but ${foeName(e.foe, e.fname)} cuts you off.`); break;
      case 'dodged': out.push(`You roll under the blow and come up ready to answer it.`); break;
      case 'ward': out.push('A shimmer of force hangs in the air before you.'); break;
      case 'unmoved': out.push(`${cap(foeName(e.foe, e.fname))} does not fear your god.`); break;
      case 'skill': case 'use': case 'roll': case 'foeroll': case 'enter': case 'save': case 'new': break;
      case 'dead': out.push(`The lantern gutters and goes out. ${f.hero.name}'s delve ends here, on ${THEMES[e.floor - 1].name}.`); break;
      case 'won': {
        const M = MONSTERS[e.boss];
        out.push(`${cap(the(e.boss))} ${(M && M.deathLine) || 'falls, and the crown rolls to your feet'}. The Lantern Deep is yours.`);
        break;
      }
    }
  }
  return out.join(' ');
}

// ---------- the page ----------
// The title, and the text: what just happened, then (if you moved, or anything changed in
// the room worth saying again) where you are now.
export function tellPage(f, events, rnd) {
  const enter = events.filter((e) => e.t === 'enter').pop();
  const said = describeEvents(events, f, rnd);
  let where = '';
  if (f.mode === 'prologue') return { title: 'The Lantern Deep', text: '' };
  if (f.mode === 'create') return { title: 'The Lantern Deep', text: 'Under the ruins of the Gallows Inn a stair goes down, and down, five floors to the Hollow King and his hoard. Many have gone down. Who are you?' };
  if (f.mode === 'won' || f.mode === 'dead') return { title: f.mode === 'won' ? 'Victory' : 'The lantern goes out', text: said };
  if (enter) where = describeRoom(f, rnd, enter.first);
  else if (f.mode === 'explore' && events.some((e) => ['kill', 'escape', 'calmed', 'sneaked', 'wanderer', 'leftShop'].includes(e.t))) where = exitsLine(f.room.exits, rnd);
  return { title: titleFor(f), text: [said, where].filter(Boolean).join(' ') };
}

export function titleFor(f) {
  if (!f.room) return 'The Lantern Deep';
  if (f.mode === 'furnish') return f.waiting && f.waiting.here ? cap(f.room.name.replace(/^the /, '')) : 'At the Doorway';
  if (f.mode === 'fight') return `Fight: ${cap(f.room.foe.name.replace(/^the /, ''))}`;
  if (f.mode === 'shop') return 'The Pedlar’s Wares';
  return cap(f.room.name.replace(/^the /, ''));
}

