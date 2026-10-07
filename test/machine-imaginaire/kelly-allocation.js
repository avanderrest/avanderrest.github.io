/* A chance grid deals colours out in exact shares — a colour covering 40% of the photo
   gets 40% of the panels, give or take the one panel rounding needs — and the panels on
   the canvas really are the colours that were dealt. */
const M = window.__machine;
const c = document.createElement('canvas');
c.width = 100; c.height = 100;
const x = c.getContext('2d');
[['#d9442a', 40], ['#1f3b73', 30], ['#f2e8d5', 18], ['#2f6b3a', 12]].reduce((y, [col, n]) => { x.fillStyle = col; x.fillRect(0, y, 100, n); return y + n; }, 0);
M.setPhotoData(x.getImageData(0, 0, 100, 100), 'test');
const problems = [];
const notes = [];
for (const grid of [5, 12, 23]) {
  const r = M.render({ seed: 'kelly-' + grid, style: 'kelly', params: { grid, fill: 'flat', gap: 0 } });
  const P = M.palette();
  const sum = r.counts.reduce((a, b) => a + b, 0);
  if (sum !== r.cells) problems.push(grid + ': dealt ' + sum + ' of ' + r.cells);
  r.counts.forEach((n, i) => { if (Math.abs(n - P[i].w * r.cells) >= 1) problems.push(grid + ': ' + P[i].hex + ' got ' + n + ' for ' + (P[i].w * r.cells).toFixed(2)); });
  // read each panel's centre back off the canvas
  const cols = grid, rows = r.cells / cols;
  const img = M.S && document.getElementById('art').getContext('2d').getImageData(0, 0, M.W, M.H).data;
  let wrong = 0;
  for (let i = 0; i < r.cells; i++) {
    const px = Math.floor(((i % cols) + 0.5) * M.W / cols), py = Math.floor((Math.floor(i / cols) + 0.5) * M.H / rows);
    const k = (py * M.W + px) * 4;
    const hex = '#' + [img[k], img[k + 1], img[k + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    if (hex !== P[r.deck[i]].hex) wrong++;
  }
  if (wrong) problems.push(grid + ': ' + wrong + ' panels painted the wrong colour');
  notes.push(grid + ' cols: ' + r.counts.join('/') + ' of ' + r.cells);
}
M.clearPhoto();
return JSON.stringify({ pass: !problems.length, detail: (problems.join('; ') || 'ok') + ' — ' + notes.join('; ') });
