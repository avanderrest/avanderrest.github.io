/* lib/tune.js on the gummy table. Without ?tune the page has no panel and no window.__tune.
   With it (loaded here in an iframe): the panel is there, a slider changes what is drawn and
   is kept across a reload, the glow's handle sits where the glow is and dragging it moves
   the glow, Copy's text carries the new numbers, and Reset puts everything back. */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [], bad = [];
if (document.querySelector('.lt-panel') || window.__tune) bad.push('panel shows without ?tune');

const frame = document.createElement('iframe');
frame.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:700px;border:0;z-index:99999';
document.body.appendChild(frame);
async function load() {
  frame.src = location.pathname + '?tune#tab=gummy&r=' + Math.random();
  for (let i = 0; i < 100; i++) {
    await wait(100);
    const w = frame.contentWindow;
    if (w && w.__tune && w.__playground && w.document.querySelector('.lt-panel')) return w;
  }
  throw new Error('the ?tune page never came up');
}
let w = await load();
const name = 'physics-playground gummy';
let t = w.__tune[name];
w.__tune[name].reset();
const P = w.__playground;
P.show('gummy');
await wait(300);
P.run(1);

function sig() {
  const c = w.document.getElementById('c2d');
  const s = w.document.createElement('canvas'); s.width = 120; s.height = 75;
  const g = s.getContext('2d'); g.drawImage(c, 0, 0, 120, 75);
  const d = g.getImageData(0, 0, 120, 75).data;
  let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] * 3 + d[i + 2] * 7;
  return sum;
}
P.pg.toys.gummy.release && P.pg.toys.gummy.release();
const freeze = () => { P.loop && P.loop.stop && P.loop.stop(); };
freeze();
P.views.gummy.draw(); const a = sig();
P.views.gummy.draw(); if (sig() !== a) bad.push("two draws of a still table differ, so the comparison means nothing");
t.set('T', 0.6); P.views.gummy.draw(); const b = sig();
out.push(`T 0.28 -> 0.6 changes the picture by ${Math.abs(b - a)}`);
if (a === b) bad.push('moving T did not change the drawing');

// the glow's handle
const h = w.document.querySelector('.lt-handle');
await wait(100);
const c = w.document.getElementById('c2d').getBoundingClientRect(), fit = P.fit;
const hr = h.getBoundingClientRect();
const at = { x: c.left + (fit.ox + 160 * fit.s) / fit.dpr, y: c.top + (fit.oy - 60 * fit.s) / fit.dpr };
// a glow above the top of the window is held at the edge, dashed
const want = { x: Math.min(w.innerWidth - 12, Math.max(12, at.x)), y: Math.min(w.innerHeight - 12, Math.max(12, at.y)) };
if ((want.x !== at.x || want.y !== at.y) !== h.classList.contains('lt-edge')) bad.push('the handle does not say whether it is held at the edge');
const off = Math.hypot(hr.left + hr.width / 2 - want.x, hr.top + hr.height / 2 - want.y);
out.push(`glow handle ${off.toFixed(1)}px from the glow`);
if (off > 2) bad.push(`glow handle is ${off.toFixed(1)}px off`);
const x0 = hr.left + hr.width / 2, y0 = hr.top + hr.height / 2;
const ev = (type, x, y) => h.dispatchEvent(new w.PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true }));
ev('pointerdown', x0, y0); ev('pointermove', x0 + 100, y0 + 150); ev('pointerup', x0 + 100, y0 + 150);
const g = t.values.glow;
out.push(`dragged glow to ${g.x}, ${g.y}`);
if (!(g.x > 170 && g.y > -50)) bad.push('dragging the handle did not move the glow');

const text = t.copyText();
if (!/T: 0\.6,\s+\/\/ was 0\.28/.test(text) || !/glow: \{ x: [\d.]+, y: [-\d.]+ \},\s+\/\/ was/.test(text)) bad.push('Copy text is missing the changes: ' + text);

// kept across a reload
w = await load(); t = w.__tune[name];
if (t.values.T !== 0.6) bad.push(`T after reload is ${t.values.T}`);
const row = [...w.document.querySelectorAll('.lt-row')].find((r) => r.querySelector('label').textContent === 'T');
if (!row.classList.contains('lt-moved') || row.querySelector('input[type=range]').value !== '0.6') bad.push('the T row does not show the kept value');
t.reset();
if (t.values.T !== 0.28 || t.values.glow.x !== 160) bad.push('Reset did not restore the source values');
let kept = null; try { kept = w.localStorage.getItem('tune-' + name); } catch (e) { /* none */ }
if (kept !== null && kept !== 'null') bad.push('Reset left values in storage: ' + kept);
frame.remove();

return JSON.stringify({ pass: bad.length === 0, detail: out.concat(bad).join('; ') });
