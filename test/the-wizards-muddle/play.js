/* The real pointer reaches the real study.

   The bot calls the sim's verbs, so the whole input path (telling a tap from a drag, the
   lift, the drop onto the outline, the ping, the zoom) could be dead with every Node case
   green. This dismisses the help card, taps empty wall (the detector must ping and use a
   charge), drags a thing off the floor onto a shelf with pointer events (it must stand on
   the shelf and the Put away count move), uncovers the riddle's answer and taps it (it must be found), and
   zooms with the + button and back. Turns alternate, so a find must hand over to the
   player's turn by itself, with the owl's eyes covered: a tap on a thing, a description
   typed into the dialog, the owl's guess, and then the owl's next riddle. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__study, problems = [], notes = [];
  for (let i = 0; i < 40 && !G.ready(); i++) await sleep(100);
  const ok = document.querySelector('#cs-ok'); if (ok) ok.click();
  const c = document.querySelector('#cs-room');
  const ev = (t, x, y, id = 1) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: id, bubbles: true, pointerType: 'mouse', isPrimary: true }));
  const tapAt = async (x, y) => { const p = G.toScreen(x, y); ev('pointerdown', p.x, p.y); await sleep(20); ev('pointerup', p.x, p.y); await sleep(30); };
  const dragTo = async (it, x, y) => {
    const t = G.study.byKind(it.kind), a = G.toScreen(t.x, t.y - 6), b = G.toScreen(x, y - 6);
    ev('pointerdown', a.x, a.y);
    for (let i = 1; i <= 12; i++) { ev('pointermove', a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12); await sleep(12); }
    ev('pointerup', b.x, b.y); await sleep(40);
  };
  const S = G.S;

  // a ping on bare wall, away from everything
  const before = S.charge;
  let spot = null;
  for (const [x, y] of [[400, 80], [800, 80], [440, 400], [760, 420], [380, 300]]) if (!G.study.topAt(x, y)) { spot = [x, y]; break; }
  await tapAt(...spot);
  if (!(S.charge < before - 0.5)) problems.push(`a tap on the wall did not ping (charge ${before.toFixed(2)} -> ${S.charge.toFixed(2)})`);

  // drag a thing off the floor onto the top shelf of the left bookcase, from above it
  const { PLANKS, onFloor } = await import('/the-wizards-muddle/sim.js');
  const loose = [...S.items].reverse().find((it) => onFloor(it) && G.study.topAt(it.x, it.y - 6) === it && (!G.study.cur || it.kind !== G.study.cur.kind));
  const n0 = G.study.putAway();
  await dragTo(loose, 160, PLANKS[0] - 40);
  const put = G.study.byKind(loose.kind);
  if (put.y !== PLANKS[0]) problems.push(`let go of over the top shelf, the ${loose.kind} came to rest at y ${put.y}`);
  await sleep(600);
  const shown = document.querySelector('#cs-tidy').textContent;
  if (!shown.startsWith(String(n0 + 1))) problems.push(`Put away shows "${shown}" after ${n0} -> ${G.study.putAway()}`);
  notes.push(`put the ${loose.kind} on the top shelf; ${shown}`);

  // uncover the answer, then tap it
  const cur = G.study.cur, T = G.study.target, { centre } = await import('/the-wizards-muddle/sim.js');
  let m = centre(T);
  for (let g = 0; g < 15; g++) {
    const top = G.study.topAt(m.x, m.y);
    if (!top || top === T) break;
    await dragTo(top, 120 + g * 70, 720);
    m = centre(T);
  }
  await tapAt(m.x, m.y);
  if (S.hunt.done.length !== 1) problems.push(`tapping the ${cur.kind} did not find it (${JSON.stringify(G.study.ping ? S.hunt : '')})`);
  notes.push(`found ${cur.kind}`);
  await sleep(1900);
  if (G.mode !== 'pick' || G.study.cur) problems.push(`a find did not hand over to your turn (mode ${G.mode}, riddle ${G.study.cur && G.study.cur.kind})`);
  if (!document.querySelector('#cs-owl').classList.contains('hide')) problems.push('the owl did not cover its eyes on your turn');

  // zoom in and back out with the buttons
  document.querySelector('#cs-zin').click();
  const z = G.cam.z;
  document.querySelector('#cs-zout').click();
  if (!(z > 1.3) || G.cam.z !== 1) problems.push(`zoom buttons went ${z} then ${G.cam.z}`);

  // your turn: pick, describe, the owl guesses
  const hg = G.study.byKind('hourglass');
  if (G.study.topAt(centre(hg).x, centre(hg).y) !== hg) { G.study.lift(hg); G.study.drop(hg, 1000, 700); }
  await tapAt(centre(hg).x, centre(hg).y);
  const input = document.querySelector('#cs-desc');
  if (!input) problems.push('no description box after picking a thing');
  else {
    input.value = 'it keeps time with sand in glass';
    document.querySelector('#cs-spyform').requestSubmit();
    for (let i = 0; i < 80 && G.mode !== 'hunt'; i++) await sleep(100);
    if (S.owl.owl + S.owl.you !== 1) problems.push(`the round was not scored (${JSON.stringify(S.owl)})`);
    else notes.push(S.owl.owl ? 'the owl guessed the hourglass' : 'the owl missed the hourglass');
    if (!S.owl.owl) problems.push('the owl could not guess "keeps time with sand in glass"');
    if (!G.study.cur) problems.push('the owl did not set its next riddle after your turn');
    else notes.push(`then the owl spied the ${G.study.cur.kind}`);
    if (document.querySelector('#cs-owl').classList.contains('hide')) problems.push('the owl kept its eyes covered after your turn');
  }
  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') });
})();
