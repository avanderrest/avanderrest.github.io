/* The race camera keeps your car on screen and only shows part of the desk.

   Once the view follows the car, the failure is silent: a lead that swings the
   car off the edge at speed, a clamp that parks the view in a corner while the
   car drives away, or a zoom that never actually lands. So drive a lap with the
   AI's own steering and check, every few frames, where the car is on screen. */
return (async () => {
  const P = window.__toyRacers;
  const problems = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n) => new Promise((r) => {
    const go = () => (n-- <= 0 ? r() : requestAnimationFrame(go));
    requestAnimationFrame(go);
  });

  P.start(P.TRACKS[0].id, { laps: 3 });
  await frames(2);
  const fitAtGrid = P.view.scale;
  P.state.countdown = 0.01;
  await wait(3200);               // the swoop in
  const zoom = P.view.scale / P.view.fit;
  if (P.cam.k < 1) problems.push(`camera still zooming after 3s (k=${P.cam.k.toFixed(2)})`);
  const shown = (P.view.w / P.view.scale) * (P.view.h / P.view.scale) / (P.DESK_W * P.DESK_H);
  if (shown > 0.4) problems.push(`${Math.round(shown * 100)}% of the desk on screen`);

  // let the player's car drive itself as an AI would
  const you = P.player;
  you.ai = { skill: 1, nerve: 0.5, line: 0, rubber: 0, t: 0 };
  you.isPlayer = false;
  let worst = 1, samples = 0;
  for (let i = 0; i < 80; i++) {
    await wait(100);
    const sx = P.view.ox + you.x * P.view.scale, sy = P.view.oy + you.y * P.view.scale;
    // distance from the nearest edge as a share of the smaller screen side
    const m = Math.min(sx, sy, P.view.w - sx, P.view.h - sy) / Math.min(P.view.w, P.view.h);
    worst = Math.min(worst, m);
    samples++;
  }
  you.isPlayer = true;
  you.ai = null;
  if (worst < 0.12) problems.push(`car came within ${(worst * 100).toFixed(1)}% of the screen edge`);

  return JSON.stringify({
    pass: problems.length === 0,
    detail: `${problems.join('; ') || 'ok'} — zoom ${zoom.toFixed(2)}x the fitted desk ` +
      `(grid ${fitAtGrid.toFixed(3)}), ${Math.round(shown * 100)}% of desk shown, ` +
      `closest to edge ${(worst * 100).toFixed(1)}% over ${samples} samples, lap ${you.lap}`,
  });
})();
