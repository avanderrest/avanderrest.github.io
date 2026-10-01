// Every culprit has to be catchable by somebody who only plays the game.
//
// For each of the seven, this plays all twelve days through the real buttons: sorts the
// pile, opens the counter, sells, weighs and stamps what each customer brings, asks them
// everything, walks to one errand each afternoon, tidies what it's
// left alone with, leaves the night-11 letter sealed. Nothing is handed over by the debug
// handle except "this tidy puzzle is done". Then it checks that every word every ledger
// page needs was actually collected along the way — a word that never turns up makes that
// page unsolvable and that culprit uncatchable, and nothing on screen would say so — fills
// the ledger, and breaks the culprit's story in the Village Hall.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const H = window.__oak;
  const click = (sel) => { const b = document.querySelector(sel); if (b) b.click(); return !!b; };
  const report = [];
  let pass = true;

  for (const c of H.O.SUSPECTS) {
    localStorage.clear();
    H.fast = true;
    H.newGame(c);
    click('#b-go');
    await sleep(900);
    const stuck = [];
    for (let day = 1; day <= 11; day++) {
      // the morning: the pile first, then the box, then the counter
      if (day === 2) { click('#b-lf'); await sleep(50); H.solveVisit(); await sleep(800); click('#b-home'); await sleep(50); }
      for (let guard = 0; guard < 400; guard++) {
        if (H.current()) { H.sortTop(); await sleep(5); continue; }
        const n = H.need();
        if (n && n.weigh) { click('#b-weigh'); await sleep(10); continue; }
        if (n) { click(`[data-give="${n.give}"]`); await sleep(n.stamp ? 950 : 10); continue; }
        if (click('[data-topic]')) { await sleep(5); continue; }
        if (click('[data-bye]')) { await sleep(5); continue; }
        const btn = document.getElementById('b-close');
        if (btn && !btn.disabled && H.S.stage === 'counter') break;
        H.arrive(); await sleep(30);
      }
      const closer = document.getElementById('b-close');
      if (!closer || closer.disabled) { stuck.push('day ' + day + ' morning never finished'); break; }
      closer.click();
      await sleep(50);
      // the afternoon — out on the map, to the first errand on offer
      if (day < 11) {
        const p = document.querySelector('.place[data-p]');
        if (p) {
          p.click(); await sleep(60);
          H.solveVisit(); await sleep(900);
          if (!click('#b-home')) stuck.push('day ' + day + ' no way home from ' + p.dataset.p);
          await sleep(50);
        } else click('#b-eve');
      } else {
        click('#b-leave'); await sleep(50);
      }
      // the evening
      if (!click('#b-bed')) { stuck.push('day ' + day + ' no bed'); break; }
      await sleep(20);
      click('#b-morning'); await sleep(day === 11 ? 300 : 900);
    }

    const S = H.S;
    // every word every page needs, actually collected?
    const missing = [];
    H.O.ledger(c).forEach((pg) => {
      const ans = H.answers(pg.id);
      Object.values(ans).forEach((w) => { if (!S.words[w]) missing.push(pg.id + ':' + w); });
    });
    H.solveLedger();
    const solved = Object.keys(S.solved).length;

    // the Village Hall
    let ending = null;
    if (S.phase === 'hall') {
      click('#h-speak'); await sleep(20);
      H.present('ev_scrapes'); await sleep(20);
      const sus = document.querySelector(`.sus[data-s="${c}"]`);
      if (sus) sus.click();
      await sleep(20);
      for (let i = 0; i < 4 && S.phase === 'hall' && S.hall.step === 'cross'; i++) {
        const st = H.O.statements(c)[S.hall.i];
        const breaks = st.breaks.concat(c === 'beatrice' && S.hall.i === 0 ? ['ev_ticket'] : []);
        const ev = breaks.find((e) => S.evidence[e]);
        if (!ev) { stuck.push('nothing to break statement ' + (S.hall.i + 1)); break; }
        H.present(ev); await sleep(20);
      }
      if (S.hall && S.hall.step === 'win') click('#h-end');
      await sleep(50);
      ending = S.ending;
    } else stuck.push('never reached the hall (phase ' + S.phase + ', day ' + S.day + ')');

    const want = c === 'beatrice' ? 'self' : 'justice';
    const ok = !missing.length && solved === 5 && ending === want && !stuck.length && S.visited.length === 10;
    if (!ok) pass = false;
    report.push(`${c}: ${ok ? 'caught' : 'FAILED'} (pages ${solved}/5, places ${S.visited.length}/10, ending ${ending}, cups ${S.cups}` +
      (missing.length ? ', missing ' + missing.join(' ') : '') + (stuck.length ? ', ' + stuck.join('; ') : '') + ')');
  }
  localStorage.clear();
  return JSON.stringify({ pass, detail: report.join(' | ') });
})();
