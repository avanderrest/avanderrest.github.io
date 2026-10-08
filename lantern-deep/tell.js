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

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const the = (kind) => { const n = MONSTERS[kind] ? MONSTERS[kind].name : kind; return n.startsWith('the ') ? n : 'the ' + n; };
const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

// ---------- the room ----------
export function describeRoom(f, rnd, first = true) {
  const T = THEMES[f.floor - 1], r = f.room, out = [];
  if (first) {
    const size = r.size === 'large' ? pick(rnd, ['A wide chamber opens up around you.', 'The passage gives onto a great, echoing room.']) :
      r.size === 'small' ? pick(rnd, ['You squeeze into a cramped little room.', 'The room is barely more than a widening of the passage.']) :
        pick(rnd, ['You step into ' + r.name + '.', 'Your lantern finds the edges of ' + r.name + '.']);
    out.push(size);
    out.push(`${cap(pick(rnd, T.walls))}; underfoot, ${pick(rnd, T.floors)}. The air smells of ${pick(rnd, T.smells)}, and you can hear ${pick(rnd, T.sounds)}.`);
    if (r.props.length) out.push(`${cap(list(r.props))} lie about.`);
  } else out.push(pick(rnd, [`You are back in ${r.name}.`, `${cap(r.name)} again.`]));
  if (r.start) out.push(f.floor === 1 ? 'Behind you the stair climbs back up to the ruined inn and the daylight.' : 'The stair you came down rises behind you into the dark.');
  if (r.feature) out.push(r.feature.state === 'new' ? pick(rnd, FEATURE_NEW[r.feature.kind]) : FEATURE_USED[r.feature.kind]);
  if (r.foe) out.push(foeLine(r.foe, rnd, first));
  if (r.loot) out.push(pick(rnd, ['Coins glint among the rubble.', 'Something catches the light on the floor.']));
  if (r.stairs) out.push(pick(rnd, ['In the far corner a stair winds down into deeper dark.', 'A cold draught rises from a stair leading down.']));
  out.push(exitsLine(r.exits, rnd));
  if (f.hero.hurt < 0.3) out.push(pick(rnd, ['Your wounds throb. You will not last long like this.', 'You are bleeding, and the dark knows it.']));
  if (f.hero.poisoned) out.push('The poison burns in your veins.');
  return out.join(' ');
}

function foeLine(foe, rnd, first) {
  if (foe.state === 'hostile') return first ? pick(rnd, INTROS[foe.kind] || [`${cap(the(foe.kind))} is here.`]) : `${cap(the(foe.kind))} is still here, and still angry.`;
  if (foe.state === 'passed') return `${cap(the(foe.kind))} dozes, unaware of you.`;
  if (foe.state === 'calm') return `${cap(the(foe.kind))} watches you, keeping to the bargain.`;
  if (foe.state === 'fled') return `There is no sign of ${the(foe.kind)} now.`;
  return `${cap(the(foe.kind))} lies dead where it fell.`;
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
  const foeName = (k) => the(k);
  for (const e of events) {
    switch (e.t) {
      case 'begin': out.push(`The Lantern Deep lies under the ruins of the Gallows Inn. Five floors down, they say, the Hollow King still sits his throne, and his hoard with him. You are ${f.hero.name}, ${f.hero.race.toLowerCase()} ${f.hero.cls.toLowerCase()}, and you have come to see. You light your lantern and start down the stair.`); break;
      case 'descend': out.push(pick(rnd, [`You catch your breath on the stair, then go down into ${e.name}.`, `The stair turns and turns, and lets you out into ${e.name}.`])); break;
      case 'fight':
        if (e.how === 'fight') out.push(pick(rnd, [`You ready your ${f.hero.weapon.toLowerCase()} and close in.`, 'No way round it. You attack.']));
        if (e.how === 'ambush') out.push(`You strike from the dark before ${foeName(e.foe)} can wake.`);
        break;
      case 'mimic': out.push('The lid yawns open on rows of teeth. The chest is a mimic, and it is hungry!'); break;
      case 'mimicFound': out.push('As you lean in, the “chest” licks its lips. A mimic! It knows you know.'); break;
      case 'spotted': out.push(`A stone shifts under your boot. ${cap(foeName(e.foe))} whirls round!`); break;
      case 'sneaked': out.push(pick(rnd, [`You keep to the shadows. ${cap(foeName(e.foe))} never sees you.`, `Step by careful step you slip past ${foeName(e.foe)}.`])); break;
      case 'insulted': out.push(`${cap(foeName(e.foe))} is in no mood to talk.`); break;
      case 'calmed': out.push(`Words work where steel might not. ${cap(foeName(e.foe))} lets you pass.`); break;
      case 'toll': out.push(`It costs you ${e.n} gold, mind.`); break;
      case 'hit':
        if (e.by !== 'hero') break;
        if (e.how === 'crit') out.push(`A perfect blow! You hit ${foeName(e.foe)} for ${e.n}.`);
        else if (e.how === 'weapon') out.push(pick(rnd, [`You hit ${foeName(e.foe)} for ${e.n}.`, `Your blow lands: ${e.n} damage.`, `You catch ${foeName(e.foe)} hard, for ${e.n}.`]));
        else out.push(`${e.how} hits ${foeName(e.foe)} for ${e.n}.`);
        if (e.hp > 0 && e.hp / e.maxHp < 0.35) out.push(`${cap(foeName(e.foe))} is reeling.`);
        break;
      case 'miss':
        if (e.by === 'hero') out.push(pick(rnd, ['You miss.', 'Your swing goes wide.', `${cap(foeName(e.foe))} slips aside.`]));
        else out.push(`${cap(foeName(e.foe))} ${pick(rnd, MONSTERS[e.foe].verbs)}, but you twist away.`);
        break;
      case 'hurt':
        if (MONSTERS[e.source]) out.push(`${cap(foeName(e.source))} ${pick(rnd, MONSTERS[e.source].verbs)}: ${e.n} damage.`);
        else if (e.source === 'trap') out.push(`It hurts: ${e.n} damage.`);
        else if (e.source === 'poison') out.push(`The poison bites: ${e.n} damage.`);
        else if (e.source === 'grubs') out.push(`Rot grubs burrow out of the body and into your hand: ${e.n} damage.`);
        break;
      case 'kill':
        out.push(e.how === 'fled' ? `${cap(foeName(e.foe))} flees before your holy light.` : pick(rnd, [`${cap(foeName(e.foe))} falls and does not get up.`, `${cap(foeName(e.foe))} is dead.`]));
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
      case 'poisoned': out.push(e.foe === 'fountain' ? 'The water is foul. Your stomach knots: poisoned!' : 'The bite burns. You are poisoned!'); break;
      case 'retch': out.push('The water is foul. You spit it out in time.'); break;
      case 'plain': out.push('It is water. Just water.'); break;
      case 'cured': out.push('The poison ebbs away.'); break;
      case 'mapped': out.push('Among the rot you find a surveyor’s plan of this floor. You know the way now.'); break;
      case 'lore': out.push('You learn a little of who built this place, and why.'); break;
      case 'crumbled': out.push('The pages crumble to dust in your fingers.'); break;
      case 'cache': out.push('There is a seam at the plinth. Behind it: a hidden cache!'); break;
      case 'stone': out.push('It is just stone.'); break;
      case 'rested': out.push(e.short ? 'You sit with your back to the wall and close your eyes for a little while.' : 'You build up the fire and sleep beside it.'); break;
      case 'wanderer': out.push(`You wake to a sound close by. ${cap(foeName(e.foe))} has found you!`); break;
      case 'shop': out.push('“Have a look, have a look. Everything’s guaranteed, more or less.”'); break;
      case 'bought': out.push(`You hand over ${e.n} gold.`); break;
      case 'leftShop': out.push('“Mind how you go.”'); break;
      case 'escape': out.push(e.how === 'flee' ? 'You run, and you do not look back.' : 'A burst of smoke, and you are gone.'); break;
      case 'cornered': out.push(`You try to run, but ${foeName(e.foe)} cuts you off.`); break;
      case 'dodged': out.push(`You roll under the blow and come up ready to answer it.`); break;
      case 'ward': out.push('A shimmer of force hangs in the air before you.'); break;
      case 'unmoved': out.push(`${cap(foeName(e.foe))} does not fear your god.`); break;
      case 'skill': case 'use': case 'roll': case 'foeroll': case 'enter': case 'save': case 'new': break;
      case 'dead': out.push(`The lantern gutters and goes out. ${f.hero.name}'s delve ends here, on ${THEMES[e.floor - 1].name}.`); break;
      case 'won': out.push('The Hollow King crumbles into ash and rust, and the crown rolls to your feet. The Lantern Deep is yours.'); break;
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
  if (f.mode === 'create') return { title: 'The Lantern Deep', text: 'Under the ruins of the Gallows Inn a stair goes down, and down, five floors to the Hollow King and his hoard. Many have gone down. Who are you?' };
  if (f.mode === 'won' || f.mode === 'dead') return { title: f.mode === 'won' ? 'Victory' : 'The lantern goes out', text: said };
  if (enter) where = describeRoom(f, rnd, enter.first);
  else if (f.mode === 'explore' && events.some((e) => ['kill', 'escape', 'calmed', 'sneaked', 'wanderer', 'leftShop'].includes(e.t))) where = exitsLine(f.room.exits, rnd);
  return { title: titleFor(f), text: [said, where].filter(Boolean).join(' ') };
}

export function titleFor(f) {
  if (!f.room) return 'The Lantern Deep';
  if (f.mode === 'fight') return `Fight: ${cap(the(f.room.foe.kind).replace(/^the /, ''))}`;
  if (f.mode === 'shop') return 'The Pedlar’s Wares';
  return cap(f.room.name.replace(/^the /, ''));
}

