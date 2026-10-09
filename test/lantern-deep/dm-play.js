/* The Dungeon Master's mode, through the real page: the role switch, the boss and a class
   start a delve; the scroll takes the opening and the panel the AI's background, and the
   story will not begin on a blank; the start room is written on the scroll; then the map
   editor: a creature picked from the palette and a tap on the real canvas puts it in a
   glowing room, it takes a name, a part, a temper and wits, a chest takes a trap and
   contents, a campfire beside a monster is refused with a reason, and a thing can be taken
   away again; a drag looks around the map and "Back to the hero" undoes it. The hero only
   moves when Continue is pressed, its choices are never pressable, it says something each
   move, and walking into the planned room builds exactly what was planned.

   Cases share one page and play.js comes next, so this always hands the page back as a
   new delve in the ordinary role. */
return (async () => {
  const G = window.__lantern;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const problems = [], notes = [];
  const waitFor = async (f, ms = 15000) => { const t = performance.now(); while (!f()) { if (performance.now() - t > ms) return false; await sleep(40); } return true; };
  const type = (sel, text) => { const e = $(sel); e.value = text; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
  // a tap on the canvas, as a finger would make it
  const tapTile = async (tx, ty) => {
    await sleep(120);
    const p = G.screenOf(tx, ty), c = $('#ld-map');
    const o = { clientX: p.x, clientY: p.y, pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o));
    await sleep(30);
  };
  const plan = (id) => G.S.map.rooms[id].plan;
  try {
    if (!$('#ld-dialog').hidden) $('#ld-go') ? $('#ld-go').click() : $('#ld-dialog').click();
    if (G.S.mode !== 'create') { G.sim.newRun(1234, 'hero'); G.render(); }

    // ---- the role, the boss, the hero
    const roleBtn = $('[data-role="dm"]');
    if (!roleBtn) return JSON.stringify({ pass: false, detail: 'no "You are the Dungeon Master" button on the first page' });
    roleBtn.click();
    $('[data-boss="crabQueen"]').click();
    [...document.querySelectorAll('.ld-choice')].find((b) => /Fighter/.test(b.textContent)).click();
    await waitFor(() => G.S.mode !== 'create', 3000);
    if (G.S.mode !== 'prologue' || G.S.quest.boss !== 'crabQueen') problems.push(`after choosing the hero: mode ${G.S.mode}, boss ${G.S.quest && G.S.quest.boss}`);

    // ---- one box: the opening is the story, what the AI knows, and the first room; then the
    // AI answers on the same scroll
    if ($('#ld-write').hidden || $('#ld-title').textContent !== 'The Lantern Deep' || document.querySelectorAll('#ld-furnish textarea, #ld-furnish input').length) problems.push('the opening is not one box on the scroll');
    if ($('#ld-editor').hidden) problems.push('the map editor is not shown while the opening is written');
    if (!$('#ld-let-in').disabled) problems.push('"Begin the story" can be pressed with nothing on the scroll');
    const actsAtStart = G.S.acts;
    await sleep(500);
    if (G.S.acts !== actsAtStart) problems.push('the AI moved before the story began');
    const opening = 'Rainwater runs down the last steps into a cracked stone basin. Your older brother Tom ran off with the bandits two winters ago, and you would never hurt him';
    type('#ld-write', opening);
    $('#ld-let-in').click();
    await waitFor(() => G.S.mode !== 'prologue' && !G.busy && G.S.acts > actsAtStart + 1, 4000);
    await sleep(300);
    if (!/brother Tom/.test(G.S.notes || '')) problems.push('the opening is not what the AI knows');
    if (!$('#ld-text').textContent.startsWith(opening + '.') || $('#ld-text').textContent.length <= opening.length + 2) problems.push(`after the opening the scroll reads "${$('#ld-text').textContent.slice(0, 200)}" (the opening, then the AI's answer)`);
    if (G.S.acts < actsAtStart + 2) problems.push('the AI did not answer the opening');
    if ($('#ld-say').hidden || $('#ld-say').textContent.length < 8) problems.push('the hero said nothing in answer to the opening');
    notes.push(`after the opening: "${$('#ld-text').textContent.slice(opening.length, opening.length + 80)}…" ${$('#ld-say').textContent}`);

    // ---- the map editor
    const ed = G.sim.editable();
    if (!ed.length) problems.push('no room beside the start can be planned');
    const R = G.S.map.rooms[ed[0]];
    const tool = (kind) => $(`#ld-editor [data-kind="${kind}"]`);
    if (!tool('bandit')) problems.push('no bandit in the palette');
    else {
      tool('bandit').click();
      await tapTile(R.x + 1, R.y + 1);
      const p = plan(R.id);
      if (!p || p.foes.length !== 1 || p.foes[0].kind !== 'bandit' || p.foes[0].x !== R.x + 1 || p.foes[0].y !== R.y + 1) problems.push(`tapping the map with the bandit picked planned ${JSON.stringify(p)}`);
      if (!$('#ld-ed-name')) problems.push('the placed bandit\'s options did not open');
      else {
        type('#ld-ed-name', 'Tom');
        type('#ld-ed-who', "Pip's older brother, who ran off with the bandits");
        $('#ld-editor [data-opt="wits"][data-val="sharp"]').click();
        const f = plan(R.id).foes[0];
        if (f.name !== 'Tom' || !/brother/.test(f.who) || f.wits !== 'sharp') problems.push(`the bandit's options came out ${JSON.stringify(f)}`);
      }
      // a campfire beside him is refused, with a reason
      tool('camp').click();
      await tapTile(R.x + 2, R.y + 1);
      if (plan(R.id).things.some((t) => t.kind === 'camp')) problems.push('a campfire was planned beside a bandit');
      if (!/campfire/i.test(($('.ld-ed-msg') || {}).textContent || '')) problems.push('a refused campfire gave no reason');
      // a chest, with a trap and an antidote in it
      tool('chest').click();
      await tapTile(R.x, R.y + 2);
      $('#ld-editor [data-opt="trap"][data-val="needle"]').click();
      $('#ld-editor [data-opt="take"][data-val="antidote"]').click();
      const c = plan(R.id).things.find((t) => t.kind === 'chest');
      if (!c || c.trap !== 'needle' || !c.items || c.items.join() !== 'antidote') problems.push(`the chest came out ${JSON.stringify(c)}`);
      // coins, then taken away again
      tool('coins').click();
      await tapTile(R.x + 3, R.y + 2);
      const before = plan(R.id).things.length;
      $('#ld-editor [data-act="remove"]').click();
      if (plan(R.id).things.length !== before - 1 || plan(R.id).things.some((t) => t.kind === 'coins')) problems.push('the coins could not be taken away');
      $('#ld-editor [data-act="unbrush"]') && $('#ld-editor [data-act="unbrush"]').click();
    }
    // the room the hero is in is settled
    await tapTile(G.S.map.rooms[G.S.at].x, G.S.map.rooms[G.S.at].y);
    if (!/settled/.test($('.ld-insp').textContent)) problems.push(`the hero's own room does not say it is settled: ${$('.ld-insp').textContent.slice(0, 80)}`);

    // ---- a drag looks around the map
    {
      const c = $('#ld-map'), r = c.getBoundingClientRect();
      const o = (x) => ({ clientX: r.left + x, clientY: r.top + 60, pointerId: 9, pointerType: 'mouse', bubbles: true });
      c.dispatchEvent(new PointerEvent('pointerdown', o(120))); c.dispatchEvent(new PointerEvent('pointermove', o(180))); c.dispatchEvent(new PointerEvent('pointerup', o(180)));
      await sleep(60);
      if ($('#ld-recentre').hidden) problems.push('dragging the map did not offer "Back to the hero"');
      $('#ld-recentre').click(); await sleep(60);
      if (!$('#ld-recentre').hidden) problems.push('"Back to the hero" stayed after it was pressed');
    }

    // ---- Continue moves the hero, one move at a time
    const watchPress = () => [...document.querySelectorAll('#ld-choices .ld-choice')].some((b) => !b.disabled);
    let moves = 0, said = 0, entered = false, answered = 0;
    for (let k = 0; k < 40 && !entered && G.S.mode !== 'dead' && G.S.mode !== 'won'; k++) {
      if (G.S.mode === 'furnish') {
        const to = G.S.furnish.to;
        const words = to === R.id ? 'Barrels of black wine, and Tom sitting on one of them' : 'A quiet, dripping room';
        type('#ld-write', words);
        const acts = G.S.acts;
        $('#ld-let-in').click();
        await waitFor(() => G.S.mode !== 'furnish' && G.S.acts > acts + 1 || G.S.mode === 'dead', 4000);
        await sleep(200);
        // the AI answers at once, after the Dungeon Master's words on the same page
        if (G.S.acts > acts + 1 && $('#ld-text').textContent.startsWith(words + '.')) answered++;
        if (to === R.id) entered = true;
        continue;
      }
      if (['explore', 'fight', 'shop'].includes(G.S.mode)) {
        if (watchPress()) problems.push('a hero choice could be pressed while the AI plays');
        const acts = G.S.acts;
        await sleep(250);
        if (G.S.acts !== acts) problems.push('the hero moved without Continue');
        const btn = $('#ld-continue');
        if (!btn) { problems.push(`no Continue in mode ${G.S.mode}`); break; }
        btn.click();
        await waitFor(() => G.S.acts > acts, 4000);
        moves++;
        if (!$('#ld-say').hidden && $('#ld-say').textContent.length > 8) said++;
      }
    }
    // the flow can reach the planned room on answers alone; Continue must still move the hero
    for (let k = 0; k < 3 && ['explore', 'fight', 'shop'].includes(G.S.mode); k++) {
      const acts = G.S.acts;
      $('#ld-continue').click();
      await waitFor(() => G.S.acts > acts, 4000);
      if (G.S.acts > acts) { moves++; if (!$('#ld-say').hidden && $('#ld-say').textContent.length > 8) said++; }
      if (G.S.mode === 'furnish') break;
    }
    if (!moves) problems.push('Continue never moved the hero');
    if (moves && said < moves / 2) problems.push(`the hero spoke on only ${said} of ${moves} moves`);
    if (entered) {
      const rm = G.S.map.rooms[R.id];
      if (!rm.foes.some((f) => f.name === 'Tom' && f.wits === 'sharp') || !rm.things.some((t) => t.kind === 'chest' && t.trapped && t.items.join() === 'antidote')) problems.push(`the planned room was built as ${JSON.stringify({ foes: rm.foes, things: rm.things })}`);
      if (!answered) problems.push('the AI never answered a room straight after it was written');
    } else notes.push('the hero never walked into the planned room');
    notes.push(`${answered} rooms answered at once, ${moves} moves on Continue, ${said} with a line ("${$('#ld-say').textContent.slice(0, 60)}"); planned room ${entered ? 'entered' : 'not reached'}; floor ${G.S.floor}, mode ${G.S.mode}`);
  } finally {
    G.sim.newRun(20261008, 'hero');
    G.render();
  }
  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') });
})();
