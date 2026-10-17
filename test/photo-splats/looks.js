/* Every look draws, and each one is its own picture.

   A made-up scene (a red ball in front of a green wall) shown in each look in turn: the
   GL reports no error, the canvas is not blank, no look leaves the picture the same as
   the photo, and the paper looks put paper where there are no splats. The chosen look is
   saved, and a bad name falls back to the photo. */
return (async () => {
  const frames = (n) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const G = window.__splats, P = G.P, problems = [], notes = [];
  const ball = 3000, wall = 60 * 40, n = ball + wall;
  const s = P.emptyScene(n, { width: 1200, height: 800, focal: 1.2 });
  let r = 11;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < ball; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, rad = 0.25 * Math.cbrt(rnd()), q = Math.sqrt(1 - u * u);
    s.pos.set([q * Math.cos(t) * rad, q * Math.sin(t) * rad, 2 + u * rad], i * 3);
    s.scale.set([0.03, 0.03, 0.03], i * 3); s.rot[i * 4] = 1;
    s.color.set([230, 40, 40, 255], i * 4);
  }
  // the wall covers only the middle, so the corners are empty
  for (let j = 0; j < wall; j++) {
    const i = ball + j, x = (j % 60) / 59 - 0.5, y = Math.floor(j / 60) / 39 - 0.5;
    s.pos.set([x * 3, y * 2, 5], i * 3);
    s.scale.set([0.05, 0.05, 0.01], i * 3); s.rot[i * 4] = 1;
    s.color.set([40, 200, 60, 255], i * 4);
  }
  G.sim.setSway(false);
  G.show(s, { title: 'Ball and wall', orbit: 20 });
  const c = document.getElementById('ps-view');
  const grab = () => {
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const g = t.getContext('2d'); g.drawImage(c, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const px = (d, fx, fy) => { const i = (Math.round(fy * (c.height - 1)) * c.width + Math.round(fx * (c.width - 1))) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const diff = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i += 16) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return sum / (a.length / 16) / 3; };
  const gl = G.renderer.gl;
  G.setStyle('photo'); await frames(4);
  const photo = grab();
  for (const look of ['oil', 'watercolour', 'dots', 'pencil', 'comic']) {
    G.setStyle(look); await frames(4);
    const err = gl.getError();
    const d = grab(), mid = px(d, 0.5, 0.5), corner = px(d, 0.02, 0.03), dd = diff(d, photo);
    notes.push(`${look}: middle ${mid}, corner ${corner}, ${dd.toFixed(0)} from the photo`);
    if (err) problems.push(`${look}: GL error ${err}`);
    if (dd < 4) problems.push(`${look} looks just like the photo`);
    if (Math.max(...mid) < 30) problems.push(`${look}: the middle is black`);
    // every look but the photo sits on a light ground where there are no splats
    if (Math.min(...corner) < 150) problems.push(`${look}: the empty corner is not paper (${corner})`);
  }
  if (JSON.parse(G.text()).style !== 'comic') problems.push('the look is not reported');
  if (G.sim.toSave().settings.style !== 'comic') problems.push('the look is not saved');
  G.setStyle('no-such-look');
  if (JSON.parse(G.text()).style !== 'photo') problems.push('a bad look name did not fall back to the photo');
  G.setStyle('photo');
  return JSON.stringify({ pass: problems.length === 0, detail: problems.concat(notes).join('; ') });
})();
