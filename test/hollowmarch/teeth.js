/* A village that never builds a defence has to lose, and not straight away.

   The other side of the opening case. The waves grow on a formula — more packs,
   tougher monsters, hit points scaled by the wave — and a change to any of it can
   quietly make the game unlosable (the lone tower mops up everything forever) or
   unwinnable (the second wave flattens a sensible start). Neither shows up by
   looking at it.

   So this builds only what wave 1 requires, then presses Start and does nothing
   else. It has to survive the first two waves and fall by wave 12. */
return (() => {
  const K = window.__hollowmarch;
  K.setSpeed(0);
  K.newGame();
  const s = () => K.state();
  K.place(6, 6, 'tower');
  K.place(1, 4, 'farm');

  const MUST_LAST = 2, MUST_FALL = 12;
  const hp = [];
  let t = 0;
  while (!s().fallen && s().wave <= MUST_FALL + 3) {
    const n = s().wave;
    K.startWave();
    if (!K.running()) break;
    let w = 0;
    while (K.running() && w < 900) { K.step(1); w++; }
    if (K.running()) return JSON.stringify({ pass: false, detail: `wave ${n} still running after ${w}s` });
    t += w;
    hp.push(`${n}:${s().fallen ? 'fell' : s().castleHp}`);
  }

  const fellOn = s().fallen ? s().wave : null;
  const problems = [];
  if (fellOn !== null && fellOn <= MUST_LAST) problems.push(`the keep fell on wave ${fellOn} with the build the game asks for`);
  if (fellOn === null || fellOn > MUST_FALL) problems.push(`one tower held to wave ${s().wave} — the horde has no teeth`);

  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' — ' : '') + `keep hp by wave ${hp.join(' ')}; ${t}s simulated`,
  });
})();
