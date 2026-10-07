/* A photo's colours carry their shares through. A made-up photo that is 40% red,
   35% blue and 25% white has to come back as those three colours at those shares,
   and its light map has to see the red top and the white bottom. */
const M = window.__machine;
const w = 100, h = 100;
const c = document.createElement('canvas');
c.width = w; c.height = h;
const x = c.getContext('2d');
x.fillStyle = '#ff0000'; x.fillRect(0, 0, w, 40);
x.fillStyle = '#0000ff'; x.fillRect(0, 40, w, 35);
x.fillStyle = '#ffffff'; x.fillRect(0, 75, w, 25);
const a = M.analyse(x.getImageData(0, 0, w, h));
const want = { '#ff0000': 0.4, '#0000ff': 0.35, '#ffffff': 0.25 };
const problems = [];
if (a.palette.length !== 3) problems.push(a.palette.length + ' colours');
for (const p of a.palette) {
  if (!(p.hex in want)) problems.push('unexpected ' + p.hex);
  else if (Math.abs(p.w - want[p.hex]) > 0.02) problems.push(p.hex + ' at ' + p.w);
}
if (a.palette[0].hex !== '#ff0000') problems.push('ground is ' + a.palette[0].hex);
const top = a.lum.slice(0, 16), bottom = a.lum.slice(-16);
if (top !== '4'.repeat(16)) problems.push('top light row ' + top);
if (bottom !== 'f'.repeat(16)) problems.push('bottom light row ' + bottom);
// the link form has to decode to exactly the same palette
const round = M.decodePal(M.encodePal(a.palette));
if (JSON.stringify(round) !== JSON.stringify(a.palette)) problems.push('link round trip changed it');
return JSON.stringify({
  pass: !problems.length,
  detail: (problems.join('; ') || 'ok') + ' — ' + a.palette.map((p) => p.hex + ' ' + (p.w * 100).toFixed(1) + '%').join(', ') + '; light ' + top + '/' + bottom,
});
