/* Economy shape — the screen. The status row is the resources, the clock is the phase's
   own, and the actions come from sim.js. Nothing in this file changes a rule. */

import { createGame, RULES, HINT, MAP } from './sim.js';
import { startPrototype, pill, line } from './ui.js';

function resource(r, S) {
  const n = pill(r.name, S.res[r.id] ?? r.start);
  if (r.max != null) {
    const bar = line('i', 'pf-res-bar');
    const value = line('b');
    value.style.width = (Math.max(0, Math.min(1, (S.res[r.id] ?? 0) / r.max)) * 100).toFixed(1) + '%';
    bar.append(value);
    n.append(bar);
  }
  return n;
}

function paint(S, ui, game) {
  const p = game.phase();
  ui.chip('Day ' + S.day);
  ui.head(p.name, p.note);
  ui.clock(S.left, p.seconds);
  ui.status((game.GAME.resources || []).map((r) => resource(r, S)));
  ui.stage(null);
}

function frame(S, ui, game) {
  const p = game.phase();
  ui.clock(S.left, p && p.seconds);
}

startPrototype({ createGame, rules: RULES, hint: HINT, paint, frame, map: MAP });
