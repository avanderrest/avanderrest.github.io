/* The real buttons and number keys play the real game, and the page says what happened.

   The bot drives act() directly, so the whole page could be dead with every Node case
   green. This picks a class by clicking its button, then plays sixty choices by pressing
   number keys (preferring fights, chests and unexplored doors), and checks along the way:
   every press changes the page, the scroll never shows "undefined" or "NaN", the dice strip
   shows a pill for every roll the sim made, the HP bar says what the sim says, grouped
   choices fold into one row and open, close and work, and the map has actually been
   painted (lit pixels round the hero). Restoring a save is save.node.js's job. */
return (async () => {
  const G = window.__lantern;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const problems = [], notes = [];
  const dlg = document.querySelector('#ld-dialog');
  if (!dlg.hidden) document.querySelector('#ld-go').click();
  for (let i = 0; i < 40 && !document.querySelector('[data-hero]'); i++) await sleep(50);

  const classBtn = document.querySelector('[data-hero="fighter"]');
  if (!classBtn) return JSON.stringify({ pass: false, detail: 'no Fighter button on the first page' });
  classBtn.click(); document.querySelector('#ld-begin').click();
  await sleep(100);
  if (G.S.mode !== 'explore') problems.push(`clicking the Fighter left the mode at ${G.S.mode}`);

  const press = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: String(k), bubbles: true }));
  let rollsSeen = 0, pressed = 0, groupsOpened = 0;
  const prefer = ['fight', 'attack', 'open', 'search', 'take', 'descend', 'use:potion-heal'];
  for (let step = 0; step < 60 && G.S.mode !== 'dead' && G.S.mode !== 'won'; step++) {
    const buttons = [...document.querySelectorAll('.ld-choice')];
    const cs = G.choices();
    // find the row (by its number) for the choice we want; a group row opens first
    let want = prefer.map((p) => cs.find((c) => (c.id === p || c.id.startsWith(p + ':')) && !c.disabled)).find(Boolean);
    want = want && want.id;
    if (!want) {
      const go = cs.filter((c) => c.verb === 'go');
      const fresh = go.find((c) => !G.S.map.rooms[G.S.map.rooms[G.S.at].exits[c.id.slice(3)]].visited);
      // once nothing is fresh, pick at random rather than by step % go.length: a junction
      // revisited only on steps of one parity (e.g. a two-room dead end ping-ponged into by
      // a forced single-exit neighbour) got the same index forever and the bot never left.
      want = (fresh || go[Math.floor(Math.random() * go.length)] || cs.find((c) => !c.disabled)).id;
    }
    const before = document.querySelector('#ld-text').textContent + '|' + G.S.acts;
    const target = cs.find((c) => c.id === want);
    let idx = -1;
    const labelOf = (c) => (G.page.labels && G.page.labels[c.id]) || c.label;
    buttons.forEach((b, i) => { if (b.querySelector('.ld-label').firstChild.textContent === labelOf(target)) idx = i; });
    if (idx < 0 && target.group) {
      const gi = buttons.findIndex((b) => /…/.test(b.textContent));
      if (gi >= 0) { press(gi + 1); await sleep(30); groupsOpened++; const bs = [...document.querySelectorAll('.ld-choice')]; idx = bs.findIndex((b) => b.querySelector('.ld-label').firstChild.textContent === labelOf(target)); }
    }
    if (idx < 0) { problems.push(`step ${step}: no button for ${want}`); break; }
    const logBefore = G.S.acts;
    press(idx + 1); pressed++;
    for (let i = 0; i < 20 && G.busy; i++) await sleep(50);
    await sleep(20);
    if (G.S.acts === logBefore) { problems.push(`step ${step}: pressing ${idx + 1} (${want}) did nothing`); break; }
    const after = document.querySelector('#ld-text').textContent + '|' + G.S.acts;
    if (after === before) problems.push(`step ${step}: the page did not change after ${want}`);
    const text = document.querySelector('#ld-text').textContent;
    if (/undefined|NaN|\[object/.test(text) || /undefined|NaN/.test(document.querySelector('#ld-choices').textContent)) problems.push(`step ${step}: broken words after ${want}: ${text.slice(0, 120)}`);
    const pills = document.querySelectorAll('.ld-roll').length;
    rollsSeen += pills;
    const hp = G.S.hero.hp, shown = document.querySelector('#ld-hp').textContent;
    if (!shown.includes(`${hp} /`)) problems.push(`step ${step}: HP bar says "${shown}" but the hero has ${hp}`);
  }
  if (!rollsSeen) problems.push('sixty choices and the dice strip never showed a roll');

  // a group of two items folds into one row; opening it shows both and a Back row
  if (G.S.mode !== 'dead' && G.S.mode !== 'won') {
    if (G.S.mode === 'fight' || G.S.mode === 'shop') { G.S.mode = 'explore'; G.S.fight = null; }
    const rm = G.S.map.rooms[G.S.at]; for (const f of rm.foes) f.state = 'dead';
    G.S.hero.boosts = 0;
    G.S.hero.bag = [{ id: 'potion-heal', n: 2 }, { id: 'antidote', n: 1 }];
    G.S.hero.hp = 3; G.S.hero.poison = 2;
    G.render();
    const rows = () => [...document.querySelectorAll('.ld-choice')].map((b) => b.querySelector('.ld-label').firstChild.textContent);
    const gi = rows().findIndex((t) => /Use an item/.test(t));
    if (gi < 0) problems.push(`two usable items did not fold into a group row: ${rows().join(' / ')}`);
    else {
      press(gi + 1); await sleep(30); groupsOpened++;
      const open = rows();
      if (!(open.some((t) => /healing potion/i.test(t)) && open.some((t) => /antidote/i.test(t)) && open[open.length - 1] === 'Back')) problems.push(`the open group shows ${open.join(' / ')}`);
      press(open.length); await sleep(30);
      if (!rows().some((t) => /Use an item/.test(t))) problems.push('Back did not fold the group again');
      press(gi + 1); await sleep(30);
      const k = rows().findIndex((t) => /healing potion/i.test(t));
      press(k + 1);
      for (let i = 0; i < 20 && G.busy; i++) await sleep(50);
      await sleep(30);
      if (G.S.hero.hp <= 3) problems.push(`drinking from the group did not heal (${G.S.hero.hp} HP)`);
    }
  }

  // the map is painted: some lit pixels near the middle of the canvas
  await sleep(400);
  const cv = document.querySelector('#ld-map'), cx = cv.getContext('2d');
  const d = cx.getImageData(Math.floor(cv.width / 2) - 40, Math.floor(cv.height / 2) - 40, 80, 80).data;
  let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++;
  if (lit < 200) problems.push(`the map round the hero is dark: ${lit} lit pixels of 6400`);

  notes.push(`${pressed} presses, ${rollsSeen} roll pills, ${groupsOpened} groups opened, ${lit} lit pixels, floor ${G.S.floor}, mode ${G.S.mode}, ${G.S.tally.rooms} rooms`);
  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') });
})();
