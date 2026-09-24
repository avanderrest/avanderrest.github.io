/* The simplest real factory has to make money and finish the first two orders.

   Mixer, press, fryer, counter, joined by belts — the line the first level's hint
   describes — built with the real placement rules on the starting cash and run
   through the real simulation. It has to sell ten donuts and come out ahead of what
   the dough cost. Then a glazer goes in over one of its belts (placing over a belt
   is how a player does it) and the same line has to finish the glazed order.

   What this catches is everything between the machines that looks fine standing
   still: a machine that will not take from a belt, a counter that never sells, a
   fryer that burns everything, a price that makes a working line lose money. */
return (() => {
  const D = window.__donut;
  const problems = [];
  D.setSpeed(0);
  D.fresh();
  const s = () => D.state();
  const R = 3;
  const cash0 = s().cash;

  const built = [
    D.place(0, R, 'mixer', 0), D.belt(1, R, 0), D.place(2, R, 'press', 0), D.belt(3, R, 0),
    D.place(4, R, 'fryer', 0), D.belt(5, R, 0), D.belt(6, R, 0), D.place(7, R, 'counter', 0),
  ];
  if (!built.every(Boolean)) {
    return JSON.stringify({ pass: false, detail: `could not build the line on £${(cash0 / 100).toFixed(2)}: ${built.join(',')}` });
  }
  const spent = cash0 - s().cash;

  // run until the level changes, a second at a time
  const until = (lvl, cap) => {
    let t = 0;
    while (s().level < lvl && t < cap) { D.step(1); t++; }
    return t;
  };

  const bonus1 = D.levelDef(0).bonus;
  const t1 = until(1, 300);
  const sold1 = s().sold;
  const cash1 = s().cash;
  if (s().level < 1) problems.push(`level 1 not finished after 300s: ${sold1} sold, goal ${s().goals[0].count}/${s().goals[0].n}`);
  // what the line earned on its own, net of the dough and before the level bonus
  const earned = cash1 - bonus1 - (cash0 - spent);
  if (earned <= 0) problems.push(`the line lost money: ${earned}p over ${sold1} sales`);

  // a glazer in place of the last belt, as a player would drop one on
  if (!D.place(6, R, 'glazer', 0)) problems.push(`could not place a glazer with ${s().cash}p`);
  const t2 = until(2, 300);
  const g = s().goals;
  if (s().level < 2) problems.push(`level 2 not finished 300s after adding the glazer: glazed ${g[0] && g[0].count}/${g[0] && g[0].n}`);

  return JSON.stringify({
    pass: !problems.length,
    detail: problems.length ? problems.join(' | ')
      : `built for ${spent}p; level 1 in ${t1}s (${sold1} sold, ${earned}p earned before the bonus); level 2 in ${t2}s with a glazer; ${s().sold} sold in all`,
  });
})();
