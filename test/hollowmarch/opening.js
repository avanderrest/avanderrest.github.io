/* The first wave can be held with the first build the game asks for.

   Before wave 1 the game insists on an archer tower and a farm, and that is all the
   starting gold buys. So that exact build has to hold: a new player who does what
   they are told and loses the keep on wave 1 has been sold a broken game, and
   nothing on screen would say which number went wrong. It also checks the wave pays
   out — the farm's income and the loot land in the purse — and that the result is
   saved, so a reload does not put the player back before it. */
return (() => {
  const K = window.__hollowmarch;
  const problems = [];
  K.setSpeed(0);
  K.newGame();
  const s = () => K.state();
  const gold0 = s().gold;

  // The tower beside the keep, on the last stretch every road shares. The farm goes on
  // the cell furthest from every road: goblins burn village buildings near their path,
  // and a farm lost to that is the raiding rule working, not the opening failing.
  const W = K.W;
  K.place(6, 6, 'tower');
  const road = new Set();
  for (const g of K.GATES) for (let c = g, n = 0; c >= 0 && c !== K.CASTLE && n < 64; c = K.flow().next[c], n++) road.add(c);
  let farm = -1, far = -1;
  for (let i = 0; i < W * K.H; i++) {
    if (s().grid[i] || road.has(i)) continue;
    const d = Math.min(...[...road].map((r) => Math.hypot(r % W - i % W, Math.floor(r / W) - Math.floor(i / W))));
    if (d > far) { far = d; farm = i; }
  }
  K.place(farm % W, Math.floor(farm / W), 'farm');
  if (s().grid[6 * W + 6] !== 'tower' || s().grid[farm] !== 'farm') {
    return JSON.stringify({ pass: false, detail: `could not afford the required opening on ${gold0} gold` });
  }
  const goldBuilt = s().gold;
  const income = K.income().total;
  if (income <= 0) problems.push('the farm earns nothing');

  K.startWave();
  if (!K.running()) return JSON.stringify({ pass: false, detail: 'wave 1 would not start with a tower and a farm down' });
  let t = 0;
  while (K.running() && t < 600) { K.step(1); t++; }

  if (K.running()) problems.push(`wave 1 still going after ${t}s`);
  if (s().fallen) problems.push(`the keep fell on wave 1 (${t}s)`);
  const hp = s().castleHp;
  if (hp < 15) problems.push(`the keep came out of wave 1 on ${hp}/20`);
  const entry = s().log[0];
  if (!entry || entry.wave !== 1) problems.push('wave 1 left no entry in the chronicle');
  if (s().wave !== 2) problems.push(`the wave counter reads ${s().wave} after wave 1`);
  if (entry && entry.lost.length) problems.push(`lost ${entry.lost.join(', ')} on wave 1, ${far.toFixed(1)} tiles from the road`);
  if (entry && s().gold !== goldBuilt + entry.bounty + entry.income) {
    problems.push(`gold ${s().gold} is not ${goldBuilt} + ${entry.bounty} loot + ${entry.income} income`);
  }
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('hollowmarch-save-v1')); } catch (e) { /* checked below */ }
  if (!saved || saved.wave !== 2) problems.push(`the save does not have wave 2 in it (${saved && saved.wave})`);

  return JSON.stringify({
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' — ' : '')
      + `wave 1 over in ${t}s, keep ${hp}/20, ${entry ? entry.slain : '?'} slain, ${entry ? entry.leaked : '?'} leaked, `
      + `farm at ${farm % W},${Math.floor(farm / W)}; gold ${gold0} -> ${goldBuilt} after building -> ${s().gold} (loot ${entry ? entry.bounty : '?'}, income ${income})`,
  });
})();
