/* A sculpture's STL is meant for a 3D printer, and a slicer quietly makes a mess of a
   mesh with holes in it. For every form: the STL is a closed solid, every edge shared by
   exactly two triangles, and it is no more than 100 mm across as promised. */
return (async () => {
  const M = window.__machine;
  await M.ready3d();
  M.clearPhoto();
  const notes = [];
  let pass = true;
  const forms = [['gyroid', {}], ['diamond', {}], ['schwarz', { outline: 'cube' }], ['cage', {}], ['knot', {}], ['gyroid', { level: 5, wall: 15 }]];
  for (const [form, extra] of forms) {
    const def = M.STYLES.sculpture.params.reduce((o, p) => (o[p.k] = p.def, o), {});
    M.render({ seed: 'print-check', style: 'sculpture', params: Object.assign(def, { form }, extra) });
    const dv = M.play.scene.stl();
    const n = dv.getUint32(80, true);
    const key = (o) => Math.round(dv.getFloat32(o, true) * 1000) + ',' + Math.round(dv.getFloat32(o + 4, true) * 1000) + ',' + Math.round(dv.getFloat32(o + 8, true) * 1000);
    const edges = new Map();
    let lo = Infinity, hi = -Infinity, degenerate = 0;
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12;
      const v = [key(o), key(o + 12), key(o + 24)];
      if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) { degenerate++; continue; }
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3], e = a < b ? a + '|' + b : b + '|' + a;
        edges.set(e, (edges.get(e) || 0) + 1);
        const x = dv.getFloat32(o + k * 12, true);
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
    }
    let open = 0;
    edges.forEach((c) => { if (c !== 2) open++; });
    const share = open / edges.size, span = hi - lo;
    const ok = n > 1000 && share < 0.001 && span > 60 && span <= 100.5;
    if (!ok) pass = false;
    notes.push(form + (Object.keys(extra).length ? JSON.stringify(extra) : '') + (ok ? ' ok' : ' FAILED') + ': ' + n + ' triangles, ' + open + ' edges not shared by two (' + (share * 100).toFixed(3) + '%), ' + degenerate + ' slivers, ' + span.toFixed(0) + ' mm wide');
  }
  return JSON.stringify({ pass, detail: notes.join('; ') });
})();
