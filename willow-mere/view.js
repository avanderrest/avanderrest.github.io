/* Willow Mere: the screen. A camera follows the boat over the lake painted by art.js, the
   water moves (glints, lapping, wakes, rings from the oars), the light goes round from misty
   dawn to a starlit night with a lantern on the bow, and keys, a held finger or the mouse
   become oar strokes. Sound and the music that follows your rowing live here too. Nothing in
   here changes the rules. */

import { createMere, W, H, GENTLE, TRUST_TIME, HOLD_CAP, LITTER, YOUNG, FRIENDS, TANGLED, PULL, dayPhase, clamp, wrapAngle } from './sim.js';
import { paintLand, paintWater, drawLily, drawFrog, drawLitter, drawBird, drawRaft, drawFriend, drawBoat, oarAngle, oarTip, drawBadge, makeCanvas } from './art.js';
import { streamFor, newSeed } from '../lib/rng.js';
import { store, setting } from '../lib/save.js';
import { readSeed, writeSeed } from '../lib/seed.js';
import { createAudio, whenUnlocked } from '../lib/audio.js';
import { fixedLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const save = store('willow-mere-save-v1');
const seenHelp = setting('willow-mere-seen-help', false);
const audio = createAudio('willow-mere-sound');
const VIEW_SPAN = 560;           // world px across the window's shorter side, before clamping
const TOP_SPEED = 105;           // about as fast as steady rowing gets, for the music and the wake
const FONT = '"Patrick Hand", "Segoe Print", cursive';
const KEY_BOTH = ['KeyW', 'ArrowUp', 'Space'], KEY_LEFT = ['KeyA', 'ArrowLeft'], KEY_RIGHT = ['KeyD', 'ArrowRight'], KEY_BACK = ['KeyS', 'ArrowDown'], KEY_HELP = ['KeyE', 'Enter'];
const CONTROL = new Set([...KEY_BOTH, ...KEY_LEFT, ...KEY_RIGHT, ...KEY_BACK, ...KEY_HELP]);
// the light through the day: phase, multiply tint, glow colour, glow strength, mist, night
const SKY = [
  [0.00, '#c9bad6', '#ffd7c0', 0.14, 0.8, 0.25],
  [0.08, '#e6dcdc', '#ffe2c4', 0.10, 0.45, 0],
  [0.18, '#f6f1e6', '#fff1d6', 0.06, 0.08, 0],
  [0.30, '#ffffff', '#ffffff', 0.0, 0, 0],
  [0.52, '#ffffff', '#ffffff', 0.0, 0, 0],
  [0.62, '#f7d9ac', '#ffb04d', 0.16, 0, 0],
  [0.70, '#d9a9b2', '#ff8a5c', 0.14, 0.05, 0.12],
  [0.77, '#6c6f9e', '#9a7ad0', 0.06, 0.06, 0.75],
  [0.82, '#3d4c84', '#000000', 0.0, 0.05, 1],
  [0.94, '#3d4c84', '#000000', 0.0, 0.14, 1],
  [1.00, '#c9bad6', '#ffd7c0', 0.14, 0.8, 0.25],
];
const TIMES = [[0.1, 'Misty dawn'], [0.3, 'Morning'], [0.55, 'Midday'], [0.68, 'Golden hour'], [0.78, 'Dusk'], [0.97, 'Night'], [1, 'First light']];

const $ = (s) => document.querySelector(s);
const canvas = $('#wm-lake'), ctx = canvas.getContext('2d');
const tint = makeCanvas(2, 2), tctx = tint.getContext('2d');
let vw = 0, vh = 0, dpr = 1, Z = 1;
const cam = { x: W / 2, y: H / 2 };

// ---------- the game ----------
const urlSeed = readSeed();
let saved = save.load();
let carried = 0;
if (saved && urlSeed != null && saved.seed !== urlSeed) { carried = (saved.lakes || 0) + (saved.done ? 1 : 0); saved = null; }
const m = createMere({ saved, seed: urlSeed ?? newSeed(), on: onEvent });
if (carried) m.S.lakes = carried;
writeSeed(m.S.seed);

let art = null;            // the painted lake and its little lives
let anim = 0, lastNow = performance.now();
const ripples = [];        // rings on the water: { x, y, r, grow, life, age, a }
const floats = [];         // words that rise and fade: { x, y, text, age }
const oarView = { L: { phi: 0.08, lift: 0, ph: -1, swirl: 0 }, R: { phi: 0.08, lift: 0, ph: -1, swirl: 0 } };
const keys = new Set();
const pointer = { down: false, x: 0, y: 0, id: null };
let helpHeld = false, dirty = false, frozen = false;
const seen = new Set();    // hints already given this visit

function onEvent(ev, d = {}) {
  const b = m.S.boat;
  switch (ev) {
    case 'stroke': sfx.stroke(d.oars === 'both', d.dir < 0, d.rhythm); break;
    case 'pickup':
      sfx.pickup(); ring(d.x, d.y, 4, 26, 0.9, 0.5);
      say(d.x, d.y - 10, `+ ${LITTER[d.kind].name.replace(/^an? /, '')}`);
      once('pickup', 'Into the boat it goes. When she is full, row back to the crate on the jetty.');
      break;
    case 'full': hint(`The boat is full (${HOLD_CAP}). Row back to the crate on the jetty to empty her.`); break;
    case 'drop':
      sfx.drop();
      if (!d.left) { hint(`Emptied into the crate. ${m.S.tidied} of ${m.S.litter.length} pieces tidied.`); say(m.lake.jetty.end.x, m.lake.jetty.end.y - 24, `${m.S.tidied} / ${m.S.litter.length}`); }
      break;
    case 'bump': sfx.bump(Math.min(1, d.v / 90)); break;
    case 'startle':
      sfx.peep(2); ring(d.x, d.y, 3, 20, 0.7, 0.5);
      once('startle', d.kind === 'duckling' ? 'Too quick! The ducklings scattered. Stop rowing and let the boat glide in slowly.' : 'Too quick! The cygnets scattered. Stop rowing and let the boat glide in slowly.');
      break;
    case 'join':
      sfx.peep(1); say(d.x, d.y - 10, d.kind === 'duckling' ? 'peep!' : 'cheep!');
      if (d.n === 1) once('join-' + d.kind, d.kind === 'duckling' ? 'A duckling has decided to trust you and follows your wake. Lead it home to its mother in the reeds, not too fast.' : 'A cygnet is following you. Its mother, the swan, waits by her nest.');
      break;
    case 'left':
      sfx.peep(1); say(d.x, d.y - 10, 'wait!');
      once('left-' + d.kind, d.kind === 'duckling' ? 'A duckling could not keep up and has stopped. Row a little slower with little ones behind you.' : 'A cygnet could not keep up and has stopped. Row a little slower with little ones behind you.');
      break;
    case 'deliver': sfx.quack(d.kind === 'duckling'); break;
    case 'home': {
      sfx.chimes(3); say(d.x, d.y - 12, `${d.n} / ${d.of}`);
      if (d.n === d.of) hint(d.kind === 'duckling' ? 'Every duckling is home with mum.' : 'All the cygnets are safe with the swan.');
      break;
    }
    case 'board': {
      sfx.hop(); const name = FRIENDS[d.kind].name;
      hint(`${cap(name)} hopped aboard. ${d.kind === 'cat' ? 'Take the kitten back to the cottage by the jetty.' : `Its ${FRIENDS[d.kind].home === 'bramble' ? 'bramble' : 'stump'} home is along the shore. Look for the marker.`}`);
      break;
    }
    case 'hop': sfx.hop(); break;
    case 'land': sfx.chimes(4); hint(`${cap(FRIENDS[d.kind].name)} is home safe.`); say(b.x, b.y - 30, 'thank you!'); break;
    case 'freed': sfx.chimes(5); ring(d.x, d.y, 6, 40, 1.2, 0.6); hint(`You untangled ${TANGLED[d.kind]}. It shakes out its feathers and paddles off.`); break;
    case 'complete': setTimeout(showComplete, 2200); sfx.chimes(9); break;
    case 'newlake': buildArt(); writeSeed(m.S.seed); snapCamera(); break;
    case 'save': dirty = true; break;
  }
  hud();
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- the painted lake ----------
function buildArt() {
  const land = paintLand(m.lake), water = paintWater(m.lake, land);
  const life = streamFor(m.lake.seed, 'life');
  const lake = m.lake, sd = (x, y) => lake.sdAt(x, y);
  const nests = Object.values(lake.nests).map((n) => n.anchor);
  // lily pads in clusters, a few with flowers and frogs
  const lilies = [];
  for (let c = 0; c < 16; c++) {
    let cx = 0, cy = 0;
    for (let t = 0; t < 200; t++) {
      cx = 150 + life() * (W - 300); cy = 150 + life() * (H - 300);
      const d = sd(cx, cy);
      if (d > 36 && d < 150 && nests.every((n) => Math.hypot(n.x - cx, n.y - cy) > 90) && Math.hypot(cx - lake.jetty.end.x, cy - lake.jetty.end.y) > 160) break;
    }
    const n = 4 + Math.floor(life() * 8);
    for (let i = 0; i < n; i++) {
      const a = life() * Math.PI * 2, r = life() * 42;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
      if (sd(x, y) < 20) continue;
      lilies.push({ x, y, r: 7 + life() * 8, a: life() * Math.PI * 2, ph: life() * 10, dark: life() < 0.4, flower: life() < 0.22 ? (life() < 0.5 ? '#f3a8c2' : '#fbf3ea') : null, frog: life() < 0.12 ? { gone: 0 } : null });
    }
  }
  const glints = [];
  for (let i = 0; glints.length < 900 && i < 20000; i++) {
    const x = life() * W, y = life() * H;
    if (sd(x, y) > 26) glints.push({ x, y, ph: life() * 100, len: 4 + life() * 9, sp: 0.8 + life() * 1.4 });
  }
  const flies = [];
  for (let i = 0; flies.length < 70 && i < 8000; i++) {
    const x = life() * W, y = life() * H, d = sd(x, y);
    if (d > -90 && d < 30) flies.push({ x, y, ph: life() * 100, r: 10 + life() * 30 });
  }
  const darts = land.reeds.slice(0, 8).map((r, i) => ({ x: r.x, y: r.y - 10, hx: r.x, hy: r.y - 10, t: 0, ph: i * 1.7, col: ['#3c8fd8', '#4bb39a', '#c0503a'][i % 3] }));
  const runs = land.runs.map((r) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of r) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { pts: r, x0, y0, x1, y1 };
  });
  art = { land, water, lilies, glints, flies, darts, runs, fish: 2 };
  hud();
}

// ---------- the camera ----------
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  Z = clamp(Math.min(vw, vh) / VIEW_SPAN, 0.62, 1.6);
  Z = Math.max(Z, vw / (W - 200), vh / (H - 200));
  tint.width = Math.max(2, Math.ceil(vw / 2)); tint.height = Math.max(2, Math.ceil(vh / 2));
}
function clampCam() {
  const hw = vw / 2 / Z, hh = vh / 2 / Z;
  cam.x = clamp(cam.x, hw, W - hw); cam.y = clamp(cam.y, hh, H - hh);
}
function snapCamera() { cam.x = m.S.boat.x; cam.y = m.S.boat.y; clampCam(); }
function followCamera(dt) {
  const b = m.S.boat;
  const tx = b.x + b.vx * 0.9, ty = b.y + b.vy * 0.9;
  const k = 1 - Math.exp(-2.2 * dt);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  clampCam();
}
const toWorld = (sx, sy) => ({ x: cam.x + (sx - vw / 2) / Z, y: cam.y + (sy - vh / 2) / Z });
const toScreen = (x, y) => ({ x: (x - cam.x) * Z + vw / 2, y: (y - cam.y) * Z + vh / 2 });

// ---------- the light ----------
function sky(ph) {
  let i = 1; while (i < SKY.length - 1 && SKY[i][0] < ph) i++;
  const a = SKY[i - 1], b = SKY[i], f = clamp((ph - a[0]) / (b[0] - a[0]), 0, 1);
  const mix = (x, y) => { const h = (s) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)); const A = h(x), B = h(y); return A.map((v, k) => Math.round(v + (B[k] - v) * f)); };
  return { mul: mix(a[1], b[1]), glow: mix(a[2], b[2]), glowA: a[3] + (b[3] - a[3]) * f, mist: a[4] + (b[4] - a[4]) * f, night: a[5] + (b[5] - a[5]) * f };
}
const timeName = (ph) => TIMES.find(([p]) => ph < p)[1];

// ---------- drawing ----------
function ring(x, y, r, grow, life, a = 0.45) { ripples.push({ x, y, r, grow, life, age: 0, a }); if (ripples.length > 160) ripples.shift(); }
function say(x, y, text) { floats.push({ x, y, text, age: 0 }); if (floats.length > 12) floats.shift(); }

function render() {
  const now = performance.now(), dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  if (!art) return;
  if (!frozen) anim += dt;
  followCamera(dt);
  const S = m.S, t = anim, ph = dayPhase(S.clock), L = sky(ph);
  const hw = vw / 2 / Z, hh = vh / 2 / Z;
  const x0 = Math.max(0, cam.x - hw - 2), y0 = Math.max(0, cam.y - hh - 2), x1 = Math.min(W, cam.x + hw + 2), y1 = Math.min(H, cam.y + hh + 2);
  const vis = (x, y, pad = 60) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#3d6a4a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * Z, 0, 0, dpr * Z, dpr * (vw / 2 - cam.x * Z), dpr * (vh / 2 - cam.y * Z));
  ctx.imageSmoothingEnabled = true;

  // the water
  ctx.drawImage(art.water, x0 * 0.5, y0 * 0.5, (x1 - x0) * 0.5, (y1 - y0) * 0.5, x0, y0, x1 - x0, y1 - y0);
  // sunlight glints by day
  const day = 1 - L.night;
  if (day > 0.05) {
    ctx.strokeStyle = '#f2fbf6'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (const gl of art.glints) {
      if (!vis(gl.x, gl.y, 10)) continue;
      const s = Math.sin(t * gl.sp + gl.ph); if (s < 0.55) continue;
      ctx.globalAlpha = (s - 0.55) * 1.6 * day * 0.7;
      ctx.beginPath(); ctx.moveTo(gl.x - gl.len / 2, gl.y); ctx.quadraticCurveTo(gl.x, gl.y - 1.5, gl.x + gl.len / 2, gl.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // water lapping at the bank
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const r of art.runs) {
    if (r.x1 < x0 - 20 || r.x0 > x1 + 20 || r.y1 < y0 - 20 || r.y0 > y1 + 20) continue;
    ctx.beginPath(); r.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.setLineDash([]); ctx.strokeStyle = `rgba(226,244,234,${0.16 + 0.08 * Math.sin(t * 0.9)})`; ctx.lineWidth = 14; ctx.stroke();
    ctx.setLineDash([9, 17]); ctx.lineDashOffset = -t * 7; ctx.strokeStyle = 'rgba(244,252,247,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.setLineDash([]);
  // the wake: two lines spreading from the stern, fading with age
  const trail = S.trail;
  for (let i = 1; i < trail.length; i++) {
    const p = trail[i], q = trail[i - 1], age = S.clock - p.t;
    if (age > 3.2) break;
    const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const sp1 = 7 + age * 13, sp0 = 7 + (S.clock - q.t) * 13;
    ctx.strokeStyle = `rgba(240,250,246,${0.38 * (1 - age / 3.2)})`; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(q.x + nx * sp0, q.y + ny * sp0); ctx.lineTo(p.x + nx * sp1, p.y + ny * sp1);
    ctx.moveTo(q.x - nx * sp0, q.y - ny * sp0); ctx.lineTo(p.x - nx * sp1, p.y - ny * sp1); ctx.stroke();
  }
  // a bow wave when she is moving
  const spd = m.speed(), b = S.boat;
  if (spd > 15) {
    const hx = Math.cos(b.a), hy = Math.sin(b.a), a = clamp(spd / TOP_SPEED, 0, 1) * 0.5;
    ctx.strokeStyle = `rgba(244,252,248,${a})`; ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(b.x + hx * 34, b.y + hy * 34); ctx.quadraticCurveTo(b.x + hx * 24 - hy * s * 18, b.y + hy * 24 + hx * s * 18, b.x + hx * 8 - hy * s * 22, b.y + hy * 8 + hx * s * 22); ctx.stroke(); }
  }
  // rings
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i]; r.age += dt;
    if (r.age > r.life) { ripples.splice(i, 1); continue; }
    if (!vis(r.x, r.y)) continue;
    const k = r.age / r.life, rad = r.r + r.grow * Math.sqrt(k);
    ctx.strokeStyle = `rgba(240,250,246,${r.a * (1 - k)})`; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // lily pads and frogs
  for (const p of art.lilies) {
    if (!vis(p.x, p.y)) continue;
    drawLily(ctx, p, t);
    if (p.frog) {
      if (p.frog.gone > 0) p.frog.gone -= dt;
      else if (Math.hypot(b.x - p.x, b.y - p.y) < 70) { p.frog.gone = 25; ring(p.x + 6, p.y + 4, 2, 22, 1, 0.6); sfx.plop(); }
      else drawFrog(ctx, p.x, p.y, p.a + 2);
    }
  }
  // what floats: litter, rafts, birds
  for (const l of S.litter) if (l.state === 'water' && vis(l.x, l.y)) drawLitter(ctx, l, t);
  for (const f of S.friends) {
    if (vis(f.rx, f.ry)) drawRaft(ctx, f.raft, f.rx, f.ry, f.ra, t, f.ph);
    if (f.state === 'adrift' && vis(f.x, f.y)) drawFriend(ctx, f.kind, f.rx + Math.sin(t * 0.7 + f.ph) * 3, f.ry - 2, f.ra + Math.PI / 2 + Math.sin(t * 0.5) * 0.4, t);
  }
  for (const tg of S.tangled) if (vis(tg.x, tg.y)) drawBird(ctx, tg.kind, tg.x, tg.y, tg.a, t, tg.ph, { tangled: tg.state === 'tangled' });
  for (const [who, mo] of Object.entries(S.mothers)) {
    if (S.chain.some((id) => YOUNG[S.young[id].kind].mother === who)) {
      // she looks up when you bring her young near: a soft ring round her
      const k = (t * 0.8) % 1;
      ctx.strokeStyle = `rgba(255,248,220,${0.6 * (1 - k)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(mo.x, mo.y, 20 + k * 30, (20 + k * 30) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (vis(mo.x, mo.y)) drawBird(ctx, who, mo.x, mo.y, mo.a, t, who === 'duck' ? 1 : 2);
  }
  for (const y of S.young) {
    if (!vis(y.x, y.y)) continue;
    drawBird(ctx, y.kind, y.x, y.y, y.a, t * 1.6, y.ph);
    // making up its mind about the boat: a little ring filling above it
    if (y.state === 'lost' && y.trust > 0) {
      const k = y.trust / TRUST_TIME;
      ctx.strokeStyle = 'rgba(255,250,232,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(y.x, y.y - 14, 4.5, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    }
    // a little wake when paddling hard
    if (y.state !== 'lost' && Math.random() < dt * 2) ring(y.x - Math.cos(y.a) * 6, y.y - Math.sin(y.a) * 6, 2, 8, 0.8, 0.3);
  }
  // the boat and her oars
  const lamp = clamp((L.night - 0.1) / 0.6, 0, 1);
  for (const side of ['L', 'R']) {
    const o = m.oars[side], v = oarView[side];
    const a = oarAngle(o.ph, v.phi); v.phi = a.phi; v.lift = a.lift;
    const caught = o.ph >= 0 && (v.ph < 0 || o.ph < v.ph);
    const finished = v.ph >= 0 && v.ph < PULL && o.ph >= PULL;
    if (caught || finished || (o.ph >= 0 && o.ph < PULL && (v.swirl -= dt) < 0)) {
      const tip = oarTip(b, side, v.phi);
      ring(tip.x, tip.y, caught ? 3 : 2, caught ? 26 : 14, caught ? 1.4 : 0.9, caught ? 0.6 : 0.35);
      v.swirl = 0.14;
    }
    v.ph = o.ph;
  }
  drawBoat(ctx, b, oarView, { litter: S.hold.map((id) => S.litter[id].kind), friends: S.friends.filter((f) => f.state === 'aboard').map((f) => f.kind) }, t, lamp);
  for (const f of S.friends) if (f.state === 'hop') drawFriend(ctx, f.kind, f.x, f.y - Math.sin(Math.PI * clamp(f.t / 1.6, 0, 1)) * 16, Math.atan2(m.lake.homes[f.kind].home.y - f.fy, m.lake.homes[f.kind].home.x - f.fx), t);

  // the land over it all
  ctx.drawImage(art.land.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  // the crate on the jetty, filling up
  drawCrate(ctx, m.lake.jetty, S.tidied / S.litter.length, S.hold.length > 0 && Math.hypot(b.x - m.lake.jetty.end.x, b.y - m.lake.jetty.end.y) < 140, t);
  // the friends who got home, sitting by their doors
  for (const f of S.friends) if (f.state === 'home') { const h = m.lake.homes[f.kind].home; drawFriend(ctx, f.kind, h.x + 14, h.y + 6, Math.PI * 0.5 + Math.sin(t * 0.4) * 0.3, t, 0.9); }
  // markers over the homes of whoever is aboard
  for (const f of S.friends) if (f.state === 'aboard') { const h = m.lake.homes[f.kind].home; marker(h.x, h.y - 40, t); }
  // dragonflies by day
  if (day > 0.3) for (const d of art.darts) {
    d.t -= dt;
    if (d.t <= 0) { d.t = 0.6 + Math.random() * 1.6; d.hx = d.x + (Math.random() - 0.5) * 120; d.hy = d.y + (Math.random() - 0.5) * 80; }
    d.x += (d.hx - d.x) * Math.min(1, dt * 4); d.y += (d.hy - d.y) * Math.min(1, dt * 4);
    if (!vis(d.x, d.y)) continue;
    ctx.globalAlpha = day;
    ctx.fillStyle = d.col; ctx.fillRect(d.x - 4, d.y - 0.8, 8, 1.6);
    ctx.fillStyle = 'rgba(230,245,255,0.6)'; const fl = Math.sin(t * 60 + d.ph) * 1.5;
    ctx.beginPath(); ctx.ellipse(d.x, d.y - 3, 1.6, 3.5 + fl, 0.3, 0, Math.PI * 2); ctx.ellipse(d.x, d.y + 3, 1.6, 3.5 - fl, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // cloud shadows drifting over everything
  if (day > 0.2) {
    for (let i = 0; i < 5; i++) {
      const cx = ((i * 717 + t * 9) % (W + 1000)) - 500, cy = (i * 431) % H, r = 260 + (i % 3) * 90;
      if (!vis(cx, cy, r)) continue;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(30,50,60,${0.1 * day})`); gr.addColorStop(1, 'rgba(30,50,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  // words that rise
  ctx.font = `20px ${FONT}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.age += dt;
    if (f.age > 2) { floats.splice(i, 1); continue; }
    const a = f.age < 0.2 ? f.age / 0.2 : 1 - (f.age - 0.2) / 1.8;
    ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(50,40,30,0.7)'; ctx.lineWidth = 3.5; ctx.strokeText(f.text, f.x, f.y - f.age * 18);
    ctx.fillStyle = '#fff8e6'; ctx.fillText(f.text, f.x, f.y - f.age * 18);
  }
  ctx.globalAlpha = 1;

  // the light: tint the whole scene, then let the lamps through
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = 'source-over';
  tctx.fillStyle = `rgb(${L.mul.join(',')})`; tctx.fillRect(0, 0, tint.width, tint.height);
  if (L.night > 0.02) {
    tctx.globalCompositeOperation = 'lighter';
    const lights = [];
    const bow = { x: b.x + Math.cos(b.a) * 28, y: b.y + Math.sin(b.a) * 28 };
    lights.push([bow.x, bow.y, 190, 0.85]);
    for (const w of art.land.windows) lights.push([w.x, w.y, 90, 0.75]);
    lights.push([m.lake.jetty.end.x, m.lake.jetty.end.y, 70, 0.4]);
    for (const [x, y, r, a] of lights) {
      const s = toScreen(x, y), sx = s.x / 2, sy = s.y / 2, rr = r * Z / 2;
      if (sx < -rr || sy < -rr || sx > tint.width + rr || sy > tint.height + rr) continue;
      const gr = tctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
      gr.addColorStop(0, `rgba(255,210,140,${a * L.night})`); gr.addColorStop(0.5, `rgba(200,150,90,${a * 0.45 * L.night})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      tctx.fillStyle = gr; tctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(tint, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  if (L.glowA > 0.01) {
    ctx.globalCompositeOperation = 'screen';
    const gr = ctx.createLinearGradient(0, 0, canvas.width * 0.6, canvas.height);
    gr.addColorStop(0, `rgba(${L.glow.join(',')},${L.glowA * 1.6})`); gr.addColorStop(1, `rgba(${L.glow.join(',')},0)`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }
  // the world again, for what shines at night: stars in the water, fireflies, the lamp glass
  ctx.setTransform(dpr * Z, 0, 0, dpr * Z, dpr * (vw / 2 - cam.x * Z), dpr * (vh / 2 - cam.y * Z));
  if (L.night > 0.05) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fff6d8';
    for (const gl of art.glints) {
      if (!vis(gl.x, gl.y, 4)) continue;
      const s = Math.sin(t * gl.sp * 0.7 + gl.ph);
      if (s < 0.2) continue;
      ctx.globalAlpha = (s - 0.2) * 0.55 * L.night;
      ctx.fillRect(gl.x, gl.y, gl.len > 10 ? 1.8 : 1.1, gl.len > 10 ? 1.8 : 1.1);
    }
    for (const f of art.flies) {
      const fx = f.x + Math.sin(t * 0.4 + f.ph) * f.r, fy = f.y + Math.cos(t * 0.31 + f.ph * 1.3) * f.r * 0.6;
      if (!vis(fx, fy, 10)) continue;
      const k = Math.max(0, Math.sin(t * 1.7 + f.ph * 3));
      ctx.globalAlpha = k * L.night;
      const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, 7);
      gr.addColorStop(0, 'rgba(230,255,150,0.95)'); gr.addColorStop(1, 'rgba(160,220,80,0)');
      ctx.fillStyle = gr; ctx.fillRect(fx - 7, fy - 7, 14, 14);
    }
    ctx.globalAlpha = lamp;
    const bow = { x: b.x + Math.cos(b.a) * 28, y: b.y + Math.sin(b.a) * 28 };
    const gr = ctx.createRadialGradient(bow.x, bow.y, 0, bow.x, bow.y, 22);
    gr.addColorStop(0, 'rgba(255,220,150,0.9)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = gr; ctx.fillRect(bow.x - 22, bow.y - 22, 44, 44);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // morning mist, rolling slowly over the water
  if (L.mist > 0.01) {
    for (let i = 0; i < 9; i++) {
      const mx = ((i * 523 + t * 6) % (W + 900)) - 450, my = (i * 337 + Math.sin(t * 0.05 + i) * 60) % H, r = 280 + (i % 4) * 70;
      if (!vis(mx, my, r)) continue;
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, r);
      gr.addColorStop(0, `rgba(246,242,246,${0.42 * L.mist})`); gr.addColorStop(1, 'rgba(246,242,246,0)');
      ctx.fillStyle = gr; ctx.fillRect(mx - r, my - r, r * 2, r * 2);
    }
  }
  // screen space: a soft vignette, then the arrows to wherever you are taking someone
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
  vg.addColorStop(0, 'rgba(30,30,40,0)'); vg.addColorStop(1, `rgba(30,30,40,${0.22 + 0.15 * L.night})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
  for (const p of pointers()) edgeBadge(p, t);
  // the finger or mouse you are rowing toward
  if (pointer.down) {
    ctx.strokeStyle = 'rgba(255,250,235,0.7)'; ctx.lineWidth = 2;
    const k = (t * 1.5) % 1;
    ctx.beginPath(); ctx.ellipse(pointer.x, pointer.y, 10 + k * 14, (10 + k * 14) * 0.7, 0, 0, Math.PI * 2); ctx.globalAlpha = 1 - k; ctx.stroke(); ctx.globalAlpha = 1;
  }

  // ambient life that only needs a frame clock
  art.fish -= dt;
  if (art.fish <= 0) {
    art.fish = 1.5 + Math.random() * 4;
    const p = toWorld(Math.random() * vw, Math.random() * vh);
    if (m.sdAt(p.x, p.y) > 40) { ring(p.x, p.y, 2, 22, 1.8, 0.5); setTimeout(() => ring(p.x, p.y, 2, 16, 1.4, 0.35), 280); }
  }
  updateHelp();
  tickSound(dt, L);
}

function drawCrate(g, J, fill, active, t) {
  const x = J.end.x, y = J.end.y;
  g.fillStyle = 'rgba(30,40,30,0.3)'; g.fillRect(x - 9, y - 4, 22, 14);
  // what is in it pokes out of the top as it fills
  const n = Math.round(fill * 7);
  const cols = ['#5d9b6a', '#d23c3c', '#f2c230', '#f4f4ee', '#3b7dd8', '#2f5d3a', '#cfe6ec'];
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i]; g.fillRect(x - 9 + (i * 5) % 16, y - 17 - (i % 2) * 2, 4, 6); }
  g.fillStyle = '#5e8a4e'; g.fillRect(x - 11, y - 14, 22, 18);
  g.fillStyle = '#4a7040'; g.fillRect(x - 11, y - 8, 22, 1.6); g.fillRect(x - 11, y - 2, 22, 1.6);
  g.fillStyle = '#76a362'; g.fillRect(x - 11, y - 14, 22, 2);
  g.strokeStyle = '#f4f0e0'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y - 11); g.lineTo(x + 4.5, y - 3); g.lineTo(x - 4.5, y - 3); g.closePath(); g.stroke();
  if (active) marker(x, y - 34, t);
}
function marker(x, y, t) {
  const bob = Math.sin(t * 3) * 3;
  ctx.fillStyle = 'rgba(40,30,20,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 30, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe7a8'; ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x - 8, y - 8 + bob); ctx.lineTo(x + 8, y - 8 + bob); ctx.lineTo(x, y + 4 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
}

// Where the arrows at the edge point: whoever is aboard to their home, the young to their
// mother, a full boat to the crate, and the last few things left on the lake.
function pointers() {
  const S = m.S, out = [], lake = m.lake;
  for (const f of S.friends) if (f.state === 'aboard') out.push({ ...lake.homes[f.kind].home, what: { friend: f.kind } });
  const kinds = new Set(S.chain.map((id) => S.young[id].kind));
  for (const k of kinds) { const mo = S.mothers[YOUNG[k].mother]; out.push({ x: mo.x, y: mo.y, what: { bird: YOUNG[k].mother } }); }
  const loose = S.litter.filter((l) => l.state === 'water');
  if (m.holdWeight() >= HOLD_CAP - 1 || (S.hold.length && !loose.length)) out.push({ ...lake.jetty.end, what: { crate: true } });
  if (loose.length && loose.length <= 3) for (const l of loose) out.push({ x: l.x, y: l.y, what: { litter: l.kind } });
  const waiting = [...S.young.filter((y) => y.state === 'lost' || y.state === 'startle').map((y) => ({ x: y.x, y: y.y, what: { bird: y.kind } })),
    ...S.friends.filter((f) => f.state === 'adrift').map((f) => ({ x: f.rx, y: f.ry, what: { friend: f.kind } })),
    ...S.tangled.filter((tg) => tg.state === 'tangled').map((tg) => ({ x: tg.x, y: tg.y, what: { bird: tg.kind } }))];
  if (waiting.length && waiting.length <= 3) out.push(...waiting);
  return out;
}
function edgeBadge(p, t) {
  const s = toScreen(p.x, p.y), top = 64, pad = 30;
  if (s.x > pad && s.x < vw - pad && s.y > top && s.y < vh - pad) return;
  const cx = vw / 2, cy = (vh + top) / 2, dx = s.x - cx, dy = s.y - cy;
  const k = Math.min((vw / 2 - pad) / Math.abs(dx || 1e-6), ((vh - top) / 2 - pad) / Math.abs(dy || 1e-6));
  const x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
  ctx.save();
  ctx.fillStyle = '#f6edd9'; ctx.strokeStyle = '#8a6d4a'; ctx.lineWidth = 1.5;
  ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(18, -9); ctx.lineTo(18, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  drawBadge(ctx, x, y, 21, p.what, t);
}

// ---------- the controls ----------
const held = (list) => list.some((k) => keys.has(k));
function controls() {
  let L = false, R = false;
  const fw = held(KEY_BOTH), left = held(KEY_LEFT), right = held(KEY_RIGHT), back = held(KEY_BACK);
  if (fw) L = R = true;
  // turning: pull the outside oar; while also going ahead, rest the inside one
  if (left && !right) { R = true; if (fw) L = false; }
  if (right && !left) { L = true; if (fw) R = false; }
  if (left && right) L = R = true;
  if (!fw && !left && !right && !back && pointer.down) {
    // row toward the finger: turn with one oar, then both; near it, only let her glide in
    const w = toWorld(pointer.x, pointer.y), b = m.S.boat, d = Math.hypot(w.x - b.x, w.y - b.y);
    const err = wrapAngle(Math.atan2(w.y - b.y, w.x - b.x) - b.a);
    if (d > 36 && !(d < 170 && m.speed() > GENTLE * 0.8)) {
      if (Math.abs(err) > 0.3) { if (err > 0) L = true; else R = true; }
      else L = R = true;
    }
  }
  m.row({ L, R, back });
  m.help(held(KEY_HELP) || helpHeld);
}

window.addEventListener('keydown', (e) => {
  if (!dialog.hidden) { if (e.code === 'Escape') closeDialog(); return; }
  if (!CONTROL.has(e.code)) return;
  e.preventDefault(); keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); pointer.down = false; helpHeld = false; });
canvas.addEventListener('pointerdown', (e) => {
  pointer.down = true; pointer.id = e.pointerId; pointer.x = e.clientX; pointer.y = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
});
canvas.addEventListener('pointermove', (e) => { if (pointer.down && e.pointerId === pointer.id) { pointer.x = e.clientX; pointer.y = e.clientY; } });
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => { if (e.pointerId === pointer.id) pointer.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const helpBtn = $('#wm-help');
helpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); helpHeld = true; });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) helpBtn.addEventListener(ev, () => { helpHeld = false; });
function updateHelp() {
  const bird = m.nearHelp();
  helpBtn.hidden = !bird;
  if (bird) {
    helpBtn.style.setProperty('--p', bird.p.toFixed(3));
    helpBtn.querySelector('.wm-help-label').textContent = `Hold ${matchMedia('(pointer: coarse)').matches ? 'here' : 'E'} to untangle the ${bird.kind}`;
  }
}

// ---------- the journal ----------
const el = {
  litter: $('#wm-litter'), boat: $('#wm-boat'), duck: $('#wm-ducklings'), cyg: $('#wm-cygnets'), help: $('#wm-friends'),
  time: $('#wm-time'), hint: $('#wm-hint'), lakes: $('#wm-lakes'), sound: $('#wm-sound'),
};
let hintTimer = 0;
function hud() {
  if (!el.litter) return;
  const p = m.progress();
  el.litter.textContent = `${p.tidied} / ${p.litter}`;
  el.boat.textContent = `${p.inBoat} / ${p.cap}`;
  el.boat.parentElement.classList.toggle('full', p.inBoat >= p.cap - 1);
  el.duck.textContent = `${p.ducklings} / ${p.ducklingsOf}`;
  el.cyg.textContent = `${p.cygnets} / ${p.cygnetsOf}`;
  el.help.textContent = `${p.helped} / ${p.helpOf}`;
  for (const [node, done] of [[el.litter, p.tidied === p.litter], [el.duck, p.ducklings === p.ducklingsOf], [el.cyg, p.cygnets === p.cygnetsOf], [el.help, p.helped === p.helpOf]]) node.parentElement.classList.toggle('done', done);
  el.lakes.textContent = m.S.lakes ? `${m.S.lakes} lake${m.S.lakes > 1 ? 's' : ''} tidied before this one` : '';
  el.sound.textContent = audio.on ? '♪ Sound on' : '♪ Sound off';
}
function hint(text) {
  el.hint.textContent = text; el.hint.classList.add('show');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => el.hint.classList.remove('show'), 5200);
}
function once(key, text) { if (seen.has(key)) return; seen.add(key); hint(text); }
setInterval(() => { el.time.textContent = timeName(dayPhase(m.S.clock)); }, 1000);

// ---------- dialogs ----------
const dialog = $('#wm-dialog'), dialogBody = $('#wm-dialog-body');
function openDialog(html, buttons) {
  dialogBody.innerHTML = html;
  const row = document.createElement('div'); row.className = 'wm-actions';
  for (const [label, fn, primary] of buttons) {
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = label; if (primary) bt.className = 'primary';
    bt.addEventListener('click', () => { closeDialog(); fn && fn(); });
    row.appendChild(bt);
  }
  dialogBody.appendChild(row);
  dialog.hidden = false; keys.clear(); pointer.down = false;
  row.querySelector('button.primary, button')?.focus();
}
function closeDialog() { dialog.hidden = true; }
dialog.addEventListener('pointerdown', (e) => { if (e.target === dialog) closeDialog(); });
function showHelp() {
  openDialog(`<h2>Willow Mere</h2>
    <p>A quiet lake that needs a little looking after. Nothing can go wrong here, so take your time.</p>
    <ul>
      <li><b>Row</b> with <kbd>W</kbd> / <kbd>↑</kbd> / <kbd>Space</kbd> (both oars), turn with <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd>, back water with <kbd>S</kbd> / <kbd>↓</kbd>. Hold a key and the oars keep a steady stroke; press again just as they come round for a stronger one.</li>
      <li>Or <b>hold the mouse or a finger</b> on the water and the boat rows toward it.</li>
      <li><b>Litter</b> goes in the boat as you pass over it. When she is full, empty her into the crate on the jetty.</li>
      <li><b>Lost ducklings and cygnets</b> are shy. Glide in slowly and wait beside them, nearly still, until they decide to trust you. Then they follow your wake, but they can't keep up if you race off. Lead them to their mothers by the reeds.</li>
      <li><b>Animals adrift</b> hop aboard if you come alongside gently. Take them home.</li>
      <li><b>Birds caught in fishing line</b>: stop beside them and hold <kbd>E</kbd> to untangle.</li>
    </ul>`, [['Off we go', () => seenHelp.set(true), true]]);
}
function showComplete() {
  const n = m.S.lakes + 1;
  openDialog(`<h2>The mere is tidy</h2>
    <p>Every piece of litter is in the crate, every duckling and cygnet is home, and the hedgehog, the field mouse and the kitten are back where they belong.</p>
    <p class="quiet">${n === 1 ? 'Your first lake.' : `That makes ${n} lakes.`} You can keep rowing here as long as you like, or find another lake that needs you.</p>`,
  [['Keep rowing', null], ['Row to a new lake', () => m.newLake(newSeed()), true]]);
}
function askNewLake() {
  openDialog(`<h2>A new lake?</h2><p>${m.S.done ? 'This one is tidy. ' : 'This lake is not finished yet, and its progress will be lost. '}A new lake has new shores, new litter and new little ones to find.</p>`,
    [['Stay here', null], ['Row to a new lake', () => m.newLake(newSeed()), true]]);
}
$('#wm-howto').addEventListener('click', showHelp);
$('#wm-new').addEventListener('click', askNewLake);
el.sound.addEventListener('click', () => { audio.toggle(); hud(); });

// ---------- sound ----------
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];       // D major pentatonic
const CHORDS = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]];
const music = { next: 0, step: 0, bar: 0, note: 4, spd: 0 };
let amb = null, birdT = 3, nightT = 1;
whenUnlocked((c) => {
  const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = c.createGain(); g.gain.value = 0;
  src.connect(lp).connect(g).connect(audio.out()); src.start();
  amb = { g, lp };
});
const sfx = {
  stroke(both, back, rhythm) {
    audio.noise({ dur: 0.38, vol: both ? 0.05 : 0.035, filter: 'bandpass', freq: back ? 600 : 950, to: 360, q: 0.8 });
    audio.tone({ freq: 118, to: 96, dur: 0.16, type: 'sawtooth', vol: 0.01, delay: 0.03 });
    audio.tone({ freq: 236, to: 200, dur: 0.1, type: 'triangle', vol: 0.012, delay: 0.05 });
    audio.noise({ dur: 0.3, vol: 0.012, filter: 'highpass', freq: 2800, delay: 0.48 });
    if (rhythm) audio.tone({ freq: mtof(SCALE[5 + Math.floor(Math.random() * 5)]), dur: 2, type: 'sine', vol: 0.016, delay: 0.02 });
  },
  pickup() { audio.tone({ freq: 700, to: 1150, dur: 0.12, type: 'sine', vol: 0.03 }); audio.noise({ dur: 0.15, vol: 0.025, filter: 'bandpass', freq: 1500, q: 1.5 }); },
  drop() { audio.tone({ freq: 190, to: 150, dur: 0.12, type: 'triangle', vol: 0.045 }); audio.noise({ dur: 0.12, vol: 0.03, filter: 'lowpass', freq: 700 }); },
  bump(k) { audio.tone({ freq: 95, to: 55, dur: 0.25, type: 'sine', vol: 0.06 * k + 0.02 }); audio.noise({ dur: 0.18, vol: 0.03 * k, filter: 'lowpass', freq: 380 }); },
  peep(n) { for (let i = 0; i < n + 1; i++) audio.tone({ freq: 2700 + Math.random() * 300, to: 3300, dur: 0.06, type: 'sine', vol: 0.018, delay: i * 0.11 }); },
  quack(duck) {
    if (duck) for (let i = 0; i < 2; i++) audio.tone({ freq: 480, to: 340, dur: 0.09, type: 'square', vol: 0.016, delay: i * 0.16 });
    else audio.tone({ freq: 330, to: 270, dur: 0.24, type: 'triangle', vol: 0.03 });
  },
  plop() { audio.tone({ freq: 520, to: 150, dur: 0.13, type: 'sine', vol: 0.04 }); audio.noise({ dur: 0.1, vol: 0.02, filter: 'bandpass', freq: 900 }); },
  hop() { audio.tone({ freq: 600, to: 900, dur: 0.1, type: 'sine', vol: 0.025 }); audio.tone({ freq: 900, to: 1300, dur: 0.1, type: 'sine', vol: 0.02, delay: 0.12 }); },
  chimes(n) { for (let i = 0; i < n; i++) audio.tone({ freq: mtof(SCALE[(i * 2) % SCALE.length] + 12), dur: 2.4, type: 'sine', vol: 0.018, delay: i * 0.13 }); },
};
function tickSound(dt, L) {
  const c = amb ? audio.ctx() : null;
  if (!c || c.state !== 'running') return;
  const sp = clamp(m.speed() / TOP_SPEED, 0, 1);
  music.spd += (sp - music.spd) * Math.min(1, dt * 0.8);
  if (amb) {
    amb.g.gain.setTargetAtTime(audio.on ? 0.045 + music.spd * 0.05 : 0, c.currentTime, 0.4);
    amb.lp.frequency.setTargetAtTime(360 + music.spd * 520, c.currentTime, 0.4);
  }
  if (!audio.on) return;
  // music: a slow pentatonic wander over four chords, quicker and fuller as you row
  const eighth = 30 / (62 + 30 * music.spd);
  if (music.next < c.currentTime) music.next = c.currentTime + 0.08;
  while (music.next < c.currentTime + 0.3) {
    const when = music.next - c.currentTime, night = L.night > 0.5;
    if (music.step % 16 === 0) {
      const ch = CHORDS[music.bar % 4]; music.bar++;
      audio.tone({ freq: mtof(ch[0] - (night ? 12 : 0)), dur: 5, type: 'sine', vol: 0.03, delay: when, attack: 0.06 });
      for (const n of ch.slice(1)) audio.tone({ freq: mtof(n), dur: 5.5, type: 'triangle', vol: 0.0055, delay: when, attack: 0.9 });
    }
    const p = (music.step % 4 === 0 ? 0.3 : 0.1) + 0.45 * music.spd - (night ? 0.08 : 0);
    if (Math.random() < p) {
      music.note = clamp(music.note + Math.floor(Math.random() * 5) - 2, 0, SCALE.length - 1);
      const f = mtof(SCALE[music.note] - (night ? 12 : 0));
      audio.tone({ freq: f, dur: 1.7, type: 'triangle', vol: 0.016 + 0.01 * music.spd, delay: when, attack: 0.006 });
      audio.tone({ freq: f, dur: 1.2, type: 'sine', vol: 0.006, delay: when + eighth * 3, attack: 0.01 });
    }
    music.step++; music.next += eighth;
  }
  // birds by day, crickets and the odd owl by night
  birdT -= dt; nightT -= dt;
  if (L.night < 0.4 && birdT <= 0) {
    birdT = 4 + Math.random() * 7;
    const base = 2600 + Math.random() * 1400, n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) audio.tone({ freq: base * (1 + (i % 2) * 0.12), to: base * 1.25, dur: 0.07, type: 'sine', vol: 0.008, delay: i * 0.09 });
  }
  if (L.night > 0.5 && nightT <= 0) {
    nightT = 0.7 + Math.random() * 0.6;
    for (let i = 0; i < 3; i++) audio.tone({ freq: 4400, dur: 0.035, type: 'sine', vol: 0.004, delay: i * 0.06 });
    if (Math.random() < 0.03) { audio.tone({ freq: 400, to: 360, dur: 0.4, type: 'sine', vol: 0.02, delay: 0.1 }); audio.tone({ freq: 380, to: 330, dur: 0.6, type: 'sine', vol: 0.02, delay: 0.7 }); }
  }
}

// ---------- saving ----------
function persist() { save.save(m.S); dirty = false; }
setInterval(() => { if (dirty) persist(); }, 2000);
setInterval(persist, 20000);
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------- start ----------
resize();
window.addEventListener('resize', () => { resize(); clampCam(); });
requestAnimationFrame(() => setTimeout(() => {
  buildArt();
  snapCamera();
  $('#wm-loading').hidden = true;
  if (!seenHelp.get()) showHelp();
  loop.start();
}, 30));
const loop = fixedLoop({ step: (dt) => { if (!frozen) { controls(); m.step(dt); } }, render });

expose('__mere', {
  get S() { return m.S; },
  sim: m,
  get lake() { return m.lake; },
  get art() { return art; },
  text() { return JSON.stringify(m.progress()); },
  teleport(x, y, a) { const b = m.S.boat; b.x = x; b.y = y; if (a != null) b.a = a; b.vx = b.vy = b.w = 0; m.S.trail.length = 0; snapCamera(); },
  setClock(c) { m.S.clock = c; },
  freeze(on = true) { frozen = !!on; },
  render() { lastNow = performance.now(); render(); },
  newLake(seed) { m.newLake(seed ?? newSeed()); },
  toScreen,
  persist,
});
