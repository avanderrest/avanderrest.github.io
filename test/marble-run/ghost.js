/* The ghost shows where a piece will really hang.

   A slope next to another slope joins its rail and tilts to meet it, so a ghost drawn as a
   lone slope sat higher than the slope that then landed: it looked as if the piece shifted
   down as you placed it. On the first level, hang a slope at (1,2), hover a slope over
   (2,2), and the ghost's rails must sit exactly where the placed slope's rails do once it
   has eased into place; the slope at (1,2), which re-tilts, must get a faint ghost too. */
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
  R.placeAt(1, 2);
  R.ui.hover = { x: 2, y: 2, inside: true };
  R.pickTool('slope');
  const ghosts = fx.children.filter((c) => c.isGroup);
  const ghost = ghosts.length ? spots(ghosts[ghosts.length - 1]) : '';
  const all = ghosts.map(spots);
  R.ui.hover = null;
  R.placeAt(2, 2);
  for (let i = 0; i < 30; i++) { R.render(); await wait(16); }
  const i = R.game.world.pieces.findIndex((p) => p.x === 2 && p.y === 2);
  const placed = spots(pieces.children[i]);
  R.game.clear();   // the cases share a page and its save
  R.goLevel(0);
  const pass = ghosts.length === 2 && all.includes(placed) && placed !== '';
  return JSON.stringify({ pass, detail: `${ghosts.length} ghosts (want 2: the new slope and the one it re-tilts); ghost rails ${all.includes(placed) ? 'match' : 'do NOT match'} the placed slope (${placed})` });
})();
