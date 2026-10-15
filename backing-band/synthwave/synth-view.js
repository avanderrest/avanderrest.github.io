/* Synthwave machine: the page (parked from the Physics Playground, see README.md). The rig is plain DOM over a sunset: an
   oscilloscope (an AnalyserNode drawn triggered on a rising zero crossing, so the wave
   stands still), nine knobs (drag up or down, scroll, or arrow keys), sixteen pads and a
   four-track step sequencer scheduled ahead on the audio clock. Every sound is built from
   oscillators, noise and filters through one chain: drive, echo, volume, scope.
   See synth-sim.js for the patch, the pads and the grooves. */
import { KNOBS, VOICES, TRACKS, GROOVES } from './synth-sim.js';

// ---------- constants ----------
const KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
const LOOKAHEAD = 0.12;
const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createSynthView({ sim, root, audio, save }) {
  // ---------- the rig ----------
  root.innerHTML = `
    <div class="sun"></div><div class="grid"></div>
    <div class="rig">
      <section class="panel scope-panel"><h3>Oscilloscope</h3><canvas class="scope" id="sy-scope"></canvas></section>
      <section class="panel knobs" id="sy-knobs" aria-label="Knobs"></section>
      <section class="panel pads-panel"><h3>Pads</h3><div class="pads" id="sy-pads"></div>
        <div class="pad-edit" id="sy-padedit" hidden>
          <span id="sy-padname">Pad</span>
          <select id="sy-voice" aria-label="Sound">${VOICES.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>
          <button id="sy-down" aria-label="Note down">−</button><span id="sy-note">A2</span><button id="sy-up" aria-label="Note up">+</button>
        </div>
      </section>
      <section class="panel seq-panel"><h3>Sequencer</h3><div class="seq" id="sy-seq"></div>
        <p class="seq-note">Tap a step to switch it. The bass line follows the groove.</p></section>
    </div>`;
  const scope = root.querySelector('#sy-scope'), sg = scope.getContext('2d');

  // ---------- the audio chain ----------
  let A = null;
  function chain() {
    const c = audio.ctx();
    if (!c) return null;
    if (A && A.c === c) return A;
    const voice = c.createGain(), drums = c.createGain();
    const drive = c.createWaveShaper(); drive.oversample = '2x';
    const dry = c.createGain(), delay = c.createDelay(1.5), fb = c.createGain(), wet = c.createGain(), tone = c.createBiquadFilter();
    const vol = c.createGain(), comp = c.createDynamicsCompressor(), an = c.createAnalyser();
    an.fftSize = 2048;
    tone.type = 'lowpass'; tone.frequency.value = 3200;
    voice.connect(drive); drums.connect(drive);
    drive.connect(dry); drive.connect(delay);
    delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet);
    dry.connect(vol); wet.connect(vol);
    vol.connect(comp); comp.connect(an); an.connect(audio.out());
    A = { c, voice, drums, drive, dry, delay, fb, wet, vol, an, buf: new Float32Array(an.fftSize) };
    applyKnobs();
    return A;
  }
  function applyKnobs() {
    if (!A) return;
    const k = sim.knobs, t = A.c.currentTime;
    A.drive.curve = driveCurve(k.drive);
    A.delay.delayTime.setTargetAtTime(sim.stepDur() * 3, t, 0.05);
    A.fb.gain.setTargetAtTime(0.25 + k.echo * 0.4, t, 0.05);
    A.wet.gain.setTargetAtTime(k.echo * 0.6, t, 0.05);
    A.vol.gain.setTargetAtTime(k.volume * 0.9, t, 0.03);
  }
  function driveCurve(d) {
    const n = 1024, curve = new Float32Array(n), amt = 1 + d * 14;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amt) / Math.tanh(amt); }
    return curve;
  }
  // make sure sound can run, then do f
  function withAudio(f) {
    if (!audio.on) return;
    const c = audio.ctx(); if (!c) return;
    if (c.state === 'running') { chain(); f(); } else c.resume().then(() => { chain(); f(); }, () => {});
  }

  // ---------- the voices ----------
  function noise(c, when, dur) {
    const len = Math.ceil(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; s.start(when); return s;
  }
  function env(c, when, peak, attack, hold, release) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + release);
    return g;
  }
  function play(voice, freqs, when, opts = {}) {
    const a = chain(); if (!a) return;
    const c = a.c, k = sim.knobs, out = sim.isDrum(voice) ? a.drums : a.voice;
    when = Math.max(when, c.currentTime);
    if (voice === 'kick') {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(160, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
      const g = env(c, when, 0.9, 0.002, 0.02, 0.32); o.connect(g).connect(out); o.start(when); o.stop(when + 0.4);
      const n = noise(c, when, 0.02), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000;
      const ng = env(c, when, 0.25, 0.001, 0, 0.015); n.connect(f).connect(ng).connect(out);
    } else if (voice === 'snare' || voice === 'clap') {
      const bursts = voice === 'clap' ? [0, 0.011, 0.023] : [0];
      for (const b of bursts) {
        const n = noise(c, when + b, 0.25), f = c.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = voice === 'clap' ? 1300 : 1900; f.Q.value = voice === 'clap' ? 1.6 : 0.8;
        const g = env(c, when + b, voice === 'clap' ? 0.5 : 0.45, 0.001, 0.005, voice === 'clap' && b === 0.023 ? 0.22 : 0.12);
        n.connect(f).connect(g).connect(out);
      }
      if (voice === 'snare') {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, when); o.frequency.exponentialRampToValueAtTime(140, when + 0.08);
        const g = env(c, when, 0.35, 0.001, 0.01, 0.09); o.connect(g).connect(out); o.start(when); o.stop(when + 0.15);
      }
    } else if (voice === 'hat') {
      const n = noise(c, when, 0.08), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      const g = env(c, when, 0.22, 0.001, 0.003, 0.045); n.connect(f).connect(g).connect(out);
    } else if (voice === 'tom') {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freqs[0] * 2, when); o.frequency.exponentialRampToValueAtTime(freqs[0], when + 0.2);
      const g = env(c, when, 0.6, 0.002, 0.02, 0.3); o.connect(g).connect(out); o.start(when); o.stop(when + 0.4);
    } else if (voice === 'zap' || voice === 'laser') {
      const o = c.createOscillator(); o.type = voice === 'zap' ? 'square' : 'sawtooth';
      const f0 = voice === 'zap' ? 1400 : freqs[0] * 4;
      o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(voice === 'zap' ? 70 : freqs[0] / 2, when + 0.25);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 4000; f.Q.value = 6;
      const g = env(c, when, 0.22, 0.002, 0.05, 0.22); o.connect(f).connect(g).connect(out); o.start(when); o.stop(when + 0.35);
    } else {
      // the melodic voices: two or three detuned oscillators through a resonant lowpass
      const att = voice === 'pad' ? 0.25 + k.attack * 1.5 : 0.003 + k.attack * k.attack * 1.2;
      const rel = voice === 'pluck' ? 0.18 + k.release * 0.3 : voice === 'pad' ? 0.6 + k.release * 2.5 : 0.06 + k.release * k.release * 2;
      const hold = opts.hold != null ? opts.hold : voice === 'bass' ? 0.16 : voice === 'pluck' ? 0 : voice === 'pad' ? 0.6 : 0.22;
      const peak = (voice === 'bass' ? 0.42 : voice === 'chord' || voice === 'pad' ? 0.16 : 0.24) / Math.sqrt(freqs.length);
      const cutoff = 80 * Math.pow(2, k.cutoff * 7.2) * (voice === 'bass' ? 0.7 : 1);
      const wave = WAVES[k.wave | 0];
      const end = when + att + hold + rel + 0.05;
      for (const fq of freqs) {
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7 + k.res * 17;
        f.frequency.setValueAtTime(Math.min(16000, cutoff * (voice === 'pluck' || voice === 'bass' ? 3.5 : 1.6)), when);
        f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff), when + 0.05 + (voice === 'pluck' ? 0.12 : 0.25));
        const g = env(c, when, peak, att, hold, rel);
        f.connect(g).connect(out);
        const spread = k.detune * (voice === 'bass' ? 9 : 22);
        const det = voice === 'pluck' ? [0] : voice === 'bass' ? [-spread, spread] : [-spread, 0, spread];
        for (const d of det) {
          const o = c.createOscillator(); o.type = wave; o.frequency.value = fq; o.detune.value = d;
          if (voice === 'lead') {
            const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(9, when + 0.35);
            lfo.connect(lg).connect(o.detune); lfo.start(when); lfo.stop(end);
          }
          o.connect(f); o.start(when); o.stop(end);
        }
        if (voice === 'bass') {
          const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = fq / 2;
          const sg2 = env(c, when, peak * 0.8, att, hold, rel); sub.connect(sg2).connect(out); sub.start(when); sub.stop(end);
        }
      }
    }
  }
  function hitPad(i, when) {
    const s = sim.padSound(i); if (!s) return;
    withAudio(() => play(s.voice, s.freqs, when != null ? when : A.c.currentTime));
    const el = padEls[i];
    if (el) { el.classList.add('hit'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('hit'), 140); }
  }

  // ---------- knobs ----------
  const knobBox = root.querySelector('#sy-knobs');
  const knobEls = {};
  for (const [k, d] of Object.entries(KNOBS)) {
    const el = document.createElement('div');
    el.className = 'knob'; el.tabIndex = 0;
    el.setAttribute('role', 'slider'); el.setAttribute('aria-label', d.name);
    el.setAttribute('aria-valuemin', d.min); el.setAttribute('aria-valuemax', d.max);
    el.innerHTML = `<svg viewBox="-30 -30 60 60" aria-hidden="true">
        <defs><filter id="glow-${k}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <circle r="25" fill="#12052a" stroke="rgba(255,63,208,0.35)" stroke-width="1.2"/>
        <path class="k-track" d="${arc(0, 1)}" fill="none" stroke="rgba(43,240,255,0.18)" stroke-width="4" stroke-linecap="round"/>
        <path class="k-arc" fill="none" stroke="#2bf0ff" stroke-width="4" stroke-linecap="round" filter="url(#glow-${k})"/>
        <circle r="15" fill="#1d0b3d" stroke="rgba(255,255,255,0.12)"/>
        <line class="k-ptr" x1="0" y1="-4" x2="0" y2="-13" stroke="#ffe14a" stroke-width="2.6" stroke-linecap="round"/>
      </svg><span class="k-name">${d.name}</span><span class="k-val"></span>`;
    knobBox.appendChild(el);
    knobEls[k] = el;
    let drag = null;
    el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, v: sim.knobs[k] }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const range = d.max - d.min;
      setKnob(k, drag.v + (drag.y - e.clientY) / 160 * range * (e.shiftKey ? 0.25 : 1));
    });
    const end = () => { if (drag) { drag = null; save(); } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => { e.preventDefault(); setKnob(k, sim.knobs[k] - Math.sign(e.deltaY) * (d.step || (d.max - d.min) / 40)); save(); }, { passive: false });
    el.addEventListener('dblclick', () => { setKnob(k, d.def); save(); });
    el.addEventListener('keydown', (e) => {
      const st = d.step || (d.max - d.min) / 40;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setKnob(k, sim.knobs[k] + st);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setKnob(k, sim.knobs[k] - st);
      else return;
      e.preventDefault(); e.stopPropagation(); save();
    });
  }
  function setKnob(k, v) { sim.setKnob(k, v); paintKnob(k); applyKnobs(); }
  function paintKnob(k) {
    const d = KNOBS[k], v = sim.knobs[k], t = (v - d.min) / (d.max - d.min), el = knobEls[k];
    el.querySelector('.k-arc').setAttribute('d', t > 0.001 ? arc(0, t) : 'M0 0');
    const ang = -135 + 270 * t;
    el.querySelector('.k-ptr').setAttribute('transform', `rotate(${ang})`);
    el.querySelector('.k-val').textContent = d.labels ? d.labels[v | 0] : Math.round(t * 100);
    el.setAttribute('aria-valuenow', v);
    el.setAttribute('aria-valuetext', d.labels ? d.labels[v | 0] : Math.round(t * 100) + '%');
  }
  function arc(t0, t1) {
    const r = 21, a0 = (-135 + 270 * t0 - 90) * Math.PI / 180, a1 = (-135 + 270 * t1 - 90) * Math.PI / 180;
    const big = (t1 - t0) * 270 > 180 ? 1 : 0;
    return `M${(r * Math.cos(a0)).toFixed(2)} ${(r * Math.sin(a0)).toFixed(2)} A${r} ${r} 0 ${big} 1 ${(r * Math.cos(a1)).toFixed(2)} ${(r * Math.sin(a1)).toFixed(2)}`;
  }

  // ---------- pads ----------
  const padBox = root.querySelector('#sy-pads');
  const padEls = [];
  let editing = false, picked = 0;
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('button');
    b.className = 'pad';
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (editing) { picked = i; syncEdit(); }
      hitPad(i);
    });
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (editing) { picked = i; syncEdit(); } hitPad(i); } });
    padBox.appendChild(b);
    padEls.push(b);
  }
  function paintPads() {
    sim.pads.forEach((p, i) => {
      const b = padEls[i];
      b.classList.toggle('drum', sim.isDrum(p.voice));
      b.classList.toggle('picked', editing && i === picked);
      b.innerHTML = `<span class="p-key">${KEYS[i].toUpperCase()}</span><span>${p.voice}</span><span class="p-note">${sim.isDrum(p.voice) && p.voice !== 'tom' && p.voice !== 'laser' ? '' : noteName(p.note)}</span>`;
      b.setAttribute('aria-label', `Pad ${i + 1}: ${p.voice} ${noteName(p.note)}`);
    });
  }
  const editBox = root.querySelector('#sy-padedit'), voiceSel = root.querySelector('#sy-voice');
  function syncEdit() {
    editBox.hidden = !editing;
    editBtn.setAttribute('aria-pressed', String(editing));
    const p = sim.pads[picked];
    root.querySelector('#sy-padname').textContent = `Pad ${KEYS[picked].toUpperCase()}`;
    voiceSel.value = p.voice;
    root.querySelector('#sy-note').textContent = noteName(p.note);
    paintPads();
  }
  voiceSel.addEventListener('change', () => { sim.setPad(picked, { voice: voiceSel.value }); syncEdit(); hitPad(picked); save(); });
  root.querySelector('#sy-down').addEventListener('click', () => { sim.setPad(picked, { note: sim.pads[picked].note - 1 }); syncEdit(); hitPad(picked); save(); });
  root.querySelector('#sy-up').addEventListener('click', () => { sim.setPad(picked, { note: sim.pads[picked].note + 1 }); syncEdit(); hitPad(picked); save(); });
  const editBtn = document.getElementById('sy-edit');
  editBtn.addEventListener('click', () => { editing = !editing; syncEdit(); });

  // ---------- the sequencer ----------
  const seqBox = root.querySelector('#sy-seq');
  const stepEls = {};
  for (const t of TRACKS) {
    const name = document.createElement('span'); name.className = 't-name'; name.textContent = t;
    seqBox.appendChild(name);
    stepEls[t] = [];
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('button');
      b.className = 'step';
      b.setAttribute('aria-label', `${t} step ${i + 1}`);
      b.addEventListener('click', () => { sim.toggleStep(t, i); paintSeq(); save(); if (sim.pattern[t][i]) withAudio(() => playHit({ track: t, voice: t, note: sim.notes[i] }, A.c.currentTime)); });
      seqBox.appendChild(b);
      stepEls[t].push(b);
    }
  }
  let nowStep = -1;
  function paintSeq() {
    for (const t of TRACKS) stepEls[t].forEach((b, i) => {
      b.classList.toggle('on', sim.pattern[t][i]);
      b.classList.toggle('now', i === nowStep);
      b.setAttribute('aria-pressed', String(sim.pattern[t][i]));
    });
  }
  function playHit(h, when) {
    if (h.track === 'bass') play('bass', [sim.freq(h.note)], when, { hold: sim.stepDur() * 0.7 });
    else play(h.voice, [sim.freq(h.note)], when);
  }
  let nextT = 0, seqStep = 0;
  const marks = [];
  function schedule() {
    if (!sim.playing || !A) return;
    const c = A.c;
    if (nextT < c.currentTime - 0.2) nextT = c.currentTime + 0.05;   // fell behind (a background tab): start again from now
    while (nextT < c.currentTime + LOOKAHEAD) {
      for (const h of sim.hitsAt(seqStep)) playHit(h, nextT);
      marks.push({ step: seqStep % 16, t: nextT });
      nextT += sim.stepDur();
      seqStep++;
    }
  }
  const playBtn = document.getElementById('sy-play');
  function setPlaying(v) {
    sim.play(v);
    playBtn.setAttribute('aria-pressed', String(sim.playing));
    playBtn.innerHTML = sim.playing ? '■ Stop' : '&#9654; Play groove';
    if (sim.playing) withAudio(() => { nextT = A.c.currentTime + 0.06; seqStep = 0; marks.length = 0; });
    else { nowStep = -1; paintSeq(); }
  }
  playBtn.addEventListener('click', () => setPlaying(!sim.playing));
  const grooveSel = document.getElementById('sy-groove');
  for (const [k, gv] of Object.entries(GROOVES)) { const o = document.createElement('option'); o.value = k; o.textContent = gv.name; grooveSel.appendChild(o); }
  grooveSel.addEventListener('change', () => { sim.loadGroove(grooveSel.value); syncBpm(); paintSeq(); applyKnobs(); save(); });
  const bpm = document.getElementById('sy-bpm'), bpmOut = document.getElementById('sy-bpm-out');
  function syncBpm() { bpm.value = sim.bpm; bpmOut.textContent = sim.bpm; }
  bpm.addEventListener('input', () => { sim.setBpm(bpm.value); syncBpm(); applyKnobs(); save(); });

  // ---------- the scope ----------
  function drawScope() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(scope.clientWidth * d), h = Math.round(scope.clientHeight * d);
    if (!w || !h) return;
    if (scope.width !== w || scope.height !== h) { scope.width = w; scope.height = h; }
    sg.fillStyle = 'rgba(5, 1, 18, 0.55)'; sg.fillRect(0, 0, w, h);
    sg.strokeStyle = 'rgba(43, 240, 255, 0.10)'; sg.lineWidth = 1;
    sg.beginPath();
    for (let x = 0; x <= 10; x++) { sg.moveTo(x * w / 10, 0); sg.lineTo(x * w / 10, h); }
    for (let y = 0; y <= 4; y++) { sg.moveTo(0, y * h / 4); sg.lineTo(w, y * h / 4); }
    sg.stroke();
    let data = null;
    if (A) { A.an.getFloatTimeDomainData(A.buf); data = A.buf; }
    sg.lineWidth = 2.2 * d; sg.strokeStyle = '#2bf0ff'; sg.shadowColor = '#2bf0ff'; sg.shadowBlur = 12 * d;
    sg.beginPath();
    const N = 1024;
    let start = 0;
    if (data) for (let i = 1; i < data.length - N; i++) if (data[i - 1] < 0 && data[i] >= 0) { start = i; break; }
    for (let i = 0; i < N; i++) {
      const v = data ? data[start + i] : Math.sin(i / N * Math.PI * 4) * 0.02;
      const x = i / (N - 1) * w, y = h / 2 - v * h * 0.42;
      if (i) sg.lineTo(x, y); else sg.moveTo(x, y);
    }
    sg.stroke();
    sg.shadowBlur = 0;
  }

  function draw() {
    drawScope();
    if (A && sim.playing) {
      let s = -1;
      while (marks.length && marks[0].t <= A.c.currentTime) s = marks.shift().step;
      if (s >= 0 && s !== nowStep) { nowStep = s; paintSeq(); }
    }
  }
  function tick() { schedule(); }
  function key(e, isDown) {
    if (!isDown || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0) { hitPad(i); return true; }
    if (e.key === ' ') { setPlaying(!sim.playing); return true; }
    return false;
  }
  function show() { syncAll(); }
  function hide() { if (sim.playing) setPlaying(false); }
  function sound(on) { if (!on && sim.playing) setPlaying(false); }
  function syncAll() {
    for (const k of Object.keys(KNOBS)) paintKnob(k);
    grooveSel.value = sim.groove; syncBpm(); paintPads(); paintSeq(); syncEdit();
  }
  syncAll();

  return { draw, tick, key, show, hide, sound, hitPad, setPlaying, get chain() { return A; } };
}
