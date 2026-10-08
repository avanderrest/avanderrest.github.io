/* Sound, shared by every game: one AudioContext for the page, unlocked on the first tap
   or key press, and two building blocks to make effects from.

     const audio = createAudio('donut-works-sound');   // remembers on/off under that key
     audio.tone({ freq: 660, to: 990, dur: 0.12, type: 'triangle', vol: 0.06, delay: 0 })
     audio.noise({ dur: 0.2, vol: 0.05, filter: 'bandpass', freq: 1800, q: 1 })
     audio.on / audio.toggle() / audio.set(false)
     audio.ctx()     the AudioContext (null until it can exist), for anything richer
     audio.out()     the node to connect to: master gain, so on/off covers custom sounds

   A game keeps its own table of named effects built from these (sfx('pop') etc.), because
   which sounds a game makes is the game's business; how a beep is made is not. */

import { legacyFlag } from './save.js';

let actx = null, master = null, unlocked = false;
const listeners = new Set();

function ensure() {
  if (actx) return actx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { actx = new AC(); } catch (e) { return null; }
  master = actx.createGain();
  master.connect(actx.destination);
  return actx;
}

// A browser only lets sound start inside a real gesture, and for a finger that is the END
// of the touch (pointerup, touchend, click), not pointerdown or touchstart, which only
// count for a mouse. So every gesture tries again until the context is really running;
// marking it unlocked after one failed try left touch screens silent for good.
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
function ready() {
  if (unlocked || !actx || actx.state !== 'running') return;
  unlocked = true;
  if (typeof window !== 'undefined') for (const ev of GESTURES) window.removeEventListener(ev, unlock, true);
  for (const f of listeners) f(actx);
}
function unlock() {
  if (unlocked) return;
  const c = ensure();
  if (!c) return;
  if (c.state === 'running') ready();
  else c.resume().then(ready, () => {});
}
if (typeof window !== 'undefined') {
  for (const ev of GESTURES) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

// Call f(ctx) once audio is allowed to run (immediately if it already is).
export function whenUnlocked(f) { if (unlocked && actx) f(actx); else listeners.add(f); }

let noiseBuf = null;
function noiseBuffer(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = c.sampleRate;   // one second, looped as needed
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

export function createAudio(key, fallback = true) {
  const pref = key ? legacyFlag(key, fallback) : { get: () => fallback, set: (v) => v };
  const api = {
    on: pref.get(),
    set(v) { api.on = !!v; pref.set(api.on); if (!api.on && actx && actx.state === 'running') { /* let tails finish */ } return api.on; },
    toggle() { return api.set(!api.on); },
    ctx() { return ensure(); },
    out() { ensure(); return master; },
    tone({ freq = 440, to, dur = 0.1, type = 'sine', vol = 0.05, delay = 0, attack = 0.004 } = {}) {
      if (!api.on) return;
      const c = ensure(); if (!c || c.state !== 'running') { unlock(); if (!c || c.state !== 'running') return; }
      const t0 = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },
    noise({ dur = 0.15, vol = 0.05, filter = 'bandpass', freq = 1200, to, q = 1, delay = 0 } = {}) {
      if (!api.on) return;
      const c = ensure(); if (!c || c.state !== 'running') { unlock(); if (!c || c.state !== 'running') return; }
      const t0 = c.currentTime + delay;
      const src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
      const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
      if (to) f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(master);
      src.start(t0); src.stop(t0 + dur + 0.03);
    },
  };
  return api;
}
