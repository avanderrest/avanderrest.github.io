/* Every chapter of the road has a way through, and what it takes is out there.

   The land is generated a chapter at a time: a barrier across the far end with one
   passable cell, a campfire at the near end, and the chapter's key pieces — the
   fisherman and his reeds, the hermit and the damp hollow, and so on — dropped face
   down in between, along with a pedlar who sells the way through instead. The
   scatter picks free cells at random and gives up after sixty tries, so a crowded
   chapter can quietly come out without its hermit, or its pedlar, and the walk ends
   at a wall nobody can open. Nothing says so; the player just never finds him.

   So this generates a few hundred chapters and checks each one: the barrier spans
   every row with exactly one way through, the seeds for that barrier and a pedlar
   are all present, there is a campfire to wake at, lighthouses turn up on schedule,
   and every card on the board is a card the game knows how to play. */
return (() => {
  const W = window.__wayside;
  const S = W.S;
  const ROWS = W.ROWS;
  const problems = [];
  const tally = (msg) => { problems.push(msg); };

  W.ensureGenerated(S.gen + 3000);
  const chs = S.chapters;
  let missing = 0;
  const emptiest = { free: Infinity, i: -1 };

  for (const ch of chs) {
    const tpl = W.CHAPTERS[ch.type];
    const where = `chapter ${ch.i} (${ch.type}, cols ${ch.start}-${ch.end})`;
    // the barrier: the whole end column, one way through
    let pass = 0;
    for (let r = 0; r < ROWS; r++) {
      const cell = W.cellAt(r, ch.end);
      const id = cell && cell.id;
      if (id === tpl.pass) pass++;
      else if (id !== tpl.block) tally(`${where}: row ${r} of the barrier is ${id || 'empty'}`);
    }
    if (pass !== 1) tally(`${where}: ${pass} ways through the barrier`);

    // what lies between
    const found = {};
    let free = 0;
    for (let c = ch.start + 1; c < ch.end; c++) for (let r = 0; r < ROWS; r++) {
      const cell = W.cellAt(r, c);
      if (!cell) { free++; continue; }
      found[cell.id] = (found[cell.id] || 0) + 1;
      if (!W.CARDS[cell.id]) tally(`${where}: an unknown card "${cell.id}"`);
    }
    if (free < emptiest.free) { emptiest.free = free; emptiest.i = ch.i; }
    for (const id of tpl.seeds.concat('pedlar')) {
      if (!found[id]) { missing++; tally(`${where}: no ${id}`); }
    }
    for (const it of tpl.sells) if (!W.ITEMS[it]) tally(`${where}: the pedlar sells "${it}", which is not an item`);

    // a campfire at the near end (the first chapter starts at home instead)
    const startIds = [];
    for (let r = 0; r < ROWS; r++) { const cell = W.cellAt(r, ch.start); if (cell) startIds.push(cell.id); }
    if (!startIds.includes(ch.i === 0 ? 'home' : 'camp')) tally(`${where}: no ${ch.i === 0 ? 'home' : 'campfire'} at the start`);
    if (ch.i > 0 && ch.i % W.LIGHTHOUSE_EVERY === 0 && !found.lighthouse) tally(`${where}: no lighthouse`);
    if (ch.i > 0 && chs[ch.i - 1].type === ch.type) tally(`${where}: the same barrier twice running`);
  }

  const kinds = {};
  for (const ch of chs) kinds[ch.type] = (kinds[ch.type] || 0) + 1;
  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? `${problems.length} problems, first: ${problems.slice(0, 5).join(' | ')} — ` : '')
      + `${chs.length} chapters (${Object.entries(kinds).map(([k, n]) => k + ' ' + n).join(', ')}); `
      + `${missing} key pieces missing; most crowded had ${emptiest.free} empty cells (chapter ${emptiest.i})`,
  });
})();
