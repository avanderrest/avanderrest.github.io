/* A whole game, three contracts to the ending, with nothing but the rules.

   In Node, through sim.js: for each contract, go through every room whose window will
   open (a shuttered one only with a lockpick), put the people in it down, and search
   everything that can be searched with what you carry, round and round until a pass finds
   nothing new. By then everything the contract requires must be in hand, or the contract
   could never be finished. Then the target's window, which must now open; climb back out
   without touching them (they are spared), give the silver to the Lowmarket, go past the
   fence and on to the next. The cards are answered the way a gentle player would, and the
   game has to reach its ending, the Sparrow's.

   The walking outside is not played: reach.js proves every window and hold can be reached
   from the start, and keys.js that the moves get there. */
import { createTithe } from '../../tithe/sim.js';

const PREFER = [/^Leave it$/, /^Leave .* be/, /^Go on/, /^Give it/, /^To the fence/, /^Out into the night/, /^Begin/, /^The end/];

export default function () {
  const problems = [];
  let card = null, cards = 0;
  const ti = createTithe({ on: (ev, d) => { if (ev === 'card') { card = d; if (d) cards++; } } });
  const { S, LEVELS } = ti;
  const answer = () => {
    if (!card) return false;
    if ((card.actions || []).some((a) => a.label === 'Begin again')) return false;   // the ending: stop there
    const acts = (card.actions || []).filter((a) => !a.disabled);
    const a = PREFER.map((re) => acts.find((x) => re.test(x.label))).find(Boolean) || acts[0];
    if (!a) { problems.push(`a card with no way on: ${card.title}`); card = null; return false; }
    a.fn();
    return true;
  };
  const tick = (secs) => { for (let t = 0; t < secs; t += 1 / 60) ti.update(1 / 60); };
  const settle = (R) => { for (const p of R.people) p.state = 'ko'; R.climbIn = 0; R.peek = false; R.hidden = null; };

  ti.newGame();
  for (let n = 0; n < 5 && card && S.mode !== 'ext'; n++) answer();
  const runs = [];
  for (let li = 0; li < LEVELS.length; li++) {
    if (S.li !== li || S.mode !== 'ext') { problems.push(`contract ${li + 1} did not start (mode ${S.mode}, level ${S.li})`); break; }
    const L = LEVELS[li];
    let entered = new Set(), found = true, passes = 0;
    const tried = new Set();                 // a knife rack left alone stays unsearched: try each once
    while (found && passes++ < 6) {
      found = false;
      for (const id of Object.keys(L.rooms)) {
        const rs = ti.roomState(id);
        if (!rs.unlocked) {
          if (S.run.inv.picks <= 0) continue;
          S.run.inv.picks--; rs.unlocked = true;
        }
        ti.enterRoom(id);
        entered.add(id);
        const R = S.room;
        settle(R);
        for (const sp of R.spots) {
          if (sp.done || !sp.loot || (sp.needs && !ti.has(sp.needs)) || tried.has(id + sp.i)) continue;
          tried.add(id + sp.i);
          ti.completeSearch(sp);
          found = true;
          while (card && answer());
        }
        ti.leaveRoom(false);
        while (card && answer());
      }
    }
    const missing = L.required.filter((r) => !ti.has(r));
    if (missing.length) { problems.push(`${L.name}: still missing ${missing.join(', ')} after searching ${entered.size} rooms`); break; }

    ti.tryWindow('T');
    tick(1.2);
    if (S.mode !== 'room' || S.room.id !== 'T') { problems.push(`${L.name}: the target's window did not open (mode ${S.mode})`); break; }
    const R = S.room;
    settle(R);
    tick(1.5);
    const silver = S.run.silver;
    ti.useSpot(R.spots[0]);                  // walk back to the sill and climb out
    for (let t = 0; t < 10 && !card; t += 1 / 60) ti.update(1 / 60);
    if (!card) { problems.push(`${L.name}: climbing out of the target's room asked nothing (mode ${S.mode})`); break; }
    for (let n = 0; n < 10 && card && answer(); n++);
    runs.push(`${L.name}: ${entered.size} rooms, ${tried.size} searched in ${passes} passes, ${silver} silver given`);
  }
  if (runs.length === LEVELS.length) {
    const st = S.run.stats;
    if (st.spared !== LEVELS.length) problems.push(`${st.spared} spared, not ${LEVELS.length}`);
    if (S.run.kept !== 0 || S.run.given <= 0) problems.push(`kept ${S.run.kept}, gave ${S.run.given}`);
    if (S.mode !== 'card' || !cards) problems.push(`the game ended in mode ${S.mode}`);
  }
  const ending = card ? card.title : '(no card)';
  if (runs.length === LEVELS.length && ending !== 'The Sparrow of Vell') problems.push(`a gentle run ended as ${ending}`);
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + runs.join('; ') + `; ending: ${ending}, ${cards} cards answered`,
  };
}
