/* Every order can be filled with what the shop has by the time it is asked for.

   Each level's unlocks are what the next level's order is built from, and the two are
   written in different places: the order in its own level, the ingredients in the one
   before. Move a topping to a later level, or write an order for a recipe whose glaze
   nobody unlocks, and the game carries on looking perfectly healthy — the player just
   never finishes that order. So this walks the unlocks level by level, starting from what
   a fresh shop really has, and asks whether each goal could be met at that point. It runs
   on into the standing orders, which ask for more and more different named recipes. */
return (() => {
  const D = window.__donut;
  const problems = [];
  const notes = [];

  D.setSpeed(0);
  D.fresh();
  const u0 = D.state().unlocked;
  const have = { machines: [...u0.machines], glazes: [...u0.glazes], tops: [...u0.tops], fillings: [...u0.fillings] };
  const KNOWN = { machines: D.MACHINES, glazes: D.GLAZES, tops: D.TOPS, fillings: D.FILLINGS };

  const plainTops = () => have.tops.filter((t) => !D.TOPS[t].random);
  const makes = (r) =>
    (!r.glaze || (have.machines.includes('glazer') && have.glazes.includes(r.glaze))) &&
    (!r.filling || (have.machines.includes('filler') && have.fillings.includes(r.filling))) &&
    (!r.tops.length || (have.machines.includes('topper') && r.tops.every((t) => have.tops.includes(t))));
  const donut = (glaze, filling, tops) => ({ stage: 'donut', glaze, filling, tops, note: null, fillVal: 0, passes: { fry: 1, fill: 1, top: tops.length } });
  // the dearest thing the shop could sell right now: every named recipe, and the
  // richest unnamed build (one glaze, one ordinary filling, as many toppings as fit)
  const dearest = () => {
    let best = D.valueOf(donut(null, null, [])).total;
    for (const r of D.RECIPES) if (makes(r)) best = Math.max(best, D.valueOf(donut(r.glaze, r.filling, r.tops)).total);
    const g = have.machines.includes('glazer') && have.glazes[0] ? have.glazes[0] : null;
    const f = have.machines.includes('filler') ? have.fillings.find((x) => x !== 'mystery') || null : null;
    const t = have.machines.includes('topper') ? plainTops().slice(0, 2) : [];
    return Math.max(best, D.valueOf(donut(g, f, t)).total);
  };

  function possible(f, g) {
    const why = [];
    const need = (m) => { if (!have.machines.includes(m)) why.push(`no ${m}`); };
    for (const k of Object.keys(f)) {
      if (!['stage', 'glazed', 'recipe', 'named', 'silly', 'filled', 'tops', 'worth'].includes(k)) why.push(`goal filter "${k}" is new to this test`);
    }
    ['mixer', 'press', 'fryer', 'counter'].forEach(need);
    if (f.glazed) { need('glazer'); if (!have.glazes.length) why.push('no glaze'); }
    if (f.filled) { need('filler'); if (!have.fillings.length) why.push('no filling'); }
    if (f.silly) { need('topper'); if (!have.tops.some((t) => D.TOPS[t].silly)) why.push('no silly topping'); }
    if (f.tops) { need('topper'); if (plainTops().length < f.tops) why.push(`only ${plainTops().length} toppings for a ${f.tops}-topping order`); }
    if (f.recipe) {
      const r = D.RECIPES.find((x) => x.id === f.recipe);
      if (!r) why.push(`no recipe called ${f.recipe}`);
      else if (!makes(r)) why.push(`${r.name} needs ${[r.glaze, r.filling, ...r.tops].filter(Boolean).join(', ')}`);
    }
    if (f.named || g.distinct) {
      const n = D.RECIPES.filter(makes).length;
      if (n < (g.distinct || 1)) why.push(`${g.distinct || 1} named kinds wanted, ${n} makeable`);
    }
    if (f.worth) { const d = dearest(); if (d < f.worth) why.push(`worth ${f.worth}p wanted, dearest makeable is ${d}p`); }
    return why;
  }

  const upTo = D.LEVELS.length + 12;          // the written levels and a good run of standing orders
  for (let i = 0; i < upTo; i++) {
    const L = D.levelDef(i);
    for (const g of L.goals) {
      const why = possible(g.filter, g);
      if (why.length) problems.push(`level ${i + 1} "${L.name}", ${g.label}: ${why.join('; ')}`);
    }
    for (const [k, list] of Object.entries(L.unlock || {})) {
      for (const x of list) {
        if (!KNOWN[k] || !KNOWN[k][x]) problems.push(`level ${i + 1} unlocks ${k} "${x}", which does not exist`);
        else if (!have[k].includes(x)) have[k].push(x);
      }
    }
  }

  const never = D.RECIPES.filter((r) => !makes(r)).map((r) => r.name);
  if (never.length) problems.push(`never makeable, whatever is unlocked: ${never.join(', ')}`);
  const lastKinds = D.levelDef(upTo - 1).goals[0].distinct;
  notes.push(`${D.LEVELS.length} levels and ${upTo - D.LEVELS.length} standing orders all fillable`,
    `${D.RECIPES.filter(makes).length}/${D.RECIPES.length} recipes makeable by the end`,
    `standing order ${upTo - D.LEVELS.length} wants ${lastKinds} kinds`, `dearest donut ${dearest()}p`);

  return JSON.stringify({ pass: !problems.length, detail: problems.length ? problems.join(' | ') : notes.join('; ') });
})();
