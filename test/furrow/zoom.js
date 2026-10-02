/* Zooming, with no buttons to fall back on. What breaks silently: a trackpad's stream of
   small wheel deltas racing through every step at once, a pinch that also paints or walks,
   the spot under the cursor sliding away, and live mode not zooming at all.
   Driven with synthetic wheel and touch pointer events on the real canvas. */
const F = window.furrow;
F.newGame(4242);
F.render();
const cv = document.getElementById('screen');
const r = cv.getBoundingClientRect();
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
const wheel = (dy, x, y, o) => cv.dispatchEvent(new WheelEvent('wheel', Object.assign({ deltaY: dy, clientX: x, clientY: y, bubbles: true, cancelable: true }, o)));
const ptr = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
const worldUnder = (x, y) => { const k = cv.width / r.width; return [(x - r.left) * k / F.zoom + F.cam.x, (y - r.top) * k / F.zoom + F.cam.y]; };

// build mode, free camera: one mouse notch is one step, about the cursor
F.S.follow = null;
const z0 = F.zoom;
const px = r.left + r.width * 0.3, py = r.top + r.height * 0.35;
const before = worldUnder(px, py);
wheel(-100, px, py);
const z1 = F.zoom;
const after = worldUnder(px, py);
check('a mouse notch zooms in one step', z1 === z0 + 1, z0 + ' -> ' + z1);
const drift = Math.hypot(after[0] - before[0], after[1] - before[1]);
check('the spot under the cursor stays put', drift < 2, drift.toFixed(2) + 'px of world drift');

// a trackpad: twenty 3px deltas are 60, short of a step; ten more cross it, once
const zt = F.zoom;
for (let i = 0; i < 20; i++) wheel(3, cx, cy);
const zMid = F.zoom;
for (let i = 0; i < 10; i++) wheel(3, cx, cy);
check('small trackpad deltas add up to one step, not twenty', zMid === zt && F.zoom === zt - 1, zt + ' -> ' + zMid + ' -> ' + F.zoom);

// pinch: fingers 100px apart spreading to 300px roughly triples the zoom (clamped)
const zp = F.zoom, tool = F.S.tool, selB = F.S.selB;
ptr('pointerdown', 1, cx - 50, cy); ptr('pointerdown', 2, cx + 50, cy);
for (let s = 50; s <= 150; s += 10) { ptr('pointermove', 1, cx - s, cy); ptr('pointermove', 2, cx + s, cy); }
ptr('pointerup', 2, cx + 150, cy); ptr('pointerup', 1, cx - 150, cy);
const zIn = F.zoom;
check('spreading two fingers zooms in', zIn > zp, zp + ' -> ' + zIn);
check('the pinch picked nothing and changed no tool', F.S.tool === tool && F.S.selB === selB && !F.S.follow);
ptr('pointerdown', 1, cx - 150, cy); ptr('pointerdown', 2, cx + 150, cy);
for (let s = 150; s >= 40; s -= 10) { ptr('pointermove', 1, cx - s, cy); ptr('pointermove', 2, cx + s, cy); }
ptr('pointerup', 1, cx - 40, cy); ptr('pointerup', 2, cx + 40, cy);
check('pinching back zooms out', F.zoom < zIn, zIn + ' -> ' + F.zoom);

// live mode zooms too, and a pinch there does not send her walking
const v = F.V.find((p) => !p.gone);
F.liveAs(v);
F.render();
const zl = F.zoom;
wheel(-100, cx, cy);
check('the wheel zooms in live mode', F.zoom === zl + 1, zl + ' -> ' + F.zoom);
v.path = null;
ptr('pointerdown', 1, cx - 40, cy); ptr('pointerdown', 2, cx + 40, cy);
for (let s = 40; s <= 120; s += 10) { ptr('pointermove', 1, cx - s, cy); ptr('pointermove', 2, cx + s, cy); }
ptr('pointerup', 1, cx - 120, cy); ptr('pointerup', 2, cx + 120, cy);
check('a pinch in live mode does not walk anywhere', !v.path, 'zoom now ' + F.zoom + ', fitted ' + F.liveZoom);

return JSON.stringify({ pass: checks.every(Boolean), detail: notes.join('; ') });
