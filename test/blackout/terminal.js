/* Can each terminal be reached past its camera without shooting it — but only just?

   Amber's rule for the terminal room: you should be able to get to the terminal without
   taking the camera out, but it should be difficult, only just possible. Both halves
   break silently. The first camera, in the room's corner, covered the only lane to the
   terminal at every point of its sweep: no timing at all got past it, and nothing on
   screen said so. Small changes to its angle or speed swing it to trivially easy.

   This plays every timing exhaustively against the real camSees. A state is a tile in
   the room, the tick within the camera's cycle, and how far through the next guard step
   you are. Every move of yours adds one; every GUARD_EVERY the world ticks; the camera
   turns every `every` ticks. You are caught if it sees your tile after your step or after
   the tick. You can wait outside in the dark doorway as long as you like, so what is
   counted is the entry timings from which the terminal can be reached unseen. The guard
   who patrols the room is left out: this is about the camera. */
const B = window.__blackout;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

const GE = B.consts.GUARD_EVERY;
B.MISSIONS.forEach((m, mi) => {
  const S = B.newGame('normal', mi);
  const R = B.consts.TERM_ROOM;
  const c = S.cams.find((q) => q.lv === R.lv && q.x >= R.x0 - 1 && q.x <= R.x1 + 1 && q.y >= R.y0 - 1 && q.y <= R.y1 + 1);
  if (!c) { check((mi + 1) + ' ' + m.id + ' has a camera on the terminal', false); return; }
  const every = c.every || 3;
  const seq = [];
  for (let t = 0; t <= c.steps; t++) seq.push(t);
  for (let t = c.steps - 1; t > 0; t--) seq.push(t);
  const period = seq.length * every;
  const angleAt = (tick) => c.a0 + (c.a1 - c.a0) * seq[Math.floor(tick / every) % seq.length] / c.steps;
  const seen = (x, y, tick) => { c.a = angleAt(tick); return B.camSees(c, x, y, R.lv); };
  const inRoom = (x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;
  const goals = new Set(R.goals.map((g) => g.join(',')));     // the tiles you can hack from

  function solve(ex, ey) {
    let ok = 0, shortest = Infinity;
    for (let start = 0; start < period * GE; start++) {
      let frontier = [[ex, ey, Math.floor(start / GE), start % GE, 0]];
      const vis = new Set();
      let found = false;
      for (let depth = 0; depth < 40 && frontier.length && !found; depth++) {
        const next = [];
        for (const [x, y, tick, pace, n] of frontier) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (!B.passable(nx, ny, R.lv, 'player') || !(inRoom(nx, ny) || (nx === ex && ny === ey))) continue;
            if (seen(nx, ny, tick)) continue;
            let p2 = pace + 1, t2 = tick;
            if (p2 >= GE) { p2 = 0; t2 = tick + 1; if (seen(nx, ny, t2)) continue; }
            if (goals.has(nx + ',' + ny)) { found = true; shortest = Math.min(shortest, n + 1); break; }
            const k = nx + ',' + ny + ',' + (t2 % period) + ',' + p2;
            if (vis.has(k)) continue;
            vis.add(k);
            next.push([nx, ny, t2, p2, n + 1]);
          }
          if (found) break;
        }
        frontier = next;
      }
      if (found) ok++;
    }
    return { ok, shortest };
  }

  const res = R.entries.map(([x, y]) => solve(x, y));
  const total = period * GE;
  const name = (mi + 1) + ' ' + m.id;
  check(name + ': the terminal can be reached past the camera', res.some((q) => q.ok > 0),
    R.entries.map((e, i) => e.join(',') + ' ' + res[i].ok + '/' + total).join(', '));
  check(name + ': but only from a few timings', res.every((q) => q.ok <= total / 6));
  check(name + ': and only by the shortest way in', Math.min(...res.map((q) => q.shortest)) <= 7, 'shortest ' + Math.min(...res.map((q) => q.shortest)) + ' moves');
});
B.newGame('normal', 0);

return JSON.stringify({ pass, detail: notes.join('; ') });
