/* Can a plain-minded player win every mission, with every guard and camera in it?

   map.js says a compound is connected and terminal.js says its camera can be slipped past,
   but neither puts the guards in. A mission can pass both and still be unwinnable: a beat
   that sweeps the only way to the door every few ticks, a floodlight over the cut, a
   carrier who is never alone. This bot plays each mission through the real verbs and never
   fires at a guard before the download. It knows where everyone is, but it plays by the rules and plans the way a
   careful player does: before each step it tries the step out, on a copy of the game, a
   few moves ahead (go on, or stand and wait), and only takes it if nobody would see it.
   Otherwise it waits, and if waiting would be seen too, it backs off; if a camera has it
   boxed in, or has kept it waiting a long while, it shoots the camera out. It knocks out the
   carrier from behind, opens the door, hacks, and once the download trips the alarm it
   runs for the wire, shooting any hunter who has it in his sights (and, out of rounds,
   knocking out any it can get behind).

   Fixed rules of thumb (keep two tiles from a guard, four in front of him) were tried
   first and lost every run on every mission, the first one included: a guard on a beat
   that crosses the top of the stairs closes off the only retreat. The look-ahead is what
   makes the bot a fair judge of the maps rather than of itself.

   Each mission is played from several start delays (standing outside the wire for a few
   moves first), so the guards are met at different points of their beats. A mission
   passes if the bot gets out with the data in at least half of them. */
const B = window.__blackout;
const notes = [];
let pass = true;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DELAYS = [0, 2, 4, 6, 8, 10];
const AHEAD = 4;          // moves tried out past the step itself
const ESCAPE_AHEAD = 6;   // and on the way out, where they come at you every move

function play(mi, delay) {
  const S = B.newGame('normal', mi);
  B.start();
  const C = B.consts;
  const key = B.key;
  for (let i = 0; i < delay; i++) { B.stay(); B.flush(); }

  // the whole game state, minus the action queue (functions), which is empty between moves
  const snap = () => { const o = {}; for (const k of Object.keys(S)) if (k !== 'queue') o[k] = structuredClone(S[k]); return o; };
  const restore = (o) => { for (const k of Object.keys(o)) S[k] = structuredClone(o[k]); S.queue = []; S.busy = 0; };

  const tiles = (pred) => {
    const out = [];
    for (let lv = 0; lv < C.LV; lv++) for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) if (pred(x, y, lv)) out.push(key(x, y, lv));
    return out;
  };
  const doors = tiles((x, y, lv) => B.tile(x, y, lv) === 'D');
  const term = tiles((x, y, lv) => B.tile(x, y, lv) === 'T')[0];
  const outside = tiles((x, y, lv) => B.tile(x, y, lv) === 'o');
  const besideOf = (k) => DIRS.map(([dx, dy]) => [B.kx(k) + dx, B.ky(k) + dy, B.kl(k)])
    .filter(([x, y, lv]) => B.passable(x, y, lv, 'player')).map(([x, y, lv]) => key(x, y, lv));
  const here = () => key(S.player.x, S.player.y, S.player.lv);

  function goals() {
    const carrier = S.guards.find((g) => g.card);
    if (!S.hasCard && carrier) {
      if (carrier.down) return [key(carrier.x, carrier.y, carrier.lv)];
      const [fx, fy] = DIRS[carrier.face];   // any side of him but the one he is looking at
      return DIRS.filter(([dx, dy]) => !(dx === fx && dy === fy))
        .map(([dx, dy]) => [carrier.x + dx, carrier.y + dy, carrier.lv])
        .filter(([x, y, lv]) => B.passable(x, y, lv, 'player')).map(([x, y, lv]) => key(x, y, lv));
    }
    if (!S.doorOpened) return [].concat(...doors.map(besideOf));
    if (!S.dataDone) return besideOf(term);
    return outside;
  }

  // the first step of the shortest way to the nearest goal, keeping out of lamplight if it can
  function nextStep() {
    const gs = goals(), from = here();
    const guards = S.guards.filter((g) => !g.down).map((g) => key(g.x, g.y, g.lv));
    const pick = (r) => gs.filter((k) => r.dist[k] > 0).sort((a, b) => r.dist[a] - r.dist[b])[0];
    const dark = new Set(guards);
    for (let k = 0; k < S.light.length; k++) if (S.light[k] >= C.LIT && !gs.includes(k)) dark.add(k);
    let r = B.bfs(from, 'player', 9999, dark), g = pick(r);
    if (g === undefined) { r = B.bfs(from, 'player', 9999, new Set(guards)); g = pick(r); }
    if (g === undefined) return -1;
    while (r.prev[g] !== from) g = r.prev[g];
    return g;
  }

  const step = (k) => { const ok = B.moveTo(B.kx(k), B.ky(k), B.kl(k)); if (!ok) B.stay(); B.flush(); };
  const hold = () => { B.stay(); B.flush(); };

  // did that go badly? Being seen at all.
  function hurt(before) {
    if (S.mode === 'over') return true;
    return S.seen > before.seen || S.alarm;
  }

  // try a first move, then AHEAD moves of carrying on or of standing still; good if either is clean
  function tryOut(first) {
    const base = snap();
    let good = false;
    for (const then of ['go', 'hold']) {
      restore(base);
      const before = { seen: S.seen };
      first();
      let bad = hurt(before);
      for (let i = 0; i < AHEAD && !bad && S.mode === 'play'; i++) {
        if (then === 'go') { const n = nextStep(); if (n < 0) hold(); else step(n); } else hold();
        bad = hurt(before);
      }
      if (!bad) { good = true; break; }
    }
    restore(base);
    return good;
  }

  /* The plain way out: a hunter with you in his sights fires on his next step, so shoot him
     first, as anyone would, and any other within four tiles: two hunters can otherwise stand
     between you and the stairs, never quite facing you, and shuffle along with you for ever.
     Out of rounds, knock out one you can get behind. Bold (no nearer the wire for a dozen
     moves, as when a hunter loiters in the one hall out) means shoot any hunter in view and
     take the plain shortest way, whoever is looking. Otherwise run
     the cheapest way to the wire, where a tile someone can see costs a lot and a tile beside
     a hunter costs some. A plain shortest path that only keeps off red tiles flip-flops on a
     staircase while they close in. */
  function escapeAct(bold) {
    const aimer = B.targets().find((t) => t.kind === 'guard' && t.o.aiming) ||
      B.targets().find((t) => t.kind === 'guard' && (bold || Math.hypot(t.o.x - S.player.x, t.o.y - S.player.y) <= 4));
    if (aimer) { B.fire(aimer); B.flush(); return; }
    const a = B.contextAction();
    if (a && a.kind === 'takedown' && S.rounds === 0) { B.use(); B.flush(); return; }
    const from = here(), hunters = S.guards.filter((g) => !g.down);
    const cost = new Float32Array(S.light.length).fill(Infinity), prev = new Int32Array(S.light.length).fill(-1);
    const price = (k) => {
      const x = B.kx(k), y = B.ky(k), lv = B.kl(k);
      let c = 1;
      if (bold) return c;
      if (B.watchedAt(x, y, lv)) c += 12;
      for (const g of hunters) if (g.lv === lv && Math.abs(g.x - x) + Math.abs(g.y - y) <= 2) c += 4;
      return c;
    };
    const taken = new Set(hunters.map((g) => key(g.x, g.y, g.lv)));
    cost[from] = 0;
    const open = [from];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
      const k = open.splice(bi, 1)[0];
      if (B.tile(B.kx(k), B.ky(k), B.kl(k)) === 'o') break;
      for (const n of B.neighbours(k, 'player')) {
        if (taken.has(n)) continue;
        const c = cost[k] + price(n);
        if (c < cost[n]) { if (cost[n] === Infinity) open.push(n); cost[n] = c; prev[n] = k; }
      }
    }
    let g = outside.filter((k) => cost[k] < Infinity).sort((x, y) => cost[x] - cost[y])[0];
    if (g === undefined) { hold(); return; }
    while (prev[g] !== from) g = prev[g];
    step(g);
  }

  let alarmWhy = null, held = 0, nearest = Infinity, stall = 0;
  for (let n = 0; n < 700; n++) {
    if (S.alarm && !alarmWhy) alarmWhy = document.getElementById('msg').textContent.replace(/ — .*/, '');
    if (S.mode === 'won') return { won: true, early: S.earlyAlarm, moves: S.moves };
    if (S.mode === 'over') return { won: false, why: 'shot', phase: S.phase + (alarmWhy ? ' after ' + alarmWhy : '') };
    if (S.mode === 'hack') {
      for (let i = 0; i < 3 && S.mode === 'hack'; i++) { S.hack.pos = S.hack.zoneAt + S.hack.zone / 2; B.hackPress(); }
      B.flush();
      if (!S.run) B.toggleRun();   // the alarm is up: run for it
      continue;
    }
    const carrier = S.guards.find((g) => g.card);
    const a = B.contextAction();
    if (a && ((a.kind === 'takedown' && a.g === carrier) || a.kind === 'door' || a.kind === 'hack')) { B.use(); B.flush(); continue; }

    // On the way out the same look-ahead, with getting shot as the only thing to avoid: try the
    // plain way out (escapeAct), each other neighbour, and standing still, each followed by
    // ESCAPE_AHEAD moves of the plain way out, and take the first that costs no blood.
    if (S.dataDone) {
      const d = B.bfs(here(), 'player', 9999, null), left = Math.min(...outside.map((k) => (d.dist[k] < 0 ? 9999 : d.dist[k])));
      if (left < nearest) { nearest = left; stall = 0; } else stall++;
      if (stall > 12) { escapeAct(true); continue; }
      const p = S.player, base = snap();
      const opts = [() => escapeAct(), hold].concat(DIRS.map(([dx, dy]) => [p.x + dx, p.y + dy, p.lv])
        .filter(([x, y, lv]) => B.passable(x, y, lv, 'player')).map(([x, y, lv]) => () => step(key(x, y, lv))));
      let chosen = opts[0];
      for (const o of opts) {
        restore(base);
        const hp = S.hp;
        o();
        for (let i = 0; i < ESCAPE_AHEAD && S.mode === 'play' && S.hp === hp; i++) escapeAct();
        if (S.mode === 'won' || (S.mode === 'play' && S.hp === hp)) { chosen = o; break; }
      }
      restore(base);
      chosen();
      continue;
    }
    // The terminal's camera lets you past on only a few timings (terminal.js checks that there
    // are some), and four moves of look-ahead cannot find them; a player who cannot either
    // spends a round on it. Elsewhere: when boxed in by a camera, or kept waiting on one for ages.
    const cam = B.targets().find((t) => t.kind === 'cam');
    if (cam && S.doorOpened && !S.dataDone && cam.o.lv === 1) { B.fire(cam); B.flush(); continue; }
    const c = nextStep();
    if (c >= 0 && tryOut(() => step(c))) { step(c); held = 0; continue; }
    if (cam && held > 30) { B.fire(cam); B.flush(); held = 0; continue; }
    if (tryOut(hold)) { hold(); held++; continue; }
    // waiting is no good either: back off to whichever neighbour is
    const p = S.player;
    const backs = DIRS.map(([dx, dy]) => [p.x + dx, p.y + dy, p.lv]).filter(([x, y, lv]) => B.passable(x, y, lv, 'player'))
      .map(([x, y, lv]) => key(x, y, lv)).filter((k) => k !== c && !S.guards.some((g) => !g.down && key(g.x, g.y, g.lv) === k));
    const back = backs.find((k) => tryOut(() => step(k)));
    if (back !== undefined) step(back);
    else if (cam && tryOut(() => { B.fire(B.targets().find((t) => t.kind === 'cam')); B.flush(); })) { B.fire(cam); B.flush(); }
    else if (c >= 0) step(c);
    else hold();
  }
  return { won: false, why: 'out of time', phase: S.phase };
}

B.MISSIONS.forEach((m, mi) => {
  const results = DELAYS.map((d) => play(mi, d));
  const wins = results.filter((q) => q.won);
  const clean = wins.filter((q) => !q.early).length;
  const losses = {};
  results.filter((q) => !q.won).forEach((q) => { const k = q.why + ' in ' + q.phase; losses[k] = (losses[k] || 0) + 1; });
  const ok = wins.length >= DELAYS.length / 2;
  if (!ok) pass = false;
  notes.push((mi + 1) + ' ' + m.id + ': ' + wins.length + '/' + DELAYS.length + ' out' + (ok ? '' : ' FAILED') + ', ' + clean + ' clean' +
    (wins.length ? ', ' + Math.round(wins.reduce((s, q) => s + q.moves, 0) / wins.length) + ' moves' : '') +
    (Object.keys(losses).length ? ' (' + Object.entries(losses).map(([k, v]) => v + ' ' + k).join(', ') + ')' : ''));
});
B.newGame('normal', 0);
document.getElementById('end').hidden = true;

return JSON.stringify({ pass, detail: notes.join('; ') });
