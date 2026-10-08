/* The Cluttered Study: the screen. The painted study on a canvas with every thing in it,
   the owl's riddle in the bar above, the detector's ripples and beeps, dragging things
   about (with a mark where the thing in hand will come to rest), zoom by wheel, pinch or
   the buttons, and the owl's turn. Nothing in here changes the rules. */

import { createStudy, W, H, FLOOR, HUNT, CHARGE, THING, THINGS, centre, clamp } from './sim.js';
import { paintRoom, drawRoomLive, drawThing, drawGhost, drawLive, drawShadow, LIVE } from './art.js';
import { newSeed } from '../lib/rng.js';
import { seedForPage, writeSeed } from '../lib/seed.js';
import { store, setting } from '../lib/save.js';
import { createAudio } from '../lib/audio.js';
import { frameLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
// v1 gave every thing a slot on a labelled shelf; v2 has ninety things and no slots
const save = store('the-cluttered-study-save-v2', { was: [{ key: 'the-cluttered-study-save-v1', upgrade: () => null }] });
const seenHelp = setting('the-cluttered-study-seen-help', false);
const audio = createAudio('the-cluttered-study-sound');
const ZMAX = 3;
const DRAG_PX = 7;            // screen px a press must move before it is a drag, not a tap
const RIPPLE = 1.5;           // seconds a detector ripple lasts
const NEXT_AFTER = 1700;      // ms from a find to the next riddle
const OWL_GUESSES = 3;
const HEAT_COL = { cold: [120, 170, 255], cool: [150, 210, 230], warm: [255, 210, 110], hot: [255, 150, 60], here: [255, 90, 70], owl: [200, 160, 255] };
const HEAT_WORD = { cold: 'Cold', cool: 'Cool', warm: 'Warm', hot: 'Hot!', here: 'Right here!' };
const BEEPS = { cold: [1, 300], cool: [2, 420], warm: [3, 560], hot: [4, 760], here: [6, 980] };

const $ = (s) => document.querySelector(s);
const canvas = $('#cs-room'), ctx = canvas.getContext('2d');
const nameOf = (kind) => THING[kind].name;

// ---------- the game ----------
const loaded = save.load();
const seed = seedForPage(loaded && loaded.seed != null ? loaded.seed : newSeed());
let study = createStudy({ saved: loaded, seed, on: onEvent });
if (study.S.seed !== seed) study.newMess(seed);

let room = null, dpr = 1, base = 1, cssW = 1, cssH = 1, fitted = false;
const cam = { z: 1, x: 0, y: 0 };
let mode = 'hunt';            // 'hunt' | 'pick' (choosing a thing for the owl) | 'owl' (it is guessing)
let drag = null;              // { it, dx, dy } while a thing is held
const ripples = [];           // { x, y, t, level }
const sparks = [];            // { x, y, vx, vy, t, life, col }
const falls = new Map();      // thing -> { y0, t, dur }: a dropped thing falling to rest
let anim = 0, dirty = false, sinceSave = 0, toastTimer = 0, nextTimer = 0, owlPick = null, doneStars = null;

function persist() { save.save(study.S); dirty = false; sinceSave = 0; }

// ---------- events from the sim ----------
function onEvent(e, d = {}) {
  switch (e) {
    case 'clue': showClue(); owlTalk(); break;
    case 'hint':
      showClue();
      if (d.level >= 2) toast(d.level === 2 ? 'The owl is looking somewhere around there…' : 'Very close to that glow.');
      sfx('hoot'); owlTalk(); persist(); break;
    case 'found': {
      const it = study.byKind(d.kind), m = centre(it);
      burst(m.x, m.y, 26, [255, 220, 120]);
      sfx('found');
      toast(`Yes! The ${nameOf(d.kind)}.  ${'★'.repeat(d.stars)}${'☆'.repeat(3 - d.stars)}`);
      showClue(); updateHud(); owlTalk(); persist();
      clearTimeout(nextTimer);
      // turns alternate: the owl spied, so now you spy (the owl's next riddle follows that)
      nextTimer = setTimeout(() => { startSpy(); toast('Your turn to spy!'); }, NEXT_AFTER);
      break;
    }
    case 'hunt-done': doneStars = d.stars; break;   // shown after your last turn
    case 'under': ripple(d.x, d.y, 'here'); sfx('here'); toast('Right here, but underneath something. Move things aside.'); break;
    case 'resting': sfx('rest'); toast('The detector is recharging. Look a little first.'); break;
    case 'ping': ripple(d.x, d.y, d.level); sfx('ping', d.level); updateHud(); dirty = true; break;
    case 'lift': sfx('pick'); break;
    case 'drop': {
      const it = study.byKind(d.kind);
      if (it.y - d.from.y > 8) falls.set(it, { y0: d.from.y, t: 0, dur: Math.min(0.5, 0.18 + (it.y - d.from.y) / 900), away: d.away });
      else sfx(d.away ? 'tidy' : 'thud');
      updateHud(); persist(); break;
    }
    case 'put': { const it = study.byKind(d.kind), m = centre(it); burst(m.x, m.y, 8, [190, 255, 160]); break; }
    case 'spotless': sfx('fanfare'); toast('Spotless! Every thing in its place.'); setTimeout(spotless, 900); break;
    case 'mess': falls.clear(); ripples.length = 0; showClue(); updateHud(); persist(); break;
    case 'spy': updateHud(); persist(); break;
  }
}

// ---------- the clue bar ----------
function showClue() {
  const el = $('#cs-clue'), hint = $('#cs-hint'), c = study.cur, done = study.S.hunt.done.length;
  let html, h = '';
  if (mode === 'pick') { html = 'Your turn! Tap the thing you are thinking of.'; h = 'The owl has its eyes covered. No peeking!'; }
  else if (mode === 'owl') { html = el.innerHTML; h = hint.textContent; }
  else if (c) {
    html = `I spy <em>${THING[c.kind].clue}</em>.`;
    h = c.hints ? THING[c.kind].hint : '';
  } else if (done >= HUNT) { html = 'All eight found! Tidy up, or let the cat in.'; h = 'Put things away on any shelf, the sill or the desk.'; }
  else { html = 'Well spotted…'; }
  if (el.innerHTML !== html) { el.innerHTML = html; el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
  hint.textContent = h;
  $('#cs-hintbtn').hidden = mode !== 'hunt';
  $('#cs-hintbtn').disabled = !c || c.hints >= 3;
  $('#cs-cancel').hidden = mode !== 'pick';
  $('#cs-spy').hidden = !(mode === 'hunt' && !c && done >= HUNT);   // between turns the game hands you your turn itself
  $('#cs-owl').classList.toggle('hide', mode === 'pick');   // no peeking while you choose
  $('#cs-found').textContent = `${done} / ${HUNT}`;
}
function owlTalk(think = false) {
  const o = $('#cs-owl');
  o.classList.toggle('think', think);
  o.classList.remove('talk'); void o.offsetWidth; if (!think) o.classList.add('talk');
}
let lastCharge = -1;
function updateHud() {
  const S = study.S, n = study.putAway();
  $('#cs-tidy').textContent = `${n} / ${THINGS.length}`;
  $('#cs-tidybar').style.width = `${(n / THINGS.length) * 100}%`;
  $('#cs-score').textContent = `Owl ${S.owl.owl} · You ${S.owl.you}`;
  $('#cs-found').textContent = `${S.hunt.done.length} / ${HUNT}`;
  updateCharge(true);
}
function updateCharge(force) {
  const q = Math.round(study.S.charge * 20);
  if (!force && q === lastCharge) return;
  lastCharge = q;
  const box = $('#cs-charge');
  if (box.children.length !== CHARGE) box.innerHTML = '<i></i>'.repeat(CHARGE);
  [...box.children].forEach((el, i) => el.style.setProperty('--f', `${clamp(study.S.charge - i, 0, 1) * 100}%`));
}
function toast(text, ms = 2600) {
  const t = $('#cs-toast');
  t.textContent = text; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- sound ----------
function sfx(name, arg) {
  const a = audio;
  switch (name) {
    case 'ping': {
      const [n, f] = BEEPS[arg] || BEEPS.cold, gap = arg === 'here' ? 0.07 : 0.11;
      for (let i = 0; i < n; i++) a.tone({ freq: f, to: f * 1.04, dur: 0.07, type: 'square', vol: 0.022, delay: i * gap });
      a.tone({ freq: f / 2, dur: 0.25, type: 'sine', vol: 0.03 });
      break;
    }
    case 'here': for (let i = 0; i < 6; i++) a.tone({ freq: 980, dur: 0.06, type: 'square', vol: 0.022, delay: i * 0.07 }); break;
    case 'found': [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone({ freq: f, dur: 0.35, type: 'triangle', vol: 0.05, delay: i * 0.07 })); a.noise({ dur: 0.5, vol: 0.02, filter: 'highpass', freq: 6000, delay: 0.2 }); break;
    case 'rest': a.tone({ freq: 150, to: 120, dur: 0.12, type: 'sine', vol: 0.05 }); break;
    case 'pick': a.tone({ freq: 520, to: 740, dur: 0.07, type: 'sine', vol: 0.035 }); break;
    case 'thud': a.noise({ dur: 0.12, vol: 0.06, filter: 'lowpass', freq: 380 }); a.tone({ freq: 110, to: 70, dur: 0.1, type: 'sine', vol: 0.05 }); break;
    case 'tidy': a.noise({ dur: 0.04, vol: 0.05, filter: 'bandpass', freq: 1800, q: 3 }); a.tone({ freq: 880, dur: 0.18, type: 'triangle', vol: 0.04, delay: 0.03 }); a.tone({ freq: 1320, dur: 0.25, type: 'triangle', vol: 0.03, delay: 0.09 }); break;
    case 'hoot': a.tone({ freq: 392, to: 370, dur: 0.22, type: 'sine', vol: 0.06 }); a.tone({ freq: 349, to: 330, dur: 0.32, type: 'sine', vol: 0.06, delay: 0.26 }); break;
    case 'owlping': a.tone({ freq: 660, dur: 0.3, type: 'sine', vol: 0.04 }); a.tone({ freq: 990, dur: 0.3, type: 'sine', vol: 0.03, delay: 0.08 }); break;
    case 'fanfare': [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => a.tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.05, delay: i * 0.11 })); break;
    case 'wrong': a.tone({ freq: 330, to: 262, dur: 0.3, type: 'triangle', vol: 0.04 }); break;
    case 'cat': a.tone({ freq: 700, to: 500, dur: 0.35, type: 'sawtooth', vol: 0.015 }); a.tone({ freq: 520, to: 760, dur: 0.3, type: 'triangle', vol: 0.03, delay: 0.32 }); a.noise({ dur: 0.6, vol: 0.05, filter: 'bandpass', freq: 900, delay: 0.5 }); break;
  }
}

// ---------- effects ----------
function ripple(x, y, level) { ripples.push({ x, y, t: 0, level }); if (ripples.length > 8) ripples.shift(); }
function burst(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, life: 0.6 + Math.random() * 0.6, col });
  }
}

// ---------- drawing ----------
function fit() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  cssW = r.width || 1; cssH = r.height || 1;
  // the room covers the frame: on a tall phone frame it is cut at the sides, and dragging
  // the wall looks along it
  base = Math.max(cssW / W, cssH / H);
  if (!fitted) { cam.x = (W - cssW / base) / 2; fitted = true; }
  clampCam();
}
function clampCam() {
  cam.z = clamp(cam.z, 1, ZMAX);
  const vw = cssW / (base * cam.z), vh = cssH / (base * cam.z);
  cam.x = clamp(cam.x, 0, Math.max(0, W - vw)); cam.y = clamp(cam.y, 0, Math.max(0, H - vh));
}
function toRoom(cx, cy) {
  const r = canvas.getBoundingClientRect();
  return { x: (cx - r.left) / (base * cam.z) + cam.x, y: (cy - r.top) / (base * cam.z) + cam.y };
}
function toScreen(x, y) {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (x - cam.x) * base * cam.z, y: r.top + (y - cam.y) * base * cam.z };
}

const onShelf = (it) => it.y < FLOOR.y0 - 1;
function render() {
  const k = dpr * base * cam.z;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2c2a4c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
  if (room) ctx.drawImage(room, 0, 0, W, H);
  drawRoomLive(ctx, anim);

  // where the thing in hand will come to rest if let go: a pale copy, and the shelf lit
  if (drag) {
    const it = drag.it, r = study.restFor(it.kind, it.x, it.y);
    if (Math.abs(r.y - it.y) > 4 || Math.abs(r.x - it.x) > 4) {
      ctx.save(); ctx.translate(r.x, r.y); drawGhost(ctx, it.kind, 0.28 + Math.sin(anim * 6) * 0.08); ctx.restore();
    }
    if (r.on) {
      ctx.fillStyle = `rgba(255,220,140,${0.35 + Math.sin(anim * 6) * 0.1})`;
      ctx.fillRect(r.on.x0, r.on.y - 2, r.on.x1 - r.on.x0, 3);
    }
  }

  // the hint's glow
  const c = study.cur, T = study.target;
  if (c && c.glow && T && mode === 'hunt') {
    const m = centre(T), gx = m.x + c.glow.dx, gy = m.y + c.glow.dy, rad = c.glow.r * (1 + Math.sin(anim * 2.4) * 0.05);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(gx, gy, rad * 0.2, gx, gy, rad);
    g.addColorStop(0, 'rgba(255,215,120,0.22)'); g.addColorStop(0.75, 'rgba(255,200,100,0.12)'); g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(gx, gy, rad, 0, Math.PI * 2); ctx.setLineDash([6, 10]); ctx.lineDashOffset = -anim * 20;
    ctx.strokeStyle = 'rgba(255,220,140,0.5)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  }

  // the things, in order; the one in hand last, lifted
  for (const it of study.S.items) {
    if (drag && drag.it === it) continue;
    let y = it.y;
    const f = falls.get(it);
    if (f) { const p = Math.min(1, f.t / f.dur); y = f.y0 + (it.y - f.y0) * p * p; }
    ctx.save(); ctx.translate(it.x, y); ctx.rotate(it.rot);
    if (!onShelf(it) || (f && f.t < f.dur)) drawShadow(ctx, it);
    drawThing(ctx, it.kind);
    if (LIVE.has(it.kind)) drawLive(ctx, it.kind, anim);
    if (owlPick === it) { ctx.restore(); ctx.save(); outline(it, 'rgba(200,160,255,0.9)'); }
    ctx.restore();
  }
  if (drag) {
    const it = drag.it;
    ctx.save(); ctx.translate(it.x, it.y + 6);
    ctx.beginPath(); ctx.ellipse(0, 0, THING[it.kind].w * 0.5, 6, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,4,16,0.3)'; ctx.fill();
    ctx.translate(0, -12); ctx.scale(1.08, 1.08);
    drawThing(ctx, it.kind);
    if (LIVE.has(it.kind)) drawLive(ctx, it.kind, anim);
    ctx.restore();
  }

  // detector ripples: rings out from the tap and a wave either side, coloured by heat
  for (const r of ripples) {
    const p = r.t / RIPPLE, [cr, cg, cb] = HEAT_COL[r.level], hot = { cold: 0.2, cool: 0.4, warm: 0.6, hot: 0.85, here: 1, owl: 0.7 }[r.level];
    for (let i = 0; i < 3; i++) {
      const q = p * 1.4 - i * 0.18;
      if (q <= 0 || q >= 1) continue;
      ctx.beginPath(); ctx.arc(r.x, r.y, 8 + q * (40 + hot * 70), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(1 - q) * 0.9})`; ctx.lineWidth = 3 + hot * 3; ctx.stroke();
    }
    const fade = Math.max(0, 1 - p * 1.1);
    if (fade > 0) {
      const bars = 9, reach = 30 + hot * 110;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${fade * 0.85})`;
      for (const s of [-1, 1]) for (let i = 0; i < bars; i++) {
        const x = r.x + s * (22 + (i / bars) * reach), env = Math.sin((1 - i / bars) * Math.PI * 0.5);
        const h = (4 + hot * 26) * env * (0.55 + 0.45 * Math.abs(Math.sin(anim * 22 + i * 1.7 + s)));
        ctx.fillRect(x - 1.5, r.y - h, 3, h * 2);
      }
      if (HEAT_WORD[r.level]) {
        ctx.font = `800 ${16 + hot * 6}px Nunito, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 4; ctx.strokeStyle = `rgba(30,20,40,${fade})`; ctx.strokeText(HEAT_WORD[r.level], r.x, r.y - 30 - p * 16);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${fade})`; ctx.fillText(HEAT_WORD[r.level], r.x, r.y - 30 - p * 16);
      }
    }
  }
  for (const s of sparks) {
    const a = 1 - s.t / s.life;
    ctx.fillStyle = `rgba(${s.col[0]},${s.col[1]},${s.col[2]},${a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.5 + a * 2.5, 0, Math.PI * 2); ctx.fill();
  }
}
function outline(it, col) {
  const t = THING[it.kind];
  ctx.translate(it.x, it.y); ctx.rotate(it.rot);
  ctx.beginPath(); ctx.roundRect(-t.w / 2 - 6, -t.h - 6, t.w + 12, t.h + 12, 10);
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.lineDashOffset = -anim * 18; ctx.stroke(); ctx.setLineDash([]);
}

function update(dt) {
  anim += dt;
  study.step(dt);
  updateCharge(false);
  for (let i = ripples.length - 1; i >= 0; i--) if ((ripples[i].t += dt) > RIPPLE) ripples.splice(i, 1);
  for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt; if (s.t > s.life) sparks.splice(i, 1); }
  for (const [it, f] of falls) { f.t += dt; if (f.t >= f.dur) { falls.delete(it); sfx(f.away ? 'tidy' : 'thud'); } }
  if (dirty && (sinceSave += dt) > 5) persist();
  render();
}

// ---------- input ----------
const pointers = new Map();
let press = null, pinch = null;
function pinchState() {
  const [a, b] = [...pointers.values()];
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    if (drag) { study.drop(drag.it, drag.it.x, drag.it.y); drag = null; }
    press = null;
    const p = pinchState(); pinch = { ...p, z: cam.z, at: toRoom(p.mx, p.my) };
    return;
  }
  if (pointers.size > 2) return;
  const at = toRoom(e.clientX, e.clientY);
  const pad = e.pointerType === 'mouse' ? 0 : 6;
  press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, at, it: mode === 'owl' ? null : study.topAt(at.x, at.y, pad), moved: false, cam: { ...cam } };
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const p = pinchState();
    zoomAt(pinch.z * p.d / pinch.d, p.mx, p.my, pinch.at);
    return;
  }
  const at = toRoom(e.clientX, e.clientY);
  if (!press || press.id !== e.pointerId) {
    if (e.pointerType === 'mouse' && !drag) canvas.className = mode !== 'owl' && study.topAt(at.x, at.y) ? 'grab' : '';
    return;
  }
  if (!press.moved && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > DRAG_PX) {
    press.moved = true;
    if (press.it && mode !== 'owl') {
      const it = press.it;
      drag = { it, dx: it.x - press.at.x, dy: it.y - press.at.y };
      study.lift(it); falls.delete(it);
      canvas.className = 'grabbing';
    }
  }
  if (!press.moved) return;
  if (drag) { study.hold(drag.it, at.x + drag.dx, at.y + drag.dy); dirty = true; }
  else {
    const k = base * cam.z;
    cam.x = press.cam.x - (e.clientX - press.sx) / k; cam.y = press.cam.y - (e.clientY - press.sy) / k; clampCam();
  }
});
function release(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; press = null; return; }
  if (!press || press.id !== e.pointerId) return;
  const p = press; press = null;
  if (e.type === 'pointercancel') { if (drag) { study.drop(drag.it, drag.it.x, drag.it.y); drag = null; } return; }
  if (drag) { const it = drag.it; drag = null; study.drop(it, it.x, it.y); canvas.className = ''; return; }
  if (!p.moved) tap(p.at.x, p.at.y, p.it);
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(cam.z * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });
function zoomAt(z, cx, cy, anchor) {
  const at = anchor || toRoom(cx, cy), r = canvas.getBoundingClientRect();
  cam.z = clamp(z, 1, ZMAX);
  cam.x = at.x - (cx - r.left) / (base * cam.z); cam.y = at.y - (cy - r.top) / (base * cam.z);
  clampCam();
}
function zoomStep(f) { const r = canvas.getBoundingClientRect(); zoomAt(cam.z * f, r.left + r.width / 2, r.top + r.height / 2); }

function tap(x, y, it) {
  if (mode === 'hunt') { study.ping(x, y); return; }
  if (mode === 'pick' && it) { owlPick = it; askDescription(it); }
}

// ---------- the owl's turn ----------
function startSpy() {
  if (mode !== 'hunt') return;
  mode = 'pick'; owlPick = null; showClue(); owlTalk();
}
// Your turn is over (guessed, or skipped): the owl spies next, or the mess is done.
function endSpy() {
  mode = 'hunt'; owlPick = null; owlTalk();
  if (!study.cur && study.S.hunt.done.length < HUNT) { study.next(); persist(); }
  showClue();
  if (doneStars != null) { const st = doneStars; doneStars = null; setTimeout(() => huntDone(st), 400); }
}
function askDescription(it) {
  dialog(`
    <h2>I spy…</h2>
    <p>Describe the <b>${nameOf(it.kind)}</b> for the owl, without saying what it is.</p>
    <form id="cs-spyform">
      <input type="text" id="cs-desc" autocomplete="off" placeholder="something shiny that…" maxlength="120" />
      <p class="muted">Colours, what it is made of, what it does, what shape it is: the owl knows a lot of words.</p>
      <div class="row"><button type="button" class="cs-btn" id="cs-spyback" style="background:var(--parch)">Pick another</button><button type="submit" class="cs-btn">Ask the owl</button></div>
    </form>`);
  const input = $('#cs-desc');
  setTimeout(() => input.focus(), 30);
  $('#cs-spyback').onclick = () => { closeDialog(); owlPick = null; };
  $('#cs-spyform').onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    closeDialog();
    owlGuess(it, text);
  };
}
async function owlGuess(it, text) {
  mode = 'owl'; showClue();
  const el = $('#cs-clue'), hint = $('#cs-hint');
  const say = (h, small = '') => { el.innerHTML = h; hint.textContent = small; el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  say(`“I spy ${escapeHtml(text.replace(/^i spy\s*/i, ''))}”`, 'The owl is thinking…');
  owlTalk(true);
  await wait(1300);
  let ranked = study.guess(text).map((g) => g.kind);
  if (!ranked.length) ranked = study.S.items.map((x) => x.kind).sort(() => Math.random() - 0.5);
  let got = false;
  for (let i = 0; i < Math.min(OWL_GUESSES, ranked.length); i++) {
    const g = study.byKind(ranked[i]), m = centre(g);
    ripple(m.x, m.y, 'owl'); sfx('owlping'); owlTalk();
    say(i === 0 ? `Hoo… is it the <em>${nameOf(g.kind)}</em>?` : `Then is it the <em>${nameOf(g.kind)}</em>?`, `Guess ${i + 1} of ${OWL_GUESSES}`);
    await wait(1500);
    if (g === it) { got = true; break; }
    sfx('wrong');
    await wait(500);
  }
  if (got) { burst(centre(it).x, centre(it).y, 20, [200, 160, 255]); sfx('found'); say('Hoo-hoo! I got it!', `It was the ${nameOf(it.kind)}. Try a trickier clue next time.`); }
  else { sfx('fanfare'); say('You got me!', `It was the ${nameOf(it.kind)}. I would never have guessed.`); }
  study.spyRound(got);
  await wait(2800);
  endSpy();
}
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- dialogs ----------
function dialog(html) { $('#cs-card').innerHTML = html; $('#cs-dialog').hidden = false; }
function closeDialog() { $('#cs-dialog').hidden = true; }
$('#cs-dialog').addEventListener('click', (e) => { if (e.target.id === 'cs-dialog' && mode !== 'pick') closeDialog(); });
function howTo() {
  dialog(`
    <h2>The Cluttered Study</h2>
    <p>The cat has been in the wizard's study again. The owl has spotted something in the mess and will give you a riddle for it.</p>
    <ul>
      <li><b>Tap the thing</b> you think it means.</li>
      <li>Tap anywhere else and the <b>detector beeps</b>: faster, higher and warmer in colour the nearer you are. It holds five pings and refills by itself.</li>
      <li>Things <b>hide under other things</b>. Drag them aside to look.</li>
      <li><b>Put things away</b> wherever you like: let go of a thing over a shelf, the window sill or the desk and it stands there. A pale copy shows where it will land.</li>
      <li><b>Hint</b> gives a plainer clue, then shows roughly where to look.</li>
      <li><b>Turns go back and forth.</b> Once you find the owl's thing, it is your turn: pick a thing, describe it, and see if the owl can guess (it covers its eyes while you choose). Then the owl spies again.</li>
      <li>Zoom with the wheel, a pinch, or the + and − buttons.</li>
    </ul>
    <p class="muted">There is no timer. Take as long as you like.</p>
    <div class="row"><button type="button" class="cs-btn" id="cs-ok">Let's look</button></div>`);
  $('#cs-ok').onclick = () => { seenHelp.set(true); closeDialog(); if (cssW / base < W - 40) toast('Drag the wall to look around.'); };
}
function huntDone(stars) {
  if (!$('#cs-dialog').hidden) return;
  const n = study.putAway();
  dialog(`
    <h2>All eight found!</h2>
    <p class="stars">${'★'.repeat(Math.round(stars / HUNT))}${'☆'.repeat(3 - Math.round(stars / HUNT))}</p>
    <p>${stars} of ${HUNT * 3} stars. ${n === THINGS.length ? 'And the study is spotless.' : `${THINGS.length - n} things are still on the floor.`}</p>
    <div class="row"><button type="button" class="cs-btn" id="cs-keep" style="background:var(--parch)">Keep tidying</button><button type="button" class="cs-btn" id="cs-again">Let the cat in</button></div>`);
  $('#cs-keep').onclick = closeDialog;
  $('#cs-again').onclick = () => { closeDialog(); newMess(); };
}
function spotless() {
  if (!$('#cs-dialog').hidden) return;
  dialog(`
    <h2>Spotless!</h2>
    <p>All ${THINGS.length} things are off the floor and put away. The owl is very impressed.</p>
    <div class="row"><button type="button" class="cs-btn" id="cs-keep" style="background:var(--parch)">Admire it</button><button type="button" class="cs-btn" id="cs-again">Let the cat in</button></div>`);
  $('#cs-keep').onclick = closeDialog;
  $('#cs-again').onclick = () => { closeDialog(); newMess(); };
}
function newMess() {
  mode = 'hunt'; owlPick = null; doneStars = null;
  clearTimeout(nextTimer);
  const s = newSeed();
  writeSeed(s);
  sfx('cat');
  study.newMess(s);
  study.next();
  toast('The cat has been in again…');
  persist();
}

// ---------- buttons ----------
$('#cs-hintbtn').onclick = () => study.hint();
$('#cs-cancel').onclick = endSpy;
$('#cs-spy').onclick = startSpy;
$('#cs-mess').onclick = newMess;
$('#cs-howto').onclick = howTo;
$('#cs-zin').onclick = () => zoomStep(1.4);
$('#cs-zout').onclick = () => zoomStep(1 / 1.4);
const soundBtn = $('#cs-sound');
const showSound = () => { soundBtn.innerHTML = `♪ <span class="lg">Sound ${audio.on ? 'on' : 'off'}</span>`; soundBtn.style.opacity = audio.on ? 1 : 0.6; };
soundBtn.onclick = () => { audio.toggle(); showSound(); };
showSound();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') { if (!$('#cs-dialog').hidden && mode !== 'pick') closeDialog(); else if (mode === 'pick') endSpy(); }
  if (e.key === '+' || e.key === '=') zoomStep(1.4);
  if (e.key === '-') zoomStep(1 / 1.4);
});
window.addEventListener('resize', fit);
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------- start ----------
fit();
if (!study.cur && study.S.hunt.done.length < HUNT) study.next();
showClue(); updateHud();
persist();
frameLoop(update).start();
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { room = paintRoom(); });
if (!seenHelp.get()) howTo();
else if (cssW / base < W - 40) setTimeout(() => toast('Drag the wall to look around.'), 600);

expose('__study', {
  get S() { return study.S; },
  get study() { return study; },
  get mode() { return mode; },
  get cam() { return cam; },
  toScreen, toRoom, startSpy, newMess, owlGuess,
  ready: () => !!room,
  text: () => JSON.stringify({ seed: study.S.seed, mode, cur: study.cur, done: study.S.hunt.done.length, putAway: study.putAway(), charge: +study.S.charge.toFixed(2), cam }),
});
