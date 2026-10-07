/* Every style draws a real picture, with a seed's palette and with a photo's: not blank,
   not all ground, at least three colours, and quick enough to drag a slider on. */
const M = window.__machine;
const notes = [];
let pass = true;
const c = document.createElement('canvas');
c.width = 80; c.height = 50;
const x = c.getContext('2d');
const g = x.createLinearGradient(0, 0, 80, 50);
g.addColorStop(0, '#f4d35e'); g.addColorStop(0.5, '#ee964b'); g.addColorStop(1, '#0d3b66');
x.fillStyle = g; x.fillRect(0, 0, 80, 50);
const photo = x.getImageData(0, 0, 80, 50);
for (const source of ['seed', 'photo']) {
  for (const seed of ['one', 'two', 'three']) {
    if (source === 'photo') M.setPhotoData(photo, 'gradient'); else M.clearPhoto();
    for (const style of M.ORDER) {
      const t0 = performance.now();
      M.render({ seed, style });
      const ms = performance.now() - t0;
      const d = document.getElementById('art').getContext('2d').getImageData(0, 0, M.W, M.H).data;
      const seen = new Map();
      let n = 0;
      for (let py = 10; py < M.H; py += 25) for (let px = 10; px < M.W; px += 25) {
        const k = (py * M.W + px) * 4;
        const key = (d[k] >> 4) + ',' + (d[k + 1] >> 4) + ',' + (d[k + 2] >> 4);
        seen.set(key, (seen.get(key) || 0) + 1); n++;
      }
      const top = Math.max(...seen.values()) / n;
      const ok = seen.size >= 3 && top < 0.97 && ms < 1500;
      if (!ok) pass = false;
      if (!ok || seed === 'one') notes.push(source + '/' + seed + '/' + style + (ok ? '' : ' FAILED') + ': ' + seen.size + ' colours, commonest ' + Math.round(top * 100) + '%, ' + Math.round(ms) + 'ms');
    }
  }
}
M.clearPhoto();
return JSON.stringify({ pass, detail: notes.join('; ') });
