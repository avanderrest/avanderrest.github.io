/* The ghost shows where a piece will really hang.

   Slopes once joined into one rail and tilted to meet, and the ghost had to show that.
   Since 2026-10-16 a slope is always the same angle wherever it hangs, so a ghost beside
   another slope is just the slope: on the first level, hang a slope at (4,6), hover a
   slope over (5,6), and there must be exactly one ghost, whose rails sit exactly where the
   placed slope's rails do (nothing next to it re-tilts). */
return (async () => {
  const R = window.__run;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fx = R.scene.children[R.scene.children.length - 2];
  const pieces = R.scene.children[R.scene.children.length - 3];
  const spots = (g) => {
    const out = [];
    g.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry') out.push([o.position.x, o.position.y].map((v) => v.toFixed(3)).join(',')); });
    return out.sort().join(' ');
  };
  R.goLevel(0);
  R.pickTool('slope');
  R.placeAt(4, 6);
  R.ui.hover = { x: 5, y: 6, inside: true };
  R.pickTool('slope');
  const ghosts = fx.children.filter((c) => c.isGroup);
  const ghost = ghosts.length ? spots(ghosts[ghosts.length - 1]) : '';
  const all = ghosts.map(spots);
  R.ui.hover = null;
  R.placeAt(5, 6);
  for (let i = 0; i < 30; i++) { R.render(); await wait(16); }
  const i = R.game.world.pieces.findIndex((p) => p.x === 5 && p.y === 6);
  const placed = spots(pieces.children[i]);
  R.game.clear();   // the cases share a page and its save
  R.goLevel(0);
  const pass = ghosts.length === 1 && all.includes(placed) && placed !== '';
  return JSON.stringify({ pass, detail: `${ghosts.length} ghosts (want 1: the new slope, nothing re-tilts); ghost rails ${all.includes(placed) ? 'match' : 'do NOT match'} the placed slope (${placed})` });
})();
