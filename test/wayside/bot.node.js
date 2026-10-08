/* A walker who does the errands gets down the coast: six chapters and a lit lamp.

   A bot runs the real sim in Node with seeded dice, walking alone. It reads the land the way
   a player who had read every signpost would: for each chapter it knows the errand (oars
   for the boat, mushrooms for the hermit's key, the axe for planks, honey for the troll, the
   pick for a lantern) and heads for the next piece of it, laying a card into every empty
   square on the way and stepping onto it. It fights what it walks into with its best move,
   says yes to every trade, and climbs any dark lighthouse in the chapter it is in.

   What this guards is the whole chain at once: chapters that can be opened with what they
   hold, dialogue options that do what they say, fights that end, and a lamp that lights. */
import { createWayside, CARDS, ROWS, DIRS } from '../../wayside/sim.js';
import { mulberry32 } from '../../lib/rng.js';

const GOAL = 6;           // chapters to get through
const BUDGET = 3000;      // verbs before the bot gives up

export function run(seed, trace) {
  let lastFlash = '';
  const w = createWayside({ seed, rnd: mulberry32(seed), best: {}, on: (e, d) => { if (e === 'flash') lastFlash = d; } });
  w.newGame('solo', null, seed);
  const S = () => w.S;
  let verbs = 0, fights = 0, falls = 0, stuck = '', lastFight = null;

  // what to walk to next in this chapter
  function target() {
    const ch = w.here(), inv = S().inv;
    const find = (id) => {
      for (let c = ch.start; c <= ch.end; c++) for (let r = 0; r < ROWS; r++) {
        const cell = w.cellAt(r, c);
        if (cell && cell.id === id) return { r, c, cell };
      }
      return null;
    };
    const lamp = find('lighthouse');
    if (lamp && !lamp.cell.used) return lamp;
    if (ch.open) return { r: ch.passRow, c: ch.end + 1 };
    const want = {
      river: () => 'bridge',
      wall: () => (inv.key ? 'gate' : inv.mushrooms ? 'hermit' : 'hollow'),
      chasm: () => (inv.planks ? 'brokenbridge' : inv.axe ? 'woodcutter' : 'stump'),
      mountain: () => (inv.lantern ? 'cave' : inv.pick ? 'miner' : 'shed'),
      thorns: () => (inv.honey || S().coins >= 7 ? 'troll' : S().hearts <= 1 ? 'camp' : 'beehive'),
    }[ch.type]();
    return find(want) || { r: ch.passRow, c: ch.end };
  }

  // breadth-first over the squares a walker may cross: open ground (lay a card there), and any
  // card but a closed barrier, unless that barrier is where we are going
  function nextStep(t) {
    const h = S().hero;
    const key = (r, c) => r * 100000 + c;
    const seen = new Set([key(h.r, h.c)]);
    const q = [[h.r, h.c, null]];
    while (q.length) {
      const [r, c, first] = q.shift();
      for (const [dr, dc] of Object.values(DIRS)) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || seen.has(key(nr, nc))) continue;
        const step = first || { r: nr, c: nc };
        if (nr === t.r && nc === t.c) return step;
        const cell = w.cellAt(nr, nc);
        if (cell) {
          const k = CARDS[cell.id].kind;
          if ((k === 'block' && !cell.used && !(cell.id === 'river' && S().inv.boat)) || ((cell.id === 'bridge' || cell.id === 'troll') && !cell.used)) continue;
        }
        seen.add(key(nr, nc));
        q.push([nr, nc, step]);
      }
    }
    return null;
  }

  function settle() {
    for (let guard = 0; guard < 200 && (w.dlg || w.battle); guard++) {
      verbs++;
      if (w.battle) {
        const b = w.battle;
        if (b !== lastFight) { lastFight = b; fights++; }
        if (b.pending) {
          const before = S().hearts;
          w.battleResolve();
          if (S().hearts > before) falls++;          // knocked down, woken whole at the last fire
          continue;
        }
        const moves = w.battleMoves();
        let best = 0;
        moves.forEach((m, i) => { if (!m.run && m.dmg > moves[best].dmg) best = i; });
        w.battleMove(best);
        continue;
      }
      const opts = w.dlg.options;
      // a trade before a fight: the troll wins a fight with bare hands every time
      let i = -1;
      for (const re of [/^(Hand|Offer)/, /^Pay/, /^Fight/, /^(Toss|Walk on)/]) {
        i = opts.findIndex((o) => !o.disabled && re.test(o.label));
        if (i >= 0) break;
      }
      if (w.dlg.kind === 'lamp') i = 0;
      if (i < 0) i = opts.length - 1;
      w.chooseOption(i);
    }
  }

  while (verbs < BUDGET && w.here().i < GOAL) {
    verbs++;
    settle();
    const t = target();
    const st = nextStep(t);
    if (typeof trace === 'function') trace({ t, st, hero: { ...S().hero }, phase: S().phase, sel: S().selected, hand: S().hand.slice(), at: st && w.cellAt(st.r, st.c) && w.cellAt(st.r, st.c).id, hint: lastFlash });
    if (!st) { stuck = `no way to ${JSON.stringify(t)} in chapter ${w.here().i} (${w.here().type})`; break; }
    if (!w.cellAt(st.r, st.c)) {
      if (!w.canPlace()) { stuck = 'laid a card and could not step'; break; }
      const hand = S().hand;
      let i = hand.findIndex((id) => CARDS[id].kind === 'path');
      if (i < 0) i = hand.findIndex((id) => CARDS[id].kind !== 'action' && CARDS[id].kind !== 'enemy');
      if (i < 0) i = hand.findIndex((id) => CARDS[id].kind !== 'action');
      if (i < 0) {                                         // three action cards: trade one away
        const a = hand.findIndex((id) => id === 'rework' || id === 'cross');
        if (a < 0) { stuck = `a hand of nothing but ${hand.join(', ')}`; break; }
        w.handPick(a);
        w.actionPick(a === 0 ? 1 : 0);
        continue;
      }
      w.handPick(i);
      w.placeAt(st.r, st.c);
      continue;
    }
    w.tryMove(st.r, st.c);
  }
  settle();
  if (!stuck && w.here().i < GOAL) {
    const t = target(), cell = w.cellAt(t.r, t.c), ch = w.here();
    stuck = `out of moves heading for ${cell ? cell.id : 'open ground'} in a ${ch.type} chapter with ${S().coins} coins, ${S().hearts} hearts, ${Object.keys(S().inv).filter((k) => S().inv[k]).join('+') || 'empty hands'}`;
  }
  return { seed, ch: w.here().i, lamps: S().lamps, steps: S().steps, placed: S().placed, coins: S().coins, fights, falls, verbs, stuck };
}

export default function () {
  const runs = [1, 2, 3, 4, 5].map((s) => run(s));
  const problems = [];
  for (const r of runs) {
    if (r.ch < GOAL) problems.push(`seed ${r.seed}: stopped in chapter ${r.ch + 1}${r.stuck ? ` (${r.stuck})` : ''}`);
    if (r.lamps < 1) problems.push(`seed ${r.seed}: no lamp lit`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `seed ${r.seed}: chapter ${r.ch + 1} in ${r.steps} steps, ${r.placed} laid, ${r.lamps} lamp, ${r.fights} fights, ${r.falls} falls`).join('; '),
  };
}
