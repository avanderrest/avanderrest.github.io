/* Backing Band: the screen and the sound. The band on stage, the rack of buttons, the
   lights, every sound synthesised with Web Audio (drums from noise and swept sines,
   guitar by Karplus-Strong, the singer by a sawtooth through three formant filters),
   playback, the timeline dock, Mega Jam's rig and the oscilloscope. See sim.js for the songs and the
   scoring.

   The band plays a simplified pop backing and every button lights up as it is pressed;
   then you take one instrument at a time and play its part back. The speed switch slows
   everything down for practice. */
import {
  INST, SPEEDS, chord, note, drum, held, once, rest, SONGS, problems, midiOf, LEVELS, MEGA, byMk, scoreTimeline,
  freshSave, fromV1, createBand, createJam, JAM_KNOBS, JAM_GROOVES, JAM_PADS, JAM_STEPS,
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
  const JAM_AHEAD = 0.15;                 // s the sequencer schedules ahead of the clock
  const JAM_KEYS = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];
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
  let scopeAn = null;
  let scopeBuf = null;
  const plucks = new Map();               // midi -> Karplus-Strong buffer

  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ac.createGain();
      master.gain.value = 0.8;
      // the oscilloscope listens to everything, after the compressor
      scopeAn = ac.createAnalyser();
      scopeAn.fftSize = 2048;
      scopeBuf = new Float32Array(scopeAn.fftSize);
      master.connect(comp).connect(scopeAn).connect(ac.destination);
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
    // a lone note was a quarter as loud as the bass (Amber, 2026-10-14: "is the keyboard
    // really quiet?"): each note is louder now, and a chord's notes share the level instead
    const share = 1 / Math.sqrt(midis.length);
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
        const g = env(t, 0.28 * share, 0.02, Math.max(0.02, dur - 0.1), 0.18);
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
        g.gain.exponentialRampToValueAtTime(0.36 * share, t + 0.008);
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

  /* Mega Jam's knobs work on everything it plays: drive, then a resonant lowpass, then
     an echo a dotted eighth long, then the volume. Built once per audio context (the
     offline renders swap the context out, and get their own). */
  let fx = null;
  function jamFx() {
    if (fx && fx.c === ac) return fx;
    const input = ac.createGain();
    const drive = ac.createWaveShaper();
    drive.oversample = '2x';
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    const dry = ac.createGain();
    const delay = ac.createDelay(2);
    const fb = ac.createGain();
    const wet = ac.createGain();
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3000;
    const vol = ac.createGain();
    input.connect(drive).connect(lp);
    lp.connect(dry).connect(vol);
    lp.connect(delay).connect(tone).connect(fb).connect(delay);
    tone.connect(wet).connect(vol);
    vol.connect(master);
    fx = { c: ac, input, drive, lp, delay, fb, wet, vol, curveAt: -1 };
    applyKnobs();
    return fx;
  }
  function applyKnobs() {
    if (!fx || fx.c !== ac) return;
    const k = jam.knobs;
    const t = ac.currentTime;
    if (fx.curveAt !== k.drive) {
      // no drive is a straight line, not a gentle tanh: off really is off
      const n = 1024, curve = new Float32Array(n), amt = k.drive * 12;
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = amt ? Math.tanh(x * (1 + amt)) / Math.tanh(1 + amt) : x; }
      fx.drive.curve = curve;
      fx.curveAt = k.drive;
    }
    fx.lp.frequency.setTargetAtTime(Math.min(20000, 120 * Math.pow(2, k.cutoff * 7.4)), t, 0.03);
    fx.lp.Q.setTargetAtTime(0.5 + k.res * 16, t, 0.03);
    fx.delay.delayTime.setTargetAtTime(jam.stepDur() * 3, t, 0.05);
    fx.fb.gain.setTargetAtTime(k.echo * 0.55, t, 0.05);
    fx.wet.gain.setTargetAtTime(k.echo * 0.7, t, 0.05);
    fx.vol.gain.setTargetAtTime(k.volume * 1.1, t, 0.03);
  }
  // one Mega Jam sound, through the knobs
  function jamSound(inst, b, t, out) {
    sound(MEGA.instruments[inst], b, t, LIVE_DUR[inst] * jam.lengthScale(), out || jamFx().input);
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
    // three players, one per part (Amber, 2026-10-14: the bass was drawn on the guitarist,
    // so a three-part song showed two people)
    'stadium-stomp': { bg: '#b3131b', sings: 'guitar', look: {
      guitar: L('long', HAIR.black, SK[0], '#d62828', '#1b1b1f', { i: '#f2f2f2' }),
      bass: L('short', HAIR.dark, SK[1], '#1b1b1f', '#1b1b1f', { i: '#d62828' }),
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
    // Mega Jam's band is whoever the mix uses (Amber, 2026-10-15), cast again as it changes
    const insts = song.mega ? jamInsts() : [...song.order, ...(song.sung && !spec.sings ? ['vocals'] : [])];
    band.cast = insts.join();
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
  const { state, findSong, stepSec, pctOf, tlPctOf, pctOfParts, tried, sectionDone, allDone, defOf, partOf } = game;
  // Mega Jam's rig: pads, sequencer, knobs (see createJam in sim.js). An old save's
  // free-time loop has no pads, so it starts on the first groove.
  const jam = createJam(save.jam);
  // a shared link (#jam=...) opens on that mix; it is only kept once you change something
  const shared = new URLSearchParams(location.hash.slice(1)).get('jam');
  const fromLink = shared ? jam.fromCode(unb64(shared)) : false;
  // `shown`: rows added by hand, which stay on screen while empty (an empty row is hidden)
  const seq = { rec: false, step: 0, next: 0, now: -1, editing: false, picked: 0, shown: new Set() };

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
  const jamPlayBtn = $('btn-jam-play');
  const clearBtn = $('btn-clear');
  const grooveSel = $('jam-groove');
  const bpmIn = $('jam-bpm');
  const bpmOut = $('jam-bpm-out');
  const scopeEl = $('scope');
  let rig = null;                         // Mega Jam's rig on screen: { pads, steps, knobs, ... }
  let stations = {};                      // inst -> { el, pads: [], dots, show, turn, score, face }

  const say = () => {};                   // the status line under the controls was removed
  const pctText = (n) => (n == null ? '' : n + '%');
  const lower = (inst) => INST[inst].name.toLowerCase();

  // how complete some parts are together: the average of their scores, an untried part as 0

  function songNote(s) {
    if (s.mega) return `${JAM_GROOVES[jam.groove].name} · ${jam.bpm} bpm`;
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
      $('song-sub').textContent = 'Every sound in the band on sixteen pads, a sequencer and knobs.';
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
    // the sections sit under the band, and the timeline under them (Amber, 2026-10-15);
    // a section's name scrolls the timeline to it
    // Clear and Play mine sit on its right, so a one-section song keeps the bar for them
    secbarEl.hidden = song.mega;
    secbarEl.classList.toggle('one-section', !song.mega && song.sections.length < 2);
    vocalsBtn.hidden = song.mega || !song.sung;
    // no modes since 2026-10-15: playing along and the timeline share one screen
    modesEl.innerHTML = '';
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
    rig = null;
    if (song.mega) { renderRig(); syncButtons(); return; }
    // every instrument at once (Amber, 2026-10-15: no tabs, always all)
    // the stations in a box of their own, so a wide screen can put them beside the band
    const box = document.createElement('div');
    box.className = 'stations';
    rackEl.appendChild(box);
    for (const inst of song.order) {
      const def = song.instruments[inst];
      const part = song.mega ? null : state.section.parts[inst] || null;
      // an instrument resting in the section on show is not on screen for it (Amber, 2026-10-15)
      if (!song.mega && !part) continue;
      const info = INST[inst];
      const el = document.createElement('article');
      el.className = 'station';
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
      if (part) score.textContent = scoreText(part);
      const sp = document.createElement('span');
      sp.className = 'spacer';
      head.append(name, score, sp);
      let show = null;
      let turn = null;
      if (part) {
        // no Show me (Amber, 2026-10-15): This section plays it, and every pad lights
        turn = document.createElement('button');
        turn.className = 'primary';
        turn.textContent = 'My turn';
        turn.addEventListener('click', () => {
          if (state.turn && state.turn.part === part) endTurn('stopped');
          else startTurn(inst);
        });
        head.append(turn);
      }

      const padsEl = document.createElement('div');
      padsEl.className = 'pads';
      const pads = def.buttons.map((btn, i) => {
        const p = document.createElement('button');
        p.className = 'pad';
        p.innerHTML = '<span></span>' + (btn.sub ? '<small></small>' : '') + (i < 9 ? `<kbd>${i + 1}</kbd>` : '');
        p.firstChild.textContent = btn.label;
        if (btn.sub) p.querySelector('small').textContent = btn.sub;
        // a pad is also what you drag onto the timeline (Amber, 2026-10-15: no second set
        // of buttons); its note lands on its own row
        p.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          press(inst, i);
          if (!song.mega && !state.turn) drag(e, inst, btn.label, { lazy: true, drop: (x, y) => dropAt(inst, i, x, y) });
        });
        padsEl.appendChild(p);
        return p;
      });
      const dots = document.createElement('div');
      dots.className = 'dots';
      el.append(head, padsEl, dots);
      el.addEventListener('pointerdown', () => { state.focus = inst; });
      box.appendChild(el);
      stations[inst] = { el, pads, dots, show, turn, score, face, part };
    }
    syncButtons();
  }

  function greet() {
    const song = state.song;
    if (song.mega) say('Press Play, then tap the steps or Record the pads.');
    else say(allDone(song) ? 'Every part played. Listen to your band!' : '');
  }

  // the instrument a pad belongs to, as it is laid out right now

  // ---------- lights ----------
  function light(inst, b, ms, section) {
    if (section && section !== state.section) return;
    bandHit(inst, ms);
    // Play mine is the timeline's: the play-along pads stay dark while it plays
    if (state.playing && state.playing.what === 'check') return;
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
    seq.rec = false;
    if (p.what === 'jam') paintNow(-1);
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
    play('section', [segOf(sec)], () => say(`Pick an instrument in the ${sec.name.toLowerCase()} and press My turn.`));
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
        st.turn.textContent = state.turn && state.turn.part.inst === inst ? 'Stop' : 'My turn';
      }
      if (what !== 'show:' + inst) st.el.classList.remove('showing');
    }
    vocalsBtn.setAttribute('aria-pressed', save.vocals);
    vocalsBtn.lastChild.textContent = save.vocals ? 'Vocals on' : 'Vocals off';
    recBtn.innerHTML = seq.rec ? '&#9632; Stop recording' : '&#9679; Record';
    recBtn.classList.toggle('rec', seq.rec);
    jamPlayBtn.innerHTML = what === 'jam' ? '&#9632; Stop' : '&#9654; Play';
    grooveSel.value = jam.groove;
    bpmIn.value = jam.bpm;
    bpmOut.textContent = jam.bpm;
    if (tl.go) tl.go.textContent = what === 'check' ? '■ Stop' : '▶ Play mine';
    sectionsEl.querySelectorAll('.sec').forEach((b) => b.classList.toggle('on', b.dataset.section === (state.section && state.section.id)));
  }

  function viewSection(sec) {
    if (!sec || sec === state.section) return;
    state.section = sec;
    renderRack();
    renderDock();                         // the timeline shows the section picked, and only it
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

  // `building`: a press on the timeline, which sounds but never counts towards My turn —
  // the tapping and the timeline each play and score only themselves (Amber, 2026-10-15)
  function press(inst, b, building = false) {
    const def = defOf(inst);
    if (!def || !def.buttons[b]) return;
    state.focus = inst;
    audio();
    if (!state.quiet) {
      if (state.song.mega) jamSound(inst, b, ac.currentTime + 0.005);
      else sound(def, b, ac.currentTime + 0.005, LIVE_DUR[inst], master);
    }
    light(inst, b, 160);
    if (state.song.mega || building) return;
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

  // a part's two scores, kept apart: playing along, then building it on the timeline
  function scoreText(part) {
    const play = pctOf(state.song, part), built = tlPctOf(state.song, part);
    return [play != null ? pctText(play) : '', built != null ? 'timeline ' + pctText(built) : ''].filter(Boolean).join(' · ');
  }
  // keeps a part's best score (played along, or `timeline`) and shows it where it is shown
  function recordPct(part, pct, timeline = false) {
    const best = game.keepPct(part, pct, timeline);
    if (stations[part.inst] && stations[part.inst].part === part) stations[part.inst].score.textContent = scoreText(part);
    renderSongs();
    renderDeck();
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

  // ---------- the timeline ----------
  /* The other way to learn a part, under the sections and drawn like Mega Jam's
     sequencer (Amber, 2026-10-15). It shows one section at a time, the one picked
     above it, with every instrument at once: a block of rows each, a row per button,
     a slot per step of that instrument's loop (its name says "×4" when the loop
     plays four times in the section). Nothing shows where the notes belong: drag a
     pad from the left onto the timeline (it lands on its own row), or tap a slot,
     then Play mine plays back only what you placed, a playhead sweeping across, and
     each note takes a colour as it is reached: spot on, nearly (a step early or
     late), the right moment but the wrong note, or off. The tally says how many are
     still to find, never where. A part all spot on with nothing extra finishes it;
     every check scores each part as the share of what you placed that is spot on,
     out of all you placed plus all still to find. What you place is kept per part
     while the page is open. No words above it; one line of help below. */
  const TL_RESULTS = ['spot', 'near', 'wrongnote', 'off'];
  const TL_HELP = 'Drag a pad onto the timeline or tap a slot · drag a note to move it · tap a note to remove it';
  const drafts = {};                      // part key -> Map('step|b' -> { step, b })
  const tlResults = {};                   // part key -> results of the last check
  const tlGaps = {};                      // part key -> steps where a note was left out entirely
  const dockEl = $('dock');
  const tlBtns = $('tl-btns');

  // the instruments that play in the section on show, as their parts
  const tlParts = () => state.song.order.map((inst) => state.section && state.section.parts[inst]).filter(Boolean);
  const tlCols = () => Math.max(1, ...tlParts().map((p) => p.length));

  const tl = { go: null, selbar: null, tally: '', tallyOf: null };

  function renderDock() {
    const song = state.song;
    const on = !song.mega;
    dockEl.hidden = !on;
    document.body.classList.toggle('tl-mode', on);
    dockEl.replaceChildren();
    tl.go = tl.selbar = null;
    tlBtns.replaceChildren();
    if (!on) return;
    const sec = state.section;
    const parts = tlParts();
    const cols = tlCols();
    const what = state.playing && state.playing.what;

    const clear = document.createElement('button');
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      for (const p of parts) { (drafts[p.key] || new Map()).clear(); delete tlResults[p.key]; delete tlGaps[p.key]; }
      paintDock();
    });
    const go = tl.go = document.createElement('button');
    go.className = 'primary';
    go.textContent = what === 'check' ? '■ Stop' : '▶ Play mine';
    go.addEventListener('click', () => (state.playing && state.playing.what === 'check' ? stop() : checkTimeline()));
    // up on the sections' row, on the right (Amber, 2026-10-15)
    tlBtns.replaceChildren(clear, go);

    const scroll = document.createElement('div');
    scroll.className = 'tl-scroll';
    const grid = document.createElement('div');
    grid.className = 'tl-grid';
    grid.style.setProperty('--cols', cols);
    const beat = song.spb;

    // a row per button of each instrument playing here, named as the sequencer names
    // them ("🥁 Kick"), right across the section; an instrument resting in it is not on
    // it. A loop shorter than the longest repeats along its row, and a slot in a repeat is
    // the same note as the slot it repeats (`step` is where in the loop, `g` across)
    for (const part of parts) {
      const inst = part.inst;
      const h = INST[inst].h;
      part.buttons.forEach((btn, b) => {
        const lab = document.createElement('div');
        lab.className = 'tl-lab';
        lab.style.setProperty('--h', h);
        lab.textContent = INST[inst].icon + ' ' + btn.label + (btn.sub && btn.sub !== 'power' ? ' ' + btn.sub : '');
        grid.appendChild(lab);
        for (let g = 0; g < cols; g++) {
          const c = document.createElement('div');
          // tl- prefixed: a bare "bar" is already the deck's row of switches
          c.className = 'tl-cell' + (g % beat === 0 ? ' tl-beat' : '') + (g >= part.length ? ' tl-repeat' : '');
          c.style.setProperty('--h', h);
          c.dataset.inst = inst;
          c.dataset.step = g % part.length;
          c.dataset.b = b;
          c.dataset.g = g;
          c.addEventListener('pointerdown', (e) => cellDown(e, c));
          grid.appendChild(c);
        }
      });
    }
    scroll.appendChild(grid);
    const selbar = tl.selbar = document.createElement('div');
    selbar.className = 'tl-selbar';
    if (tl.tallyOf !== sec) tl.tally = '';
    // the sections and their buttons head the timeline's panel, all on one row with
    // Clear and Play mine on the right; one line of text under it (Amber, 2026-10-15)
    dockEl.append(secbarEl, scroll, selbar);
    paintDock();
  }

  const sectionById = (id) => state.song.sections.find((x) => x.id === id);
  const partOfCell = (c) => state.section.parts[c.dataset.inst];
  const cellsOf = () => [...dockEl.querySelectorAll('.tl-cell')];
  // draw the placed notes, with their colours from the last check where they have one,
  // and the tail each one rings on for
  function paintDock() {
    const tails = new Set();
    for (const part of tlParts()) {
      if (part.inst === 'drums' || !drafts[part.key] || !drafts[part.key].size) continue;
      for (const e of minePart(part).events) for (let s = 1; s < e.len; s++) tails.add(part.key + '|' + (e.step + s) + '|' + e.b);
    }
    for (const c of cellsOf()) {
      const part = partOfCell(c);
      const key = c.dataset.step + '|' + c.dataset.b;
      const notes = drafts[part.key];
      const res = tlResults[part.key];
      const on = !!notes && notes.has(key);
      // a red column stays until something is put in it
      const gap = !!tlGaps[part.key] && tlGaps[part.key].has(+c.dataset.step) && !(notes && [...notes.values()].some((n) => n.step === +c.dataset.step));
      c.classList.toggle('gap', gap);
      c.classList.toggle('on', on);
      c.classList.toggle('tail', !on && tails.has(part.key + '|' + key));
      for (const r of TL_RESULTS) c.classList.toggle(r, !!res && res.get(key) === r);
    }
    paintSel();
  }

  // the one line under the timeline: the tally after a check, or else how it works
  function paintSel() {
    if (!tl.selbar) return;
    tl.selbar.textContent = tl.tally || (tlParts().length ? TL_HELP : `Only the singer in the ${state.section.name.toLowerCase()}: nothing to place.`);
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
    else { notes.set(key, { step, b }); press(part.inst, b, true); }
    if (tlResults[part.key]) tlResults[part.key].delete(key);
    paintDock();
  }
  // a placed note dragged to another slot goes to that step: onto that slot's row when
  // it is its own instrument's, or staying on its own row when it is another's
  function moveNote(part, step, b, cell) {
    const to = +cell.dataset.step;
    if (to >= part.length) return;
    const row = cell.dataset.inst === part.inst ? +cell.dataset.b : b;
    const key = step + '|' + b;
    drafts[part.key].delete(key);
    if (tlResults[part.key]) tlResults[part.key].delete(key);
    placeNote(part, to, row);
    press(part.inst, row, true);
  }

  // a press on a slot: a tap adds or removes the
  // note there, and a placed note can be dragged away to another slot
  function cellDown(e, c) {
    if (e.button) return;
    const part = partOfCell(c);
    const step = +c.dataset.step, b = +c.dataset.b;
    const placed = c.classList.contains('on');
    if (placed) e.preventDefault();
    drag(e, part.inst, part.buttons[b].label, {
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

  /* Play mine: every instrument you have put notes in, in the section on show, each
     loop once and all together. (`from`, a step to start at, is kept for the tests.) */
  function checkTimeline(from = 0) {
    const parts = tlParts().filter((p) => drafts[p.key] && drafts[p.key].size && p.length > from);
    if (!parts.length) {
      say(from ? 'Nothing placed from there on.' : 'Nothing on the timeline yet: drag a pad onto it first.');
      return;
    }
    const scores = parts.map((part) => ({ part, score: scoreTimeline(part, drafts[part.key]) }));
    for (const { part } of scores) { delete tlResults[part.key]; delete tlGaps[part.key]; }
    paintDock();                          // plain again until each note is reached
    if (state.turn) endTurn('stopped');   // Play mine is the timeline's; a turn in progress ends
    const what = 'check';
    const stepMs = stepSec() * 1000;
    const start = performance.now() + 120;
    const steps = Math.max(...parts.map((p) => p.length)) - from;
    const cells = cellsOf();
    const playing = () => state.playing && state.playing.what === what;
    let col = -1;
    const sweep = setInterval(() => {
      if (!playing()) { clearInterval(sweep); cells.forEach((c) => c.classList.remove('now')); return; }
      const i = Math.floor((performance.now() - start) / stepMs);
      if (i < 0 || i >= steps || from + i === col) return;
      col = from + i;
      for (const c of cells) {
        const here = +c.dataset.g === col;
        c.classList.toggle('now', here);
        if (!here) continue;
        const sc = scores.find((x) => x.part.inst === c.dataset.inst);
        if (!sc) continue;
        const r = sc.score.results.get(c.dataset.step + '|' + c.dataset.b);
        if (r) c.classList.add(r);
        if (sc.score.gaps.has(+c.dataset.step)) c.classList.add('gap');
        if (c.classList.contains('on')) c.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
    }, 20);
    const from0 = (part) => {
      const m = minePart(part);
      if (!from) return m;
      return Object.assign(m, { length: part.length - from, events: m.events.filter((e) => e.step >= from).map((e) => Object.assign({}, e, { step: e.step - from })) });
    };
    play(what, [{ section: state.section, parts: scores.map(({ part }) => from0(part)), steps }], () => {
      clearInterval(sweep);
      cells.forEach((c) => c.classList.remove('now'));
      for (const { part, score } of scores) { tlResults[part.key] = score.results; tlGaps[part.key] = score.gaps; }
      paintDock();
      reportTimeline(scores);
    });
    say('Playing what you placed…');
  }

  function reportTimeline(scores) {
    const total = { spot: 0, near: 0, wrongnote: 0, off: 0, missing: 0 };
    for (const { score } of scores) for (const k of Object.keys(total)) total[k] += score[k];
    const bits = [];
    if (total.spot) bits.push(`${total.spot} spot on`);
    if (total.near) bits.push(`${total.near} nearly`);
    if (total.wrongnote) bits.push(`${total.wrongnote} right time, wrong note`);
    if (total.off) bits.push(`${total.off} off`);
    if (total.missing) bits.push(`${total.missing} still to find`);
    tl.tally = bits.join(' · ');
    tl.tallyOf = state.section;
    paintSel();
    state.last = { timeline: total, solved: scores.filter((x) => x.score.solved).map((x) => x.part.key) };
    const solved = scores.filter((x) => x.score.solved);
    // the timeline's own score, apart from playing along
    for (const { part, score } of scores) recordPct(part, score.solved ? 100 : score.pct, true);
    if (solved.length === scores.length) say('Spot on, all of it!');
    else {
      say(solved.length
        ? `${solved.map((x) => INST[x.part.inst].name).join(' and ')} spot on! Move the yellow, orange and red ones in the rest, and play it again.`
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
  // a pad let go over the timeline: its note goes on its own row, at the step it is over
  function dropAt(inst, b, x, y) {
    const cell = cellAt(x, y);
    const part = cell && state.section.parts[inst];
    if (!part || +cell.dataset.step >= part.length) return false;
    placeNote(part, +cell.dataset.step, b);
    return true;
  }

  // ---------- mega jam: the rig ----------
  /* After the parked synthwave machine, in this rack's own colours: knobs over the
     whole jam, sixteen pads that can each be any sound in the band, and a sixteen-step
     sequencer with a row per pad, scheduled ahead on the audio clock. Record writes
     your pad presses onto the nearest step while it plays. */
  const KNOB_ARC = 21;
  function arc(t) {
    const a0 = (-135 - 90) * Math.PI / 180, a1 = (-135 + 270 * t - 90) * Math.PI / 180;
    const big = t * 270 > 180 ? 1 : 0;
    const p = (a) => `${(KNOB_ARC * Math.cos(a)).toFixed(2)} ${(KNOB_ARC * Math.sin(a)).toFixed(2)}`;
    return `M${p(a0)} A${KNOB_ARC} ${KNOB_ARC} 0 ${big} 1 ${p(a1)}`;
  }
  const padLabel = (i) => {
    const hit = jam.padHit(i);
    if (!hit) return { inst: null, label: '—', sub: '' };
    const btn = MEGA.instruments[hit[0]].buttons[hit[1]];
    // the row name is the most telling of the two: "A1" beside another A's "A2", "Open hat"
    return { inst: hit[0], label: btn.label, sub: btn.sub || INST[hit[0]].name, short: btn.sub && /\d/.test(btn.sub) ? btn.sub : btn.label };
  };

  function renderRig() {
    rackEl.innerHTML = `
      <div class="rig">
        <section class="rig-panel rig-knobs"><h3>Knobs</h3><div class="knobs"></div></section>
        <section class="rig-panel rig-pads">
          <div class="rig-head"><h3>Pads</h3><span class="spacer"></span><button class="tiny" id="jam-edit" aria-pressed="false">Edit pads</button></div>
          <div class="jam-pads"></div>
          <div class="pad-edit" hidden>
            <b class="pe-name"></b>
            <select class="pe-inst" aria-label="Instrument"></select>
            <select class="pe-sound" aria-label="Sound"></select>
          </div>
        </section>
        <section class="rig-panel rig-seq">
          <div class="rig-head"><h3>Sequencer</h3><span class="spacer"></span><select class="add-row" aria-label="Add a row"></select><select class="add-row del-row" aria-label="Remove a row"></select></div>
          <div class="seq"></div>
          <p class="sub">Tap a step to switch it on or off. Each pad can have a row.</p></section>
      </div>`;
    const q = (sel) => rackEl.querySelector(sel);
    rig = { pads: [], steps: [], names: [], knobs: {}, edit: q('.pad-edit'), editBtn: q('#jam-edit'), inst: q('.pe-inst'), snd: q('.pe-sound'), add: q('.add-row'), del: q('.del-row') };
    rig.del.addEventListener('change', () => {
      const p = parseInt(rig.del.value, 10);
      if (p >= 0) removeRow(p);
      rig.del.value = '';
    });
    rig.add.addEventListener('change', () => {
      const p = parseInt(rig.add.value, 10);
      if (p >= 0) { seq.shown.add(p); paintSteps(); }
      rig.add.value = '';
    });

    for (const [k, d] of Object.entries(JAM_KNOBS)) {
      const el = document.createElement('div');
      el.className = 'knob';
      el.tabIndex = 0;
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-label', d.name);
      el.setAttribute('aria-valuemin', 0);
      el.setAttribute('aria-valuemax', 100);
      el.innerHTML = `<svg viewBox="-30 -30 60 60" aria-hidden="true">
          <circle r="26" class="k-face"/>
          <path class="k-track" d="${arc(1)}"/><path class="k-arc"/>
          <circle r="15" class="k-cap"/>
          <line class="k-ptr" x1="0" y1="-5" x2="0" y2="-13"/>
        </svg><span class="k-name">${d.name}</span><span class="k-val"></span>`;
      q('.knobs').appendChild(el);
      rig.knobs[k] = el;
      let drag = null;
      el.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, v: jam.knobs[k] }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => { if (drag) setKnob(k, drag.v + (drag.y - e.clientY) / 160 * (e.shiftKey ? 0.25 : 1)); });
      const end = () => { if (drag) { drag = null; persistJam(); } };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('wheel', (e) => { e.preventDefault(); setKnob(k, jam.knobs[k] - Math.sign(e.deltaY) / 40); persistJam(); }, { passive: false });
      el.addEventListener('dblclick', () => { setKnob(k, d.def); persistJam(); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setKnob(k, jam.knobs[k] + 1 / 40);
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setKnob(k, jam.knobs[k] - 1 / 40);
        else return;
        e.preventDefault();
        e.stopPropagation();
        persistJam();
      });
      paintKnob(k);
    }

    const padBox = q('.jam-pads');
    for (let i = 0; i < JAM_PADS; i++) {
      const b = document.createElement('button');
      b.className = 'pad';
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (seq.editing) { seq.picked = i; syncEdit(); }
        hitPad(i);
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hitPad(i); } });
      padBox.appendChild(b);
      rig.pads.push(b);
    }

    const seqBox = q('.seq');
    for (let p = 0; p < JAM_PADS; p++) {
      // the row's name: a first tap offers to remove the row, a second removes it
      const name = document.createElement('button');
      name.className = 't-name';
      name.addEventListener('click', () => {
        if (name.classList.contains('armed')) { removeRow(p); return; }
        name.classList.add('armed');
        name.textContent = '✕ Remove';
        clearTimeout(name._t);
        name._t = setTimeout(() => { name.classList.remove('armed'); paintPads(); }, 2500);
      });
      seqBox.appendChild(name);
      rig.names.push(name);
      const row = [];
      for (let i = 0; i < JAM_STEPS; i++) {
        const b = document.createElement('button');
        b.className = 'step' + (i % 4 === 0 ? ' beat' : '');
        b.addEventListener('click', () => {
          jam.toggleStep(p, i);
          seq.shown.add(p);               // a row you have worked on stays, even emptied
          paintSteps();
          persistJam();
          const hit = jam.padHit(p);
          if (jam.rows[p][i] && hit && !(state.playing && state.playing.what === 'jam')) { audio(); jamSound(hit[0], hit[1], ac.currentTime + 0.005); }
        });
        seqBox.appendChild(b);
        row.push(b);
      }
      rig.steps.push(row);
    }

    for (const inst of MEGA.order) {
      const o = document.createElement('option');
      o.value = inst;
      o.textContent = INST[inst].icon + ' ' + INST[inst].name;
      rig.inst.appendChild(o);
    }
    rig.editBtn.addEventListener('click', () => { seq.editing = !seq.editing; syncEdit(); });
    rig.inst.addEventListener('change', () => { fillSounds(rig.inst.value); pickSound(MEGA.instruments[rig.inst.value].buttons[0].mk); });
    rig.snd.addEventListener('change', () => pickSound(rig.snd.value));
    paintPads();
    paintSteps();
    syncEdit();
  }

  function setKnob(k, v) { jam.setKnob(k, v); paintKnob(k); applyKnobs(); }
  function paintKnob(k) {
    const el = rig && rig.knobs[k];
    if (!el) return;
    const t = jam.knobs[k];
    el.querySelector('.k-arc').setAttribute('d', t > 0.001 ? arc(t) : 'M0 0');
    el.querySelector('.k-ptr').setAttribute('transform', `rotate(${-135 + 270 * t})`);
    const text = k === 'length' ? `${jam.lengthScale() < 1 ? jam.lengthScale().toFixed(2) : jam.lengthScale().toFixed(1)}×` : Math.round(t * 100) + '';
    el.querySelector('.k-val').textContent = text;
    el.setAttribute('aria-valuenow', Math.round(t * 100));
    el.setAttribute('aria-valuetext', text);
  }
  function paintPads() {
    if (!rig) return;
    rig.pads.forEach((b, i) => {
      const { inst, label, sub, short } = padLabel(i);
      b.style.setProperty('--h', inst ? INST[inst].h : 0);
      b.classList.toggle('picked', seq.editing && i === seq.picked);
      b.innerHTML = '<span></span><small></small><kbd></kbd>';
      b.children[0].textContent = label;
      b.children[1].textContent = sub;
      b.children[2].textContent = JAM_KEYS[i].toUpperCase();
      b.setAttribute('aria-label', `Pad ${JAM_KEYS[i].toUpperCase()}: ${inst ? INST[inst].name + ' ' : ''}${label}`);
      const name = rig.names[i];
      name.style.setProperty('--h', inst ? INST[inst].h : 0);
      if (!name.classList.contains('armed')) name.textContent = (inst ? INST[inst].icon + ' ' : '') + short;
      name.title = `Pad ${JAM_KEYS[i].toUpperCase()}: ${label}${sub ? ' · ' + sub : ''}. Tap twice to remove the row.`;
      rig.steps[i].forEach((st, k) => st.setAttribute('aria-label', `${label} step ${k + 1}`));
    });
  }
  function paintSteps() {
    if (!rig) return;
    const hidden = [];
    rig.steps.forEach((row, p) => {
      const show = seq.shown.has(p) || jam.rows[p].some(Boolean);
      rig.names[p].hidden = !show;
      if (!show) hidden.push(p);
      row.forEach((b, i) => {
        b.hidden = !show;
        b.classList.toggle('on', jam.rows[p][i]);
        b.classList.toggle('now', i === seq.now);
        b.setAttribute('aria-pressed', String(jam.rows[p][i]));
        b.style.setProperty('--h', rig.pads[p].style.getPropertyValue('--h'));
      });
    });
    // the empty rows wait in a menu, named by their pad
    rig.add.innerHTML = `<option value="">${hidden.length ? '+ Add a row' : 'Every pad has a row'}</option>`;
    for (const p of hidden) {
      const { inst, label, sub } = padLabel(p);
      const o = document.createElement('option');
      o.value = p;
      o.textContent = `${JAM_KEYS[p].toUpperCase()} · ${inst ? INST[inst].icon + ' ' : ''}${label}${sub ? ' · ' + sub : ''}`;
      rig.add.appendChild(o);
    }
    rig.add.disabled = !hidden.length;
    // and the rows on show wait in another, to remove one (a row's name tapped twice does too)
    const showing = jam.rows.map((_, p) => p).filter((p) => !hidden.includes(p));
    rig.del.innerHTML = '<option value="">− Remove a row</option>';
    for (const p of showing) {
      const { inst, label, sub } = padLabel(p);
      const o = document.createElement('option');
      o.value = p;
      o.textContent = `${JAM_KEYS[p].toUpperCase()} · ${inst ? INST[inst].icon + ' ' : ''}${label}${sub ? ' · ' + sub : ''}`;
      rig.del.appendChild(o);
    }
    rig.del.disabled = !showing.length;
  }
  function paintNow(i) {
    if (!rig || i === seq.now) return;
    for (const row of rig.steps) {
      if (seq.now >= 0) row[seq.now].classList.remove('now');
      if (i >= 0) row[i].classList.add('now');
    }
    seq.now = i;
  }
  function fillSounds(inst) {
    rig.snd.innerHTML = '';
    for (const btn of MEGA.instruments[inst].buttons) {
      const o = document.createElement('option');
      o.value = btn.mk;
      o.textContent = btn.label + (btn.sub ? ' · ' + btn.sub : '');
      rig.snd.appendChild(o);
    }
  }
  function syncEdit() {
    if (!rig) return;
    rig.edit.hidden = !seq.editing;
    rig.editBtn.setAttribute('aria-pressed', String(seq.editing));
    rig.editBtn.textContent = seq.editing ? 'Done' : 'Edit pads';
    if (seq.editing) {
      const hit = jam.padHit(seq.picked);
      const inst = hit ? hit[0] : MEGA.order[0];
      rig.edit.querySelector('.pe-name').textContent = `Pad ${JAM_KEYS[seq.picked].toUpperCase()}`;
      rig.inst.value = inst;
      fillSounds(inst);
      rig.snd.value = jam.pads[seq.picked];
    }
    paintPads();
  }
  function pickSound(mk) {
    jam.setPad(seq.picked, mk);
    rig.snd.value = mk;
    paintPads();
    paintSteps();
    hitPad(seq.picked);
    persistJam();
  }

  // the instruments in the mix: rows with steps in them, or, with none yet, the pads
  function jamInsts() {
    const used = (p) => jam.rows[p].some(Boolean);
    const any = jam.rows.some((r) => r.some(Boolean));
    const out = new Set();
    jam.pads.forEach((_, p) => { const hit = jam.padHit(p); if (hit && (!any || used(p))) out.add(hit[0]); });
    return [...out];
  }
  function recast() {
    if (state.song.mega && jamInsts().join() !== band.cast) bandFor(state.song);
  }
  function persistJam() { recast(); save.jam = jam.toSave(); persist(); syncUrl(); }

  // plays pad i now: a tap on it, its key, or the sequencer's audition
  function hitPad(i) {
    const hit = jam.padHit(i);
    if (!hit) return;
    audio();
    if (!state.quiet) jamSound(hit[0], hit[1], ac.currentTime + 0.005);
    if (rig && rig.pads[i]) lightPad(rig.pads[i], 160);
    bandHit(hit[0], 160);
    if (seq.rec && state.playing && state.playing.what === 'jam') {
      // where the bar is now, in steps: the next step to schedule, less how far off it still is
      const at = seq.step - (seq.next - ac.currentTime) / jam.stepDur();
      jam.record(i, at);
      paintSteps();
      persistJam();
    }
  }

  function playJam() {
    stop();
    audio();
    const bus = ac.createGain();
    bus.connect(jamFx().input);
    seq.step = 0;
    seq.next = ac.currentTime + 0.06;
    const p = { what: 'jam', bus, timers: [], interval: 0 };
    const tick = () => {
      if (state.playing !== p) return;
      if (seq.next < ac.currentTime - 0.2) seq.next = ac.currentTime + 0.05;   // fell behind (a background tab): carry on from now
      while (seq.next < ac.currentTime + JAM_AHEAD) {
        const step = seq.step % JAM_STEPS;
        const t = seq.next;
        for (const pad of jam.hitsAt(step)) {
          const hit = jam.padHit(pad);
          if (!hit) continue;
          jamSound(hit[0], hit[1], t, bus);
          setTimeout(() => {
            if (state.playing !== p) return;
            if (rig && rig.pads[pad]) lightPad(rig.pads[pad], 140);
            bandHit(hit[0], 140);
          }, (t - ac.currentTime) * 1000);
        }
        setTimeout(() => { if (state.playing === p) paintNow(step); }, (t - ac.currentTime) * 1000);
        seq.next += jam.stepDur();
        seq.step++;
      }
    };
    state.playing = p;
    tick();
    p.interval = setInterval(tick, 25);
    syncButtons();
  }

  function toggleJam() {
    if (state.playing && state.playing.what === 'jam') { stop(); return; }
    playJam();
  }
  // Record starts the bar going if it isn't, and writes your presses onto it
  function toggleRecord() {
    if (seq.rec) { seq.rec = false; syncButtons(); return; }
    if (!(state.playing && state.playing.what === 'jam')) playJam();
    seq.rec = true;
    syncButtons();
  }
  // a removed row loses its steps and goes back in the Add a row menu
  function removeRow(p) {
    const name = rig && rig.names[p];
    if (name) { clearTimeout(name._t); name.classList.remove('armed'); }
    jam.rows[p] = jam.rows[p].map(() => false);
    seq.shown.delete(p);
    paintPads();
    paintSteps();
    persistJam();
  }
  function clearJam() {
    // the rows on screen stay there, emptied, ready to fill again
    jam.rows.forEach((r, p) => { if (r.some(Boolean)) seq.shown.add(p); });
    jam.clear();
    paintSteps();
    persistJam();
  }
  function loadGroove(name) {
    jam.loadGroove(name);
    seq.shown.clear();
    applyKnobs();
    paintPads();
    paintSteps();
    syncEdit();
    persistJam();
    syncButtons();
    renderDeck();
  }
  /* The address bar always holds the mix (#jam=...), so the link is the share: copy it
     and whoever opens it hears the same jam. base64, as it needn't be read by a person. */
  const b64 = (t) => btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = (t) => { try { return decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/')))); } catch (e) { return ''; } };
  function mixUrl() { return location.href.split('#')[0] + '#jam=' + b64(jam.toCode()); }
  function syncUrl() {
    const url = state.song.mega ? mixUrl() : location.href.split('#')[0];
    if (url !== location.href) history.replaceState(null, '', url);
  }

  function setBpm(v) {
    jam.setBpm(v);
    applyKnobs();
    bpmOut.textContent = jam.bpm;
    persistJam();
  }

  // ---------- the scope ----------
  /* Band or Scope, in the corner of the stage: the scope is the whole mix drawn as a
     wave, started on a rising zero crossing so a steady note stands still. */
  let scopeOn = false;
  function setStageView(v) {
    save.stage = v === 'scope' ? 'scope' : 'band';
    persist();
    syncStageView();
  }
  function syncStageView() {
    const scope = save.stage === 'scope';
    stageEl.hidden = scope;
    scopeEl.hidden = !scope;
    document.querySelectorAll('.stage-view .spd').forEach((b) => {
      const on = b.dataset.view === save.stage;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (scope && !scopeOn) { scopeOn = true; requestAnimationFrame(scopeFrame); }
  }
  function scopeFrame() {
    if (save.stage !== 'scope') { scopeOn = false; return; }
    drawScope();
    requestAnimationFrame(scopeFrame);
  }
  const sg = scopeEl.getContext('2d');
  scopeEl.style.aspectRatio = `${STAGE_W} / ${STAGE_H}`;
  function drawScope() {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(scopeEl.clientWidth * d), h = Math.round(scopeEl.clientHeight * d);
    if (!w || !h) return;
    if (scopeEl.width !== w || scopeEl.height !== h) { scopeEl.width = w; scopeEl.height = h; }
    sg.fillStyle = 'rgba(16, 17, 19, 0.6)';   // a little of the last frame stays, as on a real screen
    sg.fillRect(0, 0, w, h);
    sg.strokeStyle = 'rgba(240, 163, 58, 0.12)';
    sg.lineWidth = 1;
    sg.beginPath();
    for (let x = 0; x <= 10; x++) { sg.moveTo(x * w / 10, 0); sg.lineTo(x * w / 10, h); }
    for (let y = 0; y <= 4; y++) { sg.moveTo(0, y * h / 4); sg.lineTo(w, y * h / 4); }
    sg.stroke();
    let data = null;
    if (scopeAn && ac && ac.state === 'running') { scopeAn.getFloatTimeDomainData(scopeBuf); data = scopeBuf; }
    const N = 1024;
    let start = 0;
    if (data) for (let i = 1; i < data.length - N; i++) if (data[i - 1] < 0 && data[i] >= 0) { start = i; break; }
    sg.lineWidth = 2.2 * d;
    sg.strokeStyle = '#f6b04a';
    sg.shadowColor = '#f0a33a';
    sg.shadowBlur = 10 * d;
    sg.beginPath();
    for (let i = 0; i < N; i++) {
      const v = data ? data[start + i] : 0;
      const x = i / (N - 1) * w, y = h / 2 - v * h * 0.45;
      if (i) sg.lineTo(x, y); else sg.moveTo(x, y);
    }
    sg.stroke();
    sg.shadowBlur = 0;
  }

  // ---------- choosing ----------
  function selectSong(id) {
    const s = findSong(id);
    if (!s) return;
    stop();
    game.chooseSong(id);
    renderSongs();
    renderDeck();
    renderRack();
    renderDock();
    bandFor(s);
    syncUrl();
    greet();
  }

  function selectSection(id) {
    const sec = state.song.sections.find((s) => s.id === id);
    if (!sec) return;
    stop();
    if (state.turn) endTurn('stopped');
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
  jamPlayBtn.addEventListener('click', toggleJam);
  clearBtn.addEventListener('click', clearJam);
  for (const [k, g] of Object.entries(JAM_GROOVES)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = g.name;
    grooveSel.appendChild(o);
  }
  grooveSel.addEventListener('change', () => loadGroove(grooveSel.value));
  bpmIn.addEventListener('input', () => setBpm(bpmIn.value));
  document.querySelectorAll('.stage-view .spd').forEach((b) => b.addEventListener('click', () => setStageView(b.dataset.view)));
  const help = $('help');
  $('btn-help').addEventListener('click', () => help.showModal());

  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || help.open || pickerEl.open) return;
    if (state.song.mega) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const i = JAM_KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0) { e.preventDefault(); hitPad(i); }
      return;
    }
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 9)) return;
    const inst = (state.turn && state.turn.part.inst) || state.focus || state.song.order[0];
    const def = defOf(inst);
    if (def && n <= def.buttons.length) { e.preventDefault(); press(inst, n - 1); }
  });

  // the page always opens on Mega Jam (Amber, 2026-10-15); a song is a pick away
  if (!state.song.mega) game.chooseSong('mega');
  renderSongs();
  renderDeck();
  renderRack();
  renderDock();
  bandFor(state.song);
  syncStageView();
  syncUrl();
  greet();
  try { if (!localStorage.getItem(SAVE_KEY)) { help.showModal(); persist(); } } catch (e) { /* ignore */ }

  // ---------- debug handle ----------
  expose('__band', {
    SONGS, MEGA, state, problems, INST, sim: game,
    get save() { return save; },
    selectSong, selectSection, setSpeed, listen, listenSection, showPart, startTurn, endTurn, press, stop,
    jam, seq, mixUrl, unb64, removeRow, fromLink, toggleJam, toggleRecord, clearJam, hitPad, loadGroove, setBpm, setKnob, setStageView, drawScope,
    stations: () => stations,
    band, BANDS, STAGES, drawBand,
    placeNote, tlParts, checkTimeline, scoreTimeline, drafts, dropAt, tl, minePart,
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
