/* Pocket Pal: the screen. The painted room on a canvas with the pet in it, a hand for a
   cursor (an open palm over the pet to stroke it, a pointing finger elsewhere to draw a
   trick's gesture), the status and care buttons on the left, the trick trainer on the
   right with the microphone, and the sounds. Nothing in here changes the rules. */

import { createPal, readGesture, bestCommand, W, H, FLOOR, BOWL, TRICKS, NEEDED, WORD_WINDOW, FOODS, COLOURS, STATS, clamp } from './sim.js';
import { paintRoom, paintDark, skyAt, drawPet, drawShadow, drawBowl, drawBall, drawHand, drawHeart, drawBubble, drawStar, drawNote, drawDrop, drawThought, REST, makeCanvas } from './art.js';
import { createVoice, ENGINES, hasMic, hasBrowserSpeech } from './voice.js';
import { mulberry32, newSeed } from '../lib/rng.js';
import { store, setting } from '../lib/save.js';
import { createAudio } from '../lib/audio.js';
import { fixedLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const save = store('pocket-pal-save-v1');
const seenHelp = setting('pocket-pal-seen-help', false);
const enginePref = setting('pocket-pal-voice', 'whisper');
const audio = createAudio('pocket-pal-sound');
const GESTURE_ICON = { down: '↓', up: '↑', right: '→', left: '←', circle: '↻', zigzag: '≷' };
const GESTURE_PATH = {
  down: 'M50 10 L50 60', up: 'M50 60 L50 10', right: 'M14 35 L86 35', left: 'M86 35 L14 35',
  circle: 'M50 12 A23 23 0 1 1 46 12.4', zigzag: 'M16 16 L84 28 L16 42 L84 56',
};
const STAT_LABEL = { tummy: 'Tummy', happy: 'Happiness', energy: 'Energy', clean: 'Clean' };
const STAT_ICON = { tummy: '🍖', happy: '💛', energy: '⚡', clean: '🫧' };
const MOOD_LABEL = { asleep: 'Asleep', sleepy: 'Sleepy', hungry: 'Hungry', grubby: 'Grubby', lonely: 'Lonely', happy: 'Happy', content: 'Content' };
const SAVE_EVERY = 4;   // seconds
const PET_SCALE = 1.3;  // the pet against the room

const $ = (s) => document.querySelector(s);
const canvas = $('#pp-room'), ctx = canvas.getContext('2d');
let dpr = 1, scale = 1;
let room = null, roomHour = -1;

// ---------- the game ----------
const rnd = mulberry32(newSeed());
const loaded = save.load();
let pal = null;
const fx = [];                 // floating things: { kind, x, y, vx, vy, age, life, s }
let anim = 0, dirty = true, sinceSave = 0, purrT = 0, zT = 0, noteT = 0;
let toastTimer = 0, heartT = 0;

function start(saved, name, colour) {
  pal = createPal({ saved, name, colour, rnd, on: onEvent });
  if (saved && loaded && loaded.at) pal.away((Date.now() - loaded.at) / 1000);
  buildTricks();
  updatePanels(true);
  persist();
}

function persist() { save.save({ state: pal.S, at: Date.now() }); sinceSave = 0; }

// ---------- events from the sim ----------
function onEvent(e, d = {}) {
  const P = pal ? pal.S.pet : null;
  const head = () => ({ x: P.x, y: P.y - 120 * depth(P.y) });
  switch (e) {
    case 'say': toast(d.text); break;
    case 'hearts': if (anim - heartT < 0.18) break; heartT = anim; for (let i = 0; i < Math.min(2, d.n); i++) if (fx.length < 80) spawn('heart', head().x + (rnd() - 0.5) * 70, head().y + rnd() * 20, (rnd() - 0.5) * 30, -40 - rnd() * 30, 1.4); break;
    case 'bubbles': for (let i = 0; i < d.n; i++) if (fx.length < 90) spawn('bubble', P.x + (rnd() - 0.5) * 100, P.y - 30 - rnd() * 100, (rnd() - 0.5) * 20, -20 - rnd() * 30, 1.8, 4 + rnd() * 8); sfx('bubble'); break;
    case 'bowl': sfx('pour'); break;
    case 'eat': break;
    case 'yum': sfx('yum'); stars(P.x, P.y - 100, 4); break;
    case 'refuse': sfx('huff'); break;
    case 'confused': sfx('huh'); spawn('q', P.x + 30, head().y - 30, 0, -12, 1.4); break;
    case 'pose': sfx('yip'); updateTrain(); break;
    case 'progress': sfx('ding', d.reps); stars(P.x, P.y - 110, 8); toast(`Good ${pal.S.name}! ${d.reps} of ${NEEDED}`); updateTrain(); persist(); break;
    case 'learned': sfx('fanfare'); stars(P.x, P.y - 110, 26); toast(`${pal.S.name} learned “${d.word}”!`); buildTricks(); persist(); break;
    case 'missed': toast('Too slow, it gave up waiting. Show it again.'); updateTrain(); break;
    case 'trick': sfx('yip'); stars(P.x, P.y - 110, 6); persist(); break;
    case 'sleep': sfx('yawn'); persist(); break;
    case 'wake': sfx('yip'); break;
    case 'bath': sfx('bubble'); toast('Rub-a-dub! Scrub with the sponge.'); break;
    case 'shake': for (let i = 0; i < 18; i++) spawn('drop', P.x + (rnd() - 0.5) * 40, P.y - 60 - rnd() * 60, (rnd() - 0.5) * 300, -80 - rnd() * 140, 0.8); sfx('shake'); break;
    case 'throw': sfx('throw'); break;
    case 'bounce': sfx('bounce'); break;
    case 'catch': sfx('yip'); break;
    case 'fetched': stars(P.x, P.y - 100, 5); sfx('ding', 2); break;
    case 'yip': sfx('yip'); break;
    case 'bond': sfx('fanfare'); toast(`You and ${pal.S.name} are closer: ${d.hearts} ♥`); break;
    case 'heard': showHeard(d.text); break;
  }
  dirty = true;
}
function spawn(kind, x, y, vx, vy, life, s = 1) { fx.push({ kind, x, y, vx, vy, age: 0, life, s }); }
function stars(x, y, n) { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, v = 60 + rnd() * 120; spawn('star', x, y, Math.cos(a) * v, Math.sin(a) * v - 60, 0.9 + rnd() * 0.5, 4 + rnd() * 5); } }

// ---------- sound ----------
function sfx(name, n = 1) {
  const a = audio;
  switch (name) {
    case 'yip': a.tone({ freq: 880, to: 1320, dur: 0.08, type: 'triangle', vol: 0.05 }); a.tone({ freq: 1100, to: 1500, dur: 0.07, type: 'triangle', vol: 0.04, delay: 0.09 }); break;
    case 'huh': a.tone({ freq: 520, to: 760, dur: 0.18, type: 'triangle', vol: 0.045 }); break;
    case 'huff': a.tone({ freq: 400, to: 260, dur: 0.18, type: 'triangle', vol: 0.04 }); a.noise({ dur: 0.12, vol: 0.02, filter: 'lowpass', freq: 900 }); break;
    case 'pour': for (let i = 0; i < 6; i++) a.noise({ dur: 0.05, vol: 0.03, filter: 'bandpass', freq: 2400 + i * 200, q: 4, delay: i * 0.05 }); break;
    case 'munch': a.noise({ dur: 0.07, vol: 0.035, filter: 'bandpass', freq: 1200, q: 2 }); break;
    case 'yum': [660, 880, 990].forEach((f, i) => a.tone({ freq: f, dur: 0.12, type: 'sine', vol: 0.04, delay: i * 0.08 })); break;
    case 'ding': a.tone({ freq: 880 * Math.pow(1.122, n), dur: 0.35, type: 'sine', vol: 0.05 }); a.tone({ freq: 1760 * Math.pow(1.122, n), dur: 0.25, type: 'sine', vol: 0.02 }); break;
    case 'fanfare': [523, 659, 784, 1047].forEach((f, i) => a.tone({ freq: f, dur: i === 3 ? 0.5 : 0.14, type: 'triangle', vol: 0.05, delay: i * 0.11 })); break;
    case 'yawn': a.tone({ freq: 500, to: 260, dur: 0.6, type: 'sine', vol: 0.04 }); break;
    case 'bubble': a.tone({ freq: 700 + rnd() * 500, to: 1400, dur: 0.06, type: 'sine', vol: 0.025 }); break;
    case 'shake': a.noise({ dur: 0.5, vol: 0.04, filter: 'bandpass', freq: 3000, q: 1 }); break;
    case 'throw': a.noise({ dur: 0.18, vol: 0.03, filter: 'bandpass', freq: 800, to: 2400, q: 2 }); break;
    case 'bounce': a.tone({ freq: 180, to: 120, dur: 0.08, type: 'sine', vol: 0.05 }); break;
    case 'purr': a.noise({ dur: 0.16, vol: 0.018 * n, filter: 'lowpass', freq: 260, q: 2 }); break;
    case 'snore': a.noise({ dur: 0.9, vol: 0.012, filter: 'lowpass', freq: 380, to: 180, q: 3 }); break;
    case 'pop': a.tone({ freq: 600, to: 900, dur: 0.05, type: 'sine', vol: 0.03 }); break;
  }
}

// ---------- sizing ----------
function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.width / (W / H) * dpr);
  scale = canvas.width / W;
  room = null; dirty = true;
}
function hourNow() { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
function ensureRoom() {
  const h = Math.round(hourNow() * 4) / 4;
  if (room && h === roomHour) return;
  roomHour = h;
  room = makeCanvas(canvas.width, canvas.height);
  const rc = room.getContext('2d');
  rc.setTransform(scale, 0, 0, scale, 0, 0);
  paintRoom(rc, h);
}
const depth = (y) => (0.82 + (y - FLOOR.y0) / (FLOOR.y1 - FLOOR.y0) * 0.28) * PET_SCALE;

// ---------- the pet's pose ----------
const ease = (x) => 1 - (1 - clamp(x, 0, 1)) * (1 - clamp(x, 0, 1));
function poseFor(P, S, t) {
  const p = { ...REST, pawL: [0, 0], pawR: [0, 0], footL: [0, 0], footR: [0, 0] };
  const k = P.t, mood = pal.mood();
  const breathe = Math.sin(t * 2.3);
  p.bodySy = 1 + breathe * 0.018; p.headY = breathe * 0.9;
  const glad = mood === 'happy' || S.stroke > 0.2;
  p.tail = Math.sin(t * (glad ? 13 : 4.5)) * (glad ? 0.38 : 0.16);
  p.mouth = mood === 'lonely' ? 'frown' : mood === 'hungry' || mood === 'grubby' ? 'flat' : 'smile';
  if (mood === 'sleepy') p.eyes = 'half';
  p.lidCol = (COLOURS[S.colour] || COLOURS.honey).fur;
  if ((t + P.x * 0.01) % 4.3 < 0.13) p.eyes = 'closed';
  // eyes follow the hand
  if (hand.in) {
    const dx = (hand.x - P.x) * P.face, dy = hand.y - (P.y - 100 * depth(P.y));
    p.lookX = clamp(dx / 60, -2.6, 2.6); p.lookY = clamp(dy / 80, -2.2, 2.2);
  }
  const env = (dur, inT = 0.28, outT = 0.3) => Math.min(1, ease(k / inT), ease((dur - k) / outT));
  switch (P.act) {
    case 'walk': case 'run': case 'fetch': case 'carry': {
      const sp = P.act === 'walk' || P.act === 'carry' ? 11 : 17, ph = t * sp;
      p.lift = Math.abs(Math.sin(ph)) * (P.act === 'walk' ? 5 : 9);
      p.footL = [Math.sin(ph) * 7, 0]; p.footR = [-Math.sin(ph) * 7, 0];
      p.pawL = [-Math.sin(ph) * 6, -Math.max(0, Math.sin(ph)) * 4]; p.pawR = [Math.sin(ph) * 6, -Math.max(0, -Math.sin(ph)) * 4];
      p.ear = Math.sin(ph) * 0.12; p.tail = Math.sin(t * 14) * 0.35;
      p.headX = 4; p.headRot = 0.05;
      if (P.act === 'carry') p.mouth = 'o';
      else if (P.act !== 'walk') { p.mouth = 'tongue'; p.eyes = p.eyes === 'closed' ? 'closed' : 'open'; }
      break;
    }
    case 'eat': {
      const dip = env(P.dur, 0.3, 0.3);
      p.headY = 26 * dip + Math.sin(k * 15) * 2.5 * dip; p.headX = 10 * dip; p.headRot = 0.18 * dip;
      p.mouth = Math.sin(k * 15) > 0 ? 'chomp' : 'o'; p.eyes = 'happy'; p.tail = Math.sin(t * 12) * 0.3;
      p.pawL = [2, 0]; p.footL = [-4, 0];
      break;
    }
    case 'sleep': {
      const b = Math.sin(t * 1.3);
      p.bodySy = 0.72 + b * 0.03; p.bodySx = 1.16; p.headY = 40 + b * 1.5; p.headX = 28; p.headRot = 0.3;
      p.eyes = 'closed'; p.mouth = 'smile'; p.tail = 0.6; p.footL = [-6, 2]; p.footR = [4, 2]; p.pawL = [18, -2]; p.pawR = [22, -2];
      p.blush = 0.8; p.ear = 0.25; p.lookX = 0; p.lookY = 0;
      break;
    }
    case 'trick': trickPose(p, P, k, t, env); break;
    case 'love':
      p.eyes = 'happy'; p.blush = 1.4; p.headRot = Math.sin(t * 3) * 0.1 + 0.08; p.ear = 0.18; p.tail = Math.sin(t * 15) * 0.4; p.mouth = 'smile';
      break;
    case 'happy':
      p.lift = Math.abs(Math.sin(k * 9)) * 18; p.eyes = 'happy'; p.mouth = 'tongue'; p.ear = -0.1 + Math.sin(k * 9) * 0.2; p.tail = Math.sin(t * 16) * 0.4;
      p.pawL = [0, -10]; p.pawR = [0, -10];
      break;
    case 'confused':
      p.headRot = 0.3 * ease(k / 0.2); p.eyes = 'wide'; p.mouth = 'o'; p.ear = -0.1;
      break;
    case 'refuse':
      p.headRot = Math.sin(k * 15) * 0.2 * (1 - k / P.dur); p.eyes = 'squint'; p.mouth = 'flat';
      break;
    case 'yawn': {
      const y = env(P.dur, 0.4, 0.5);
      p.eyes = y > 0.3 ? 'closed' : p.eyes; p.mouth = y > 0.3 ? 'yawn' : 'smile'; p.headY = -5 * y; p.headRot = -0.1 * y; p.bodySy += 0.04 * y;
      break;
    }
    case 'scratch':
      p.footR = [8 + Math.sin(k * 32) * 4, -18]; p.headRot = 0.22; p.eyes = 'squint'; p.mouth = 'smile'; p.bodySx = 1.03; p.rot = -0.05;
      break;
    case 'sniff':
      p.headY = 16; p.headX = 12 + Math.sin(k * 6) * 7; p.headRot = 0.12; p.lookY = 2.2; p.mouth = 'flat';
      break;
    case 'look':
      p.headRot = Math.sin(k * 1.4) * 0.12;
      break;
    case 'stretch': {
      const s2 = env(P.dur, 0.5, 0.5);
      p.bodySx = 1 + 0.18 * s2; p.bodySy = 1 - 0.12 * s2; p.headY = 10 * s2; p.headX = 10 * s2; p.pawL = [16 * s2, 0]; p.pawR = [20 * s2, 0]; p.eyes = 'closed'; p.mouth = s2 > 0.5 ? 'yawn' : 'smile';
      break;
    }
    case 'shake': {
      const w2 = 1 - k / P.dur;
      p.rot = Math.sin(k * 42) * 0.14 * w2; p.ear = Math.sin(k * 42) * 0.5 * w2; p.eyes = 'squint'; p.mouth = 'smile';
      break;
    }
  }
  if (S.bath > 0 && P.act !== 'walk') { p.eyes = S.stroke > 0.2 ? 'happy' : 'closed'; }
  return p;
}
function trickPose(p, P, k, t, env) {
  const key = P.trick, hold = !!P.hold;
  const up = hold ? Math.min(1, ease(k / 0.28)) : env(P.dur);
  p.eyes = 'open'; p.mouth = 'smile'; p.tail = Math.sin(t * 12) * 0.32;
  if (key === 'sit') {
    p.bodySy = 1 - 0.13 * up; p.bodySx = 1 + 0.07 * up; p.headY = 8 * up; p.footL = [-8 * up, 0]; p.footR = [-6 * up, 0]; p.pawL = [4 * up, 0]; p.pawR = [2 * up, 0];
    p.mouth = k > 0.6 ? 'tongue' : 'smile';
  } else if (key === 'beg') {
    const w = Math.sin(k * 10) * 3 * up;
    p.lift = 6 * up; p.bodySy = 1 + 0.16 * up; p.headY = -16 * up; p.pawL = [8 * up, -40 * up + w]; p.pawR = [-2 * up, -42 * up - w]; p.eyes = 'happy'; p.mouth = 'tongue'; p.ear = -0.15 * up;
  } else if (key === 'paw') {
    p.pawR = [20 * up, -36 * up + Math.sin(k * 6) * 2 * up]; p.headRot = -0.14 * up; p.mouth = 'open'; p.bodySy = 1 - 0.06 * up; p.rot = -0.05 * up;
  } else if (key === 'spin') {
    const q = (k - 0.15) / 1.2, ph = hold ? ((q % 1) + 1) % 1 : clamp(q, 0, 1);
    p.turn = Math.cos(ph * Math.PI * 2); if (Math.abs(p.turn) < 0.08) p.turn = 0.08 * Math.sign(p.turn || 1);
    p.lift = Math.sin(ph * Math.PI) * 14; p.eyes = 'happy'; p.mouth = 'tongue'; p.ear = Math.sin(ph * Math.PI) * 0.3;
  } else if (key === 'roll') {
    const q = (k - 0.15) / 1.6, ph = hold ? ((q % 1) + 1) % 1 : clamp(q, 0, 1);
    p.rot = -ease(ph) * Math.PI * 2 * P.face; p.lift = Math.sin(ph * Math.PI) * 8 - 12 * Math.sin(ph * Math.PI); p.eyes = 'happy'; p.mouth = 'tongue';
    p.bodySy = 1 - 0.1 * Math.sin(ph * Math.PI);
  } else if (key === 'dance') {
    const ph = k * 7.5;
    p.rot = Math.sin(ph) * 0.2 * up; p.lift = Math.abs(Math.sin(ph)) * 10 * up; p.bodySy = 1 + 0.08 * up;
    p.pawL = [4, -28 * up - Math.max(0, Math.sin(ph)) * 8]; p.pawR = [-2, -28 * up - Math.max(0, -Math.sin(ph)) * 8];
    p.eyes = 'happy'; p.mouth = 'open'; p.headRot = -Math.sin(ph) * 0.12;
  }
}

// ---------- drawing ----------
const trail = [];          // the gesture being drawn, room px, with timestamps
const fading = [];         // finished trails fading out: { pts, age, shape }
function render() {
  ensureRoom();
  if (!pal) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(room, 0, 0); return; }
  const S = pal.S, P = S.pet, t = anim;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(room, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  drawBowl(ctx, S.bowl);
  const ds = depth(P.y);
  const ballFirst = S.ball && S.ball.y < P.y;
  if (S.ball && ballFirst) drawBall(ctx, S.ball, t);
  drawShadow(ctx, P.x, P.y, ds, P.act === 'sleep' ? 1.2 : 1);
  const pose = poseFor(P, S, t);
  drawPet(ctx, P.x, P.y, ds, P.face, S.colour, pose);
  if (S.ball && !ballFirst) drawBall(ctx, S.ball, t);
  // a coat of suds in the bath
  if (S.bath > 0) {
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4 + t * 0.6, r = 40 + (i % 3) * 14;
      drawBubble(ctx, P.x + Math.cos(a) * r * ds, P.y - 70 * ds + Math.sin(a) * r * 0.8 * ds, (6 + (i % 4) * 2.5) * ds);
    }
  }
  // lights: night outside, and lower still while it sleeps
  const night = skyAt(hourNow()).night;
  const dark = (P.act === 'sleep' ? 0.75 : 0) + (night ? 0.4 : 0);
  paintDark(ctx, Math.min(1, dark), night || P.act === 'sleep');

  // floating things
  for (const f of fx) {
    const a = 1 - f.age / f.life;
    ctx.globalAlpha = clamp(a * 1.6, 0, 1);
    if (f.kind === 'heart') drawHeart(ctx, f.x, f.y, 1 + f.age * 0.4);
    else if (f.kind === 'bubble') drawBubble(ctx, f.x, f.y, f.s);
    else if (f.kind === 'star') drawStar(ctx, f.x, f.y, f.s);
    else if (f.kind === 'note') drawNote(ctx, f.x, f.y, 1.1);
    else if (f.kind === 'drop') drawDrop(ctx, f.x, f.y, 1.2);
    else if (f.kind === 'crumb') { ctx.fillStyle = '#b06a3e'; ctx.fillRect(f.x, f.y, 3, 3); }
    else if (f.kind === 'z') { ctx.fillStyle = '#c9d2ff'; ctx.font = `bold ${14 + f.age * 10}px "Baloo 2", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('z', f.x, f.y); }
    else if (f.kind === 'q') { ctx.fillStyle = '#c0703a'; ctx.font = 'bold 30px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', f.x, f.y); }
  }
  ctx.globalAlpha = 1;

  // what it wants, when it is idle enough to think about it
  const want = pal.want();
  if (want && !S.train && S.bath <= 0 && ['idle', 'look', 'sniff', 'yawn', 'scratch'].includes(P.act)) drawThought(ctx, P.x + 70 * ds, P.y - 190 * ds, want, t);

  // training: a ghost of the gesture beside it, or a word bubble with a ring of time left
  if (S.train) drawTrainHint(S, P, ds, t);

  // gesture trails
  for (const f of fading) strokeTrail(f.pts, 1 - f.age / 0.7, f.shape);
  if (trail.length > 1) strokeTrail(trail, 1, null);

  // the hand
  if (hand.in && hand.mouse) {
    const mode = S.bath > 0 ? 'sponge' : (hand.overPet || hand.mode === 'stroke') && hand.mode !== 'draw' ? 'palm' : 'point';
    const wig = hand.mode === 'stroke' ? Math.sin(t * 18) * 2 : 0;
    drawHand(ctx, hand.x + wig, hand.y, mode, hand.down, t);
  }
}
function strokeTrail(pts, alpha, shape) {
  if (alpha <= 0) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = shape ? 'rgba(255,215,90,0.55)' : 'rgba(255,255,255,0.55)'; ctx.lineWidth = 16;
  ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
  ctx.strokeStyle = shape ? '#f2a93b' : '#8a7ad0'; ctx.lineWidth = 5; ctx.stroke();
  for (let i = 0; i < pts.length; i += 6) drawStar(ctx, pts[i].x, pts[i].y, 3.5 + Math.sin(anim * 9 + i) * 1.2, '#fff6c4');
  ctx.restore();
}
function drawTrainHint(S, P, ds, t) {
  const T = TRICKS.find((q) => q.key === S.train.key);
  if (S.train.stage === 'gesture' && !trail.length && P.act !== 'walk' && P.act !== 'run') {
    // a dotted ghost of the gesture, drawn over and over beside the pet
    const cx = P.x + (P.x > W * 0.62 ? -150 : 150) * ds, cy = P.y - 90 * ds;
    const path = ghostPath(T.gesture, cx, cy, 55);
    const q = (t * 0.6) % 1.25;
    ctx.save(); ctx.setLineDash([2, 10]); ctx.lineCap = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); path.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke(); ctx.restore();
    const at = path[Math.min(path.length - 1, Math.floor(clamp(q, 0, 1) * (path.length - 1)))];
    if (q <= 1.05) drawHand(ctx, at.x + 10, at.y + 18, 'point', false, t);
  } else if (S.train.stage === 'word') {
    const word = S.tricks[T.key].word, left = 1 - S.train.t / WORD_WINDOW;
    const x = P.x, y = P.y - 205 * ds;
    ctx.save();
    ctx.font = '600 22px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
    const w = Math.max(110, ctx.measureText(`Say “${word}”!`).width + 34);
    ctx.fillStyle = '#fffdf8'; ctx.strokeStyle = '#6b4a3a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 22, w, 40, 20); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8, y + 18); ctx.lineTo(x, y + 30); ctx.lineTo(x + 8, y + 18); ctx.fillStyle = '#fffdf8'; ctx.fill();
    ctx.fillStyle = '#6b4a3a'; ctx.fillText(`Say “${word}”!`, x, y + 6);
    ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 18, y + 13); ctx.lineTo(x - w / 2 + 18 + (w - 36) * left, y + 13); ctx.stroke();
    ctx.restore();
  }
}
function ghostPath(g, cx, cy, r) {
  const out = [];
  const L = (x0, y0, x1, y1) => { for (let i = 0; i <= 12; i++) out.push({ x: x0 + (x1 - x0) * i / 12, y: y0 + (y1 - y0) * i / 12 }); };
  if (g === 'down') L(cx, cy - r, cx, cy + r);
  else if (g === 'up') L(cx, cy + r, cx, cy - r);
  else if (g === 'right') L(cx - r, cy, cx + r, cy);
  else if (g === 'left') L(cx + r, cy, cx - r, cy);
  else if (g === 'circle') for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 + i / 30 * Math.PI * 1.9; out.push({ x: cx + Math.cos(a) * r * 0.8, y: cy + Math.sin(a) * r * 0.8 }); }
  else { L(cx - r, cy - r * 0.6, cx + r, cy - r * 0.2); L(cx + r, cy - r * 0.2, cx - r, cy + r * 0.2); L(cx - r, cy + r * 0.2, cx + r, cy + r * 0.6); }
  return out;
}

// ---------- the loop ----------
function step(dt) {
  if (!pal) return;
  anim += dt;
  pal.step(dt);
  const S = pal.S, P = S.pet;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.kind === 'drop' || f.kind === 'crumb' || f.kind === 'star') f.vy += 500 * dt * (f.kind === 'star' ? 0.4 : 1);
    if (f.kind === 'heart' || f.kind === 'bubble' || f.kind === 'z' || f.kind === 'note') f.vx += Math.sin(f.age * 5 + i) * 20 * dt;
    if (f.age >= f.life) fx.splice(i, 1);
  }
  for (let i = fading.length - 1; i >= 0; i--) { fading[i].age += dt; if (fading[i].age > 0.7) fading.splice(i, 1); }
  // little things that come with what it is doing
  if (P.act === 'sleep') { zT -= dt; if (zT <= 0) { zT = 1.1; spawn('z', P.x + 40 * P.face, P.y - 90, 12, -26, 2.2); if (rnd() < 0.3) sfx('snore'); } }
  if (P.act === 'eat') { if (rnd() < dt * 6) { spawn('crumb', P.x - 30, P.y - 40, (rnd() - 0.5) * 90, -60, 0.6); sfx('munch'); } }
  if (P.act === 'trick' && P.trick === 'dance') { noteT -= dt; if (noteT <= 0) { noteT = 0.45; spawn('note', P.x + (rnd() - 0.5) * 120, P.y - 150, 0, -40, 1.5); } }
  if (S.stroke > 0.25) { purrT -= dt; if (purrT <= 0) { purrT = 0.15; sfx('purr', S.stroke); } }
  if (stroking.pending > 0) { pal.stroke(stroking.pending, stroking.turn); stroking.pending = 0; stroking.turn = 0; }
  sinceSave += dt;
  if (sinceSave > SAVE_EVERY) persist();
  panelsT -= dt; if (panelsT <= 0) { panelsT = 0.25; updatePanels(); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('#pp-toast').classList.remove('on'); }
}
let panelsT = 0;
const loop = fixedLoop({ step, render, hz: 60 });

// ---------- pointer: stroke on the pet, draw anywhere else ----------
const hand = { x: 0, y: 0, in: false, mouse: true, down: false, mode: null, overPet: false };
const stroking = { pending: 0, turn: 0, last: null, lastA: null };
function toRoom(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function overPet(q) {
  const P = pal.S.pet, ds = depth(P.y);
  const dx = (q.x - P.x) / (66 * ds), dy = (q.y - (P.y - 70 * ds)) / (85 * ds);
  return dx * dx + dy * dy < 1;
}
canvas.addEventListener('pointerdown', (e) => {
  if (!pal) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
  const q = toRoom(e);
  Object.assign(hand, q, { in: true, down: true, mouse: e.pointerType === 'mouse' });
  hand.overPet = overPet(q);
  if (hand.overPet) { hand.mode = 'stroke'; stroking.last = q; stroking.lastA = null; }
  else { hand.mode = 'draw'; trail.length = 0; trail.push({ ...q, t: performance.now() }); }
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (!pal) return;
  const q = toRoom(e);
  Object.assign(hand, q, { in: true, mouse: e.pointerType === 'mouse' });
  hand.overPet = overPet(q);
  if (!hand.down) return;
  if (hand.mode === 'stroke') {
    if (hand.overPet && stroking.last) {
      const dx = q.x - stroking.last.x, dy = q.y - stroking.last.y, d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const a = Math.atan2(dy, dx);
        if (stroking.lastA != null) { let da = a - stroking.lastA; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; stroking.turn += da; }
        stroking.lastA = a; stroking.pending += Math.min(d, 40);
      }
    }
    stroking.last = q;
  } else if (hand.mode === 'draw') {
    const l = trail[trail.length - 1];
    if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 3) trail.push({ ...q, t: performance.now() });
    if (trail.length > 300) trail.shift();
  }
});
function endPointer(e) {
  if (!pal || !hand.down) return;
  hand.down = false;
  if (hand.mode === 'draw') {
    const pts = trail.slice();
    trail.length = 0;
    const shape = readGesture(pts);
    if (shape) {
      fading.push({ pts, age: 0, shape });
      flashGesture(shape);
      pal.gesture(shape);
    } else {
      fading.push({ pts, age: 0.35, shape: null });
      // a tap, not a drawing: on the ball throws it, on the floor calls it over
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (len < 12 && pts.length) {
        const q = pts[0];
        if (q.y > FLOOR.y0 - 30) pal.call(q.x, q.y + 10);
      }
    }
  } else if (hand.mode === 'stroke') {
    // a single tap on the pet is a pat
    if (stroking.pending === 0 && !pal.S.stroke) pal.stroke(30, 0);
  }
  hand.mode = null;
  if (e && e.pointerType !== 'mouse') hand.in = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (!hand.down) hand.in = false; });
function flashGesture(shape) {
  const el = $('#pp-gesture-flash');
  el.textContent = GESTURE_ICON[shape];
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

// ---------- the panels ----------
const bars = {};
function buildStats() {
  const box = $('#pp-stats'); box.innerHTML = '';
  for (const k of STATS) {
    const row = document.createElement('div'); row.className = 'pp-stat'; row.dataset.k = k;
    row.innerHTML = `<span class="ic" aria-hidden="true">${STAT_ICON[k]}</span><span class="lbl">${STAT_LABEL[k]}</span><b class="pct">0%</b><span class="bar"><i></i></span>`;
    box.appendChild(row);
    bars[k] = { row, fill: row.querySelector('i'), pct: row.querySelector('.pct') };
  }
}
let lastPanel = '';
function updatePanels(force = false) {
  if (!pal) return;
  const S = pal.S, P = S.pet;
  for (const k of STATS) {
    const v = Math.round(S.stats[k]);
    bars[k].fill.style.width = v + '%';
    bars[k].pct.textContent = v + '%';
    bars[k].row.classList.toggle('low', v < 25);
  }
  const mood = pal.mood();
  const sig = [mood, P.act === 'sleep', S.bath > 0, !!S.ball, pal.hearts(), S.name, JSON.stringify(S.train), Math.floor(S.age / 3600)].join('|');
  if (sig === lastPanel && !force) return;
  lastPanel = sig;
  $('#pp-mood').textContent = MOOD_LABEL[mood];
  $('#pp-mood').dataset.mood = mood;
  $('#pp-name').textContent = S.name;
  const h = pal.hearts();
  $('#pp-hearts').innerHTML = Array.from({ length: Math.max(5, Math.min(10, h + 1)) }, (_, i) => `<span class="${i < h ? 'on' : ''}">♥</span>`).join('');
  $('#pp-hearts').title = `${h} friendship heart${h === 1 ? '' : 's'}`;
  const days = Math.floor(S.age / 3600);
  $('#pp-age').textContent = days ? `${days} hour${days === 1 ? '' : 's'} together` : 'Brand new friends';
  const asleep = P.act === 'sleep';
  $('#pp-sleep').innerHTML = asleep ? '<span class="ic">☀️</span> Wake' : '<span class="ic">🌙</span> Sleep';
  for (const b of ['#pp-feed', '#pp-play', '#pp-wash']) $(b).disabled = asleep;
  $('#pp-play').disabled = asleep || !!S.ball;
  updateTrain();
}

function buildTricks() {
  const ul = $('#pp-trick-list'); ul.innerHTML = '';
  for (const t of TRICKS) {
    const T = pal.S.tricks[t.key], open = pal.unlocked(t.key);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pp-trick' + (T.learned ? ' learned' : '') + (open ? '' : ' locked'); b.dataset.key = t.key;
    b.disabled = !open;
    b.innerHTML = `<span class="g" aria-hidden="true">${open ? GESTURE_ICON[t.gesture] : '🔒'}</span><span class="n">${t.name}</span>` +
      `<span class="s">${T.learned ? '✓' : open ? '●'.repeat(T.reps) + '○'.repeat(NEEDED - T.reps) : ''}</span>`;
    b.title = open ? (T.learned ? `Learned: say “${T.word}” or ${t.hint.toLowerCase()}` : `Teach ${t.name}`) : 'Learn the one before first';
    b.addEventListener('click', () => pickTrick(t.key));
    li.appendChild(b); ul.appendChild(li);
  }
  updateTrain(true);
}
let shown = null;     // the trick the card shows
function pickTrick(key) {
  const T = pal.S.tricks[key];
  shown = key;
  if (!T.learned) pal.chooseTrick(key); else pal.stopTraining();
  updateTrain(true);
}
let lastTrain = '';
function updateTrain(force = false) {
  if (!pal) return;
  const S = pal.S, tr = S.train;
  if (tr) shown = tr.key;
  if (!shown) shown = (TRICKS.find((t) => pal.unlocked(t.key) && !S.tricks[t.key].learned) || TRICKS[0]).key;
  const t = TRICKS.find((q) => q.key === shown), T = S.tricks[shown];
  const sig = [shown, tr && tr.stage, T.reps, T.learned, T.word, voiceState].join('|');
  if (sig === lastTrain && !force) return;
  lastTrain = sig;
  for (const b of document.querySelectorAll('.pp-trick')) {
    b.classList.toggle('sel', b.dataset.key === shown);
    const TT = S.tricks[b.dataset.key];
    if (!TT.learned && pal.unlocked(b.dataset.key)) b.querySelector('.s').textContent = '●'.repeat(TT.reps) + '○'.repeat(NEEDED - TT.reps);
  }
  $('#pp-train-title').textContent = T.learned ? `${t.name}: learned` : tr ? `Teaching: ${t.name}` : `Teach ${t.name}`;
  $('#pp-ghost').setAttribute('d', GESTURE_PATH[t.gesture]);
  $('#pp-gesture-hint').textContent = t.hint + (t.gesture === 'circle' || t.gesture === 'zigzag' ? ' in the room' : ' across the room');
  $('#pp-word').textContent = T.word;
  $('#pp-say').innerHTML = `Say “<b>${T.word}</b>”`;
  $('#pp-edit-word').hidden = T.learned;
  const step1 = $('#pp-step1'), step2 = $('#pp-step2');
  step1.classList.toggle('now', !!tr && tr.stage === 'gesture');
  step2.classList.toggle('now', !!tr && tr.stage === 'word');
  step1.classList.toggle('done', !!tr && tr.stage === 'word');
  $('#pp-pips').innerHTML = Array.from({ length: NEEDED }, (_, i) => `<i class="${i < T.reps ? 'on' : ''}"></i>`).join('');
  $('#pp-progress-text').textContent = T.learned ? `Say “${T.word}” or ${t.hint.toLowerCase()} any time.` : `${T.reps} of ${NEEDED} good tries`;
  $('#pp-train-start').hidden = T.learned || !!tr;
  $('#pp-train-stop').hidden = !tr;
  $('#pp-train').classList.toggle('learned', T.learned);
}

// ---------- care buttons ----------
$('#pp-feed').addEventListener('click', () => { const f = $('#pp-foods'); f.hidden = !f.hidden; $('#pp-feed').setAttribute('aria-expanded', String(!f.hidden)); });
for (const b of document.querySelectorAll('#pp-foods button')) b.addEventListener('click', () => { pal.feed(b.dataset.food); $('#pp-foods').hidden = true; $('#pp-feed').setAttribute('aria-expanded', 'false'); updatePanels(true); });
$('#pp-play').addEventListener('click', () => { pal.play(); updatePanels(true); });
$('#pp-wash').addEventListener('click', () => { pal.wash(); updatePanels(true); });
$('#pp-sleep').addEventListener('click', () => { if (pal.S.pet.act === 'sleep') pal.wake(); else pal.sleep(); updatePanels(true); });
$('#pp-train-start').addEventListener('click', () => { pal.chooseTrick(shown); updateTrain(true); });
$('#pp-train-stop').addEventListener('click', () => { pal.stopTraining(); updateTrain(true); });
$('#pp-say').addEventListener('click', () => { const T = pal.S.tricks[shown]; heardFrom([T.word]); });
$('#pp-edit-word').addEventListener('click', () => {
  const T = pal.S.tricks[shown];
  const w = window.prompt(`What word should mean “${TRICKS.find((t) => t.key === shown).name}”? (Changing it starts the lessons again.)`, T.word);
  if (w != null && pal.setWord(shown, w)) { buildTricks(); persist(); }
});

// ---------- the microphone ----------
let voiceState = 'off';
const voice = createVoice({
  onStatus: (s) => {
    voiceState = s.state;
    const el = $('#pp-voice-status'), mic = $('#pp-mic');
    mic.classList.toggle('listening', s.state === 'listening');
    mic.classList.toggle('busy', s.state === 'loading' || s.state === 'thinking');
    if (s.state === 'loading') el.textContent = `Fetching the ears… ${Math.round((s.progress || 0) * 100)}%${s.mb ? ` of ${s.mb.toFixed(0)} MB` : ''}`;
    else if (s.state === 'listening') el.textContent = 'Listening…';
    else if (s.state === 'thinking') el.textContent = 'Working out what you said…';
    else if (s.state === 'ready') el.textContent = s.quiet ? "Didn't hear anything. Tap the mic and speak up." : s.engine === 'whisper' ? 'Ready. Tap the mic (or hold Space) and speak.' : 'Ready (browser speech).';
    else if (s.state === 'error') el.textContent = s.why;
    else el.textContent = 'The mic loads Whisper the first time (about 40 MB, kept by your browser).';
    updateTrain();
  },
  onLevel: (v) => { level = v; },
});
let level = 0;
async function listenOnce() {
  if (voice.listening) { voice.stop(); return; }
  const alts = await voice.listen();
  if (alts && alts.length) heardFrom(alts);
}
// several guesses at what was said: hand the sim the first that is a command it knows
function heardFrom(alts) {
  const S = pal.S, phrases = [...TRICKS.map((t) => S.tricks[t.key].word), S.name];
  const best = alts.find((a) => bestCommand(a, phrases)) || alts[0];
  pal.hear(best);
  updatePanels(true);
}
$('#pp-mic').addEventListener('click', listenOnce);
let spaceHeld = false;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || /INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement && document.activeElement.tagName) || !$('#pp-dialog').hidden) return;
  e.preventDefault(); spaceHeld = true; if (!voice.listening) listenOnce();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space' && spaceHeld) { spaceHeld = false; voice.stop(); } });
const engineSel = $('#pp-engine');
for (const [k, v] of Object.entries(ENGINES)) {
  if (k === 'browser' && !hasBrowserSpeech()) continue;
  const o = document.createElement('option'); o.value = k; o.textContent = v.name; engineSel.appendChild(o);
}
engineSel.value = ENGINES[enginePref.get()] && (enginePref.get() !== 'browser' || hasBrowserSpeech()) ? enginePref.get() : 'whisper';
voice.setEngine(engineSel.value);
engineSel.addEventListener('change', () => { enginePref.set(voice.setEngine(engineSel.value)); $('#pp-engine-note').textContent = ENGINES[engineSel.value].note; });
$('#pp-engine-note').textContent = ENGINES[engineSel.value].note;
if (!hasMic()) { $('#pp-mic').disabled = true; $('#pp-voice-status').textContent = 'No microphone here. Tap the word to say it.'; }

// the level meter: a little waveform of bars
const meter = $('#pp-meter'), mctx = meter.getContext('2d');
const levels = new Array(28).fill(0);
function drawMeter() {
  levels.shift(); levels.push(voice.listening ? level : level * 0.5);
  const w = meter.width, h = meter.height;
  mctx.clearRect(0, 0, w, h);
  mctx.fillStyle = voice.listening ? '#e0795a' : '#b9c6b4';
  const bw = w / levels.length;
  levels.forEach((v, i) => { const bh = Math.max(3, Math.min(h, (0.08 + v * 1.6) * h * (0.6 + 0.4 * Math.sin(i * 1.7 + anim * 6)))); mctx.fillRect(i * bw + 1.5, (h - bh) / 2, bw - 3, bh); });
}
function showHeard(text) {
  const el = $('#pp-heard');
  el.textContent = text ? `You said: “${text}”` : '';
  el.classList.remove('on'); void el.offsetWidth; if (text) el.classList.add('on');
}

// ---------- toasts, dialogs ----------
function toast(text) { const el = $('#pp-toast'); el.textContent = text; el.classList.add('on'); toastTimer = 2.8; }
const dialog = $('#pp-dialog'), dbody = $('#pp-dialog-body');
function openDialog(html, onReady) {
  dbody.innerHTML = html; dialog.hidden = false;
  onReady && onReady(dbody);
  const f = dbody.querySelector('input, button'); if (f) f.focus();
}
function closeDialog() { dialog.hidden = true; }
dialog.addEventListener('click', (e) => { if (e.target === dialog && pal) closeDialog(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dialog.hidden && pal) closeDialog(); });

function howTo() {
  openDialog(`<h2>How to play</h2>
    <ul class="pp-how">
      <li><b>Look after ${pal ? pal.S.name : 'your pal'}.</b> Feed, play ball, bath and bedtime keep the four bars up. Nothing bad happens if they drop: it just gets sulky, sleepy or grubby, and less keen on tricks.</li>
      <li><b>Stroke it.</b> Press and rub over your pal with the hand. Round and round is best. In the bath the hand is a sponge.</li>
      <li><b>Teach a trick.</b> Pick one on the right. <em>Step 1:</em> draw its gesture anywhere in the room (a swipe down for Sit) and your pal strikes the pose. <em>Step 2:</em> while it holds the pose, say the word. Three good tries and it's learned.</li>
      <li><b>Ask for a trick.</b> Once learned, the word on its own or the gesture on its own will do. Say its name and it comes running. Tap the floor to call it over.</li>
      <li><b>The microphone</b> is optional. Whisper listens in your own browser; the first time it fetches about 40 MB. With no mic, tap “Say …” to say the word.</li>
    </ul>
    <p class="pp-actions"><button type="button" class="pp-btn primary" id="pp-ok">Got it</button></p>`, (b) => b.querySelector('#pp-ok').addEventListener('click', () => { seenHelp.set(true); closeDialog(); }));
}
function adopt() {
  let colour = 'honey';
  openDialog(`<h2>Meet your Pocket Pal</h2>
    <p>A fluffy little friend is waiting for a name.</p>
    <canvas id="pp-adopt-pet" width="260" height="190" aria-hidden="true"></canvas>
    <label class="pp-field">Name <input id="pp-adopt-name" maxlength="16" value="Mochi" autocomplete="off" /></label>
    <div class="pp-swatches" role="radiogroup" aria-label="Coat">${Object.entries(COLOURS).map(([k, c]) => `<button type="button" role="radio" aria-checked="${k === colour}" data-c="${k}" style="--c:${c.fur}" title="${c.name}"></button>`).join('')}</div>
    <p class="pp-actions"><button type="button" class="pp-btn primary" id="pp-adopt-go">Adopt</button></p>`, (b) => {
    const cv = b.querySelector('#pp-adopt-pet'), c2 = cv.getContext('2d');
    const paint = () => {
      c2.clearRect(0, 0, cv.width, cv.height);
      const p = { ...REST, pawL: [0, 0], pawR: [0, 0], footL: [0, 0], footR: [0, 0], eyes: 'happy', mouth: 'tongue', blush: 1, lidCol: COLOURS[colour].fur };
      drawShadow(c2, 130, 175, 1);
      drawPet(c2, 130, 175, 1, 1, colour, p);
    };
    paint();
    for (const s of b.querySelectorAll('.pp-swatches button')) s.addEventListener('click', () => {
      colour = s.dataset.c; for (const o of b.querySelectorAll('.pp-swatches button')) o.setAttribute('aria-checked', String(o === s)); paint();
    });
    const go = () => {
      const name = b.querySelector('#pp-adopt-name').value.trim() || 'Mochi';
      closeDialog(); start(null, name, colour); sfx('fanfare');
      if (!seenHelp.get()) setTimeout(howTo, 500);
    };
    b.querySelector('#pp-adopt-go').addEventListener('click', go);
    b.querySelector('#pp-adopt-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}
$('#pp-howto').addEventListener('click', howTo);
const soundBtn = $('#pp-sound');
const showSound = () => { soundBtn.textContent = audio.on ? '♪ Sound on' : '♪ Sound off'; soundBtn.setAttribute('aria-pressed', String(audio.on)); };
soundBtn.addEventListener('click', () => { audio.toggle(); showSound(); });
showSound();

// ---------- start ----------
buildStats();
resize();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
document.addEventListener('visibilitychange', () => { if (document.hidden && pal) persist(); });
window.addEventListener('pagehide', () => { if (pal) persist(); });
(function meterLoop() { drawMeter(); requestAnimationFrame(meterLoop); })();
if (loaded && loaded.state) start(loaded.state);
else adopt();
loop.start();

expose('__pal', {
  get S() { return pal && pal.S; },
  get pal() { return pal; },
  readGesture, voice,
  start, resize,
  // run the world forward n seconds (for tests): steps the sim and the screen together
  run(seconds) { for (let i = 0; i < seconds * 60; i++) step(1 / 60); render(); },
  // hand a drawn path (room px) to the same code a real drag goes through
  draw(points) { const shape = readGesture(points); if (shape) { fading.push({ pts: points, age: 0, shape }); pal.gesture(shape); } return shape; },
  hear(text) { heardFrom([text]); },
  toScreen(x, y) { const r = canvas.getBoundingClientRect(); return { x: r.left + x / W * r.width, y: r.top + y / H * r.height }; },
  text() { if (!pal) return 'no pet yet'; const S = pal.S; return JSON.stringify({ act: S.pet.act, x: S.pet.x | 0, y: S.pet.y | 0, stats: Object.fromEntries(STATS.map((k) => [k, Math.round(S.stats[k])])), train: S.train, tricks: Object.fromEntries(TRICKS.map((t) => [t.key, S.tricks[t.key].reps + (S.tricks[t.key].learned ? '✓' : '')])) }); },
});
