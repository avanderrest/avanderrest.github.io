/* Every window on every building has to be climbable, and every contract has to be
   finishable with what is actually in the rooms.

   The maps are ASCII and the climbing rules are exact — a standing jump clears one
   square, a running jump two, you can reach a ledge two rows up — so it is very easy to
   move a cornice one square and leave a window nobody can get to. Nothing on screen says
   so; the building still looks fine.

   This searches every position reachable from the start using resolve(), which is the
   same function the keyboard drives, so a map that passes can be climbed by hand. It
   checks each window twice: once allowing hard landings, and once without any, so no
   window can only be reached by taking damage.

   Then the loot: every item a level requires, and every item a locked box needs, must be
   lying in some room of that level, in a box that doesn't itself need something that
   isn't there. */
const G = window.__tithe;
const notes = [];
let pass = true;

G.LEVELS.forEach((L) => {
  const w = G.parseLevel(L);
  const want = Object.keys(w.windows).sort();
  const r = G.reach(w, w.start);
  const got = Object.keys(r.windows).sort();
  const missing = want.filter((k) => !got.includes(k));
  if (missing.length) pass = false;

  // the same search, with every hurting fall treated as fatal
  const safe = { ...w };
  const soft = (() => {
    const seen = new Set(), q = [{ m: 's', x: w.start.x, y: w.start.y, f: 1 }], wins = {};
    const key = (p) => p.m + p.x + ',' + p.y + p.f;
    seen.add(key(q[0]));
    while (q.length) {
      const p = q.shift();
      if (p.m === 's') { const d = w.deco[p.y] && w.deco[p.y][p.x]; if (d && '123456789T'.includes(d)) wins[d] = 1; }
      for (const a of ['left', 'right', 'up', 'down', 'jump']) {
        for (const run of (a === 'jump' && p.m === 's' && G.standable(w, p.x - p.f, p.y)) ? [false, true] : [false]) {
          const m = G.resolve(safe, p, a, run);
          if (!m || m.kind === 'window') continue;
          let to = m.to;
          if (to.m === 'air') {
            const s = G.settle(w, to.x, to.y);
            if (s.dead || s.hurt) continue;
            to = { m: 's', x: s.x, y: s.y, f: to.f };
          }
          const k = key(to);
          if (!seen.has(k)) { seen.add(k); q.push(to); }
        }
      }
    }
    return Object.keys(wins).sort();
  })();
  const needsHurt = want.filter((k) => !soft.includes(k));
  if (needsHurt.length) pass = false;

  // loot: required items and keys must exist, and be reachable in dependency order
  const where = {};
  for (const id in L.rooms) for (const sp of L.rooms[id].spots) for (const l of sp.loot || []) if (l.t === 'item') where[l.id] = { room: id, needs: sp.needs || null };
  const obtainable = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const id in where) if (!obtainable.has(id) && (!where[id].needs || obtainable.has(where[id].needs))) { obtainable.add(id); grew = true; }
  }
  // every way to deal with the target: its intel must be findable, and so must what it needs
  const intel = new Set();
  for (const id in L.rooms) for (const sp of L.rooms[id].spots) for (const l of sp.loot || []) if (l.t === 'intel') intel.add(l.id);
  const methodGaps = L.methods.filter((m) => !(intel.has(m.intel) || obtainable.has(m.intel)) || m.needs.some((n) => !obtainable.has(n))).map((m) => m.id);
  const lacking = L.required.concat([L.evidence]).filter((id) => !obtainable.has(id)).concat(methodGaps.map((m) => 'method:' + m));
  if (lacking.length) pass = false;

  notes.push(L.id + ': ' + got.join('') + '/' + want.join('') + ' reached' + (missing.length ? ' MISSING ' + missing : '') +
    ', without a hard landing ' + soft.join('') + (needsHurt.length ? ' ONLY-BY-FALLING ' + needsHurt : '') +
    ', ' + r.states + ' positions; items ' + [...obtainable].join(',') + (lacking.length ? ' LACKING ' + lacking : ''));
});

return JSON.stringify({ pass, detail: notes.join(' | ') });
