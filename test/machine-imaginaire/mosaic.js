/* The mosaic has to be the photo: a photo dark on the left and light on the right gives a
   mosaic with ink on the left and bare paper on the right. A portrait photo is cropped to
   the picture's shape rather than squashed, and the tone map rides in the link. */
const M = window.__machine;
const c = document.createElement('canvas');
c.width = 120; c.height = 75;
const x = c.getContext('2d');
x.fillStyle = '#ffffff'; x.fillRect(0, 0, 120, 75);
x.fillStyle = '#101010'; x.fillRect(0, 0, 60, 75);
M.setPhotoData(x.getImageData(0, 0, 120, 75), 'half');
M.render({ seed: 'mosaic', style: 'knowlton', params: { cells: 80, glyphs: 'symbols', colour: 'ink', contrast: 120 } });
const d = document.getElementById('art').getContext('2d').getImageData(0, 0, M.W, M.H).data;
const paper = [d[(10 * M.W + M.W - 10) * 4], d[(10 * M.W + M.W - 10) * 4 + 1], d[(10 * M.W + M.W - 10) * 4 + 2]];
const inked = (x0, x1) => {
  let ink = 0, n = 0;
  for (let y = 20; y < M.H - 20; y += 7) for (let px = x0; px < x1; px += 7) {
    const k = (y * M.W + px) * 4;
    if (Math.abs(d[k] - paper[0]) + Math.abs(d[k + 1] - paper[1]) + Math.abs(d[k + 2] - paper[2]) > 60) ink++;
    n++;
  }
  return ink / n;
};
const left = inked(60, M.W / 2 - 120), right = inked(M.W / 2 + 120, M.W - 60);
const problems = [];
if (left < 0.6) problems.push('dark half only ' + Math.round(left * 100) + '% ink');
if (right > 0.05) problems.push('light half ' + Math.round(right * 100) + '% ink');
if (!/tone=[0-9a-f]{4000}/.test(location.hash)) problems.push('no tone map in the link');
// a tall photo: dark band across the middle third — cropped, the band fills the middle of the picture
const t = document.createElement('canvas');
t.width = 60; t.height = 150;
const tx = t.getContext('2d');
tx.fillStyle = '#ffffff'; tx.fillRect(0, 0, 60, 150);
tx.fillStyle = '#101010'; tx.fillRect(0, 50, 60, 50);
const a = M.analyse(tx.getImageData(0, 0, 60, 150));
const rows = Array.from({ length: 50 }, (_, j) => a.tone.slice(j * 80, j * 80 + 80));
const darkRows = rows.filter((r) => /^[01]+$/.test(r)).length;
if (darkRows < 40) problems.push('portrait not cropped: ' + darkRows + ' of 50 tone rows dark');
M.clearPhoto();
return JSON.stringify({ pass: !problems.length, detail: (problems.join('; ') || 'ok') + ' — ink left ' + Math.round(left * 100) + '%, right ' + Math.round(right * 100) + '%, portrait dark rows ' + darkRows + '/50' });
