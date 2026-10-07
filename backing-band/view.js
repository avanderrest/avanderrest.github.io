/* Backing Band: the screen and the sound. The band on stage, the rack of buttons, the
   lights, every sound synthesised with Web Audio (drums from noise and swept sines,
   guitar by Karplus-Strong, the singer by a sawtooth through three formant filters),
   playback, the timeline dock and Mega Jam's looper. See sim.js for the songs and the
   scoring.

   The band plays a simplified pop backing and every button lights up as it is pressed;
   then you take one instrument at a time and play its part back. The speed switch slows
   everything down for practice. */
import {
  INST, SPEEDS, chord, note, drum, held, once, rest, SONGS, problems, midiOf, LEVELS, MEGA, byMk, scoreTimeline,
  freshSave, fromV1, createBand,
} from './sim.js';
import { expose } from '../lib/debug.js';


  // ---------- constants ----------
  const SAVE_KEY = 'backing-band-save-v2';   // v2: a percentage per part, where v1 kept stars
  const OLD_SAVE_KEY = 'backing-band-save-v1';
  const LIVE_DUR = { keys: 0.5, synth: 0.5, strings: 0.9, horns: 0.25, whistle: 0.35, bass: 0.32, guitar: 0.7, vocals: 0.45, drums: 0.2, fx: 2 };
  const LIGHT_MIN = 0.13;                 // s a pad stays lit, however short its note
  const RING_MS = 600;                    // a note this long shows as a tap that rings on
  const TAP_MS = 180;                     // ...and is fully lit for this long first
  const SHOW_MIN = 3;                     // s; a "Show me" shorter than this plays twice
  const JAM_MAX = 30;                     // s, longest loop the looper will take
  const JAM_AHEAD = 0.15;                 // s the looper schedules ahead of the clock
  const PLAY_AHEAD = 0.25;                // s a song's notes are made into sound ahead of the clock
  const VOWELS = {                        // formants F1, F2, F3 in Hz
    ee: [270, 2290, 3010],
    ah: [730, 1090, 2440],
    oh: [450, 800, 2830],
    oo: [300, 870, 2240],
    eh: [530, 1840, 2480],
  };
  const L_FORMANTS = [350, 1200, 2700];   // the tongue-up start of "la", which then opens to "ah"
  // the face's mouth for each vowel: "la" sings as "ah", a shouted "hey!" as "eh"
  const MOUTH = { la: 'ah', hey: 'eh' };

  // ---------- save ----------
  let save = freshSave();
  try {
    let raw = localStorage.getItem(SAVE_KEY);
    const old = localStorage.getItem(OLD_SAVE_KEY);
    if (!raw && old) {
      // carried across once
      raw = JSON.stringify(fromV1(JSON.parse(old)));
      localStorage.setItem(SAVE_KEY, raw);
      localStorage.removeItem(OLD_SAVE_KEY);
    }
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch (e) { /* private mode: play unsaved */ }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }

  // ---------- audio ----------
  let ac = null;
  let master = null;
  let noiseBuf = null;
  const plucks = new Map();               // midi -> Karplus-Strong buffer

  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ac.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function env(t, peak, attack, hold, release) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  }
  function noise(t, dur) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;                        // the buffer is a second long; a riser is not
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur);
    return s;
  }
  function osc(type, f, t, dur) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function playDrum(kind, t, out) {
    if (kind === 'kick') {
      const o = osc('sine', 150, t, 0.4);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ac.createGain();
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g).connect(out);
    } else if (kind === 'snare') {
      const n = noise(t, 0.22);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1300;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(hp).connect(g).connect(out);
      const o = osc('triangle', 190, t, 0.1);
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.4, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g2).connect(out);
    } else if (kind === 'hat') {
      const n = noise(t, 0.07);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(hp).connect(g).connect(out);
    } else if (kind === 'clap') {
      const n = noise(t, 0.25);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {       // a clap is a few hands, a hair apart
        g.gain.setValueAtTime(0.7, t + i * 0.011);
        g.gain.exponentialRampToValueAtTime(0.1, t + i * 0.011 + 0.009);
      }
      g.gain.setValueAtTime(0.5, t + 0.034);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(bp).connect(g).connect(out);
    } else if (kind === 'snap') {
      const n = noise(t, 0.08);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 2.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      n.connect(bp).connect(g).connect(out);
    } else if (kind === 'crash') {
      const n = noise(t, 1.4);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4200;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      n.connect(hp).connect(g).connect(out);
    } else if (kind === 'openhat') {
      const n = noise(t, 0.45);
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6500;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.26, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      n.connect(hp).connect(g).connect(out);
    } else if (kind === 'tamb') {
      // jingles: a few bright bursts close together
      const n = noise(t, 0.25);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 8500;
      bp.Q.value = 1.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        g.gain.setValueAtTime(0.5, t + i * 0.018);
        g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.018 + 0.014);
      }
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      n.connect(bp).connect(g).connect(out);
    } else if (kind === 'tomhi' || kind === 'tomlo') {
      const [from, to] = kind === 'tomhi' ? [240, 160] : [150, 95];
      const o = osc('sine', from, t, 0.45);
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + 0.2);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.75, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g).connect(out);
    } else if (kind === 'stomp') {
      // a boot on a wooden floor: a deep thud and the knock of the boards
      const o = osc('sine', 95, t, 0.35);
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(out);
      const n = noise(t, 0.12);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.45, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      n.connect(lp).connect(g2).connect(out);
    }
  }

  function playBass(m, t, dur, tone, out) {
    const g = env(t, tone === 'sub' ? 0.55 : 0.38, 0.006, Math.max(0.02, dur - 0.08), 0.09);
    if (tone === 'sub') {
      // a pure sub is all but silent on a laptop, so a little triangle above it
      osc('sine', hz(m), t, dur + 0.1).connect(g);
      const g2 = ac.createGain();
      g2.gain.value = 0.25;
      osc('triangle', hz(m + 12), t, dur + 0.1).connect(g2).connect(g);
    } else {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
      osc('sawtooth', hz(m), t, dur + 0.1).connect(lp).connect(g);
    }
    g.connect(out);
  }

  function playKeys(midis, t, dur, tone, out) {
    for (const m of midis) {
      if (tone === 'supersaw') {
        // the wide EDM lead: a stack of detuned saws
        const g = env(t, 0.05, 0.008, Math.max(0.02, dur - 0.06), 0.16);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3600;
        for (const det of [-22, -11, 0, 11, 22]) {
          const o = osc('sawtooth', hz(m), t, dur + 0.2);
          o.detune.value = det;
          o.connect(lp);
        }
        lp.connect(g).connect(out);
      } else if (tone === 'pluck') {
        // marimba-ish: a woody knock that dies away whatever the note's length
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc('sine', hz(m), t, 0.45).connect(g);
        const g2 = ac.createGain();
        g2.gain.setValueAtTime(0.4, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc('sine', hz(m) * 4, t, 0.08).connect(g2).connect(g);
        g.connect(out);
      } else if (tone === 'synth') {
        const g = env(t, 0.09, 0.02, Math.max(0.02, dur - 0.1), 0.18);
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        for (const det of [-7, 7]) {
          const o = osc('sawtooth', hz(m), t, dur + 0.2);
          o.detune.value = det;
          o.connect(lp);
        }
        lp.connect(g).connect(out);
      } else {
        // piano-ish: struck, then dying away whether the key is held or not
        const ring = Math.max(dur, 0.25) + 0.6;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
        osc('triangle', hz(m), t, ring).connect(g);
        const g2 = ac.createGain();
        g2.gain.value = 0.35;
        osc('sine', hz(m + 12), t, ring).connect(g2).connect(g);
        g.connect(out);
      }
    }
  }

  /* Karplus-Strong: a burst of noise one period long, fed round a loop that
     smooths it a little each pass. Raw white noise is a hard pick right at the
     bridge — all twang — so the burst is smoothed first: `soft` is how much,
     from a pick (0) to the flesh of a thumb on nylon (1). Softer strings also
     lose their top faster as they ring, which is what makes nylon sound warm. */
  function pluckBuffer(m, soft) {
    const key = m + '/' + soft;
    if (plucks.has(key)) return plucks.get(key);
    const sr = ac.sampleRate;
    const N = Math.round(sr / hz(m));
    const buf = ac.createBuffer(1, Math.floor(sr * 1.6), sr);
    const d = buf.getChannelData(0);
    const a = 0.75 - soft * 0.5;          // one-pole smoothing of the burst
    let y = 0;
    for (let i = 0; i < N; i++) { y += a * (Math.random() * 2 - 1 - y); d[i] = y; }
    let mean = 0;
    for (let i = 0; i < N; i++) mean += d[i] / N;
    for (let i = 0; i < N; i++) d[i] = (d[i] - mean) * 1.6;   // no thump of DC, and back up to strength
    const w = 0.25 + soft * 0.15;         // the outer taps of the loop's smoothing: more is darker
    const keep = 0.997 - soft * 0.002;
    for (let i = N; i < d.length; i++) {
      const b = i - N;
      d[i] = keep * (w * d[b] + (1 - 2 * w) * d[b + 1 < i ? b + 1 : b] + w * (b > 0 ? d[b - 1] : d[b]));
    }
    // the last few whole periods, to loop if the note is held past the end of the buffer:
    // whole periods, so the loop joins without a click
    const loopLen = N * Math.ceil((sr * 0.05) / N);
    buf.loopFrom = (d.length - loopLen) / sr;
    plucks.set(key, buf);
    return buf;
  }
  let drive = null;
  const GUITAR = {
    // soft: the pluck; drive: overdrive or not; tone: the last lowpass; peak, release, strum spacing
    electric: { soft: 0.35, drive: true, tone: 1900, peak: 0.24, release: 0.12, strum: 0.008 },
    clean: { soft: 0.45, drive: false, tone: 3400, peak: 0.24, release: 0.25, strum: 0.014 },
    nylon: { soft: 1, drive: false, tone: 2400, peak: 0.28, release: 0.35, strum: 0.022 },
  };
  function playGuitar(midis, t, dur, tone, out) {
    const G = GUITAR[tone] || GUITAR.electric;
    let into;
    let last;
    if (G.drive) {
      if (!drive) {
        drive = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; drive[i] = Math.tanh(x * 2.2); }
      }
      // trim the top before the drive, so the strings' fizz never gets distorted,
      // then roll off what the drive adds, the way a guitar speaker does
      // and drive it hard: the overdrive squashes the string's fade, so a held chord
      // stays full, as a real overdriven guitar's does
      into = ac.createGain();
      into.gain.value = 3;
      const pre = ac.createBiquadFilter();
      pre.type = 'lowpass';
      pre.frequency.value = 2600;
      const ws = ac.createWaveShaper();
      ws.curve = drive;
      ws.oversample = '2x';
      into.connect(pre).connect(ws);
      last = ws;
    } else {
      into = ac.createGain();
      last = into;
    }
    if (tone === 'nylon') {
      // the wooden body: a warm resonance low down
      const body = ac.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = 220;
      body.Q.value = 1.2;
      body.gain.value = 5;
      last.connect(body);
      last = body;
    }
    const hp = ac.createBiquadFilter();   // and nothing muddy beneath the guitar
    hp.type = 'highpass';
    hp.frequency.value = 80;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = G.tone;
    const g = env(t, G.peak, 0.004, Math.max(0.02, dur - 0.06), G.release);
    midis.forEach((m, i) => {
      const s = ac.createBufferSource();
      s.buffer = pluckBuffer(m, G.soft);
      s.loop = true;                      // held past the buffer, it rings on
      s.loopStart = s.buffer.loopFrom;
      s.loopEnd = s.buffer.duration;
      s.connect(into);
      s.start(t + i * G.strum);           // a strum, low string first
      s.stop(t + dur + 0.4);
    });
    last.connect(hp).connect(lp).connect(g).connect(out);
  }

  function playVoice(m, vowel, t, dur, out, choir) {
    const g = env(t, choir ? 0.3 : 0.5, 0.06, Math.max(0.02, dur - 0.1), 0.14);
    const target = VOWELS[MOUTH[vowel] || vowel];
    const filters = target.map((f, i) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      // wider as the note rises: a high voice has few harmonics, far apart, and a
      // narrow formant can fall between them and pass almost nothing
      bp.Q.value = f / Math.max(90, hz(m) * 0.6);
      // a note pitched above the vowel's first formant would get nothing through it,
      // so that formant rises to meet the note, as a singer's does up high
      if (i === 0) f = Math.max(f, hz(m) * 1.05);
      if (vowel === 'la') {
        bp.frequency.setValueAtTime(Math.max(L_FORMANTS[i], i === 0 ? f : 0), t);
        bp.frequency.linearRampToValueAtTime(f, t + 0.07);
      } else bp.frequency.value = f;
      const fg = ac.createGain();
      fg.gain.value = [1, 0.5, 0.25][i];
      bp.connect(fg).connect(g);
      return bp;
    });
    // a choir is a few singers, never quite in tune with each other, and one an octave down
    const voices = choir ? [[-9, 0, 5.1], [8, 0, 5.9], [0, -12, 5.5]] : [[0, 0, 5.6]];
    for (const [cents, shift, rate] of voices) {
      const o = osc('sawtooth', hz(m + shift), t, dur + 0.2);
      o.detune.value = cents;
      // vibrato that only comes in once the note has settled, as a singer's does
      const lfo = osc('sine', rate, t, dur + 0.2);
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(hz(m + shift) * 0.012, t + Math.min(0.35, dur));
      lfo.connect(depth).connect(o.frequency);
      filters.forEach((bp) => o.connect(bp));
    }
    g.connect(out);
  }

  // "Hey!": a breath, then a short "eh" that falls in pitch, shouted by a few people
  function playShout(m, t, out) {
    const n = noise(t, 0.06);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(0.35, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp).connect(gn).connect(out);
    const g = env(t + 0.03, 0.4, 0.015, 0.12, 0.1);
    const filters = VOWELS.eh.map((f, i) => {
      const f2 = ac.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = f;
      f2.Q.value = f / 70;
      const fg = ac.createGain();
      fg.gain.value = [1, 0.6, 0.3][i];
      f2.connect(fg).connect(g);
      return f2;
    });
    for (const cents of [-15, 0, 12]) {
      const o = osc('sawtooth', hz(m), t + 0.03, 0.3);
      o.detune.value = cents;
      o.frequency.setValueAtTime(hz(m), t + 0.03);
      o.frequency.exponentialRampToValueAtTime(hz(m - 4), t + 0.28);
      filters.forEach((f2) => o.connect(f2));
    }
    g.connect(out);
  }

  // strings: slow to swell, slow to fade — the attack never takes more than half the note
  function playStrings(midis, t, dur, out) {
    const attack = Math.min(0.28, dur * 0.5);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = env(t, 0.05, attack, Math.max(0.02, dur - attack), 0.45);
    for (const m of midis) {
      for (const det of [-12, -4, 5, 13]) {
        const o = osc('sawtooth', hz(m), t, dur + 0.5);
        o.detune.value = det;
        o.connect(lp);
      }
    }
    lp.connect(g).connect(out);
  }

  // horns: a stab with a little scoop up into the note and a brassy filter "bwap"
  function playHorns(midis, t, dur, out) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 0.04);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
    const g = env(t, 0.08, 0.02, Math.max(0.02, dur - 0.06), 0.09);
    for (const m of midis) {
      for (const [type, det, lvl] of [['sawtooth', -6, 1], ['sawtooth', 6, 1], ['square', 0, 0.4]]) {
        const o = osc(type, hz(m), t, dur + 0.15);
        o.detune.setValueAtTime(det - 40, t);
        o.detune.linearRampToValueAtTime(det, t + 0.04);
        const lg = ac.createGain();
        lg.gain.value = lvl;
        o.connect(lg).connect(lp);
      }
    }
    lp.connect(g).connect(out);
  }

  function playWhistle(m, t, dur, out) {
    const o = osc('sine', hz(m), t, dur + 0.1);
    const lfo = osc('sine', 6.2, t, dur + 0.1);
    const depth = ac.createGain();
    depth.gain.value = hz(m) * 0.015;
    lfo.connect(depth).connect(o.frequency);
    const g = env(t, 0.2, 0.03, Math.max(0.02, dur - 0.06), 0.06);
    o.connect(g).connect(out);
    // and the breath through the lips
    const n = noise(t, dur + 0.05);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz(m);
    bp.Q.value = 8;
    const gn = env(t, 0.05, 0.03, Math.max(0.02, dur - 0.06), 0.05);
    n.connect(bp).connect(gn).connect(out);
  }

  function playFx(kind, t, dur, out) {
    if (kind === 'riser') {
      // noise and a tone, both sweeping up and swelling into the drop
      const n = noise(t, dur);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      n.connect(bp).connect(g).connect(out);
      const o = osc('sawtooth', 180, t, dur);
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const g2 = ac.createGain();
      g2.gain.setValueAtTime(0.001, t);
      g2.gain.exponentialRampToValueAtTime(0.1, t + dur);
      g2.gain.linearRampToValueAtTime(0, t + dur + 0.05);
      o.connect(g2).connect(out);
    } else if (kind === 'cheer') {
      // a crowd: a swell of voices (shaped noise) with claps scattered through it
      const n = noise(t, 1);
      const n2 = noise(t + 0.9, 1);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 0.6;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.3);
      g.gain.setValueAtTime(0.35, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
      n.connect(bp);
      n2.connect(bp);
      bp.connect(g).connect(out);
      for (let i = 0; i < 14; i++) playDrum('clap', t + 0.1 + Math.random() * 1.4, out);
    }
  }

  /* The lead voice: a wordless "eeeaaaooo", distorted, in an ordinary singing
     range. Each note slides into the next in both pitch and vowel — that morph is
     the whole character — so a playback keeps one `lead` state: the chain every
     note goes through (built once, so a long song stays cheap) and the last note
     sung, to slide from. */
  let leadCurve = null;
  function leadChain(out) {
    if (!leadCurve) {
      leadCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; leadCurve[i] = Math.tanh(x * 4); }
    }
    const pre = ac.createGain();
    pre.gain.value = 3;
    const ws = ac.createWaveShaper();
    ws.curve = leadCurve;
    ws.oversample = '2x';
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 180;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const post = ac.createGain();
    post.gain.value = 0.16;
    pre.connect(ws).connect(hp).connect(lp).connect(post).connect(out);
    return { in: pre, last: null };
  }
  function playLead(btn, t, dur, lead) {
    const m = btn.midis[0];
    const vowel = MOUTH[btn.vowel] || btn.vowel;
    const to = VOWELS[vowel];
    // slide in from the note before if it has only just finished: a phrase, not a list
    const prev = lead.last && t - lead.last.end < 0.2 ? lead.last : null;
    const fromHz = prev ? hz(prev.m) : hz(m);
    const from = prev ? VOWELS[prev.vowel] : to;
    const glide = 0.09;
    const g = env(t, 1, prev ? 0.02 : 0.05, Math.max(0.02, dur - 0.05), 0.14);
    const filters = to.map((f, i) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = f / Math.max(90, hz(m) * 0.6);
      const f0 = i === 0 ? Math.max(from[0], fromHz * 1.05) : from[i];
      const f1 = i === 0 ? Math.max(f, hz(m) * 1.05) : f;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.linearRampToValueAtTime(f1, t + glide + 0.04);
      const fg = ac.createGain();
      fg.gain.value = [1, 0.6, 0.35][i];
      bp.connect(fg).connect(g);
      return bp;
    });
    for (const cents of [-6, 7]) {
      const o = osc('sawtooth', fromHz, t, dur + 0.2);
      o.detune.value = cents;
      o.frequency.setValueAtTime(fromHz, t);
      o.frequency.exponentialRampToValueAtTime(hz(m), t + glide);
      const lfo = osc('sine', 5.4, t, dur + 0.2);
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(hz(m) * 0.014, t + Math.min(0.4, dur));
      lfo.connect(depth).connect(o.frequency);
      filters.forEach((bp) => o.connect(bp));
    }
    g.connect(lead.in);
    lead.last = { m, vowel, end: t + dur };
  }

  // `part` is anything with inst, buttons and tone: a song's instrument, one
  // section's part, or the Mega Jam's, whose buttons carry their own tone
  function sound(part, b, t, dur, out) {
    const btn = part.buttons[b];
    const tone = btn.tone || part.tone;
    switch (part.inst) {
      case 'drums': playDrum(btn.drum, t, out); break;
      case 'bass': playBass(btn.midis[0], t, dur, tone, out); break;
      case 'keys': playKeys(btn.midis, t, dur, 'piano', out); break;
      case 'synth': playKeys(btn.midis, t, dur, tone || 'synth', out); break;
      case 'strings': playStrings(btn.midis, t, dur, out); break;
      case 'horns': playHorns(btn.midis, t, dur, out); break;
      case 'whistle': playWhistle(btn.midis[0], t, dur, out); break;
      case 'guitar': playGuitar(btn.midis, t, dur, tone, out); break;
      case 'vocals':
        if (btn.vowel === 'hey') playShout(btn.midis[0], t, out);
        else playVoice(btn.midis[0], btn.vowel, t, dur, out, tone === 'choir');
        break;
      case 'fx': playFx(btn.fx, t, dur, out); break;
    }
  }

  // ---------- the band on stage ----------
  /* A pixel band that plays along, after Amber's reference: chunky figures about
     9x16 on a flat colour, each holding their instrument. Every song has its own
     band, loosely after the real one — a look per instrument, a backdrop colour,
     who sings, and which parts one player covers (Stadium Stomp's band is two
     people). A figure moves when its part plays: a strum, a stick, a key, the
     singer's mouth on each vowel. Drawn at one canvas pixel per art pixel and
     scaled up by CSS, so it stays crisp. */
  const STAGE_W = 116;                    // canvas pixels across: room for six players
  const STAGE_H = 30;
  const FLOOR_Y = 22;                     // where the back wall meets the boards
  const FEET = 7;                         // a player's art is 20 rows; this puts their feet at row 26
  const FIG = 13;                         // one player's box, instrument included
  const SK = ['#f3cfb1', '#e4b08a', '#b98260', '#8a5a3c', '#5e3b26'];
  const HAIR = { black: '#1b1b1f', brown: '#5b3a24', dark: '#3a2618', blonde: '#e9c46a', platinum: '#f2ead3', red: '#b4462a', grey: '#a3a3a3' };
  const INK = '#1b1b1f';
  // L(hair style, hair colour, skin, top, trousers, extra fields)
  const L = (h, hc, sk, t, p, x = {}) => Object.assign({ h, hc, sk, t, p, s: INK }, x);
  // the player's position in the line-up: guitars on the left, the singer in the middle, drums at the back right
  const LINEUP = ['guitar', 'bass', 'whistle', 'vocals', 'horns', 'strings', 'keys', 'synth', 'drums'];

  const BANDS = {
    'neon-highway': { bg: '#2b0f3f', look: {
      vocals: L('short', HAIR.black, SK[3], '#c8102e', '#c8102e', { t2: '#1b1b1f' }),
      synth: L('quiff', HAIR.blonde, SK[0], '#1fb5ad', '#2a2a40', { i: '#ff3caa', x: ['shades'] }),
      bass: L('short', HAIR.dark, SK[2], '#3a3a5a', '#1b1b1f', { i: '#e6e6e6' }),
      drums: L('long', HAIR.brown, SK[1], '#5a1f6e', '#1b1b1f', { i: '#ff3caa' }) } },
    'midnight-sidewalk': { bg: '#4a3a6a', look: {
      vocals: L('fedora', HAIR.black, SK[3], '#2a2a2a', '#1b1b1f', { hat: '#111', x: ['glove', 'socks'] }),
      bass: L('afro', HAIR.black, SK[4], '#c08a2d', '#3a2a1a', { i: '#7a2a1a' }),
      keys: L('short', HAIR.black, SK[3], '#6b2d8c', '#1b1b1f', { i: '#202020' }),
      drums: L('afro', HAIR.dark, SK[3], '#d9d9d9', '#2b2b2b', { i: '#9c1c1c' }) } },
    'streetlight-anthem': { bg: '#1c2c4c', look: {
      vocals: L('long', HAIR.black, SK[2], '#f2f2f2', '#2a3a6a'),
      guitar: L('afro', HAIR.dark, SK[1], '#202020', '#202020', { i: '#d9d9d9' }),
      keys: L('long', HAIR.brown, SK[1], '#7b5ba6', '#2a2a2a', { i: '#1b1b1f' }),
      bass: L('long', HAIR.blonde, SK[0], '#8c2d2d', '#2a3a6a', { i: '#2a2a2a' }),
      drums: L('short', HAIR.brown, SK[1], '#e0c37a', '#2a2a2a', { i: '#1f4fa0' }) } },
    'whisper-bass': { bg: '#0f1a0f', look: {
      vocals: L('bob', HAIR.black, SK[0], '#c4e02b', '#c4e02b', { x: ['roots'] }),
      synth: L('short', HAIR.brown, SK[0], '#1b1b1f', '#1b1b1f', { i: '#2b2b2b', dj: true }),
      bass: L('short', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#c4e02b' }),
      drums: L('beanie', HAIR.dark, SK[1], '#2b2b2b', '#1b1b1f', { hat: '#c4e02b', i: '#2b2b2b' }) } },
    'stadium-stomp': { bg: '#b3131b', sings: 'guitar', merge: { bass: 'guitar' }, look: {
      guitar: L('long', HAIR.black, SK[0], '#d62828', '#1b1b1f', { i: '#f2f2f2' }),
      drums: L('long', HAIR.black, SK[0], '#f2f2f2', '#d62828', { i: '#d62828' }) } },
    'ash-and-echo': { bg: '#3b2a2a', look: {
      vocals: L('quiff', HAIR.brown, SK[0], '#2b2b2b', '#1b1b1f', { tall: true }),
      synth: L('short', HAIR.dark, SK[1], '#5c6f7a', '#1b1b1f', { i: '#d9d9d9' }),
      bass: L('short', HAIR.blonde, SK[0], '#7a7a6a', '#2a2a2a', { i: '#2a2a2a' }),
      drums: L('beard', HAIR.brown, SK[1], '#4a4a4a', '#1b1b1f', { x: ['beard'], i: '#b0b0b0' }) } },
    'rebel-strut': { bg: '#127c86', look: {
      vocals: L('beanie', HAIR.blonde, SK[0], '#e8e0c8', '#3a3a3a', { hat: '#c0392b', x: ['glasses', 'beard'] }),
      bass: L('long', HAIR.brown, SK[1], '#f2a33a', '#2a2a2a', { i: '#1b1b1f' }),
      keys: L('short', HAIR.dark, SK[1], '#2c3e50', '#2a2a2a', { i: '#c0392b' }),
      drums: L('cap', HAIR.dark, SK[1], '#f2f2f2', '#2a2a2a', { hat: '#1b1b1f', i: '#f2a33a' }) } },
    'sunbeam-parade': { bg: '#2f9be0', look: {
      keys: L('afro', HAIR.dark, SK[0], '#f2f2f2', '#2b4a8a', { x: ['shades', 'beard'], i: '#1b1b1f' }),
      strings: L('long', HAIR.brown, SK[0], '#6b3fa0', '#2a2a2a'),
      bass: L('long', HAIR.blonde, SK[0], '#c0392b', '#2a2a2a', { i: '#e8e8e8' }),
      drums: L('long', HAIR.dark, SK[1], '#e8c06a', '#2a2a2a', { x: ['moustache'], i: '#1b1b1f' }) } },
    'green-eyed-sprint': { bg: '#1d1d3c', look: {
      vocals: L('quiff', HAIR.dark, SK[0], '#1b1b1f', '#1b1b1f', { t2: '#e8e8e8' }),
      guitar: L('long', HAIR.dark, SK[1], '#5a5a5a', '#1b1b1f', { i: '#c0392b' }),
      bass: L('short', HAIR.blonde, SK[0], '#2a4a7a', '#1b1b1f', { i: '#e8e8e8' }),
      synth: L('short', HAIR.brown, SK[0], '#7a2a5a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#c0392b' }) } },
    'disco-chant': { bg: '#f2c14e', look: {
      vocals: L('short', HAIR.dark, SK[1], '#e8e8e8', '#2a2a2a'),
      keys: L('bald', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { x: ['beard', 'shades'], i: '#d9d9d9' }),
      guitar: L('cap', HAIR.black, SK[1], '#e8e8e8', '#1b1b1f', { hat: '#d62828', i: '#f2f2f2' }),
      bass: L('short', HAIR.brown, SK[2], '#6b2d8c', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('afro', HAIR.dark, SK[3], '#f28a1a', '#2a2a2a', { i: '#f2f2f2' }) } },
    'bounce-signal': { bg: '#3c1a5b', look: {
      synth: L('beanie', HAIR.dark, SK[0], '#1b1b1f', '#1b1b1f', { hat: '#ff4fa3', dj: true, i: '#4fd1ff' }),
      bass: L('short', HAIR.blonde, SK[0], '#4fd1ff', '#1b1b1f', { i: '#ff4fa3' }),
      drums: L('short', HAIR.dark, SK[2], '#ff4fa3', '#1b1b1f', { i: '#4fd1ff' }) } },
    'jungle-drop': { bg: '#1f5a2a', look: {
      synth: L('short', HAIR.brown, SK[0], '#1b1b1f', '#1b1b1f', { dj: true, i: '#39ff14' }),
      bass: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#39ff14' }),
      drums: L('cap', HAIR.dark, SK[1], '#39ff14', '#1b1b1f', { hat: '#1b1b1f', i: '#2a2a2a' }) } },
    'street-busker': { bg: '#f2b632', sings: 'keys', look: {
      keys: L('hat', HAIR.blonde, SK[0], '#e8573a', '#2a2a2a', { hat: '#3a2a1a', long: true, i: '#1b1b1f' }),
      bass: L('short', HAIR.dark, SK[1], '#2a6a5a', '#1b1b1f', { i: '#e8e8e8' }),
      drums: L('short', HAIR.brown, SK[0], '#e8e8e8', '#1b1b1f', { i: '#e8573a' }) } },
    'iron-stomp': { bg: '#5a1616', look: {
      vocals: L('bald', HAIR.dark, SK[0], '#1b1b1f', '#2a2a2a', { buzz: true }),
      drums: L('short', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#8a8a8a' }),
      bass: L('long', HAIR.dark, SK[0], '#2a2a2a', '#1b1b1f', { i: '#c0392b' }),
      synth: L('short', HAIR.blonde, SK[0], '#4a4a4a', '#1b1b1f', { i: '#2a2a2a' }) } },
    'whistle-swagger': { bg: '#262626', sings: 'whistle', look: {
      whistle: L('short', HAIR.dark, SK[0], '#f2f2f2', '#1b1b1f', { arm: SK[0], x: ['tattoo'] }),
      guitar: L('long', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#e8c06a' }),
      bass: L('short', HAIR.blonde, SK[0], '#2a3a6a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[3], '#8a1a1a', '#1b1b1f', { i: '#f2f2f2' }) } },
    'golden-rise': { bg: '#0d3b5a', look: {
      vocals: L('long', HAIR.black, SK[3], '#e8c06a', '#1b1b1f'),
      synth: L('cap', HAIR.blonde, SK[0], '#1b1b1f', '#1b1b1f', { hat: '#1b1b1f', dj: true, i: '#ff8a1a' }),
      keys: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#f2f2f2' }),
      bass: L('short', HAIR.brown, SK[0], '#3a3a3a', '#1b1b1f', { i: '#ff8a1a' }),
      drums: L('short', HAIR.dark, SK[2], '#ff8a1a', '#1b1b1f', { i: '#1b1b1f' }) } },
    'glitter-groove': { bg: '#5b2a86', look: {
      vocals: L('afro', HAIR.black, SK[4], '#f2c200', '#f2c200', { band: '#e8e8e8' }),
      horns: L('afro', HAIR.black, SK[3], '#e8e8e8', '#e8e8e8'),
      bass: L('afro', HAIR.black, SK[4], '#d4af37', '#2a2a2a', { i: '#c0392b' }),
      drums: L('short', HAIR.black, SK[3], '#c0392b', '#2a2a2a', { i: '#d4af37' }) } },
    'sunny-trumpet': { bg: '#f2a03c', look: {
      vocals: L('fedora', HAIR.black, SK[4], '#f2f2f2', '#e8d8b0', { hat: '#e8d8a0' }),
      horns: L('short', HAIR.black, SK[3], '#2a8a6a', '#2a2a2a'),
      synth: L('short', HAIR.blonde, SK[0], '#2a2a2a', '#1b1b1f', { dj: true, i: '#2ad4c0' }),
      bass: L('short', HAIR.dark, SK[3], '#e8573a', '#2a2a2a', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[3], '#f2f2f2', '#2a2a2a', { i: '#2a8a6a' }) } },
    'surf-monster': { bg: '#2f5f7a', sings: 'guitar', look: {
      guitar: L('fedora', HAIR.dark, SK[0], '#3a3a3a', '#1b1b1f', { hat: '#1b1b1f', x: ['glasses'], i: '#d9d9d9' }),
      bass: L('long', HAIR.black, SK[1], '#1b1b1f', '#1b1b1f', { i: '#c0392b' }),
      horns: L('short', HAIR.brown, SK[0], '#6a6a6a', '#1b1b1f'),
      drums: L('short', HAIR.dark, SK[0], '#2a2a2a', '#1b1b1f', { x: ['beard', 'glasses'], arm: '#4a6a8a', i: '#1b1b1f' }) } },
    'campfire-drop': { bg: '#d99c52', sings: 'guitar', look: {
      guitar: L('fedora', HAIR.black, SK[4], '#f2f2f2', '#3a3a3a', { hat: '#3a2a1a', i: '#c88a4a', acoustic: true }),
      synth: L('cap', HAIR.blonde, SK[0], '#1b1b1f', '#1b1b1f', { hat: '#1b1b1f', dj: true, i: '#4fd1ff' }),
      bass: L('short', HAIR.brown, SK[0], '#6a4a2a', '#2a2a2a', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[1], '#2a2a2a', '#1b1b1f', { i: '#c88a4a' }) } },
    'late-night-crawl': { bg: '#dcdcdc', sings: 'guitar', look: {
      guitar: L('quiff', HAIR.black, SK[0], '#1b1b1f', '#1b1b1f', { t2: '#e8e8e8', i: '#e8e8e8' }),
      bass: L('short', HAIR.dark, SK[0], '#3a3a3a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[0], '#3a3a3a', '#1b1b1f', { i: '#1b1b1f' }) } },
    'dizzy-dancefloor': { bg: '#e0218a', look: {
      vocals: L('bob', HAIR.platinum, SK[0], '#cfd8dc', '#cfd8dc', { x: ['shades', 'bow'] }),
      synth: L('short', HAIR.dark, SK[2], '#1b1b1f', '#1b1b1f', { dj: true, i: '#ff4fa3' }),
      bass: L('short', HAIR.blonde, SK[0], '#e8e8e8', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { i: '#e8e8e8' }) } },
    'dancefloor-dare': { bg: '#ff6f61', sings: 'synth', look: {
      synth: L('quiff', HAIR.dark, SK[0], '#1b1b1f', '#2a2a2a', { x: ['paint'], i: '#2a2a2a' }),
      guitar: L('long', HAIR.brown, SK[0], '#f2f2f2', '#2a2a2a', { x: ['paint'], i: '#4fd1ff' }),
      bass: L('short', HAIR.blonde, SK[0], '#2a4a8a', '#2a2a2a', { x: ['paint'], i: '#f2f2f2' }),
      drums: L('short', HAIR.dark, SK[0], '#f2c200', '#2a2a2a', { x: ['paint'], i: '#2a4a8a' }) } },
    'falling-keys': { bg: '#3a3a3a', look: {
      vocals: L('spiky', HAIR.platinum, SK[0], '#1b1b1f', '#4a4a4a', { x: ['glasses'] }),
      keys: L('short', HAIR.black, SK[1], '#7a7a7a', '#1b1b1f', { i: '#1b1b1f' }),
      guitar: L('short', HAIR.dark, SK[0], '#2a2a2a', '#1b1b1f', { x: ['phones'], i: '#c0392b' }),
      bass: L('short', HAIR.dark, SK[1], '#5a5a5a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('bald', HAIR.dark, SK[0], '#1b1b1f', '#1b1b1f', { i: '#7a7a7a' }) } },
    'champion-run': { bg: '#c8641e', look: {
      guitar: L('long', HAIR.brown, SK[0], '#1b1b1f', '#1b1b1f', { band: '#f2f2f2', i: '#f2f2f2' }),
      bass: L('long', HAIR.blonde, SK[0], '#e8e8e8', '#2a3a6a', { i: '#1b1b1f' }),
      drums: L('long', HAIR.dark, SK[0], '#c0392b', '#1b1b1f', { i: '#1b1b1f' }) } },
    'dusty-bassline': { bg: '#16162a', look: {
      vocals: L('short', HAIR.black, SK[1], '#f2c200', '#f2f2f2', { x: ['moustache'] }),
      bass: L('short', HAIR.brown, SK[0], '#2a2a2a', '#1b1b1f', { i: '#e8e8e8' }),
      guitar: L('curly', HAIR.dark, SK[0], '#f2f2f2', '#1b1b1f', { i: '#8a1a1a' }),
      drums: L('long', HAIR.blonde, SK[0], '#6a6a6a', '#1b1b1f', { i: '#e8e8e8' }) } },
    'seaside-rave': { bg: '#1e88c8', crabs: true, look: {
      synth: L('crab', 0, 0, '#ef5b2f', 0, { dj: true, i: '#39ff14' }),
      bass: L('crab', 0, 0, '#f27a3a', 0, { i: '#e8e8e8' }),
      drums: L('crab', 0, 0, '#e8432a', 0, { i: '#f2c200' }) } },
    'runway-chant': { bg: '#5a0f1c', look: {
      vocals: L('long', HAIR.platinum, SK[0], '#f2f2f2', '#f2f2f2', { x: ['shades'] }),
      synth: L('short', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { dj: true, i: '#d62828' }),
      bass: L('short', HAIR.blonde, SK[0], '#3a3a3a', '#1b1b1f', { i: '#d62828' }),
      drums: L('short', HAIR.dark, SK[2], '#d62828', '#1b1b1f', { i: '#f2f2f2' }) } },
    'skyward-brass': { bg: '#6a2c91', look: {
      vocals: L('quiff', HAIR.dark, SK[0], '#d4af37', '#1b1b1f', { t2: '#1b1b1f' }),
      horns: L('short', HAIR.brown, SK[1], '#1b1b1f', '#1b1b1f'),
      bass: L('short', HAIR.blonde, SK[0], '#2a2a2a', '#1b1b1f', { i: '#d4af37' }),
      drums: L('short', HAIR.dark, SK[0], '#f2f2f2', '#1b1b1f', { i: '#1b1b1f' }) } },
    'easy-falsetto': { bg: '#ffd84a', look: {
      vocals: L('curly', HAIR.dark, SK[1], '#ff4fa3', '#2a5aa0', { t2: '#f2f2f2' }),
      synth: L('short', HAIR.blonde, SK[0], '#2ad4c0', '#1b1b1f', { i: '#f2f2f2' }),
      strings: L('long', HAIR.red, SK[0], '#6b3fa0', '#1b1b1f'),
      bass: L('short', HAIR.dark, SK[2], '#f28a1a', '#1b1b1f', { i: '#1b1b1f' }),
      drums: L('short', HAIR.brown, SK[0], '#2a5aa0', '#1b1b1f', { i: '#ff4fa3' }) } },
    mega: { bg: '#00a3e0', look: {
      guitar: L('short', HAIR.dark, SK[1], '#8fa6d8', '#1f2a4a', { i: '#e8c06a' }),
      bass: L('short', HAIR.grey, SK[0], '#6b3a1a', '#1f2a4a', { i: '#2a2a2a' }),
      vocals: L('short', HAIR.dark, SK[1], '#4f6b3a', '#c8b88a'),
      horns: L('short', HAIR.brown, SK[2], '#c0392b', '#1b1b1f'),
      synth: L('quiff', HAIR.blonde, SK[0], '#2a2a2a', '#1b1b1f', { i: '#ff4fa3' }),
      drums: L('short', HAIR.dark, SK[1], '#1f3a6a', '#1b1b1f', { i: '#d62828' }) } },
  };

  // a player nobody has dressed: picked from the song and instrument, so it never changes
  function defaultLook(songId, inst) {
    let h = 0;
    for (const c of songId + inst) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const pick = (list) => list[(h = (h * 1103515245 + 12345) >>> 0) % list.length];
    return L(pick(['short', 'long', 'quiff', 'beanie', 'cap', 'afro']), pick(Object.values(HAIR).slice(0, 5)), pick(SK),
      pick(['#c0392b', '#2a6a5a', '#3a3a5a', '#e8e8e8', '#6b3fa0', '#d4af37']), pick(['#1b1b1f', '#2a3a6a', '#3a3a3a']),
      { hat: pick(['#1b1b1f', '#c0392b', '#2a6a5a']), i: pick(['#1b1b1f', '#e8e8e8', '#c0392b', '#d4af37']) });
  }

  const stageEl = document.getElementById('band');
  const sctx = stageEl.getContext('2d');
  stageEl.width = STAGE_W;
  stageEl.height = STAGE_H;
  const band = { members: [], byInst: {}, bg: '#000', running: false };

  function bandFor(song) {
    const spec = BANDS[song.id] || { bg: '#2a2a2a', look: {} };
    const merge = spec.merge || {};
    const insts = song.mega ? Object.keys(spec.look) : [...song.order, ...(song.sung && !spec.sings ? ['vocals'] : [])];
    const members = [];
    const byInst = {};
    for (const inst of LINEUP) {
      if (!insts.includes(inst) || merge[inst]) continue;
      const m = { inst, look: spec.look[inst] || defaultLook(song.id, inst), until: 0, alt: false, singUntil: 0, vowel: '' };
      m.mic = spec.sings === inst;
      members.push(m);
      byInst[inst] = m;
    }
    for (const [from, to] of Object.entries(merge)) byInst[from] = byInst[to];
    // the singer is whoever sings: a separate figure, or the player named by `sings`
    byInst.voice = byInst[spec.sings] || byInst.vocals;
    // in Mega Jam the instruments without a player of their own nudge the nearest look-alike
    if (song.mega) for (const inst of Object.keys(INST)) byInst[inst] = byInst[inst] || byInst.synth;
    band.members = members;
    band.byInst = byInst;
    band.bg = spec.bg;
    band.id = song.id;
    drawBand();
  }

  function bandHit(inst, ms) {
    const m = band.byInst[inst];
    if (!m) return;
    m.until = performance.now() + Math.max(120, ms);
    m.alt = !m.alt;
    wake();
  }
  function bandSing(vowel, ms) {
    const m = band.byInst.voice;
    if (!m) return;
    m.singUntil = performance.now() + ms;
    m.vowel = MOUTH[vowel] || vowel;
    if (m.inst === 'vocals') { m.until = m.singUntil; m.alt = !m.alt; }
    wake();
  }
  function bandRest() {
    for (const m of band.members) { m.until = 0; m.singUntil = 0; }
    drawBand();
  }
  // redraw every frame while anyone is moving, then stop until the next note
  function wake() {
    if (band.running) return;
    band.running = true;
    const frame = () => {
      drawBand();
      const now = performance.now();
      if (band.members.some((m) => now < m.until || now < m.singUntil)) requestAnimationFrame(frame);
      else { band.running = false; drawBand(); }
    };
    requestAnimationFrame(frame);
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  const stageBg = document.createElement('canvas');
  stageBg.width = STAGE_W;
  stageBg.height = STAGE_H;
  let stageBgFor = null;

  /* Every band plays on its own stage: a wall and a floor, each picked from a set
     of painted styles with its own colours, so no two songs share a backdrop.
     Mega Jam keeps the wooden stage from the reference. A stage only changes with
     the song, so it is painted once onto its own canvas and copied each frame. */
  const STAGES = {
    'neon-highway': ['synthwave', 'grid', {}],
    'midnight-sidewalk': ['city', 'lighttiles', { tiles: ['#f2f2f2', '#7fd4ff', '#ffe08a'] }],
    'streetlight-anthem': ['stadium', 'boards', { f: ['#3a2a1e', '#33251a', '#40301f'] }],
    'whisper-bass': ['curtain', 'concrete', { c: '#163a22', fc: '#3a3d3a' }],
    'stadium-stomp': ['garage', 'concrete', { c1: '#c9c9c9', c2: '#c8102e', fc: '#555555' }],
    'ash-and-echo': ['volcano', 'stone', { fc: '#4a4440' }],
    'rebel-strut': ['panels', 'checker', { c: '#1f7a80', f1: '#111111', f2: '#eeeeee' }],
    'sunbeam-parade': ['sky', 'grass', { fc: '#4a9a3a' }],
    'green-eyed-sprint': ['brick', 'boards', { c: '#8a3324' }],
    'disco-chant': ['disco', 'checker', { c: '#2a0f3a', f1: '#d4af37', f2: '#1a1208' }],
    'bounce-signal': ['lasers', 'led', { c: '#ff2fd6', c2: '#3cf2ff', tiles: ['#ff2fd6', '#3cf2ff', '#7a3cff'] }],
    'jungle-drop': ['jungle', 'grass', { fc: '#245a1c' }],
    'street-busker': ['street', 'cobbles', { fc: '#6a6560' }],
    'iron-stomp': ['fire', 'metal', { fc: '#4a4c50' }],
    'whistle-swagger': ['curtain', 'boards', { c: '#8a0f1c', trim: true, f: ['#a87a4a', '#9a6e40', '#b38452'] }],
    'golden-rise': ['lasers', 'metal', { c: '#ffb020', c2: '#ff6a1a', fc: '#2c2e33' }],
    'glitter-groove': ['disco', 'lighttiles', { c: '#3a1060', tiles: ['#ff4fa3', '#ffd23f', '#3cf2ff', '#7dff6a'] }],
    'sunny-trumpet': ['beach', 'sand', { fc: '#e8c98a' }],
    'surf-monster': ['spooky', 'boards', { f: ['#3a2a3a', '#33233a', '#40303f'] }],
    'campfire-drop': ['desert', 'sand', { fc: '#b07a4a' }],
    'late-night-crawl': ['waveform', 'carpet', { fc: '#2a2a2e' }],
    'dizzy-dancefloor': ['spotlights', 'led', { c: '#ff4fa3', tiles: ['#ff4fa3', '#ff8fd0', '#ffffff'] }],
    'dancefloor-dare': ['stripes', 'boards', { f: ['#c89a6a', '#bb8d5e', '#d4a676'] }],
    'champion-run': ['ring', 'mat', {}],
    'dusty-bassline': ['saloon', 'sand', { fc: '#9a7a52' }],
    'seaside-rave': ['underwater', 'sand', { fc: '#d8c08a' }],
    'runway-chant': ['runway', 'runwayfloor', {}],
    'skyward-brass': ['dusk', 'boards', { f: ['#5a3a2a', '#4f3324', '#64432f'] }],
    'easy-falsetto': ['polka', 'checker', { c1: '#ffe2ee', c2: '#ff8fc8', f1: '#ff8fc8', f2: '#ffffff' }],
    'falling-keys': ['smoke', 'metal', { fc: '#222326' }],
    mega: ['planks', 'boards', {}],
  };

  function stageKit(g, seedFrom) {
    let seed = 7;
    for (const ch of seedFrom) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const W = STAGE_W, H = STAGE_H, F = FLOOR_Y;
    const K = {
      g, W, H, F,
      rnd: () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 10000) / 10000,
      px: (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); },
      rect: (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
      vg: (y0, y1, c0, c1) => {
        const gr = g.createLinearGradient(0, y0, 0, y1);
        gr.addColorStop(0, c0);
        gr.addColorStop(1, c1);
        g.fillStyle = gr;
        g.fillRect(0, y0, W, y1 - y0);
      },
      disc: (cx, cy, r, c) => {
        for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.5) K.px(x, y, c);
        }
      },
      line: (x0, y0, x1, y1, c) => {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= n; i++) K.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
      },
      beam: (x, w, c, a) => {                       // a cone of light from the top
        g.globalAlpha = a;
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x - w, F);
        g.lineTo(x + w, F);
        g.closePath();
        g.fill();
        g.globalAlpha = 1;
      },
      // the sides, where the eye-catching things go: about 26 columns each, with a ragged edge
      side: (x, y = 0) => Math.min(x, W - 1 - x) < 22 + ((Math.round(x) * 7 + Math.round(y) * 13) % 8),
      sx: () => (K.rnd() < 0.5 ? K.rnd() * 24 : W - 1 - K.rnd() * 24),
      stars: (n, y1, c = '#ffffff', sides) => { for (let i = 0; i < n; i++) K.px(sides ? K.sx() : K.rnd() * W, K.rnd() * y1, c); },
      beamTop: () => { K.rect(0, 0, W, 3, '#1d1f22'); K.rect(0, 3, W, 1, '#34373c'); },
      crowd: (top) => {
        for (let x = 0; x < W; x++) {
          if (!K.side(x)) continue;
          const h = 2 + Math.floor(K.rnd() * 3);
          K.rect(x, F - h - (top || 0), 1, h + (top || 0), '#05060b');
          if (K.rnd() < 0.12) K.px(x, F - h - (top || 0) - 1 - Math.floor(K.rnd() * 2), '#05060b');
          if (K.rnd() < 0.05) K.px(x, F - 4 - (top || 0), '#bfe3ff');
        }
      },
    };
    return K;
  }

  /* The walls. The middle, where the band stands, stays plain: anything that
     catches the eye — flames, lasers, leaves, crowds, sparkle — keeps to the two
     sides (K.side), with a ragged edge so it fades rather than stops. */
  const WALLS = {
    planks(K) {
      const planks = ['#5b3b23', '#4f331e', '#64432a', '#573821'];
      for (let x = 0, k = 0; x < K.W; x += 6, k++) {
        const c = planks[k % planks.length];
        K.rect(x, 0, 6, K.F, c);
        K.rect(x, 0, 1, K.F, '#2b1b0e');
        for (let i = 0; i < 7; i++) K.px(x + 1 + Math.floor(K.rnd() * 5), Math.floor(K.rnd() * K.F), shade(c, 0.82 + K.rnd() * 0.3));
      }
      K.beamTop();
    },
    synthwave(K) {
      K.vg(0, K.F, '#0d0420', '#4a0f5c');
      K.stars(24, 9, '#ffffff', true);
      // the striped sun, sinking at the left
      const cx = 16, cy = 15, r = 7;
      for (let y = cy - r; y < K.F; y++) {
        if (y > cy && (y - cy) % 3 === 0) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const t = (y - (cy - r)) / (2 * r);
          K.px(x, y, t < 0.5 ? '#ffd23f' : t < 0.75 ? '#ff8a3c' : '#ff3c8e');
        }
      }
      for (let x = 0; x < K.W; x++) {
        const h = K.side(x) ? Math.round(3 + Math.abs(Math.sin(x * 0.21)) * 3 + Math.abs(Math.sin(x * 0.07)) * 3) : 2;
        K.rect(x, K.F - h, 1, h, '#1a0830');
        K.px(x, K.F - h, '#ff3c8e');
      }
    },
    city(K) {
      K.vg(0, K.F, '#070a1a', '#1c2452');
      K.stars(18, 8, '#ffffff', true);
      K.disc(104, 5, 2, '#f2ecd0');
      for (let x = 0; x < K.W;) {
        const w = 5 + Math.floor(K.rnd() * 7), h = (K.side(x) ? 7 : 5) + Math.floor(K.rnd() * (K.side(x) ? 12 : 5));
        K.rect(x, K.F - h, w, h, K.rnd() < 0.5 ? '#0c0f1f' : '#141830');
        if (K.side(x)) for (let wy = K.F - h + 2; wy < K.F - 1; wy += 2) for (let wx = x + 1; wx < x + w - 1; wx += 2) {
          if (K.rnd() < 0.3) K.px(wx, wy, K.rnd() < 0.7 ? '#ffd36b' : '#fff2c0');
        }
        x += w + (K.rnd() < 0.3 ? 1 : 0);
      }
    },
    stadium(K) {
      K.vg(0, K.F, '#05070f', '#141a2e');
      K.rect(0, 2, K.W, 1, '#3a3f48');
      for (let x = 6; x < K.W; x += 12) {
        if (K.side(x)) K.beam(x + 1, 7, '#fff2b0', 0.1);
        K.rect(x, 3, 2, 1, '#fff6c8');
      }
      K.crowd(1);
    },
    curtain(K, o) {
      const f = [0.82, 0.92, 1.04, 1.1, 0.96];
      for (let x = 0; x < K.W; x++) K.rect(x, 0, 1, K.F, shade(o.c, f[x % 5]));
      for (let x = 0; x < K.W; x++) {
        K.rect(x, 0, 1, 4, shade(o.c, 0.75));
        if (x % 6 < 3) K.px(x, 4, shade(o.c, 0.75));
      }
      if (o.trim) for (let x = 0; x < K.W; x++) if (x % 6 < 3) K.px(x, 5, '#d4af37');
    },
    garage(K, o) {
      for (let y = 0; y < K.F; y++) K.rect(0, y, K.W, 1, y % 2 ? shade(o.c1, 0.9) : o.c1);
      K.rect(0, 0, K.W, 3, o.c2);
      K.rect(0, 3, K.W, 1, '#f2f2f2');
      K.rect(0, 4, K.W, 1, o.c2);
      for (const x of [8, K.W - 10]) { K.rect(x, 6, 2, K.F - 6, '#7a7a7a'); K.rect(x, 6, 1, K.F - 6, '#9a9a9a'); }
    },
    volcano(K) {
      K.vg(0, K.F, '#1c0806', '#7a2c12');
      // the volcano rises off to the left, smoking
      const vx = 16;
      for (let i = 0; i < 10; i++) K.disc(vx - 5 + K.rnd() * 10, 1 + K.rnd() * 4, 1 + K.rnd() * 2, '#4a3a36');
      for (let y = 7; y < K.F; y++) {
        const hw = (y - 7) * 1.4 + 2;
        for (let x = vx - hw; x < vx + hw; x++) K.px(x, y, K.rnd() < 0.1 ? '#3a241c' : '#2b1a14');
      }
      K.rect(vx - 2, 7, 4, 1, '#ff7a1a');
      for (let s = 0; s < 2; s++) {
        let x = vx - 1 + s;
        for (let y = 8; y < 14 + s * 2; y++) { x += Math.round((K.rnd() - 0.5) * 2); K.px(x, y, '#ff5a0a'); }
      }
      for (let i = 0; i < 24; i++) K.px(K.sx(), K.rnd() * K.F, '#9a8a80');
    },
    panels(K, o) {
      const cs = [o.c, shade(o.c, 0.93), shade(o.c, 1.05)];
      for (let x = 0, k = 0; x < K.W; x += 8, k++) {
        K.rect(x, 0, 8, K.F, cs[k % 3]);
        K.rect(x, 0, 1, K.F, shade(o.c, 0.7));
      }
      K.rect(0, 15, K.W, K.F - 15, shade(o.c, 0.78));
      K.rect(0, 15, K.W, 1, shade(o.c, 1.2));
      K.beamTop();
    },
    sky(K) {
      K.vg(0, K.F, '#2f7fd6', '#a8dcff');
      K.disc(104, 5, 4, '#fff6c8');
      K.disc(104, 5, 3, '#fff1a8');
      for (let i = 0; i < 6; i++) {
        const cx = K.sx() - 3, cy = 2 + K.rnd() * 9;
        K.rect(cx, cy, 7, 2, '#ffffff');
        K.rect(cx + 1, cy - 1, 4, 1, '#ffffff');
        K.rect(cx + 2, cy + 2, 5, 1, '#e0eefc');
      }
    },
    brick(K, o) {
      K.rect(0, 0, K.W, K.F, shade(o.c, 0.45));
      for (let y = 0, r = 0; y < K.F; y += 3, r++) {
        for (let x = r % 2 ? -3 : 0; x < K.W; x += 6) K.rect(x, y, 5, 2, shade(o.c, (K.side(x) ? 0.82 : 0.88) + K.rnd() * (K.side(x) ? 0.32 : 0.12)));
      }
      K.beamTop();
    },
    disco(K, o) {
      K.vg(0, K.F, shade(o.c, 0.55), o.c);
      for (let i = 0; i < 4; i++) K.beam(K.sx(), 5, ['#ff4fa3', '#4fd1ff', '#ffd23f'][i % 3], 0.08);
      for (let i = 0; i < 40; i++) K.px(K.sx(), 5 + K.rnd() * (K.F - 5), ['#ff4fa3', '#4fd1ff', '#ffd23f', '#ffffff'][i % 4]);
      K.rect(K.W / 2, 0, 1, 1, '#888888');
      K.disc(K.W / 2, 3, 2, '#cfcfcf');
      K.px(K.W / 2 - 1, 2, '#8a8a8a'); K.px(K.W / 2 + 1, 4, '#8a8a8a');
    },
    lasers(K, o) {
      K.rect(0, 0, K.W, K.F, '#06040a');
      // two emitters in the top corners, each fanning down its own side
      for (const [x0, dir] of [[2, 1], [K.W - 3, -1]]) {
        for (let i = 0; i < 5; i++) K.line(x0, 1, x0 + dir * (4 + i * 5), K.F - 1, i % 2 ? o.c2 : o.c);
        K.rect(x0 - 1, 0, 3, 2, '#2a2a2a');
      }
    },
    jungle(K) {
      K.vg(0, K.F, '#0b2a12', '#123c19');
      for (let v = 0; v < 6; v++) {
        let x = K.sx();
        for (let y = 0; y < K.F - 4; y++) { x += Math.round((K.rnd() - 0.5) * 1.4); K.px(x, y, '#1f5a24'); }
      }
      const greens = ['#2f7a2a', '#3f9a32', '#1f6a24', '#58b23a'];
      for (let i = 0; i < 110; i++) {
        const x = K.sx(), y = K.rnd() * K.F, c = greens[i % 4];
        K.px(x, y, c); K.px(x + 1, y, c); K.px(x + 1, y + 1, c);
      }
      // a canopy along the top joins the two sides
      for (let x = 0; x < K.W; x++) K.rect(x, 0, 1, 1 + Math.round(Math.abs(Math.sin(x * 0.4)) * 2), greens[x % 4]);
      for (let i = 0; i < 8; i++) K.px(K.sx(), K.rnd() * K.F, i % 2 ? '#ff4fa3' : '#ffd23f');
    },
    street(K) {
      WALLS.brick(K, { c: '#5a3226' });
      K.rect(0, 0, K.W, 4, '#1a1f36');
      K.rect(2, 5, 20, 2, '#c8102e');
      for (let x = 2; x < 22; x += 4) K.rect(x, 5, 2, 2, '#f2f2f2');
      K.rect(3, 7, 18, 12, '#2a1a10');
      K.rect(4, 8, 16, 10, '#ffd88a');
      K.rect(4, 8, 16, 2, '#ffe9b8');
      K.rect(11, 8, 1, 10, '#2a1a10');
      K.rect(104, 5, 1, K.F - 5, '#1a1a1a');
      K.rect(102, 4, 5, 2, '#2a2a2a');
      K.g.globalAlpha = 0.35;
      K.disc(104, 7, 4, '#ffe08a');
      K.g.globalAlpha = 1;
      K.rect(103, 6, 3, 1, '#fff2c0');
    },
    fire(K) {
      K.vg(0, K.F, '#060203', '#2a0805');
      for (let x = 0; x < K.W; x++) {
        if (!K.side(x)) continue;
        const h = Math.round(4 + Math.abs(Math.sin(x * 0.37)) * 6 + K.rnd() * 4);
        for (let y = K.F - h; y < K.F; y++) {
          const t = (y - (K.F - h)) / h;
          K.px(x, y, t < 0.3 ? '#fff0a0' : t < 0.6 ? '#ff9a1a' : '#c8340c');
        }
      }
      for (let i = 0; i < 18; i++) K.px(K.sx(), 2 + K.rnd() * 10, '#ffcc66');
    },
    waveform(K) {
      K.rect(0, 0, K.W, K.F, '#0a0a0a');
      // a fine sound wave across the top, above the band's heads: just its outline
      for (let x = 4; x < K.W - 4; x++) {
        const a = Math.round(Math.abs(Math.sin(x * 0.23) * Math.sin(x * 0.061)) * (K.side(x) ? 3 : 1));
        K.px(x, 4 - a, '#ededed');
        K.px(x, 4 + a, '#ededed');
      }
    },
    spotlights(K, o) {
      K.rect(0, 0, K.W, K.F, '#0c0610');
      for (const x of [8, 22, K.W - 23, K.W - 9]) {
        K.beam(x, 7, o.c, 0.2);
        K.rect(x - 1, 0, 3, 2, '#2a2a2a');
        K.px(x, 2, '#ffffff');
      }
    },
    stripes(K) {
      const cs = ['#ff4fa3', '#ffd23f', '#4fd1ff', '#ff8a1a', '#f2f2f2'];
      K.rect(0, 0, K.W, K.F, '#2a2633');
      for (let y = 0; y < K.F; y++) for (let x = 0; x < K.W; x++) if (K.side(x, y)) K.px(x, y, cs[Math.floor((x + y) / 6) % 5]);
    },
    ring(K) {
      K.vg(0, K.F, '#07080d', '#151a2a');
      K.beam(K.W / 2, 30, '#fff6d8', 0.08);
      K.crowd(3);
      for (const x of [3, K.W - 6]) K.rect(x, 9, 3, K.F - 9, '#c0c0c0');
      [[12, '#a82020'], [15, '#bdbdbd'], [18, '#22487e']].forEach(([y, c]) => K.rect(6, y, K.W - 12, 1, c));
    },
    saloon(K) {
      const cs = ['#4a2c18', '#452915', '#4f301a'];
      for (let y = 0, k = 0; y < K.F; y += 3, k++) { K.rect(0, y, K.W, 3, cs[k % 3]); K.rect(0, y, K.W, 1, '#2f1b0d'); }
      for (const x of [6, K.W - 14]) {
        K.rect(x, 6, 8, 10, '#e8d8b0');
        K.rect(x + 1, 7, 6, 1, '#3a2010');
        K.rect(x + 2, 9, 4, 4, '#b8a888');
        K.rect(x + 1, 14, 6, 1, '#3a2010');
      }
      K.g.globalAlpha = 0.25;
      K.disc(K.W / 2, 2, 5, '#ffcf7a');
      K.g.globalAlpha = 1;
      K.rect(K.W / 2 - 1, 0, 2, 2, '#2a2a2a');
      K.rect(K.W / 2 - 1, 2, 2, 1, '#ffe2a0');
      for (let i = 0; i < 30; i++) K.px(K.sx(), K.rnd() * K.F, '#a88a60');
    },
    underwater(K) {
      K.vg(0, K.F, '#0b5a8c', '#06264a');
      for (const x of [10, K.W - 10]) K.beam(x, 6, '#bfe8ff', 0.08);
      for (let s = 0; s < 10; s++) {
        let x = K.sx();
        const h = 4 + Math.floor(K.rnd() * 8);
        for (let y = K.F - 1; y > K.F - h; y--) { x += Math.round((K.rnd() - 0.5) * 1.5); K.px(x, y, s % 2 ? '#1f7a3a' : '#2a9a48'); }
      }
      for (let i = 0; i < 18; i++) {
        const x = K.sx(), y = K.rnd() * (K.F - 3);
        K.px(x, y, '#bfe8ff');
        if (i % 3 === 0) { K.px(x + 1, y + 1, '#bfe8ff'); K.px(x - 1, y + 1, '#bfe8ff'); K.px(x, y + 2, '#bfe8ff'); }
      }
      for (let i = 0; i < 3; i++) {
        const x = K.sx(), y = 3 + K.rnd() * 10;
        K.rect(x, y, 2, 1, '#ff8a3c'); K.px(x + 2, y, '#ffb06a'); K.px(x - 1, y - 1, '#ff8a3c'); K.px(x - 1, y + 1, '#ff8a3c');
      }
    },
    runway(K) {
      K.rect(0, 0, K.W, K.F, '#141418');
      K.rect(0, 0, K.W, 1, '#ff4fa3');
      K.rect(0, 2, K.W, 1, '#ff4fa3');
      for (let i = 0; i < 10; i++) {
        const x = K.sx(), y = 5 + K.rnd() * (K.F - 9);
        K.px(x, y, '#ffffff');
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) K.px(x + dx, y + dy, '#c8c8d8');
      }
      K.crowd(0);
    },
    dusk(K) {
      K.vg(0, K.F, '#2a1b52', '#f2924a');
      K.stars(14, 7, '#ffffff', true);
      for (let x = 0; x < K.W;) {
        const w = 4 + Math.floor(K.rnd() * 8), h = K.side(x) ? 3 + Math.floor(K.rnd() * 8) : 2 + Math.floor(K.rnd() * 3);
        K.rect(x, K.F - h, w, h, '#1a1030');
        x += w;
      }
      // a striped hot-air balloon, drifting at the right
      K.disc(104, 7, 3, '#ff4f4f');
      for (const y of [5, 7, 9]) for (let x = 101; x <= 107; x++) if ((x - 104) ** 2 + (y - 7) ** 2 <= 9) K.px(x, y, '#ffd23f');
      K.px(103, 11, '#3a2a1a'); K.px(105, 11, '#3a2a1a'); K.rect(103, 12, 3, 1, '#7a4a2a');
    },
    polka(K, o) {
      K.rect(0, 0, K.W, K.F, o.c1);
      for (let y = 2, r = 0; y < K.F; y += 5, r++) for (let x = r % 2 ? 3 : 0; x < K.W; x += 6) if (K.side(x, y)) K.rect(x, y, 2, 2, o.c2);
      K.beamTop();
    },
    smoke(K) {
      K.vg(0, K.F, '#121214', '#26262a');
      for (const x of [10, K.W - 10]) K.beam(x, 7, '#d62828', 0.2);
      K.g.globalAlpha = 0.14;
      for (let i = 0; i < 20; i++) K.disc(K.sx(), 8 + K.rnd() * 14, 2 + K.rnd() * 3, '#9a9aa0');
      K.g.globalAlpha = 1;
    },
    spooky(K) {
      K.vg(0, K.F, '#120a24', '#2c1a48');
      K.stars(14, 10, '#d8d0f0', true);
      K.disc(14, 6, 4, '#f2ecc8');
      K.disc(15, 5, 1, '#d8d0a8');
      for (let i = 0; i < 6; i++) {
        const x = K.sx(), y = 2 + K.rnd() * 8;
        K.px(x, y, '#000'); K.px(x - 1, y - 1, '#000'); K.px(x + 1, y - 1, '#000'); K.px(x - 2, y, '#000'); K.px(x + 2, y, '#000');
      }
      for (const x0 of [4, K.W - 9]) {
        K.rect(x0 + 2, 6, 2, K.F - 6, '#08050f');
        K.line(x0 + 3, 9, x0 - 1, 5, '#08050f');
        K.line(x0 + 3, 11, x0 + 7, 6, '#08050f');
      }
      for (let x = 0; x < K.W; x += 3) if (K.side(x)) K.rect(x, K.F - 4, 1, 4, '#0c0818');
    },
    desert(K) {
      K.vg(0, K.F, '#3a1f5a', '#f08a3a');
      K.stars(14, 6, '#ffffff', true);
      for (const [x, w, h] of [[0, 22, 9], [36, 44, 3], [94, 22, 11]]) K.rect(x, K.F - h, w, h, '#5a2a1a');
      const cx = 104;
      K.rect(cx, K.F - 9, 2, 9, '#1f3a1a');
      K.rect(cx - 2, K.F - 7, 2, 1, '#1f3a1a'); K.rect(cx - 2, K.F - 9, 1, 2, '#1f3a1a');
      K.rect(cx + 2, K.F - 6, 2, 1, '#1f3a1a'); K.rect(cx + 3, K.F - 8, 1, 2, '#1f3a1a');
    },
    beach(K) {
      K.vg(0, 14, '#4fb6ff', '#ffd9a0');
      K.disc(100, 13, 5, '#ffde59');
      K.vg(14, K.F, '#1f8ac8', '#16608f');
      for (let i = 0; i < 18; i++) K.rect(K.sx(), 14 + K.rnd() * 8, 2, 1, '#8fd4ff');
      for (const x0 of [8, K.W - 14]) {
        for (let y = K.F - 1, x = x0; y > 5; y--) { K.rect(x, y, 2, 1, '#7a5230'); if (y % 3 === 0) x += x0 < 50 ? 1 : -1; }
        const tx = x0 < 50 ? x0 + 5 : x0 - 5;
        for (const [dx, dy] of [[-5, 2], [5, 2], [-3, 4], [4, 4], [0, -1]]) K.line(tx, 5, tx + dx, 5 + dy, '#2f8a2a');
      }
    },
  };

  const FLOORS = {
    boards(K, o) {
      const boards = o.f || ['#7c5534', '#6f4b2d', '#835b38'];
      for (let y = K.F; y < K.H; y++) {
        const c = boards[Math.floor((y - K.F) / 2) % boards.length];
        K.rect(0, y, K.W, 1, c);
        const spread = 0.75 + 0.35 * (y - K.F) / (K.H - K.F);
        for (let k = -10; k <= 10; k++) K.px(K.W / 2 + k * 9 * spread, y, shade(c, 0.7));
        for (let i = 0; i < 6; i++) K.px(K.rnd() * K.W, y, shade(c, 0.88 + K.rnd() * 0.25));
      }
    },
    checker(K, o) {
      for (let y = K.F; y < K.H; y++) {
        const w = 4 + Math.floor((y - K.F) * 0.6);
        for (let x = 0; x < K.W; x++) {
          const i = Math.floor((x - K.W / 2) / w + 1000) + Math.floor((y - K.F) / 2);
          K.px(x, y, i % 2 ? o.f1 : o.f2);
        }
      }
    },
    concrete(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, o.fc);
      for (let i = 0; i < 90; i++) K.px(K.rnd() * K.W, K.F + K.rnd() * (K.H - K.F), shade(o.fc, 0.8 + K.rnd() * 0.4));
      K.line(20, K.F + 2, 30, K.H - 1, shade(o.fc, 0.7));
      K.line(80, K.F + 1, 74, K.H - 2, shade(o.fc, 0.7));
    },
    grass(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, o.fc);
      K.rect(0, K.F, K.W, 1, shade(o.fc, 1.25));
      for (let i = 0; i < 160; i++) K.px(K.rnd() * K.W, K.F + K.rnd() * (K.H - K.F), shade(o.fc, K.rnd() < 0.5 ? 0.8 : 1.2));
    },
    sand(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, o.fc);
      for (let y = K.F + 1; y < K.H; y += 3) for (let x = 0; x < K.W; x++) if ((x + y * 2) % 7 < 3) K.px(x, y, shade(o.fc, 0.92));
      for (let i = 0; i < 60; i++) K.px(K.rnd() * K.W, K.F + K.rnd() * (K.H - K.F), shade(o.fc, 0.8 + K.rnd() * 0.35));
    },
    led(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, '#050507');
      for (let y = K.F; y < K.H - 1; y += 2) for (let x = 0; x < K.W - 1; x += 3) {
        const c = o.tiles[Math.floor(K.rnd() * o.tiles.length)];
        K.rect(x, y, 2, 1, K.rnd() < 0.35 ? c : shade(c, 0.3));
      }
    },
    lighttiles(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, '#0a0a0e');
      for (let y = K.F + 1; y < K.H - 1; y += 4) for (let x = 1; x < K.W; x += 9) {
        const lit = K.rnd() < 0.4;
        K.rect(x, y, 8, 3, lit ? o.tiles[Math.floor(K.rnd() * o.tiles.length)] : '#26262e');
      }
    },
    grid(K) {
      K.rect(0, K.F, K.W, K.H - K.F, '#0d0420');
      for (const d of [0, 1, 3, 5, 7]) K.rect(0, K.F + d, K.W, 1, '#ff3cd0');
      for (let k = -14; k <= 14; k++) K.line(K.W / 2 + k * 2, K.F, K.W / 2 + k * 9, K.H - 1, '#b02ab8');
    },
    carpet(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, o.fc);
      for (let y = K.F + 1; y < K.H; y += 2) for (let x = (y % 4) ? 1 : 0; x < K.W; x += 3) K.px(x, y, shade(o.fc, 1.18));
    },
    metal(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, o.fc);
      for (let y = K.F; y < K.H; y += 2) for (let x = (y % 4) ? 2 : 0; x < K.W; x += 4) { K.px(x, y, shade(o.fc, 1.45)); K.px(x + 1, y + 1, shade(o.fc, 0.7)); }
    },
    stone(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, shade(o.fc, 0.6));
      for (let y = K.F, r = 0; y < K.H; y += 3, r++) for (let x = r % 2 ? -3 : 0; x < K.W; x += 7) K.rect(x, y, 6, 2, shade(o.fc, 0.85 + K.rnd() * 0.35));
    },
    cobbles(K, o) {
      K.rect(0, K.F, K.W, K.H - K.F, shade(o.fc, 0.55));
      for (let y = K.F, r = 0; y < K.H; y += 2, r++) for (let x = r % 2 ? 1 : 0; x < K.W; x += 3) K.rect(x, y, 2, 1, shade(o.fc, 0.85 + K.rnd() * 0.35));
    },
    mat(K) {
      K.rect(0, K.F, K.W, K.H - K.F, '#d8dce4');
      for (let i = 0; i < 40; i++) K.px(K.rnd() * K.W, K.F + K.rnd() * (K.H - K.F - 2), '#c4c8d2');
      K.rect(0, K.H - 2, K.W, 2, '#2a5aa0');
    },
    runwayfloor(K) {
      K.rect(0, K.F, K.W, K.H - K.F, '#0b0b0e');
      K.line(K.W / 2 - 8, K.F, K.W / 2 - 16, K.H - 1, '#f2f2f2');
      K.line(K.W / 2 + 8, K.F, K.W / 2 + 16, K.H - 1, '#f2f2f2');
      for (let y = K.F + 1; y < K.H; y += 2) K.px(K.W / 2, y, '#ff4fa3');
    },
  };

  const LOUD_WALLS = ['stripes', 'lasers', 'fire', 'jungle', 'polka', 'synthwave', 'sky', 'beach', 'garage', 'waveform', 'disco'];
  const LOUD_FLOORS = ['led', 'lighttiles', 'checker', 'grid'];
  // take some colour out of a band of the stage, then some light
  function calm(g, y, h, desat, dark) {
    g.save();
    g.globalCompositeOperation = 'saturation';
    g.globalAlpha = desat;
    g.fillStyle = '#808080';
    g.fillRect(0, y, STAGE_W, h);
    g.restore();
    g.fillStyle = `rgba(10, 10, 16, ${dark})`;
    g.fillRect(0, y, STAGE_W, h);
  }

  function paintStage() {
    const g = stageBg.getContext('2d');
    g.clearRect(0, 0, STAGE_W, STAGE_H);
    const [wall, floor, o] = STAGES[band.id] || STAGES.mega;
    const K = stageKit(g, band.id || 'mega');
    WALLS[wall](K, o);
    FLOORS[floor](K, o);
    // push the backdrop back so the band reads in front of it: wash out some colour,
    // then darken — harder for the loudest walls and floors. The players are drawn
    // over this at full colour.
    const loud = LOUD_WALLS.includes(wall);
    calm(g, 0, FLOOR_Y, loud ? 0.4 : 0.25, loud ? 0.3 : 0.2);
    calm(g, FLOOR_Y, STAGE_H - FLOOR_Y, LOUD_FLOORS.includes(floor) ? 0.45 : 0.2, LOUD_FLOORS.includes(floor) ? 0.35 : 0.15);
    // the same lighting over every stage, so they read as one game
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.fillRect(0, FLOOR_Y, STAGE_W, 1);                       // where wall meets floor
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    g.fillRect(0, STAGE_H - 1, STAGE_W, 1);                   // the stage's front lip
    const edge = g.createLinearGradient(0, 0, STAGE_W, 0);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    edge.addColorStop(0.18, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(0.82, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    g.fillStyle = edge;
    g.fillRect(0, 0, STAGE_W, STAGE_H);
    stageBgFor = band.id;
  }

  function drawBand() {
    if (stageBgFor !== band.id) paintStage();
    sctx.drawImage(stageBg, 0, 0);
    const n = band.members.length;
    const room = STAGE_W - 22;                               // a margin each side
    const gap = Math.max(0, Math.min(3, Math.floor((room - n * FIG) / Math.max(1, n + 1))));
    let x = 11 + Math.floor((room - (n * FIG + (n - 1) * gap)) / 2);
    const now = performance.now();
    for (const m of band.members) { drawMember(m, x, now); x += FIG + gap; }
  }

  function drawMember(m, ox, now) {
    const L0 = m.look;
    const playing = now < m.until;
    const pose = playing ? (m.alt ? 'a' : 'b') : 'rest';
    const fixed = m.inst === 'drums' || m.inst === 'keys' || m.inst === 'synth';
    // a soft shadow on the boards, which stays put when the player bounces
    sctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    sctx.fillRect(ox + 2, FEET + 20, 9, 1);
    sctx.fillRect(ox + 3, FEET + 21, 7, 1);
    const oy = FEET + (playing && m.alt && !fixed ? -1 : 0);   // a bounce on every other note
    const P = (x, y, c) => { sctx.fillStyle = c; sctx.fillRect(ox + x, oy + y, 1, 1); };
    const R = (x0, y0, x1, y1, c) => { sctx.fillStyle = c; sctx.fillRect(ox + x0, oy + y0, x1 - x0 + 1, y1 - y0 + 1); };
    const arm = L0.arm || L0.t;
    const hand = L0.x && L0.x.includes('glove') ? '#f2f2f2' : L0.sk;
    if (L0.h === 'crab') drawCrab(L0, P, R, pose);
    else drawPerson(L0, P, R, m.inst === 'drums');
    drawInstrument(m.inst, L0, P, R, pose, arm, hand, L0.h === 'crab');
    if (m.mic) {
      R(12, 8, 12, 18, '#9a9a9a');
      R(11, 19, 12, 19, '#333');
      P(11, 6, INK);
    }
    if (L0.h !== 'crab' && now < m.singUntil) {
      const open = m.vowel === 'ah' || m.vowel === 'eh';
      P(7, 6, '#5a1414');
      if (open) P(6, 6, '#5a1414');
    }
  }

  function drawPerson(Lk, P, R, seated) {
    if (!seated) {
      R(4, 13, 8, 13, Lk.p);
      R(4, 14, 5, 18, Lk.p);
      R(7, 14, 8, 18, Lk.p);
      if (Lk.x && Lk.x.includes('socks')) { R(4, 18, 5, 18, '#f2f2f2'); R(7, 18, 8, 18, '#f2f2f2'); }
      R(3, 19, 5, 19, Lk.s);
      R(7, 19, 9, 19, Lk.s);
    } else R(4, 13, 8, 13, Lk.p);
    R(4, 8, 8, 12, Lk.t);
    if (Lk.t2) R(6, 8, 6, 11, Lk.t2);       // the shirt under a jacket
    // a little voxel shading: light from the upper left, the right side in shade
    R(4, 8, 7, 8, shade(Lk.t, 1.14));
    R(8, 8, 8, 12, shade(Lk.t, 0.74));
    if (!seated) { R(5, 14, 5, 18, shade(Lk.p, 0.78)); R(8, 13, 8, 18, shade(Lk.p, 0.72)); }
    P(6, 7, shade(Lk.sk, 0.82));
    R(5, 3, 7, 6, Lk.sk);
    R(7, 5, 7, 6, shade(Lk.sk, 0.88));
    P(5, 3, shade(Lk.sk, 1.08));
    P(7, 4, INK);                           // an eye: everyone faces the same way
    drawHair(Lk, P, R);
    for (const x of Lk.x || []) {
      if (x === 'beard') { R(5, 6, 7, 6, Lk.hc); P(5, 5, Lk.hc); }
      if (x === 'moustache') R(6, 5, 7, 5, Lk.hc);
      if (x === 'shades') { R(6, 4, 8, 4, INK); }
      if (x === 'glasses') { P(6, 4, '#555'); P(8, 4, '#555'); }
      if (x === 'paint') { P(5, 5, '#ff4fa3'); P(7, 5, '#4fd1ff'); P(6, 3, '#f2c200'); }
      if (x === 'bow') { P(8, 1, '#ff4fa3'); P(9, 1, '#ff4fa3'); P(8, 2, '#ff4fa3'); }
      if (x === 'roots') { P(5, 2, '#39d353'); P(6, 2, '#39d353'); }
      if (x === 'phones') { P(4, 4, '#d62828'); R(5, 1, 7, 1, '#3a3a3a'); }
      if (x === 'tattoo') { P(3, 9, '#2a4a6a'); P(9, 10, '#2a4a6a'); }
    }
  }

  function drawHair(Lk, P, R) {
    const c = Lk.hc;
    const short = () => { R(5, 2, 7, 2, c); P(4, 3, c); P(5, 3, c); P(4, 4, c); };
    switch (Lk.h) {
      case 'short': short(); break;
      case 'quiff': short(); R(6, 1, 7, 1, c); P(8, 2, c); if (Lk.tall) { P(6, 0, c); P(7, 0, c); } break;
      case 'long': short(); R(4, 5, 4, 8, c); P(3, 7, c); P(3, 8, c); break;
      case 'afro': R(4, 0, 8, 2, c); R(3, 1, 3, 6, c); P(4, 3, c); P(4, 4, c); P(4, 5, c); P(8, 3, c); P(9, 2, c); break;
      case 'curly': R(4, 1, 8, 2, c); R(3, 2, 4, 8, c); P(8, 3, c); P(2, 5, c); P(2, 6, c); break;
      case 'bob': short(); R(4, 5, 4, 6, c); P(8, 3, c); P(8, 2, c); break;
      case 'spiky': short(); P(5, 1, c); P(7, 1, c); P(4, 1, c); P(8, 1, c); break;
      case 'bald': if (Lk.buzz) R(5, 2, 7, 2, shade(Lk.sk, 0.75)); else R(5, 2, 7, 2, Lk.sk); break;
      case 'beanie': R(4, 1, 7, 2, Lk.hat); P(4, 3, Lk.hat); P(4, 4, c); break;
      case 'cap': R(4, 2, 7, 2, Lk.hat); R(8, 3, 9, 3, Lk.hat); P(4, 3, c); P(4, 4, c); break;
      case 'fedora': R(3, 2, 9, 2, Lk.hat); R(4, 1, 8, 1, Lk.hat); P(4, 3, c); break;
      case 'hat': R(3, 2, 9, 2, Lk.hat); R(4, 1, 8, 1, Lk.hat); P(4, 3, c); if (Lk.long) R(4, 4, 4, 8, c); break;
      default: short();
    }
    if (Lk.band) R(5, 3, 7, 3, Lk.band);    // a headband across the forehead
  }

  function drawCrab(Lk, P, R, pose) {
    const c = Lk.t;
    const hi = shade(c, 1.2);
    R(3, 13, 9, 17, c);
    R(2, 14, 10, 16, c);
    R(4, 13, 8, 13, hi);
    P(4, 11, c); P(4, 12, c); P(8, 11, c); P(8, 12, c);   // eye stalks
    P(4, 10, INK); P(8, 10, INK);
    const up = pose === 'rest' ? 0 : pose === 'a' ? -1 : 1;
    R(0, 8 + up, 2, 10 + up, c); P(1, 8 + up, Lk.i === '#1b1b1f' ? hi : shade(c, 0.8));
    R(10, 8 - up, 12, 10 - up, c);
    P(1, 11, c); P(11, 11, c);
    P(2, 18, c); P(4, 18, c); P(8, 18, c); P(10, 18, c);
    P(1, 19, c); P(11, 19, c);
  }

  function drawInstrument(inst, Lk, P, R, pose, arm, hand, crab) {
    const i = Lk.i || '#1b1b1f';
    const wood = '#7a5230';
    if (inst === 'guitar' || inst === 'bass') {
      const bass = inst === 'bass';
      const body = Lk.acoustic ? '#c88a4a' : i;
      if (!crab) { P(3, 9, arm); P(3, 10, arm); P(9, 9, arm); }
      R(3, 10, 6, 12, body);
      R(4, 13, 5, 13, body);
      P(5, 11, Lk.acoustic ? '#3a2410' : shade(body, 0.6));
      [[7, 10], [8, 9], [9, 8], [10, 7], [11, 6]].forEach(([x, y]) => P(x, y, wood));
      if (bass) { P(12, 5, wood); P(12, 4, '#2a2a2a'); } else P(12, 5, '#2a2a2a');
      if (!crab) {
        P(pose === 'b' ? 10 : 9, pose === 'b' ? 7 : 8, hand);              // fretting hand
        P(4, pose === 'a' ? 10 : pose === 'b' ? 12 : 11, hand);            // strumming hand
      }
    } else if (inst === 'keys' || inst === 'synth') {
      if (Lk.dj) {
        R(4, 9, 6, 11, i);                                                 // the laptop's glow
        R(4, 12, 7, 12, '#9a9a9a');
        R(0, 13, 12, 14, '#2b2b2b');
        R(1, 14, 11, 14, shade(i, 0.5));
        R(1, 15, 1, 19, '#444'); R(11, 15, 11, 19, '#444');
        P(9, 12, '#444'); P(10, 12, '#777');                               // a turntable
      } else {
        R(1, 11, 11, 11, '#f2f2f2');
        [2, 4, 7, 9].forEach((x) => P(x, 11, INK));
        R(1, 12, 11, 12, i);
        R(2, 13, 2, 18, '#777'); R(10, 13, 10, 18, '#777');
        R(1, 19, 3, 19, '#555'); R(9, 19, 11, 19, '#555');
      }
      if (!crab) {
        P(3, 9, arm); P(9, 9, arm);
        const top = Lk.dj ? 12 : 10;
        P(4, pose === 'a' ? top - 1 : top, hand);
        P(8, pose === 'b' ? top - 1 : top, hand);
      }
    } else if (inst === 'drums') {
      R(0, 11, 2, 11, '#d4af37'); R(1, 12, 1, 19, '#777');                 // hi-hat
      R(2, 13, 3, 13, '#ddd'); R(2, 14, 3, 14, i);                         // snare
      R(5, 12, 6, 12, '#ddd'); R(5, 13, 6, 13, i);                         // rack tom
      R(4, 14, 8, 18, '#efefef');                                          // bass drum
      R(4, 14, 8, 14, i); R(4, 18, 8, 18, i); R(4, 15, 4, 17, i); R(8, 15, 8, 17, i);
      R(5, 16, 7, 16, Lk.t);
      R(9, 15, 10, 15, '#ddd'); R(9, 16, 10, 18, i);                       // floor tom
      R(9, 9, 11, 9, '#d4af37'); P(10, 10, '#777');                        // crash
      if (!crab) {
        P(3, 9, arm); P(9, 9, arm);
        const l = pose === 'a' ? 12 : 10;
        const r = pose === 'b' ? 12 : 10;
        P(3, l, hand); P(2, l - 1, '#e8d0a0');
        P(9, r, hand); P(10, r - 1, '#e8d0a0');
      }
    } else if (inst === 'vocals') {
      R(10, 8, 10, 18, '#9a9a9a');
      R(9, 19, 11, 19, '#333');
      P(9, 6, INK); P(10, 7, '#555');
      if (!crab) {
        P(9, 8, arm); P(9, 7, hand);
        if (pose === 'rest') { P(3, 9, arm); P(3, 10, arm); P(3, 11, hand); }
        else { P(3, 8, arm); P(3, 7, arm); P(3, 6, hand); }               // the other arm goes up
      }
    } else if (inst === 'horns') {
      const lift = pose === 'rest' ? 1 : 0;
      R(8, 6 + lift, 11, 6 + lift, '#e3b23c');
      R(12, 5 + lift, 12, 7 + lift, '#e3b23c');
      P(9, 5 + lift, '#c99a2e'); P(10, 5 + lift, '#c99a2e');
      if (!crab) { P(8, 8, arm); P(9, 7 + lift, hand); P(3, 9, arm); P(3, 10, arm); P(10, 7 + lift, hand); }
    } else if (inst === 'strings') {
      R(8, 8, 9, 9, '#8b4513'); P(10, 7, '#3b2410'); P(11, 6, '#3b2410');
      const d = pose === 'a' ? -1 : pose === 'b' ? 1 : 0;
      [[3, 10], [4, 9], [5, 9], [6, 8], [7, 8]].forEach(([x, y]) => P(x + d, y, '#e8d8b0'));
      if (!crab) { P(3, 9, arm); P(3 + d, 10, hand); P(10, 8, hand); }
    } else if (inst === 'whistle') {
      if (!crab) { P(3, 9, arm); P(9, 9, arm); P(3, 10, hand); P(9, 10, hand); }
      if (pose !== 'rest') { P(7, 6, '#5a1414'); P(10, pose === 'a' ? 1 : 2, '#f2f2f2'); P(11, pose === 'a' ? 0 : 1, '#f2f2f2'); P(11, pose === 'a' ? 1 : 2, '#f2f2f2'); }
    }
  }

  // ---------- state ----------
  const game = createBand({ save, on: (ev) => { if (ev === 'save') persist(); } });
  const { state, findSong, stepSec, pctOf, pctOfParts, tried, sectionDone, allDone, defOf, partOf } = game;
  const jam = {
    events: (save.jam && save.jam.events) || [],   // { t: s into the loop, mk: button }
    len: (save.jam && save.jam.len) || 0,
    rec: false,
    recStart: 0,
    loopStart: 0,
    recTimer: 0,
  };

  // ---------- dom ----------
  const $ = (id) => document.getElementById(id);
  const songsEl = $('songs');
  const pickerEl = $('picker');
  const sectionsEl = $('sections');
  const speedEl = $('speed');
  const modesEl = $('modes');
  const rackEl = $('rack');
  const listenBtn = $('btn-listen');
  const vocalsBtn = $('btn-vocals');
  const leadFace = $('lead-face');
  const sectionBtn = $('btn-section');
  const secbarEl = $('secbar');
  const recBtn = $('btn-rec');
  const loopBtn = $('btn-loop');
  const clearBtn = $('btn-clear');
  let stations = {};                      // inst -> { el, pads: [], dots, show, turn, score, face }

  const say = () => {};                   // the status line under the controls was removed
  const pctText = (n) => (n == null ? '' : n + '%');
  const lower = (inst) => INST[inst].name.toLowerCase();

  // how complete some parts are together: the average of their scores, an untried part as 0

  function songNote(s) {
    if (s.mega) return jam.events.length ? `Your loop: ${jam.events.length} notes` : '';
    return tried(s, s.allParts) ? `${pctOfParts(s, s.allParts)}% complete` : `${s.sections.length} sections`;
  }

  /* The songs live in a pop-up behind the Songs button, grouped by difficulty,
     easiest first: thirty cards on the page pushed the stage and the instruments
     off the screen. */
  function renderSongs() {
    songsEl.innerHTML = '';
    const groups = [...LEVELS.map((lv) => [lv, SONGS.filter((s) => s.level === lv)]), ['Jam', [MEGA]]];
    for (const [lv, list] of groups) {
      const h = document.createElement('h3');
      h.className = 'lvl';
      h.textContent = lv;
      songsEl.appendChild(h);
      for (const s of list) addSongCard(s);
    }
  }

  function addSongCard(s) {
    const b = document.createElement('button');
    b.className = 'song' + (s === state.song ? ' on' : '') + (s.mega ? ' mega' : '');
    b.dataset.song = s.id;
    b.innerHTML = `<b></b><span></span><span class="score"></span>`;
    b.children[0].textContent = s.title;
    b.children[1].textContent = s.mega ? s.genre : '';
    b.children[2].textContent = songNote(s) || ' ';
    b.addEventListener('click', () => { pickerEl.close(); selectSong(s.id); });
    songsEl.appendChild(b);
  }

  function renderDeck() {
    const song = state.song;
    $('song-title').textContent = song.title;
    if (song.mega) {
      $('song-sub').textContent = 'Play anything. Record a loop, then record again to layer on top.';
    } else {
      const secs = song.form.reduce((a, s) => a + s.length, 0) * (60 / song.bpm / song.spb);
      const at = state.speed === 1 ? '' : ` (${Math.round(song.bpm * state.speed)} at this speed)`;
      $('song-sub').textContent = `${song.key} · ${song.bpm} bpm${at}` +
        (song.sections.length > 1 ? ` · ${Math.round(secs)}s` : '');
    }
    document.body.classList.toggle('is-mega', !!song.mega);
    // section tabs, only when there is more than one
    sectionsEl.innerHTML = '';
    if (!song.mega && song.sections.length > 1) {
      for (const sec of song.sections) {
        const b = document.createElement('button');
        // a section that is only the singer has nothing to learn, so nothing to tick off
        b.className = 'sec' + (sec === state.section ? ' on' : '') + (sec.partList.length && sectionDone(song, sec) ? ' done' : '');
        b.dataset.section = sec.id;
        b.textContent = sec.name;
        b.addEventListener('click', () => selectSection(sec.id));
        sectionsEl.appendChild(b);
      }
    }
    // the sections sit under the band in play-along mode; the timeline lays them all out itself
    secbarEl.hidden = song.mega || song.sections.length < 2 || save.mode === 'timeline';
    vocalsBtn.hidden = song.mega || !song.sung;
    modesEl.innerHTML = '';
    if (!song.mega) {
      for (const [m, label] of [['play', 'Play along'], ['timeline', 'Timeline']]) {
        const b = document.createElement('button');
        b.className = 'spd' + (save.mode === m ? ' on' : '');
        b.textContent = label;
        b.setAttribute('aria-pressed', save.mode === m);
        b.addEventListener('click', () => setMode(m));
        modesEl.appendChild(b);
      }
    }
    speedEl.innerHTML = '';
    if (!song.mega) {
      const lab = document.createElement('span');
      lab.textContent = 'Speed';
      speedEl.appendChild(lab);
      for (const [v, label] of SPEEDS) {
        const b = document.createElement('button');
        b.className = 'spd' + (v === state.speed ? ' on' : '');
        b.textContent = label;
        b.setAttribute('aria-pressed', v === state.speed);
        b.addEventListener('click', () => setSpeed(v));
        speedEl.appendChild(b);
      }
    }
    syncButtons();
  }

  function renderRack() {
    const song = state.song;
    rackEl.innerHTML = '';
    stations = {};
    // tabs, so one instrument fits on the screen at a time, and All for the lot
    const tabs = document.createElement('div');
    tabs.className = 'rack-tabs';
    for (const inst of [null, ...song.order]) {
      const t = document.createElement('button');
      t.className = 'dock-tab';
      t.dataset.inst = inst || 'all';
      if (inst) {
        t.style.setProperty('--h', INST[inst].h);
        t.textContent = INST[inst].icon + ' ' + INST[inst].name;
        if (!song.mega && !state.section.parts[inst]) t.classList.add('resting');
      } else t.textContent = 'All';
      t.addEventListener('click', () => showRack(inst));
      tabs.appendChild(t);
    }
    rackEl.appendChild(tabs);
    for (const inst of song.order) {
      const def = song.instruments[inst];
      const part = song.mega ? null : state.section.parts[inst] || null;
      const info = INST[inst];
      const el = document.createElement('article');
      el.className = 'station' + (!song.mega && !part ? ' resting' : '');
      el.dataset.part = inst;
      el.style.setProperty('--h', info.h);
      const head = document.createElement('div');
      head.className = 'st-head';
      let face = null;
      if (inst === 'vocals') {
        face = document.createElement('div');
        face.className = 'face';
        face.innerHTML = '<div class="mouth"></div>';
        head.appendChild(face);
      } else {
        const icon = document.createElement('span');
        icon.className = 'st-icon';
        icon.textContent = info.icon;
        head.appendChild(icon);
      }
      const name = document.createElement('span');
      name.className = 'st-name';
      name.textContent = info.name;
      const score = document.createElement('span');
      score.className = 'st-score';
      if (part) score.textContent = pctText(pctOf(song, part));
      else if (!song.mega) score.textContent = `rests in the ${state.section.name.toLowerCase()}`;
      const sp = document.createElement('span');
      sp.className = 'spacer';
      head.append(name, score, sp);
      let show = null;
      let turn = null;
      if (part) {
        show = document.createElement('button');
        show.textContent = 'Show me';
        show.addEventListener('click', () => (state.playing && state.playing.what === 'show:' + inst ? stop() : showPart(inst)));
        turn = document.createElement('button');
        turn.className = 'primary';
        turn.textContent = 'My turn';
        turn.addEventListener('click', () => {
          if (save.mode === 'timeline') dockInst(inst);
          else if (state.turn && state.turn.part === part) endTurn('stopped');
          else startTurn(inst);
        });
        head.append(show, turn);
      }

      const padsEl = document.createElement('div');
      padsEl.className = 'pads';
      const pads = def.buttons.map((btn, i) => {
        const p = document.createElement('button');
        p.className = 'pad';
        p.innerHTML = '<span></span>' + (btn.sub ? '<small></small>' : '') + (i < 9 ? `<kbd>${i + 1}</kbd>` : '');
        p.firstChild.textContent = btn.label;
        if (btn.sub) p.querySelector('small').textContent = btn.sub;
        p.addEventListener('pointerdown', (e) => { e.preventDefault(); press(inst, i); });
        padsEl.appendChild(p);
        return p;
      });
      const dots = document.createElement('div');
      dots.className = 'dots';
      el.append(head, padsEl, dots);
      el.addEventListener('pointerdown', () => { state.focus = inst; });
      rackEl.appendChild(el);
      stations[inst] = { el, pads, dots, show, turn, score, face, part };
    }
    if (state.rackInst && !song.order.includes(state.rackInst)) state.rackInst = null;
    if (!state.rackInst && !save.rackAll) state.rackInst = song.order[0];
    applyRack();
    syncButtons();
  }

  // one instrument, or All (inst null); a choice of All is remembered between visits
  function showRack(inst) {
    state.rackInst = inst;
    save.rackAll = !inst;
    persist();
    if (inst) state.focus = inst;
    applyRack();
  }
  function applyRack() {
    const one = state.rackInst;
    for (const [inst, st] of Object.entries(stations)) st.el.hidden = !!one && inst !== one;
    rackEl.querySelectorAll('.rack-tabs .dock-tab').forEach((t) => t.classList.toggle('on', t.dataset.inst === (one || 'all')));
  }

  function greet() {
    const song = state.song;
    if (song.mega) say(jam.len ? 'Your loop is saved — press Play loop.' : 'Press Record, play something, then Stop to make it loop.');
    else say(allDone(song) ? 'Every part played. Listen to your band!' : '');
  }

  // the instrument a pad belongs to, as it is laid out right now

  // ---------- lights ----------
  function light(inst, b, ms, section) {
    // in timeline mode the song's own notes never light a button — that would give the
    // answer away — only your presses do (a press comes without a section)
    if (save.mode === 'timeline' && inst === state.tlInst && !section) {
      const dp = dockEl.querySelectorAll('.dock-pads .pad')[b];
      if (dp) lightPad(dp, ms);
    }
    if (section && section !== state.section) return;
    bandHit(inst, ms);
    const st = stations[inst];
    if (!st || !st.pads[b]) return;
    lightPad(st.pads[b], ms);
    if (st.face) {
      const v = defOf(inst).buttons[b].vowel;
      st.face.dataset.v = MOUTH[v] || v;
      clearTimeout(st.face._t);
      st.face._t = setTimeout(() => { delete st.face.dataset.v; }, ms);
    }
  }
  /* A long note doesn't stay fully lit, which read as "hold this button down":
     it flashes like any tap, then rings on dimmer with a bar running down to
     when it ends. One tap is all it ever takes. */
  function lightPad(pad, ms) {
    clearTimeout(pad._lit);
    clearTimeout(pad._ring);
    pad.classList.remove('ring');
    pad.classList.add('lit');
    if (ms < RING_MS) { pad._lit = setTimeout(() => pad.classList.remove('lit'), ms); return; }
    pad._lit = setTimeout(() => {
      pad.classList.remove('lit');
      pad.style.setProperty('--ring', (ms - TAP_MS) + 'ms');
      void pad.offsetWidth;               // restart the bar if it was already running
      pad.classList.add('ring');
      pad._ring = setTimeout(() => pad.classList.remove('ring'), ms - TAP_MS);
    }, TAP_MS);
  }
  const RING_TIP = ' A button that stays half-lit with a bar running down is a long note: it is still one tap, and it rings on by itself.';
  const hasLong = (part) => part.events.some((e) => e.len * stepSec() >= RING_MS / 1000);
  function mouth(vowel, ms) {
    bandSing(vowel, ms);
    leadFace.dataset.v = MOUTH[vowel] || vowel;
    clearTimeout(leadFace._t);
    leadFace._t = setTimeout(() => { delete leadFace.dataset.v; }, ms);
  }
  function flash(inst, b, cls, ms = 260) {
    const pad = stations[inst] && stations[inst].pads[b];
    if (!pad) return;
    pad.classList.remove(cls);
    void pad.offsetWidth;                 // restart the animation if it is already running
    pad.classList.add(cls);
    clearTimeout(pad['_' + cls]);
    pad['_' + cls] = setTimeout(() => pad.classList.remove(cls), ms);
  }

  // ---------- playback ----------
  /* Plays a run of sections back to back: each segment is a section and the
     parts of it to play. The notes are laid out in time order first, then made
     into sound only a moment ahead of the audio clock: setting a whole song up
     at once built a filter chain for every note in it, and the busiest song
     (Surf Monster's guitar riff) left the audio thread unable to keep up, so it
     played silent while the pads went on lighting. The lights run on timers
     aimed at the same moments. Across several sections the rack follows along,
     and goes back to where you were when it ends. */
  function play(what, segs, done) {
    stop();
    audio();
    const sp = stepSec();
    const bus = ac.createGain();
    bus.connect(master);
    const t0 = ac.currentTime + 0.12;
    const timers = [];
    const home = state.section;
    const follow = segs.some((s) => s.section !== home);
    const notes = [];                     // { at: s after t0, part, b, dur, section } or a riser
    let offset = 0;
    for (const seg of segs) {
      const start = offset * sp;
      if (follow) timers.push(setTimeout(() => viewSection(seg.section), Math.max(0, (t0 + start - ac.currentTime) * 1000 - 40)));
      if (seg.section.riser) notes.push({ at: start, riser: seg.steps * sp });
      const voice = seg.section.voice;
      if (voice && (what === 'band' || what === 'section')) {
        for (let c = 0; c * voice.length < seg.steps; c++) {
          for (const e of voice.events) notes.push({ at: start + (c * voice.length + e.step) * sp, voice, b: e.b, dur: e.len * sp });
        }
      }
      for (const part of seg.parts) {
        for (let c = 0; c * part.length < seg.steps; c++) {
          for (const e of part.events) {
            notes.push({ at: start + (c * part.length + e.step) * sp, part, b: e.b, dur: e.len * sp, section: seg.section });
          }
        }
      }
      offset += seg.steps;
    }
    notes.sort((a, b) => a.at - b.at);
    let next = 0;
    let lead = null;
    const tick = () => {
      const until = ac.currentTime + PLAY_AHEAD;
      for (; next < notes.length && t0 + notes[next].at < until; next++) {
        const n = notes[next];
        const t = t0 + n.at;
        if (n.riser) { playFx('riser', t, n.riser, bus); continue; }
        if (n.voice) {
          // Vocals off mutes the singer, it doesn't send them off stage: they go on
          // singing on the stage, unheard, and only the switch's own face stops.
          // Checked as each note comes due, so the switch takes effect at once.
          const btn = n.voice.buttons[n.b];
          const ms = Math.max(LIGHT_MIN, n.dur * 0.9) * 1000;
          if (save.vocals) {
            lead = lead || leadChain(bus);
            playLead(btn, t, n.dur, lead);
          }
          timers.push(setTimeout(() => (save.vocals ? mouth(btn.vowel, ms) : bandSing(btn.vowel, ms)), (t - ac.currentTime) * 1000));
          continue;
        }
        sound(n.part, n.b, t, n.dur, bus);
        const ms = Math.max(LIGHT_MIN, n.dur * 0.9) * 1000;
        timers.push(setTimeout(() => light(n.part.inst, n.b, ms, n.section), (t - ac.currentTime) * 1000));
      }
    };
    tick();
    const interval = setInterval(tick, 25);
    timers.push(setTimeout(() => {
      state.playing = null;
      if (follow) viewSection(home);
      syncButtons();
      if (done) done();
      clearInterval(interval);
    }, (t0 - ac.currentTime + offset * sp) * 1000 + 200));
    state.playing = { what, bus, timers, interval, home: follow ? home : null };
    syncButtons();
  }

  function stop() {
    const p = state.playing;
    if (!p) return;
    p.timers.forEach(clearTimeout);
    if (p.interval) clearInterval(p.interval);
    const t = ac.currentTime;
    p.bus.gain.setValueAtTime(p.bus.gain.value, t);
    p.bus.gain.linearRampToValueAtTime(0, t + 0.05);
    setTimeout(() => p.bus.disconnect(), 120);
    state.playing = null;
    if (jam.rec && jam.len) endRecord();
    if (p.home) viewSection(p.home);
    document.querySelectorAll('.pad.lit, .pad.ring').forEach((el) => { clearTimeout(el._lit); clearTimeout(el._ring); el.classList.remove('lit', 'ring'); });
    clearTimeout(leadFace._t);
    delete leadFace.dataset.v;            // and the singer stops mid-word, mouth shut
    bandRest();
    syncButtons();
  }

  const segOf = (sec, parts) => ({ section: sec, parts: parts || sec.partList, steps: sec.length });

  function listen() {
    if (state.playing && state.playing.what === 'band') { stop(); return; }
    if (state.turn) endTurn('stopped');
    const song = state.song;
    rackEl.classList.remove('focused');
    say(song.sections.length > 1 ? 'The whole song…' : 'The whole band…');
    play('band', song.form.map((s) => segOf(s)), () => {
      say(allDone(song) ? 'That was all you. Encore?' : '');
    });
  }

  function listenSection() {
    if (state.playing && state.playing.what === 'section') { stop(); return; }
    if (state.turn) endTurn('stopped');
    rackEl.classList.remove('focused');
    const sec = state.section;
    say(`The ${sec.name.toLowerCase()}, everyone in it…`);
    play('section', [segOf(sec)], () => say(`Pick an instrument in the ${sec.name.toLowerCase()} and press Show me.`));
  }

  function showPart(inst) {
    const part = partOf(inst);
    if (!part) return;
    if (state.turn) endTurn('stopped');
    state.focus = inst;
    const once = part.length * stepSec();
    const steps = once < SHOW_MIN ? part.length * 2 : part.length;
    rackEl.classList.add('focused');
    stations[inst].el.classList.add('showing');
    say(`Just the ${lower(inst)}. Watch the buttons.` + (hasLong(part) ? RING_TIP : ''));
    play('show:' + inst, [{ section: state.section, parts: [part], steps }], () => {
      if (stations[inst]) stations[inst].el.classList.remove('showing');
      rackEl.classList.remove('focused');
      say(`Ready? Press My turn on the ${lower(inst)}.`);
    });
  }

  function syncButtons() {
    const what = state.playing && state.playing.what;
    listenBtn.innerHTML = what === 'band' ? '&#9632; Stop' : state.song.sections && state.song.sections.length > 1 ? '&#9654; Play the whole song' : '&#9654; Listen to the band';
    sectionBtn.innerHTML = what === 'section' ? '&#9632; Stop' : '&#9654; This section';
    for (const [inst, st] of Object.entries(stations)) {
      if (st.show) st.show.textContent = what === 'show:' + inst ? 'Stop' : 'Show me';
      if (st.turn) {
        st.turn.textContent = save.mode === 'timeline'
          ? (state.tlInst === inst ? 'On the timeline' : 'Build it')
          : (state.turn && state.turn.part.inst === inst ? 'Stop' : 'My turn');
      }
      if (what !== 'show:' + inst) st.el.classList.remove('showing');
    }
    vocalsBtn.setAttribute('aria-pressed', save.vocals);
    vocalsBtn.lastChild.textContent = save.vocals ? 'Vocals on' : 'Vocals off';
    recBtn.innerHTML = jam.rec ? '&#9632; Stop recording' : jam.len ? '&#9679; Record a layer' : '&#9679; Record';
    recBtn.classList.toggle('rec', jam.rec);
    loopBtn.innerHTML = what === 'jam' ? '&#9632; Stop loop' : '&#9654; Play loop';
    loopBtn.disabled = !jam.len;
    clearBtn.disabled = !jam.len && !jam.rec;
    if (tl.go) tl.go.textContent = what === 'check:' + state.tlInst ? '■ Stop' : '▶ Play mine';
    if (tl.show) tl.show.textContent = what === 'show:' + state.tlInst ? '■ Stop' : 'Show me';
    sectionsEl.querySelectorAll('.sec').forEach((b) => b.classList.toggle('on', b.dataset.section === (state.section && state.section.id)));
  }

  function viewSection(sec) {
    if (!sec || sec === state.section) return;
    state.section = sec;
    renderRack();
  }

  function setSpeed(v) {
    stop();
    state.speed = v;
    save.speed = v;
    persist();
    renderDeck();
    say(v === 1 ? 'Full speed.' : `${v === 0.5 ? 'Half' : 'Three-quarter'} speed — for practice. Scores count the same.`);
  }

  // ---------- your turn ----------
  function startTurn(inst) {
    const part = partOf(inst);
    if (!part) return;
    stop();
    if (state.turn) endTurn('stopped');
    game.beginTurn(inst);
    if (state.rackInst) showRack(inst);
    const st = stations[inst];
    st.el.classList.add('live');
    rackEl.classList.add('focused');
    st.dots.innerHTML = part.groups.map(() => '<i></i>').join('');
    say(`Your turn on the ${lower(inst)}: ${part.groups.length} beats to play.` + (hasLong(part) ? ' Long notes ring on by themselves: one tap each.' : ''));
    syncButtons();
  }

  function endTurn(why, t = state.turn) {
    if (!t) return;
    const st = stations[t.part.inst];
    if (st) {
      st.el.classList.remove('live');
      if (why === 'stopped') st.dots.innerHTML = '';
    }
    rackEl.classList.remove('focused');
    state.turn = null;
    syncButtons();
  }

  function press(inst, b) {
    const def = defOf(inst);
    if (!def || !def.buttons[b]) return;
    state.focus = inst;
    audio();
    if (!state.quiet) sound(def, b, ac.currentTime + 0.005, LIVE_DUR[inst], master);
    light(inst, b, 160);
    if (state.song.mega) { if (jam.rec) recordNote(def.buttons[b]); return; }
    const r = game.pressTurn(inst, b);
    if (!r) return;                           // any pad can be played just to jam
    if (r.good) {
      flash(inst, b, 'good', 200);
      if (r.beat == null) return;
      const dot = stations[inst].dots.children[r.beat];
      if (dot) dot.className = r.missed ? 'miss' : 'done';
      if (r.done) finishTurn();
    } else {
      flash(inst, b, 'bad');
      for (const want of r.want) flash(inst, want, 'hint', 1500);
    }
  }

  function finishTurn() {
    const t = state.turn;
    const { pct, mistakes } = game.finishTurn();
    endTurn('done', t);
    completePart(t.part, pct, mistakes ? ` (${mistakes} wrong)` : '');
  }

  // keeps a part's best score and shows it everywhere it is shown
  function recordPct(part, pct) {
    const song = state.song;
    const best = game.keepPct(part, pct);
    if (stations[part.inst] && stations[part.inst].part === part) stations[part.inst].score.textContent = pctText(best);
    renderSongs();
    renderDeck();
    paintScores();
    return best;
  }

  // a part has been played through, or checked on the timeline; 100% finishes it
  function completePart(part, pct, note) {
    const song = state.song;
    const sec = part.section;
    recordPct(part, pct);
    const name = INST[part.inst].name;
    const head = `${name}: ${pct}%${note}`;
    const replay = (what, segs, msg) => setTimeout(() => {
      if (!state.playing && !state.turn && state.song === song) play(what, segs, () => say(msg));
    }, 900);
    if (allDone(song)) {
      playFx('cheer', ac.currentTime + 0.05, 2, master);
      say(`${head} — that's the whole band! Here it is together…`);
      replay('band', song.form.map((s) => segOf(s)), 'Your band. Pick another song?');
    } else if (song.sections.length > 1 && sectionDone(song, sec)) {
      say(`${head} — the ${sec.name.toLowerCase()} is done! Here it is with everyone…`);
      replay('section', [segOf(sec)], 'On to the next section.');
    } else if (pct < 100) {
      say(`${head}. Play it again with no slips for 100%.`);
    } else {
      const left = sec.partList.filter((p) => pctOf(song, p) !== 100).map((p) => lower(p.inst));
      say(`${head}. Still to play${song.sections.length > 1 ? ' in the ' + sec.name.toLowerCase() : ''}: ${left.join(', ')}.`);
    }
  }

  // ---------- timeline mode ----------
  /* The other way to learn a part. In timeline mode the bottom of the screen is
     a dock: the instruments as tabs, the chosen one's buttons across, and under
     them a timeline of the whole song — a row per button, a slot per step, and a
     line where each section ends. Each section shows its loop once ("Verse ×4"),
     and the timeline scrolls sideways when the song is long. Nothing shows where
     the notes belong: drag a button onto its row (or tap a slot), then Play mine
     plays back only what you placed, a playhead sweeping across, and each note
     takes a colour as it is reached: spot on, nearly (a step early or late), the
     right moment but the wrong note, or off. The tally says how many are still to
     find, never where. A section all spot on with nothing extra finishes that
     part; every check scores each section's part as the share of what you placed
     that is spot on, out of all you placed plus all still to find. What you place is kept per part while the
     page is open. */
  const TL_RESULTS = ['spot', 'near', 'wrongnote', 'off'];
  const drafts = {};                      // part key -> Map('step|b' -> { step, b })
  const tlResults = {};                   // part key -> results of the last check
  const dockEl = $('dock');

  function setMode(m) {
    if (save.mode === m) return;
    stop();
    if (state.turn) endTurn('stopped');
    save.mode = m;
    persist();
    renderDeck();
    renderRack();
    renderDock();
    say('');
  }

  // the sections the instrument plays in, laid end to end: one loop each
  function dockRegions(inst) {
    let g = 0;
    return state.song.sections.filter((sec) => sec.parts[inst]).map((sec) => {
      const part = sec.parts[inst];
      const r = { sec, part, g0: g };
      g += part.length;
      return r;
    });
  }

  /* A stretch of the timeline you can copy: drag along the ruler to select it,
     Copy, then tap where it goes, as many times as you like. Slots are counted
     along the whole timeline, so a stretch can cross a section line. All of it
     belongs to one song and instrument, and is dropped when either changes. */
  const tl = { key: '', sel: null, clip: null, pasting: false, go: null, show: null, selbar: null };

  function dockInst(inst) {
    state.tlInst = inst;
    renderDock();
    syncButtons();
  }

  function renderDock() {
    const song = state.song;
    const on = save.mode === 'timeline' && !song.mega;
    dockEl.hidden = !on;
    document.body.classList.toggle('tl-mode', on);
    dockEl.innerHTML = '';
    tl.go = tl.show = tl.selbar = null;
    if (!on) return;
    const insts = song.order.filter((inst) => song.sections.some((sec) => sec.parts[inst]));
    if (!insts.includes(state.tlInst)) state.tlInst = insts[0];
    const inst = state.tlInst;
    if (tl.key !== song.id + '/' + inst) Object.assign(tl, { key: song.id + '/' + inst, sel: null, clip: null, pasting: false });
    const def = defOf(inst);
    dockEl.style.setProperty('--h', INST[inst].h);
    const what = state.playing && state.playing.what;

    const head = document.createElement('div');
    head.className = 'dock-head';
    for (const i of insts) {
      const t = document.createElement('button');
      t.className = 'dock-tab' + (i === inst ? ' on' : '');
      t.style.setProperty('--h', INST[i].h);
      t.dataset.inst = i;
      t.textContent = INST[i].icon + ' ' + INST[i].name;
      t.appendChild(Object.assign(document.createElement('span'), { className: 'tl-pct' }));
      t.addEventListener('click', () => dockInst(i));
      head.appendChild(t);
    }
    const sp = document.createElement('span');
    sp.className = 'spacer';
    const go = tl.go = document.createElement('button');
    go.className = 'primary';
    go.textContent = what === 'check:' + inst ? '■ Stop' : '▶ Play mine';
    go.addEventListener('click', () => (state.playing && state.playing.what === 'check:' + inst ? stop() : checkTimeline(inst)));
    // the rack is hidden in this mode, so the dock has its own Show me: the real part,
    // each section's loop once, in the same order as the timeline
    const show = tl.show = document.createElement('button');
    show.textContent = what === 'show:' + inst ? '■ Stop' : 'Show me';
    show.addEventListener('click', () => {
      if (state.playing && state.playing.what === 'show:' + inst) { stop(); return; }
      play('show:' + inst, dockRegions(inst).map((r) => ({ section: r.sec, parts: [r.part], steps: r.part.length })),
        () => say(''));
      say(`The ${lower(inst)}, the whole way through. Listen closely.`
        + (dockRegions(inst).some((r) => hasLong(r.part)) ? RING_TIP : ''));
    });
    const clear = document.createElement('button');
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      for (const r of dockRegions(inst)) { (drafts[r.part.key] || new Map()).clear(); delete tlResults[r.part.key]; }
      paintDock();
    });
    head.append(sp, show, clear, go);

    const pads = document.createElement('div');
    pads.className = 'dock-pads';
    def.buttons.forEach((btn, b) => {
      const p = document.createElement('button');
      p.className = 'pad';
      p.innerHTML = '<span></span>' + (btn.sub ? '<small></small>' : '');
      p.firstChild.textContent = btn.label;
      if (btn.sub) p.querySelector('small').textContent = btn.sub;
      p.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        press(inst, b);
        drag(e, inst, btn.label, { drop: (x, y) => dropAt(inst, b, x, y) });
      });
      pads.appendChild(p);
    });
    const hint = document.createElement('span');
    hint.className = 'tl-hint';
    hint.textContent = 'Drag a button onto its row, or tap a slot. Drag a note to move it; tap it to remove it.'
      + (inst === 'drums' ? '' : ' A note rings on until your next one.');
    pads.appendChild(hint);

    const regions = dockRegions(inst);
    const total = regions.reduce((a, r) => a + r.part.length, 0);
    const scroll = document.createElement('div');
    scroll.className = 'tl-scroll';
    const grid = document.createElement('div');
    grid.className = 'tl-grid';
    grid.style.setProperty('--cols', total);
    const corner = document.createElement('div');
    corner.className = 'tl-lab tl-corner';
    grid.appendChild(corner);
    // which slot along the whole timeline sits under x: the ruler is measured off the first row
    const slotAt = (x) => {
      const row = grid.querySelectorAll('.tl-cell[data-b="0"]');
      for (const c of row) {
        const box = c.getBoundingClientRect();
        if (x < box.right) return +c.dataset.g;
      }
      return total - 1;
    };
    for (const r of regions) {
      const h = document.createElement('div');
      h.className = 'tl-sec';
      h.dataset.sec = r.sec.id;
      h.style.gridColumn = `span ${r.part.length}`;
      const times = r.sec.length / r.part.length;
      h.textContent = r.sec.name + (times > 1 ? ` ×${times}` : '');
      h.appendChild(Object.assign(document.createElement('span'), { className: 'tl-pct' }));
      // the strip of section names is a ruler: click it to play what you placed from
      // there, or drag along it to select a stretch to copy
      h.title = 'Click: play yours from here. Drag along: select to copy.';
      h.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        e.preventDefault();
        const g0 = slotAt(e.clientX);
        let moved = false;
        const move = (ev) => {
          if (!moved && Math.abs(ev.clientX - e.clientX) < 6) return;
          moved = true;
          // near either edge, the timeline scrolls on under the pointer
          const box = scroll.getBoundingClientRect();
          if (ev.clientX > box.right - 30) scroll.scrollLeft += 20;
          else if (ev.clientX < box.left + 100) scroll.scrollLeft -= 20;
          const g = slotAt(ev.clientX);
          tl.sel = { a: Math.min(g0, g), z: Math.max(g0, g) };
          tl.pasting = false;
          paintSel();
        };
        const up = (ev) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          if (ev.type !== 'pointercancel' && !moved) checkTimeline(inst, g0);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
      grid.appendChild(h);
    }
    const beat = song.spb;
    def.buttons.forEach((btn, b) => {
      const lab = document.createElement('div');
      lab.className = 'tl-lab';
      lab.textContent = btn.label + (btn.sub && btn.sub !== 'power' ? ' ' + btn.sub : '');
      grid.appendChild(lab);
      for (const r of regions) {
        for (let step = 0; step < r.part.length; step++) {
          const c = document.createElement('div');
          // tl- prefixed: a bare "bar" is already the deck's row of switches
          c.className = 'tl-cell' + (step === 0 ? ' tl-secline' : step % (beat * 4) === 0 ? ' tl-barline' : step % beat === 0 ? ' tl-beat' : '');
          c.dataset.sec = r.sec.id;
          c.dataset.step = step;
          c.dataset.b = b;
          c.dataset.g = r.g0 + step;
          c.addEventListener('pointerdown', (e) => cellDown(e, c));
          grid.appendChild(c);
        }
      }
    });
    // while pasting, the slots the copy would land on show under the pointer
    grid.addEventListener('pointerover', (e) => {
      const c = tl.pasting && e.target.closest('.tl-cell');
      const a = c ? +c.dataset.g : -1;
      for (const x of cellsOf()) x.classList.toggle('paste-at', a >= 0 && +x.dataset.g >= a && +x.dataset.g < a + tl.clip.len);
    });
    grid.addEventListener('pointerleave', () => cellsOf().forEach((x) => x.classList.remove('paste-at')));
    scroll.appendChild(grid);
    const selbar = tl.selbar = document.createElement('div');
    selbar.className = 'tl-selbar';
    const sum = document.createElement('p');
    sum.className = 'tl-sum';
    dockEl.append(head, pads, scroll, selbar, sum);
    paintDock();
    paintScores();
  }

  // each instrument tab shows how complete that instrument is across the song, and
  // each section on the ruler how complete its part is
  function paintScores() {
    const song = state.song;
    if (dockEl.hidden || song.mega) return;
    for (const t of dockEl.querySelectorAll('.dock-tab[data-inst]')) {
      const parts = song.sections.map((sec) => sec.parts[t.dataset.inst]).filter(Boolean);
      t.querySelector('.tl-pct').textContent = tried(song, parts) ? pctOfParts(song, parts) + '%' : '';
    }
    for (const h of dockEl.querySelectorAll('.tl-sec')) {
      const part = sectionById(h.dataset.sec).parts[state.tlInst];
      const el = h.querySelector('.tl-pct');
      el.textContent = pctText(pctOf(song, part));
      el.classList.toggle('full', pctOf(song, part) === 100);
    }
  }

  const sectionById = (id) => state.song.sections.find((x) => x.id === id);
  const cellsOf = () => [...dockEl.querySelectorAll('.tl-cell')];
  // draw the placed notes, with their colours from the last check where they have one,
  // and the tail each one rings on for
  function paintDock() {
    const tails = new Set();
    if (state.tlInst !== 'drums') {
      for (const r of dockRegions(state.tlInst)) {
        if (!drafts[r.part.key] || !drafts[r.part.key].size) continue;
        for (const e of minePart(r.part).events) for (let s = 1; s < e.len; s++) tails.add(r.part.key + '|' + (e.step + s) + '|' + e.b);
      }
    }
    for (const c of cellsOf()) {
      const part = sectionById(c.dataset.sec).parts[state.tlInst];
      const key = c.dataset.step + '|' + c.dataset.b;
      const notes = drafts[part.key];
      const res = tlResults[part.key];
      const on = !!notes && notes.has(key);
      c.classList.toggle('on', on);
      c.classList.toggle('tail', !on && tails.has(part.key + '|' + key));
      for (const r of TL_RESULTS) c.classList.toggle(r, !!res && res.get(key) === r);
    }
    paintSel();
  }

  // the line under the timeline says what selecting can do, and does it
  function paintSel() {
    for (const c of cellsOf()) c.classList.toggle('sel', !!tl.sel && +c.dataset.g >= tl.sel.a && +c.dataset.g <= tl.sel.z);
    dockEl.classList.toggle('tl-pasting', tl.pasting);
    const bar = tl.selbar;
    if (!bar) return;
    bar.innerHTML = '';
    const text = document.createElement('span');
    const btn = (label, fn, cls) => {
      const x = document.createElement('button');
      x.className = 'tiny' + (cls ? ' ' + cls : '');
      x.textContent = label;
      x.addEventListener('click', fn);
      bar.appendChild(x);
    };
    bar.appendChild(text);
    if (tl.pasting) {
      text.textContent = `Tap a slot to paste your copy there (${tl.clip.notes.length} notes over ${tl.clip.len} steps) — again as often as you like.`;
      btn('Done', () => { tl.pasting = false; tl.sel = null; paintDock(); }, 'primary');
    } else if (tl.sel) {
      text.textContent = `${tl.sel.z - tl.sel.a + 1} steps selected.`;
      btn('Copy', copySel, 'primary');
      btn('Delete notes', () => { clearRange(tl.sel.a, tl.sel.z); paintDock(); });
      btn('Deselect', () => { tl.sel = null; paintDock(); });
    } else {
      text.textContent = 'Drag along the section names to select a stretch to copy.';
    }
  }

  // the placed notes, each with where it sits along the whole timeline
  function placedNotes() {
    const out = [];
    for (const r of dockRegions(state.tlInst)) {
      const notes = drafts[r.part.key];
      if (notes) for (const [key, n] of notes) out.push({ g: r.g0 + n.step, b: n.b, key, part: r.part });
    }
    return out;
  }
  function clearRange(a, z) {
    for (const n of placedNotes()) {
      if (n.g < a || n.g > z) continue;
      drafts[n.part.key].delete(n.key);
      if (tlResults[n.part.key]) tlResults[n.part.key].delete(n.key);
    }
  }
  function copySel() {
    const { a, z } = tl.sel;
    tl.clip = { len: z - a + 1, notes: placedNotes().filter((n) => n.g >= a && n.g <= z).map((n) => ({ dg: n.g - a, b: n.b })) };
    tl.pasting = true;
    paintSel();
  }
  // a paste replaces whatever was in the stretch it lands on; the end past the song is lost
  function pasteAt(g) {
    const regions = dockRegions(state.tlInst);
    clearRange(g, g + tl.clip.len - 1);
    for (const n of tl.clip.notes) {
      const at = g + n.dg;
      const r = regions.find((x) => at >= x.g0 && at < x.g0 + x.part.length);
      if (!r) continue;
      placeNote(r.part, at - r.g0, n.b);
    }
    tl.sel = { a: g, z: g + tl.clip.len - 1 };
    paintDock();
  }

  // a note you move or add forgets its colour from the last check
  function placeNote(part, step, b) {
    const notes = drafts[part.key] = drafts[part.key] || new Map();
    notes.set(step + '|' + b, { step, b });
    if (tlResults[part.key]) tlResults[part.key].delete(step + '|' + b);
    paintDock();
  }
  function toggleNote(part, step, b) {
    const notes = drafts[part.key] = drafts[part.key] || new Map();
    const key = step + '|' + b;
    if (notes.has(key)) notes.delete(key);
    else { notes.set(key, { step, b }); press(part.inst, b); }
    if (tlResults[part.key]) tlResults[part.key].delete(key);
    paintDock();
  }
  // a placed note dragged to another slot goes there, on that slot's row
  function moveNote(part, step, b, cell) {
    const to = sectionById(cell.dataset.sec).parts[state.tlInst];
    const key = step + '|' + b;
    drafts[part.key].delete(key);
    if (tlResults[part.key]) tlResults[part.key].delete(key);
    placeNote(to, +cell.dataset.step, +cell.dataset.b);
    press(to.inst, +cell.dataset.b);
  }

  // a press on a slot: pastes while pasting; otherwise a tap adds or removes the
  // note there, and a placed note can be dragged away to another slot
  function cellDown(e, c) {
    if (e.button) return;
    const part = sectionById(c.dataset.sec).parts[state.tlInst];
    const step = +c.dataset.step, b = +c.dataset.b;
    if (tl.pasting) { pasteAt(+c.dataset.g); return; }
    const placed = c.classList.contains('on');
    if (placed) e.preventDefault();
    drag(e, state.tlInst, defOf(state.tlInst).buttons[b].label, {
      lazy: true,
      lift: placed ? c : null,
      tap: () => toggleNote(part, step, b),
      drop: placed ? (x, y) => {
        const to = cellAt(x, y);
        if (to && to !== c) moveNote(part, step, b, to);
      } : null,
    });
  }
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest('.tl-cell');
    return cell && dockEl.contains(cell) ? cell : null;
  };

  /* How close the placed notes are. Pure, so it can be tested on its own: each
     note is spot on (that button, that step), nearly (that button a step either
     side), wrongnote (another button belongs on that step) or off; plus how many
     of the part's notes nobody has placed yet. */

  /* What you placed in one section, as a part. A drum hit rings until your next
     on its row; any other note rings on until your next note at all, which is how
     a held chord gets made — one note, left to ring. It stops after a beat, or
     after the part's own longest note where that is longer, so a gap you left
     still sounds like one. */
  function minePart(part) {
    const placed = [...drafts[part.key].values()].sort((a, b) => a.step - b.step);
    const rings = part.inst !== 'drums';
    const cap = Math.max(4, ...part.events.map((e) => e.len));
    const events = placed.map((n) => {
      const next = placed.find((m) => (rings || m.b === n.b) && m.step > n.step);
      return { step: n.step, b: n.b, len: Math.max(1, Math.min(cap, (next ? next.step : part.length) - n.step)) };
    });
    return { inst: part.inst, buttons: part.buttons, tone: part.tone, length: part.length, events, section: part.section };
  }

  /* Play mine: every section you have put notes in, in order, each loop once —
     from the start, or from wherever you clicked the ruler (`from`, a slot along
     the whole timeline). Sections are scored whole either way. */
  function checkTimeline(inst = state.tlInst, from = 0) {
    const regions = dockRegions(inst).filter((r) => drafts[r.part.key] && drafts[r.part.key].size && r.g0 + r.part.length > from);
    if (!regions.length) {
      say(from ? 'Nothing placed from there on.' : 'Nothing on the timeline yet: drag a button onto it first.');
      return;
    }
    // how far into the first section to start: the rest of the section plays from there
    const skip = (r) => Math.max(0, from - r.g0);
    const scores = regions.map((r) => ({ r, score: scoreTimeline(r.part, drafts[r.part.key]) }));
    for (const { r } of scores) delete tlResults[r.part.key];
    paintDock();                          // plain again until each note is reached
    const what = 'check:' + inst;
    const stepMs = stepSec() * 1000;
    const start = performance.now() + 120;
    // where each played step sits on the timeline, skipping the sections left empty
    const map = [];
    for (const { r } of scores) for (let step = skip(r); step < r.part.length; step++) map.push({ g: r.g0 + step, r });
    const cells = cellsOf();
    const playing = () => state.playing && state.playing.what === what;
    let col = -1;
    const sweep = setInterval(() => {
      if (!playing()) { clearInterval(sweep); cells.forEach((c) => c.classList.remove('now')); return; }
      const at = map[Math.floor((performance.now() - start) / stepMs)];
      if (!at || at.g === col) return;
      col = at.g;
      const res = scores.find((x) => x.r === at.r).score.results;
      for (const c of cells) {
        const here = +c.dataset.g === col;
        c.classList.toggle('now', here);
        if (here) {
          const r = res.get(c.dataset.step + '|' + c.dataset.b);
          if (r) c.classList.add(r);
          if (c.classList.contains('on')) c.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      }
    }, 20);
    const from0 = (part, off) => {
      const m = minePart(part);
      if (!off) return m;
      return Object.assign(m, { length: part.length - off, events: m.events.filter((e) => e.step >= off).map((e) => Object.assign({}, e, { step: e.step - off })) });
    };
    play(what, scores.map(({ r }) => ({ section: r.sec, parts: [from0(r.part, skip(r))], steps: r.part.length - skip(r) })), () => {
      clearInterval(sweep);
      cells.forEach((c) => c.classList.remove('now'));
      for (const { r, score } of scores) tlResults[r.part.key] = score.results;
      paintDock();
      reportTimeline(inst, scores);
    });
    say('Playing what you placed…');
  }

  function reportTimeline(inst, scores) {
    const total = { spot: 0, near: 0, wrongnote: 0, off: 0, missing: 0 };
    for (const { score } of scores) for (const k of Object.keys(total)) total[k] += score[k];
    const bits = [];
    if (total.spot) bits.push(`${total.spot} spot on`);
    if (total.near) bits.push(`${total.near} nearly`);
    if (total.wrongnote) bits.push(`${total.wrongnote} right time, wrong note`);
    if (total.off) bits.push(`${total.off} off`);
    if (total.missing) bits.push(`${total.missing} still to find`);
    const sum = dockEl.querySelector('.tl-sum');
    if (sum) sum.textContent = bits.join(' · ');
    state.last = { inst, timeline: total, solved: scores.filter((x) => x.score.solved).map((x) => x.r.part.key) };
    const solved = scores.filter((x) => x.score.solved);
    for (const { r, score } of scores) if (!score.solved) recordPct(r.part, score.pct);
    for (const { r } of solved) completePart(r.part, 100, ` — the ${r.sec.name.toLowerCase()}, on the timeline`);
    if (solved.length < scores.length) {
      say(solved.length
        ? `${solved.map((x) => x.r.sec.name).join(' and ')} spot on! Move the yellow, orange and red ones in the rest, and play it again.`
        : 'Not quite yet — move the yellow, orange and red ones, find the rest, and play it again.');
    }
  }

  /* Dragging onto the timeline: a chip follows the pointer, and letting go calls
     drop. A lazy drag (from a slot) only becomes one once the pointer moves, so
     a press that stays put is a tap instead; with nothing to drop it is a tap or
     nothing, and a scroll on a touch screen cancels it. */
  function drag(e, inst, label, { lazy, lift, tap, drop }) {
    const x0 = e.clientX, y0 = e.clientY;
    let chip = null, gone = false;
    const follow = (ev) => {
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'tl-chip';
        chip.textContent = label;
        chip.style.setProperty('--h', INST[inst].h);
        document.body.appendChild(chip);
        if (lift) lift.classList.add('lifted');
      }
      chip.style.left = ev.clientX + 'px';
      chip.style.top = ev.clientY + 'px';
    };
    if (!lazy) follow(e);
    const move = (ev) => {
      if (chip) { follow(ev); return; }
      if (gone || Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (drop) follow(ev);
      else gone = true;
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const dragged = !!chip;
      if (chip) chip.remove();
      if (lift) lift.classList.remove('lifted');
      if (ev.type === 'pointercancel' || gone) return;
      if (dragged) drop(ev.clientX, ev.clientY);
      else if (tap) tap();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  function dropAt(inst, b, x, y) {
    const cell = cellAt(x, y);
    if (!cell) return false;
    const part = sectionById(cell.dataset.sec).parts[inst];
    if (!part) return false;
    placeNote(part, +cell.dataset.step, b);
    return true;
  }

  // ---------- mega jam: the looper ----------
  function recordNote(btn) {
    const now = ac.currentTime;
    const t = jam.len ? (now - jam.loopStart) % jam.len : now - jam.recStart;
    jam.events.push({ t: Math.round(t * 1000) / 1000, mk: btn.mk });
  }

  function toggleRecord() {
    audio();
    if (jam.rec) { endRecord(); return; }
    jam.rec = true;
    if (!jam.len) {
      // the first take: its length becomes the loop's
      stop();
      jam.events = [];
      jam.recStart = ac.currentTime;
      jam.recTimer = setTimeout(endRecord, JAM_MAX * 1000);
      say('Recording… play something, then press Stop recording.');
    } else {
      if (!(state.playing && state.playing.what === 'jam')) startLoop(ac.currentTime);
      say('Recording a layer over your loop…');
    }
    syncButtons();
  }

  function endRecord() {
    clearTimeout(jam.recTimer);
    const first = !jam.len;
    jam.rec = false;
    if (first) {
      if (!jam.events.length) { say('Nothing recorded — press Record and play some buttons.'); syncButtons(); return; }
      jam.len = Math.min(JAM_MAX, Math.max(1, ac.currentTime - jam.recStart));
      startLoop(jam.recStart);            // carries straight on: the take's start is the loop's zero
    }
    save.jam = { len: Math.round(jam.len * 1000) / 1000, events: jam.events };
    persist();
    renderSongs();
    say(`Loop: ${jam.len.toFixed(1)}s, ${jam.events.length} notes. Record again to add a layer.`);
    syncButtons();
  }

  function startLoop(zero) {
    stop();
    audio();
    const bus = ac.createGain();
    bus.connect(master);
    jam.loopStart = zero;
    let until = ac.currentTime;
    const tick = () => {
      const to = ac.currentTime + JAM_AHEAD;
      for (let k = Math.floor((until - zero) / jam.len); zero + k * jam.len < to; k++) {
        for (const e of jam.events) {
          const at = zero + k * jam.len + e.t;
          if (at < until || at >= to) continue;
          const hit = byMk.get(e.mk);
          if (!hit) continue;             // a button that has since left the songs
          const [inst, b] = hit;
          sound(MEGA.instruments[inst], b, at, LIVE_DUR[inst], bus);
          setTimeout(() => { if (state.song.mega) light(inst, b, 160); }, (at - ac.currentTime) * 1000);
        }
      }
      until = to;
    };
    tick();
    state.playing = { what: 'jam', bus, timers: [], interval: setInterval(tick, 25) };
    syncButtons();
  }

  function toggleLoop() {
    if (state.playing && state.playing.what === 'jam') { stop(); say('Loop stopped.'); return; }
    if (jam.len) { audio(); startLoop(ac.currentTime); say('Your loop. Record to add a layer.'); }
  }

  function clearJam() {
    stop();
    clearTimeout(jam.recTimer);
    jam.rec = false;
    jam.events = [];
    jam.len = 0;
    save.jam = { len: 0, events: [] };
    persist();
    renderSongs();
    say('Cleared. Press Record to start a new loop.');
    syncButtons();
  }

  // ---------- choosing ----------
  function selectSong(id) {
    const s = findSong(id);
    if (!s) return;
    stop();
    if (jam.rec) { clearTimeout(jam.recTimer); jam.rec = false; }
    game.chooseSong(id);
    renderSongs();
    renderDeck();
    renderRack();
    renderDock();
    bandFor(s);
    greet();
  }

  function selectSection(id) {
    const sec = state.song.sections.find((s) => s.id === id);
    if (!sec) return;
    stop();
    if (state.turn) endTurn('stopped');
    // in timeline mode, bring that section's part of the timeline into view
    const head = dockEl.querySelector(`.tl-sec[data-sec="${id}"]`);
    if (head) head.scrollIntoView({ block: 'nearest', inline: 'start' });
    viewSection(sec);
    syncButtons();
    say(sec.partList.length
      ? `The ${sec.name.toLowerCase()}: ${sec.partList.map((p) => lower(p.inst)).join(', ')}.`
      : `The ${sec.name.toLowerCase()} is just the singer — have a listen.`);
  }

  // ---------- input ----------
  listenBtn.addEventListener('click', listen);
  vocalsBtn.addEventListener('click', () => {
    save.vocals = !save.vocals;
    persist();
    syncButtons();
  });
  $('btn-pick').addEventListener('click', () => {
    renderSongs();
    pickerEl.showModal();
    const on = songsEl.querySelector('.song.on');
    if (on) on.scrollIntoView({ block: 'center' });
  });
  sectionBtn.addEventListener('click', listenSection);
  recBtn.addEventListener('click', toggleRecord);
  loopBtn.addEventListener('click', toggleLoop);
  clearBtn.addEventListener('click', clearJam);
  const help = $('help');
  $('btn-help').addEventListener('click', () => help.showModal());

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || help.open || pickerEl.open) return;
    if (e.key === 'Escape' && (tl.sel || tl.pasting)) { tl.sel = null; tl.pasting = false; paintDock(); return; }
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 9)) return;
    const inst = (state.turn && state.turn.part.inst) || state.focus || state.song.order[0];
    const def = defOf(inst);
    if (def && n <= def.buttons.length) { e.preventDefault(); press(inst, n - 1); }
  });

  renderSongs();
  renderDeck();
  renderRack();
  renderDock();
  bandFor(state.song);
  greet();
  try { if (!localStorage.getItem(SAVE_KEY)) { help.showModal(); persist(); } } catch (e) { /* ignore */ }

  // ---------- debug handle ----------
  expose('__band', {
    SONGS, MEGA, state, problems, INST, jam, sim: game,
    get save() { return save; },
    selectSong, selectSection, setSpeed, listen, listenSection, showPart, startTurn, endTurn, press, stop,
    toggleRecord, toggleLoop, clearJam,
    stations: () => stations,
    band, BANDS, STAGES, drawBand,
    setMode, dockInst, placeNote, checkTimeline, scoreTimeline, drafts, dropAt, tl, copySel, pasteAt, minePart,
    stepSec, midiOf,
    audioState: () => (ac ? ac.state + ' t=' + ac.currentTime.toFixed(2) : 'none'),
    // renders just a song's voice, every section that sings once through, and measures it
    async renderVoice(songId) {
      audio();
      const song = findSong(songId);
      const keep = [ac, master];
      const sr = 22050;
      const sp = 60 / song.bpm / song.spb;
      const secs = song.sections.filter((x) => x.voice);
      const total = secs.reduce((a, x) => a + x.length, 0) * sp + 1;
      const off = new OfflineAudioContext(1, Math.ceil(sr * total), sr);
      try {
        ac = off;
        master = off.destination;
        const lead = leadChain(off.destination);
        let at = 0.01;
        for (const sec of secs) {
          for (let c = 0; c * sec.voice.length < sec.length; c++) {
            for (const e of sec.voice.events) playLead(sec.voice.buttons[e.b], at + (c * sec.voice.length + e.step) * sp, e.len * sp, lead);
          }
          at += sec.length * sp;
        }
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      let bad = 0, peak = 0;
      for (let j = 0; j < d.length; j++) {
        if (!Number.isFinite(d[j])) bad++;
        else if (Math.abs(d[j]) > peak) peak = Math.abs(d[j]);
      }
      return { bad, peak: +peak.toFixed(3) };
    },
    // renders the first `secs` of a whole song offline, as Play the whole song would,
    // and counts samples that are not numbers at all: one NaN through the compressor
    // silences everything after it without an error, while the pads go on lighting
    async renderSong(songId, secs = 20) {
      audio();
      const song = findSong(songId);
      const keep = [ac, master];
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * secs), sr);
      const sp = 60 / song.bpm / song.spb;
      const firstBad = {};
      try {
        ac = off;
        master = off.destination;
        let offset = 0;
        for (const sec of song.form) {
          for (const part of sec.partList) {
            for (let c = 0; c * part.length < sec.length; c++) {
              for (const e of part.events) {
                const t = (offset + c * part.length + e.step) * sp;
                if (t < secs) sound(part, e.b, t + 0.01, e.len * sp, off.destination);
              }
            }
          }
          offset += sec.length;
        }
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      let bad = 0, sum = 0;
      for (let j = 0; j < d.length; j++) {
        if (!Number.isFinite(d[j])) { if (!bad) firstBad.at = +(j / sr).toFixed(3); bad++; } else sum += d[j] * d[j];
      }
      return { bad, firstBadAt: firstBad.at, rms: +Math.sqrt(sum / d.length).toFixed(4) };
    },
    // renders one button and says how loud it is through a small speaker: the RMS of
    // everything above `cut` Hz (a laptop or phone plays almost nothing below ~250Hz)
    async audible(songId, inst, b, dur, cut = 250) {
      audio();
      const keep = [ac, master];
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * (dur + 0.5)), sr);
      try {
        ac = off;
        const hp = off.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = cut;
        hp.connect(off.destination);
        master = hp;
        sound(findSong(songId).instruments[inst], b, 0.01, dur, hp);
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      let sum = 0;
      const n = Math.ceil(sr * dur);
      for (let j = 0; j < n; j++) sum += d[j] * d[j];
      return +Math.sqrt(sum / n).toFixed(4);
    },
    // renders one button of a song held for `dur` seconds and returns its loudness
    // every 50ms, so a note that stops dead while it is meant to be ringing shows up
    async envelope(songId, inst, b, dur) {
      audio();
      const keep = [ac, master];
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * (dur + 1)), sr);
      try {
        ac = off;
        master = off.destination;
        sound(findSong(songId).instruments[inst], b, 0.01, dur, off.destination);
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      const win = Math.round(sr * 0.05);
      const out = [];
      for (let a = 0; a + win <= d.length; a += win) {
        let sum = 0;
        for (let j = a; j < a + win; j++) sum += d[j] * d[j];
        out.push(+Math.sqrt(sum / win).toFixed(4));
      }
      return out;
    },
    // renders every jam sound offline, one per slot, and measures each: nobody can
    // listen in a test, but a sound that comes out silent or deafening shows up here
    async levels(slot = 2.5) {
      audio();
      const keep = [ac, master];
      const list = MEGA.order.flatMap((inst) => MEGA.instruments[inst].buttons.map((b, i) => ({ inst, i, label: b.label + (b.sub ? ' ' + b.sub : '') })));
      const sr = 22050;
      const off = new OfflineAudioContext(1, Math.ceil(sr * slot * list.length), sr);
      try {
        ac = off;
        master = off.destination;
        list.forEach((x, k) => sound(MEGA.instruments[x.inst], x.i, k * slot + 0.01, LIVE_DUR[x.inst], off.destination));
      } finally {
        [ac, master] = keep;
      }
      const d = (await off.startRendering()).getChannelData(0);
      return list.map((x, k) => {
        let peak = 0, sum = 0;
        const a = Math.floor(k * slot * sr), z = Math.floor((k + 1) * slot * sr);
        for (let j = a; j < z; j++) { const v = Math.abs(d[j]); if (v > peak) peak = v; sum += v * v; }
        return { inst: x.inst, label: x.label, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (z - a)).toFixed(4) };
      });
    },
  });
