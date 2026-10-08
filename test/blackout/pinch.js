/* Two fingers pinch the zoom on a touch screen, and a pinch is never also a tap.

   On a tablet there is no wheel and no +/- key, so pinching is the only way to zoom. The
   fingers are synthetic touch pointers on the canvas: spread them apart and the camera
   must zoom in, bring them together and it must zoom out, and lifting them must not walk
   the agent anywhere. Then the Follow button must bring the camera back. */
const B = window.__blackout;
const notes = [];
let pass = true;
const check = (name, ok, extra) => { if (!ok) pass = false; notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };

B.newGame('normal');
B.start();
const S = B.state;
const cv = document.querySelector('canvas');
const r = cv.getBoundingClientRect();
const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
const fire = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true }));
const P = S.player;
const at = [P.x, P.y, P.lv].join(',');

const z0 = B.cam.zoom;
fire('pointerdown', 1, cx - 40, cy);
fire('pointerdown', 2, cx + 40, cy);
for (let i = 1; i <= 5; i++) { fire('pointermove', 1, cx - 40 - i * 12, cy); fire('pointermove', 2, cx + 40 + i * 12, cy); }
const z1 = B.cam.zoom;
fire('pointerup', 2, cx + 100, cy);
fire('pointerup', 1, cx - 100, cy);
check('spreading two fingers zooms in', z1 > z0 * 1.2, z0.toFixed(2) + ' -> ' + z1.toFixed(2));

fire('pointerdown', 1, cx - 120, cy);
fire('pointerdown', 2, cx + 120, cy);
for (let i = 1; i <= 5; i++) { fire('pointermove', 1, cx - 120 + i * 16, cy); fire('pointermove', 2, cx + 120 - i * 16, cy); }
const z2 = B.cam.zoom;
fire('pointerup', 1, cx - 40, cy);
fire('pointerup', 2, cx + 40, cy);
check('pinching them together zooms out', z2 < z1 * 0.8, z1.toFixed(2) + ' -> ' + z2.toFixed(2));
check('a pinch is not a tap: the agent stays put', [P.x, P.y, P.lv].join(',') === at, at + ' -> ' + [P.x, P.y, P.lv].join(','));

check('after a pinch the camera is loose', B.cam.free === true);
await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
const follow = document.getElementById('tb-follow');
check('and the Follow button shows', !follow.hidden);
follow.click();
check('which puts the camera back on the agent', B.cam.free === false);

return JSON.stringify({ pass, detail: notes.join('; ') });
