/* Economy shape — a day of buying, working and paying. The game below is an example
   stall, built 2026-10-23 to show the shape; replace the table at the top with your game
   and keep the engine, or rewrite both if the loop needs it.

   What this shape is good at: a loop of rounds where something accumulates (money,
   stock, trust), something is spent, and the upkeep rises. The player chooses between
   actions that each cost and give.

   The interface every sim.js must expose (see GUIDE.md):
     createGame({ seed, on }) -> { S, actions(), act(id), step(dt), text() }
   Plus, for the page: `phase()`. Nothing here touches the page.

   S: day, phase, left, res, used, fired, timer, did, log, over, seed. */

import { mulberry32 } from '../../../../lib/rng.js';

export const RULES = [
  'Morning buys, evening serves, night pays.',
  'Stock is what can be sold; money has to cover the rent.',
  'The evening lasts 60 seconds whether you are ready or not.',
];

export const HINT = 'Number keys 1–9 act. A phase with a clock ends by itself.';

// ---------- the game ----------
// resources  { id, name, start, min?, max? }
// phases     { id, name, note, seconds? }  seconds omitted: wait for an advance action
// actions    { id, phase, label, note?, cost?, gain?, set?, when?, why?, once?, advance?, text?, tone? }
// events     { id, phase, every, chance?, once?, text?, cost?, gain?, set?, tone? }  (timed phases)
// endings    { id, name, text, when: (s) => boolean, win? }
const GAME = {
  resources: [
    { id: 'money', name: 'Money', start: 30 },
    { id: 'stock', name: 'Stock', start: 4, min: 0 },
    { id: 'favour', name: 'Favour', start: 0, min: 0, max: 5 },
  ],

  phases: [
    { id: 'morning', name: 'Morning', note: 'Buy what the evening needs.' },
    { id: 'evening', name: 'Evening', note: 'Serve whoever comes.', seconds: 60 },
    { id: 'night', name: 'Night', note: 'Pay the rent, then sleep.' },
  ],

  actions: [
    { id: 'buy', phase: 'morning', label: 'Buy a crate', note: '−10 money, +4 stock', cost: { money: 10 }, gain: { stock: 4 }, text: 'A crate of bowls, still warm.' },
    { id: 'chat', phase: 'morning', label: 'Chat with the neighbour', note: '+1 favour, once a morning', once: true, gain: { favour: 1 }, text: 'She promises to send people your way.' },
    { id: 'open', phase: 'morning', label: 'Open the stall', note: 'on to the evening', advance: true, text: 'The shutter goes up.' },

    { id: 'serve', phase: 'evening', label: 'Serve a bowl', note: '−1 stock, +9 money', when: (s) => s.res.stock > 0, why: 'nothing left to sell', cost: { stock: 1 }, gain: { money: 9 }, text: 'A bowl goes out; coins come in.' },
    { id: 'give', phase: 'evening', label: 'Give one away', note: '−1 stock, +1 favour, once an evening', when: (s) => s.res.stock > 0, why: 'nothing left to give', once: true, cost: { stock: 1 }, gain: { favour: 1 }, text: 'Word gets round.' },

    { id: 'rent', phase: 'night', label: 'Pay the rent', note: '−18 money, once a night', once: true, cost: { money: 18 }, text: 'The landlord counts it twice and leaves.' },
    { id: 'sleep', phase: 'night', label: 'Sleep', note: 'on to the next morning', advance: true, text: 'The lamp goes out.' },
  ],

  events: [
    { id: 'rush', phase: 'evening', every: 12, chance: 0.5, text: 'A queue forms at the counter.', gain: { money: 4 } },
    { id: 'rain', phase: 'evening', every: 15, chance: 0.35, text: 'The rain keeps the street indoors.' },
  ],

  endings: [
    { id: 'broke', name: 'The float runs out', text: 'There is not enough left to buy tomorrow, and the stall stays shut.', when: (s) => s.res.money < 8 && s.day >= 4 },
    { id: 'week', name: 'A week on the street', text: 'Seven nights, and the shutter still opens.', win: true, when: (s) => s.day > 7 },
  ],
};

// The map the Graph button draws: a column per phase, its verbs, and what ends the run.
// It is read from GAME, so it stays true when the table changes. Live tuning is optional:
// return a knobs() from createGame() and the shell renders sliders that call set(value).
function effectNote(effect, direction = 1) {
  return Object.entries(effect || {})
    .map(([id, amount]) => `${amount * direction > 0 ? '+' : '−'}${Math.abs(amount)} ${id}`)
    .join(', ');
}

function mapFromTable(g) {
  const nodes = [];
  const edges = [];
  const phases = g.phases || [];
  phases.forEach((p, col) => {
    nodes.push({ id: `phase:${p.id}`, kind: 'phase', col, label: p.name, note: p.note || '' });
    for (const a of (g.actions || []).filter((x) => x.phase === p.id)) {
      nodes.push({
        id: `act:${a.id}`,
        kind: 'action',
        col,
        label: a.label || a.id,
        note: [effectNote(a.cost, -1), effectNote(a.gain)].filter(Boolean).join(' → ') || a.note || '',
      });
      edges.push({ from: `phase:${p.id}`, to: `act:${a.id}` });
    }
    const next = phases[col + 1];
    if (next) {
      const opener = (g.actions || []).find((a) => a.phase === p.id && a.advance);
      edges.push({ from: `phase:${p.id}`, to: `phase:${next.id}`, label: opener ? opener.label : 'then' });
    }
  });
  (g.endings || []).forEach((ending) => {
    nodes.push({
      id: `end:${ending.id}`,
      kind: 'ending',
      col: phases.length,
      label: ending.name,
      note: ending.win ? 'win' : 'the run ends',
      win: Boolean(ending.win),
    });
    const last = phases[phases.length - 1];
    if (last) edges.push({ from: `phase:${last.id}`, to: `end:${ending.id}`, label: 'when' });
  });
  return { title: 'One loop', nodes, edges };
}

export const MAP = mapFromTable(GAME);

// ---------- the engine ----------
export function createGame({ seed = 1, on = () => {} } = {}) {
  const rnd = mulberry32(seed);
  const resDefs = new Map((GAME.resources || []).map((r) => [r.id, r]));
  const phaseDefs = GAME.phases || [];
  const allActions = GAME.actions || [];
  const allEvents = GAME.events || [];
  const allEndings = GAME.endings || [];

  const S = {
    seed,
    day: 1,
    phase: phaseDefs[0] ? phaseDefs[0].id : '',
    left: null,
    res: {},
    used: [],
    fired: [],
    timer: {},
    did: {},
    log: [],
    over: null,
  };
  for (const r of GAME.resources || []) S.res[r.id] = r.start;

  function say(text, tone = '') {
    S.log.push({ text, tone, day: S.day, phase: S.phase });
    if (S.log.length > 80) S.log.shift();
    on('say', { text, tone });
  }

  function bump(id, amount) {
    const def = resDefs.get(id);
    let v = (S.res[id] ?? 0) + amount;
    if (def && def.min != null) v = Math.max(def.min, v);
    if (def && def.max != null) v = Math.min(def.max, v);
    S.res[id] = Math.round(v * 100) / 100;
  }

  function apply(effect) {
    for (const [id, amount] of Object.entries(effect.cost || {})) bump(id, -amount);
    for (const [id, amount] of Object.entries(effect.gain || {})) bump(id, amount);
    for (const [id, value] of Object.entries(effect.set || {})) {
      const def = resDefs.get(id);
      const lo = def && def.min != null ? def.min : -Infinity;
      const hi = def && def.max != null ? def.max : Infinity;
      S.res[id] = Math.round(Math.max(lo, Math.min(hi, value)) * 100) / 100;
    }
  }

  const label = (id) => {
    const def = resDefs.get(id);
    return def ? def.name : id;
  };

  function whyNot(a) {
    if (S.over) return 'the run is over';
    if (a.once && S.used.includes(a.id)) {
      const p = phaseDefs.find((x) => x.id === S.phase);
      return 'already done this ' + (p ? p.name.toLowerCase() : 'phase');
    }
    if (a.when && !a.when(S)) return a.why || 'not now';
    for (const [id, amount] of Object.entries(a.cost || {})) {
      if ((S.res[id] ?? 0) < amount) {
        const short = Math.round((amount - (S.res[id] ?? 0)) * 100) / 100;
        return `needs ${short} more ${label(id)}`;
      }
    }
    return null;
  }

  function actions() {
    return allActions
      .filter((a) => a.phase === S.phase)
      .map((a) => {
        const why = whyNot(a);
        return {
          id: a.id,
          label: a.label || a.id,
          note: a.note || '',
          advance: Boolean(a.advance),
          ok: why == null,
          why: why || '',
        };
      });
  }

  function check() {
    if (S.over) return;
    for (const e of allEndings) {
      if (e.when(S)) {
        S.over = { id: e.id, name: e.name, text: e.text || '', win: Boolean(e.win) };
        say(e.text || e.name, S.over.win ? 'good' : 'bad');
        on('ending', S.over);
        return;
      }
    }
  }

  function enter(i) {
    const p = phaseDefs[i];
    if (!p) return;
    S.phase = p.id;
    S.left = p.seconds != null ? p.seconds : null;
    S.used = [];
    S.fired = [];
    S.timer = {};
    on('phase', { phase: p.id, day: S.day });
    say(p.enter || p.name + '.', 'phase');
    check();
  }

  function endPhase() {
    if (S.over) return { ok: false, why: 'the run is over' };
    const i = phaseDefs.findIndex((p) => p.id === S.phase);
    if (i < 0) return { ok: false, why: 'unknown phase ' + S.phase };
    if (i + 1 >= phaseDefs.length) {
      S.day += 1;
      enter(0);
    } else {
      enter(i + 1);
    }
    return { ok: S.over == null, why: S.over ? 'the run ended' : '' };
  }

  function act(id) {
    const a = allActions.find((x) => x.id === id && x.phase === S.phase);
    if (!a) return { ok: false, why: `no action "${id}" in ${S.phase}` };
    const why = whyNot(a);
    if (why) return { ok: false, why };
    apply(a);
    if (a.once) S.used.push(a.id);
    S.did[a.id] = (S.did[a.id] || 0) + 1;
    say(a.text || a.label, a.tone || '');
    on('act', { id: a.id });
    check();
    if (a.advance && !S.over) endPhase();
    return { ok: true };
  }

  function fire(e) {
    if (e.once && S.fired.includes(e.id)) return;
    if (e.chance != null && rnd() > e.chance) return;
    S.fired.push(e.id);
    apply(e);
    say(e.text || e.id, e.tone || '');
    on('event', { id: e.id });
    check();
  }

  function step(dt) {
    if (S.over || !(dt > 0) || S.left == null) return;
    S.left = Math.max(0, S.left - dt);
    for (const e of allEvents) {
      if (e.phase !== S.phase) continue;
      const every = e.every || 10;
      S.timer[e.id] = (S.timer[e.id] || 0) + dt;
      while (S.timer[e.id] >= every) {
        S.timer[e.id] -= every;
        fire(e);
        if (S.over) return;
      }
    }
    if (S.left <= 0) endPhase();
  }

  function phase() {
    return phaseDefs.find((p) => p.id === S.phase) || phaseDefs[0] || null;
  }

  function text() {
    return JSON.stringify({
      seed: S.seed,
      day: S.day,
      phase: S.phase,
      left: S.left == null ? null : Math.round(S.left),
      res: S.res,
      over: S.over && S.over.id,
    });
  }

  enter(0);

  return { S, GAME, act, actions, endPhase, step, phase, text, say };
}
