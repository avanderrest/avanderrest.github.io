/* Bowls tells the truth, counts right, and the computer is worth playing.

   Three things that would each break quietly:

   1. The ring. While you pull back, a ring shows where the marble would come to rest on open
      cloth. It is worked out from a formula, not the physics, so if the two ever drift apart
      the aim line lies and nobody can tell why their bowls run long. A real roll, through the
      real loop, has to stop where the ring said.
   2. The count. Nearest the button scores one for every marble in the house nearer than the
      other side's best — set out by hand, the tally has to come out exactly, and neither a dead
      marble (short of the line) nor one lying outside the rings may count.
   3. The computer. It plans by running its candidate shots forward on a copy of the tray. A
      real end against it at its keenest: it should hold the shot after most of its bowls, and
      the planning must not stall the page while it thinks.
   4. The pull. The whole length of a pull has to be spent on the tray: the house has to be
      reachable from well short of a full pull, and a full pull has to carry past it to the
      rim and no absurd distance further. */
return (async () => {
  const T = window.__tray;
  const B = T.bowls;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const settle = async (limit = 900) => {
    for (let i = 0; i < limit; i++) {
      await frame();
      if (B.phase !== 'rolling') return true;
    }
    return false;
  };
  const problems = [];
  const notes = [];

  T.setTwo(true);                       // both sides by hand for the first two checks
  T.setMode('bowls');
  await frame();

  // 1. the ring
  {
    const b = B.cur;
    b.y = 400;
    const v = 250;                      // rolls about 570px: well inside the tray
    const want = b.x + T.rollOut(v);
    T.throwBowl(v, 0);
    let stopped = null;
    for (let i = 0; i < 600 && !stopped; i++) {
      await frame();
      if (!b.vx && !b.vy) stopped = b.x;
    }
    const err = stopped == null ? Infinity : stopped - want;
    notes.push(`ring said ${want.toFixed(0)}, it stopped at ${stopped == null ? 'never' : stopped.toFixed(0)} (${err.toFixed(1)}px)`);
    if (!(Math.abs(err) < 6)) problems.push('the aim ring does not match where the marble stops');
    await settle();
  }

  // 2. the count
  {
    T.startBowls();
    await frame();
    const hs = T.HOUSE;
    // `gap` is centre to button; the marbles are spread round so none of them touch.
    const put = (team, gap, ang) => T.add('marble-l', hs.x + Math.cos(ang) * gap, hs.y + Math.sin(ang) * gap, { team });
    const reset = () => { T.bodies.length = 0; };
    const cases = [
      { set: [['you', 30, 0], ['you', 75, 1], ['ai', 55, 2.2], ['ai', 100, 3.4]], you: 1, ai: 0 },
      { set: [['ai', 26, 0], ['ai', 52, 1.5], ['ai', 78, 3], ['you', 100, 4.5]], you: 0, ai: 3 },
      { set: [['you', 30, 0], ['you', 60, 2], ['ai', 100, 4]], you: 2, ai: 0 },
      // the nearest marble is outside the rings, so it is the next one in that counts
      { set: [['ai', T.HOUSE_RINGS[0] + 40, 0], ['you', 90, 2], ['ai', 110, 4]], you: 1, ai: 0 },
    ];
    for (const c of cases) {
      reset();
      B.you = 0; B.ai = 0; B.left = { you: 0, ai: 0 }; B.phase = 'aim'; B.cur = null;
      for (const [team, gap, ang] of c.set) put(team, gap, ang);
      T.scoreEnd();
      if (B.you !== c.you || B.ai !== c.ai) problems.push(`count: wanted ${c.you}-${c.ai}, got ${B.you}-${B.ai}`);
    }
    // nothing in the rings is a blank end
    reset();
    B.you = 0; B.ai = 0; B.phase = 'aim';
    T.add('marble-l', T.DEAD_X - 30, 310, { team: 'ai' });
    T.add('marble-l', hs.x - T.HOUSE_RINGS[0] - 60, hs.y, { team: 'you' });
    T.scoreEnd();
    if (B.ai !== 0 || B.you !== 0) problems.push(`a marble outside the rings counted: ${B.you}-${B.ai}`);
    notes.push('counts come out right');
    // and the game ends at BOWLS_TO
    B.you = T.BOWLS_TO; B.t = 99;
    T.afterEnd();
    const shown = !document.getElementById('result').hidden;
    if (!B.over || !shown) problems.push('reaching the target did not end the game');
    document.getElementById('result').hidden = true;
  }

  // 3. the computer, at its keenest, over one real end
  {
    T.setTwo(false);
    T.setLevel(2);
    T.startBowls();
    let held = 0, aiBowls = 0, worstGap = 0, last = performance.now(), prevLeft = B.left.ai;
    const holding = (side) => {
      const s = T.standing(T.bodies);
      return s.length && s[0].b.team === side;
    };
    for (let guard = 0; guard < 20000 && B.phase !== 'scored'; guard++) {
      await frame();
      const now = performance.now();
      if (B.plan && !B.plan.ready) worstGap = Math.max(worstGap, now - last);
      last = now;
      if (B.phase === 'aim' && B.turn === 'you' && B.cur) {
        // Our side bowls a decent but human draw: at the button, with a wobble.
        const j = T.HOUSE, b = B.cur;
        const d = Math.hypot(j.x - b.x, j.y - b.y);
        const v = Math.sqrt(2 * T.KINDS['marble-l'].roll * d) * (1 + (Math.random() - 0.5) * 0.2);
        const a = Math.atan2(j.y - b.y, j.x - b.x) + (Math.random() - 0.5) * 0.08;
        T.throwBowl(Math.cos(a) * v, Math.sin(a) * v);
      }
      if (B.left.ai < prevLeft) {
        prevLeft = B.left.ai;
        aiBowls++;
        await settle();
        if (holding('ai')) held++;
      }
    }
    notes.push(`the computer held the shot after ${held} of ${aiBowls} bowls; worst frame while it thought ${worstGap.toFixed(0)}ms`);
    if (B.phase !== 'scored') problems.push('the end never finished');
    if (aiBowls < T.BOWLS_EACH - 1) problems.push(`the computer only bowled ${aiBowls}`);
    else if (held < Math.ceil(aiBowls / 2)) problems.push('the computer at its keenest rarely holds the shot');
    if (worstGap > 120) problems.push('thinking stalls the page');
  }

  // 4. the pull
  {
    const toButton = T.HOUSE.x - T.MAT_X;
    const pullFor = (d) => { for (let p = 1; p <= T.PULL_FULL; p++) if (T.rollOut(T.flickFrom(-p, 0).v) >= d) return p; return Infinity; };
    const pButton = pullFor(toButton), full = T.rollOut(T.flickFrom(-T.PULL_FULL, 0).v);
    const span = pullFor(toButton + T.HOUSE_RINGS[0]) - pullFor(toButton - T.HOUSE_RINGS[0]);
    notes.push(`the button takes ${pButton} of ${T.PULL_FULL}px of pull; the house spans ${span}px of it; a full pull rolls ${full.toFixed(0)}px`);
    const room = 960 - 22 - T.MAT_X;
    if (pButton > T.PULL_FULL * 0.85 || pButton < T.PULL_FULL * 0.4) problems.push('the button is at the wrong end of the pull');
    if (span < 25) problems.push('the house is too fine a sliver of the pull to aim for');
    if (full < room || full > room * 1.5) problems.push('a full pull does not land in the right place');
  }

  return JSON.stringify({ pass: !problems.length, detail: [...problems, ...notes].join('\n') });
})();
