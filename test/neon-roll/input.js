/* The one button has to reach the ball, and every run has to end and restart.

   mechanic.js drives the ball through the debug handle's hold(), which skips the
   key and pointer listeners entirely — so a renamed element, a swallowed keydown
   or a modal that never lets go would leave the game unplayable with every other
   case green. This presses real keys and pointers:

   1. From the menu, Space starts a run and holds; releasing lets go.
   2. A pointer press and release on the stage does the same.
   3. Nothing gets through while How to play is open, and opening it pauses.
   4. Endless: a ball the blackout draws level with is caught, the results card
      comes up, the best is saved, and a press restarts only once the card has
      been up long enough not to eat the press that ended the run.
   5. Air Time: a fixed two minutes, however much of it is spent in the air, and
      the seconds in the air are counted.
   6. R restarts a run from anywhere, fresh.
   7. The ball always rolls on: dropped dead still at the foot of a climb, it
      climbs out by itself.
   8. Should a run ever stop covering ground anyway, a restart is offered,
      and taken away again once it moves on.
   9. P pauses and P resumes.
  10. The landing ring (where you land if you let go now) never jumps on a press
      or a release, and slides back towards the diamond while you hold. */
return (async () => {
  const N = window.__neonRoll;
  const S = () => N.state;
  const problems = [], notes = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }));
  const stage = document.getElementById('stage');
  const panel = document.getElementById('panel');
  const ptr = (type) => (type === 'pointerdown' ? stage : window).dispatchEvent(new PointerEvent(type, { pointerId: 7, button: 0, bubbles: true, cancelable: true }));

  localStorage.removeItem('neon-roll-save-v1');
  N.setMode('endless');
  if (S().phase !== 'menu' || panel.hidden) problems.push(`page did not open on the menu (phase ${S().phase})`);

  // 1. keyboard
  key('Space', true);
  if (S().phase !== 'run') problems.push(`Space did not start a run (phase ${S().phase})`);
  if (!S().held) problems.push('Space down did not hold');
  if (!panel.hidden) problems.push('the card stayed up over the run');
  key('Space', false);
  if (S().held) problems.push('Space up did not let go');

  // 2. pointer
  ptr('pointerdown');
  if (!S().held) problems.push('a pointer press on the stage did not hold');
  ptr('pointerup');
  if (S().held) problems.push('pointer up did not let go');

  // 3. help pauses and swallows the button
  document.getElementById('btn-help').click();
  if (S().phase !== 'paused') problems.push(`opening How to play did not pause (phase ${S().phase})`);
  key('Space', true);
  if (S().held || S().phase !== 'paused') problems.push('Space got through the How to play dialog');
  key('Space', false);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  if (!document.getElementById('help').hidden) problems.push('Escape did not close How to play');
  key('Space', true); key('Space', false);
  if (S().phase !== 'run') problems.push(`a press did not resume after the dialog (phase ${S().phase})`);

  // 4. endless ends, saves, and restarts
  N.freeze(true);
  N.hold(false);
  // roll a little way so there is a score to save, then let the blackout draw level
  N.step(3);
  S().chaseX = S().ball.x + 50;
  let t = 3;
  while (S().phase === 'run' && t < 10) { N.step(0.1); t += 0.1; }
  if (S().phase !== 'over' || S().overReason !== 'caught') problems.push(`the blackout drew level and did not catch the ball (phase ${S().phase}, reason ${S().overReason})`);
  else notes.push(`caught at ${Math.floor(S().dist)} m`);
  if (panel.hidden) problems.push('no results card after the run');
  const saved = JSON.parse(localStorage.getItem('neon-roll-save-v1') || 'null');
  if (!saved || !(saved.best.endless.score > 0)) problems.push(`best score was not saved (${JSON.stringify(saved && saved.best)})`);
  N.freeze(false);
  key('Space', true); key('Space', false);
  if (S().phase !== 'over') problems.push('a press straight after the run ended restarted it');
  await sleep(900);
  key('Space', true);
  if (S().phase !== 'run') problems.push(`a press after the card settled did not restart (phase ${S().phase})`);
  else if (S().dist > 5) problems.push(`the restart kept the old run (${Math.floor(S().dist)} m)`);
  key('Space', false);

  // 6. R restarts from anywhere, mid-run, with a fresh run
  N.freeze(true);
  N.start('endless', { seed: 99 });
  N.step(6);
  const far = S().dist;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r', bubbles: true }));
  if (S().phase !== 'run' || S().dist > 1 || S().t > 0) problems.push(`R did not restart (phase ${S().phase}, ${Math.floor(S().dist)} m of ${Math.floor(far)})`);
  else notes.push(`R restarted a run at ${Math.floor(far)} m`);

  // 7. the ball always rolls on: dropped dead still at the foot of a climb, it climbs out
  const T = N.track, o = { y: 0, dy: 0, ddy: 0 };
  const y0 = (s) => { s.f(s.x0, o); return o.y; };
  T.extend(S().ball.x + 40000);
  const valley = T.segs.find((s) => (s.kind === 'roll' || s.kind === 'ramp') && s.x0 > 1500 && s.yEnd - y0(s) > 80);
  if (!valley) problems.push('no climb to test on');
  else {
    const b = S().ball;
    Object.assign(b, { on: true, x: valley.x0 + 1, s: 0, air: 0 });
    b.y = N.ground(b.x).y;
    S().chaseX = b.x - 1e5;
    for (let i = 0; i < 80 && b.x < valley.x1 + 50; i++) { S().chaseX = b.x - 1e5; N.step(0.5); }
    if (!(b.x > valley.x1)) problems.push(`a stopped ball did not roll on up a ${Math.round(valley.yEnd - y0(valley))}px climb`);
    else notes.push(`a stopped ball rolled up a ${Math.round(valley.yEnd - y0(valley))}px climb unaided`);

    // 8. and should a run ever stop covering ground, it is offered a restart, which goes away after
    const hold = b.x;
    for (let i = 0; i < 12; i++) { Object.assign(b, { x: hold, s: 0, on: true }); b.y = N.ground(hold).y; S().chaseX = hold - 1e5; N.step(0.5); }
    await sleep(60);
    if (document.getElementById('btn-stage-restart').hidden) problems.push(`no restart offered after ${S().noProgT.toFixed(1)}s without progress`);
    for (let i = 0; i < 8; i++) { S().chaseX = b.x - 1e5; N.step(0.5); }
    await sleep(60);
    if (!document.getElementById('btn-stage-restart').hidden) problems.push('the restart offer stayed up after the ball got going again');
  }
  N.freeze(false);

  // 5. air time: two minutes on the clock whatever the ball does, scored on seconds in the air
  N.freeze(true);
  N.start('airtime');
  N.hold(false);
  let t5 = 0;
  while (S().phase === 'run' && t5 < 200) { N.step(0.25); t5 += 0.25; }
  if (S().overReason !== 'time') problems.push(`air time did not run out (phase ${S().phase}, reason ${S().overReason})`);
  else if (Math.abs(t5 - 120) > 1) problems.push(`air time lasted ${t5}s, not two minutes`);
  else if (!(S().airSec > 5)) problems.push(`air time counted only ${S().airSec.toFixed(1)}s in the air`);
  else notes.push(`air time: two minutes, ${S().airSec.toFixed(1)}s of it in the air`);
  N.freeze(false);

  // 9. P pauses and P resumes
  N.start('endless', { seed: 5 });
  const pk = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP', key: 'p', bubbles: true })); };
  pk();
  if (S().phase !== 'paused') problems.push(`P did not pause (phase ${S().phase})`);
  pk();
  if (S().phase !== 'run') problems.push(`P did not resume (phase ${S().phase})`);

  // 10. the ring (let go now) never jumps on a press or a release, and slides steadily back
  //     towards the diamond (hold on) while held — Amber saw one marker leap both ways
  N.freeze(true);
  N.start('endless', { seed: 11, noChase: true });
  for (let i = 0; i < 3000 && !(!S().ball.on && S().ball.air > 0.3); i++) N.step(1 / 60);
  const ringX = () => N.predictLanding(false).x;
  const r0 = ringX();
  key('Space', true);
  const r1 = ringX(), dive = N.predictLanding(true).x;
  let steps = 0, prev = r1, jumps = 0;
  while (!S().ball.on && steps < 30) { N.step(1 / 60); const r = ringX(); if (Math.abs(r - prev) > 150) jumps++; prev = r; steps++; }
  const before = ringX();
  key('Space', false);
  const after = ringX();
  if (Math.abs(r1 - r0) > 1) problems.push(`the ring jumped ${Math.round(r1 - r0)}px on a press`);
  if (Math.abs(after - before) > 1) problems.push(`the ring jumped ${Math.round(after - before)}px on a release`);
  if (jumps) problems.push(`the ring jumped ${jumps} times while held`);
  if (!(dive < r0)) problems.push(`the diamond (hold on) is not nearer than the ring (${Math.round(dive)} vs ${Math.round(r0)})`);
  else notes.push(`holding slid the ring ${Math.round(r0 - prev)}px back towards the diamond`);
  N.freeze(false);
  N.freeze(false);
  N.setMode('endless');

  return JSON.stringify({ pass: problems.length === 0, detail: `${problems.join('; ') || 'ok'} | ${notes.join('; ')}` });
})();
