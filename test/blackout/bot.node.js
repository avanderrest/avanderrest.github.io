/* The look-ahead bot wins every mission, with nothing but the rules.

   playable.js is the bot (see its header: it plays each mission from six start delays,
   tries every step out a few moves ahead on a copy of the game, and never fires at a guard
   before the download). It runs in the page there; here the very same source runs in Node
   against sim.js, through a handle with the same verbs as window.__blackout, so a mission
   that cannot be won shows up without a browser, and the rules are shown to need nothing
   from the page. Seeded dice, so a run is repeatable. */
import { readFileSync } from 'node:fs';
import { createBlackout } from '../../blackout/sim.js';

export default function () {
  let said = '';
  const bo = createBlackout({ on: (ev, d) => { if (ev === 'say') said = d[0]; } });
  bo.seedDice(7);
  const B = {
    get consts() { return { W: bo.W, H: bo.H, LV: bo.LV, LADDERS: bo.LADDERS, START: bo.START, GATE: bo.GATE, CUT: bo.CUT, UPPER: bo.UPPER, LAMPS: bo.LAMPS, CAMERAS: bo.CAMERAS, GUARDS: bo.GUARDS, TERM_ROOM: bo.mission.termRoom }; },
    MISSIONS: bo.MISSIONS,
    newGame: bo.newGame, start: bo.begin, flush: bo.flush, stay: bo.stay, use: bo.use, fire: bo.fire, targets: bo.targets,
    hackPress: bo.hackPress, contextAction: bo.contextAction, toggleRun: bo.toggleRun, watchedAt: bo.watchedAt,
    key: bo.key, kx: bo.kx, ky: bo.ky, kl: bo.kl, tile: bo.ch, passable: bo.passable, bfs: bo.bfs, neighbours: bo.neighbours,
    moveTo: (x, y, lv) => bo.moveTo(bo.key(x, y, lv === undefined ? bo.state.player.lv : lv)),
  };
  // the two things the bot reads off the page: the message line and the end card
  const document = { getElementById: (id) => (id === 'msg' ? { textContent: said } : {}) };
  const src = readFileSync(new URL('./playable.js', import.meta.url), 'utf8');
  const t0 = Date.now();
  const out = JSON.parse(new Function('window', 'document', src)({ __blackout: B }, document));
  return { pass: out.pass, detail: out.detail + ` (in Node, ${((Date.now() - t0) / 1000).toFixed(1)}s)` };
}
