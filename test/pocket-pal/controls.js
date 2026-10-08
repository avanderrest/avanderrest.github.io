/* The real hand and the real buttons reach the real pet.

   The bot calls the sim's verbs directly, so the whole input path (the pointer handlers,
   telling a stroke on the pet from a gesture drawn beside it, the gesture reader fed from
   real pointer moves, the "Say" button, the care buttons) could be dead with every Node
   case green. This adopts a pet through the dialog, rubs it in circles with pointer events
   (happiness must rise), then teaches Sit end to end three times with a drawn swipe down
   off the pet and the Say button, checks the learned trick then fires on the swipe alone,
   and feeds it with the Feed button and the kibble in the tray. */
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const G = window.__pal, problems = [], notes = [];
  const go = document.querySelector('#pp-adopt-go');
  if (go) { document.querySelector('#pp-adopt-name').value = 'Tester'; go.click(); }
  await sleep(300);
  document.querySelector('#pp-dialog').hidden = true;
  const S = G.S, P = S.pet;
  for (const k of ['tummy', 'happy', 'energy', 'clean']) S.stats[k] = 90;
  S.stats.happy = 50;
  P.act = 'idle'; P.dur = 99; P.t = 0;
  const c = document.querySelector('#pp-room');
  const ev = (t, x, y, id) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: id, bubbles: true, pointerType: 'mouse' }));

  // rub it in circles
  const at = G.toScreen(P.x, P.y - 90);
  ev('pointerdown', at.x, at.y, 1);
  for (let i = 0; i < 70; i++) { ev('pointermove', at.x + Math.cos(i / 5) * 28, at.y + Math.sin(i / 5) * 18, 1); await sleep(16); }
  ev('pointerup', at.x, at.y, 1);
  if (!(S.stats.happy > 52)) problems.push(`rubbing left happiness at ${S.stats.happy.toFixed(1)}`);
  notes.push(`rubbed: happy 50 -> ${S.stats.happy.toFixed(1)}`);

  // three lessons: swipe down beside it, then the Say button while it holds the pose
  const swipe = async (x0, y0, x1, y1) => {
    const a = G.toScreen(x0, y0), b = G.toScreen(x1, y1);
    ev('pointerdown', a.x, a.y, 2);
    for (let i = 1; i <= 20; i++) { ev('pointermove', a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20, 2); await sleep(10); }
    ev('pointerup', b.x, b.y, 2);
  };
  document.querySelector('.pp-trick[data-key=sit]').click();
  for (let lesson = 0; lesson < 3; lesson++) {
    await sleep(900);
    P.x = 480; P.y = 500;
    await swipe(760, 120, 765, 330);
    await sleep(300);
    if (!S.train || S.train.stage !== 'word') { problems.push(`lesson ${lesson + 1}: the swipe did not put it in the pose (${JSON.stringify(S.train)}, ${P.act})`); break; }
    document.querySelector('#pp-say').click();
    await sleep(200);
  }
  if (!S.tricks.sit.learned) problems.push(`Sit not learned after three lessons (${S.tricks.sit.reps}/3)`);
  if (document.querySelector('.pp-trick[data-key=beg]').disabled) problems.push('Beg did not unlock');
  notes.push(`sit ${S.tricks.sit.learned ? 'learned' : S.tricks.sit.reps + '/3'}`);

  // asked by gesture alone
  await sleep(2600);
  P.act = 'idle'; P.t = 0; P.dur = 99;
  const before = S.performed;
  await swipe(200, 120, 205, 330);
  await sleep(200);
  if (S.performed !== before + 1 || P.trick !== 'sit') problems.push(`the swipe alone did not ask for Sit (performed ${before} -> ${S.performed}, ${P.act})`);

  // the Feed button and the tray
  await sleep(2600);
  S.stats.tummy = 40;
  document.querySelector('#pp-feed').click();
  const tray = document.querySelector('#pp-foods');
  if (tray.hidden) problems.push('Feed did not open the tray');
  tray.querySelector('[data-food=kibble]').click();
  await sleep(200);
  if (!S.bowl) problems.push('kibble did not go in the bowl');
  for (let i = 0; i < 40 && P.act !== 'eat'; i++) await sleep(100);
  if (P.act !== 'eat') problems.push(`it never went to eat (${P.act})`);
  notes.push(`fed: ${P.act}`);

  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') });
})();
