/* The real keys and a held pointer move the real boat.

   The bot rows by calling row() directly, so the whole input path (the key listeners, the
   turn mapping, rowing toward a held finger) could be dead with every Node case green. This
   holds real keys down over the real listeners on open water: W rows her forward, A turns
   her left (anticlockwise on screen) and D right, S backs her up, and holding the pointer
   on the water off to one side brings her round toward it. It also checks the help button
   only shows beside a tangled bird, and that E held there frees it. */
return (async () => {
  const G = window.__mere;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && !G.art; i++) await sleep(200);
  document.querySelector('#wm-dialog').hidden = true;
  const S = G.S, problems = [], notes = [];
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  const hold = async (code, ms) => { key(code, true); await sleep(ms); key(code, false); };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // somewhere roomy: the reachable cell furthest from any bank
  let best = null;
  for (let y = 200; y < G.lake.H - 200; y += 24) for (let x = 200; x < G.lake.W - 200; x += 24) {
    const d = G.sim.sdAt(x, y);
    if (G.lake.reachAt(x, y) && (!best || d > best.d)) best = { x, y, d };
  }
  const park = async () => { G.teleport(best.x, best.y, 0); await sleep(250); };

  await park();
  await hold('KeyW', 1600);
  const fwd = S.boat.x - best.x;
  if (fwd < 40) problems.push(`W moved her only ${fwd.toFixed(0)}px forward`);
  notes.push(`W ${fwd.toFixed(0)}px`);

  await park();
  await hold('KeyA', 1600);
  const left = wrap(S.boat.a);
  if (!(left < -0.15)) problems.push(`A did not turn her left (heading ${left.toFixed(2)})`);
  await park();
  await hold('KeyD', 1600);
  const right = wrap(S.boat.a);
  if (!(right > 0.15)) problems.push(`D did not turn her right (heading ${right.toFixed(2)})`);
  notes.push(`A ${left.toFixed(2)} rad, D ${right.toFixed(2)} rad`);

  await park();
  await hold('KeyS', 1600);
  const backed = S.boat.x - best.x;
  if (!(backed < -10)) problems.push(`S did not back her up (${backed.toFixed(0)}px)`);
  notes.push(`S ${backed.toFixed(0)}px`);

  // a held pointer straight below the boat on screen: she should come round toward it
  await park();
  const c = document.querySelector('#wm-lake'), r = c.getBoundingClientRect();
  const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, isPrimary: true }));
  // aim from where the boat really is on screen (the camera stops at the world's edge)
  await sleep(600);
  const at = G.toScreen(S.boat.x, S.boat.y);
  const target = { x: r.left + at.x, y: r.top + at.y + 160 };
  ev('pointerdown', target.x, target.y);
  for (let i = 0; i < 12; i++) { await sleep(200); ev('pointermove', target.x, target.y); }
  ev('pointerup', target.x, target.y);
  const steer = wrap(S.boat.a), moved = S.boat.y - best.y;
  if (!(steer > 0.5) || moved < 10) problems.push(`held pointer below: heading ${steer.toFixed(2)}, moved ${moved.toFixed(0)}px down`);
  notes.push(`pointer: heading ${steer.toFixed(2)}, ${moved.toFixed(0)}px toward it`);

  // the help button and E
  const btn = document.querySelector('#wm-help');
  await park();
  await sleep(200);
  const hiddenAway = btn.hidden;
  const bird = S.tangled.find((t) => t.state === 'tangled');
  G.teleport(bird.x + 40, bird.y, Math.PI);
  await sleep(300);
  const shown = !btn.hidden;
  await hold('KeyE', 2900);
  if (!hiddenAway) problems.push('the help button showed on open water');
  if (!shown) problems.push('the help button did not show beside a tangled bird');
  if (bird.state !== 'free') problems.push(`E held for 2.9s left the ${bird.kind} ${bird.state} at ${(bird.p * 100).toFixed(0)}%`);
  notes.push(`help button ${shown ? 'shown' : 'missing'} by the ${bird.kind}, ${bird.state}`);

  return JSON.stringify({ pass: !problems.length, detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; ') });
})();
