/* Synthwave machine: the rules, parked here from the Physics Playground on 2026-10-15
   (Amber: "the synth is like Backing Band"), to decide later what to do with it. Nothing
   loads it yet; see README.md. The patch (nine knobs), sixteen pads (a voice and a note
   each) and a four-track, sixteen-step sequencer with three grooves. No page access: the
   sound and the clock are the page's (synth-view.js). */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const KNOBS = {
  wave: { name: 'Wave', min: 0, max: 3, step: 1, labels: ['sine', 'triangle', 'saw', 'square'], def: 2 },
  cutoff: { name: 'Cutoff', min: 0, max: 1, def: 0.55 },
  res: { name: 'Reso', min: 0, max: 1, def: 0.35 },
  attack: { name: 'Attack', min: 0, max: 1, def: 0.05 },
  release: { name: 'Release', min: 0, max: 1, def: 0.35 },
  detune: { name: 'Detune', min: 0, max: 1, def: 0.3 },
  echo: { name: 'Echo', min: 0, max: 1, def: 0.35 },
  drive: { name: 'Drive', min: 0, max: 1, def: 0.2 },
  volume: { name: 'Volume', min: 0, max: 1, def: 0.7 },
};
export const VOICES = ['kick', 'snare', 'clap', 'hat', 'tom', 'zap', 'bass', 'lead', 'pluck', 'chord', 'pad', 'laser'];
const DRUMS = new Set(['kick', 'snare', 'clap', 'hat', 'tom', 'zap', 'laser']);
export const TRACKS = ['kick', 'snare', 'hat', 'bass'];
// A minor, the key of every sunset drive
const PAD_DEFAULT = [
  ['kick', 36], ['snare', 38], ['clap', 39], ['hat', 42],
  ['bass', 33], ['bass', 36], ['bass', 40], ['bass', 43],
  ['chord', 57], ['chord', 53], ['chord', 60], ['chord', 55],
  ['lead', 69], ['lead', 72], ['pluck', 76], ['laser', 84],
];
export const GROOVES = {
  drive: { name: 'Night drive', bpm: 104, kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'xxxxxxxxxxxxxxxx', notes: [33, 33, 45, 33, 33, 33, 45, 33, 29, 29, 41, 29, 31, 31, 43, 31] },
  arcade: { name: 'Arcade', bpm: 128, kick: 'x..x..x...x..x..', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.x.x.x.x.x.x.x.', notes: [33, 0, 40, 0, 45, 0, 40, 0, 31, 0, 38, 0, 43, 0, 38, 0] },
  slow: { name: 'Slow burn', bpm: 84, kick: 'x.......x..x....', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x...x...x...x...', notes: [33, 0, 0, 0, 29, 0, 0, 0, 36, 0, 0, 0, 31, 0, 0, 0] },
};
export function createSynth({ on = () => {} } = {}) {
  const sy = {
    knobs: Object.fromEntries(Object.entries(KNOBS).map(([k, d]) => [k, d.def])),
    pads: PAD_DEFAULT.map(([voice, note]) => ({ voice, note })),
    bpm: 104, playing: false, groove: 'drive', pattern: null, notes: null,
  };
  function loadGroove(name) {
    const g = GROOVES[name] || GROOVES.drive;
    sy.groove = GROOVES[name] ? name : 'drive';
    sy.bpm = g.bpm;
    sy.pattern = Object.fromEntries(TRACKS.map((t) => [t, [...g[t]].map((c) => c === 'x')]));
    sy.notes = g.notes.map((n) => n || 33);
  }
  function setKnob(k, v) {
    const d = KNOBS[k]; if (!d) return;
    let x = clamp(+v, d.min, d.max);
    if (d.step) x = Math.round(x / d.step) * d.step;
    sy.knobs[k] = x;
    on('knob', { k, v: x });
  }
  const isDrum = (voice) => DRUMS.has(voice);
  const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  // what to play for pad i: voice, the notes (a chord is three) and how long
  function padSound(i) {
    const p = sy.pads[i];
    if (!p) return null;
    const notes = p.voice === 'chord' || p.voice === 'pad' ? [p.note, p.note + (MINOR_THIRD.has(p.note % 12) ? 3 : 4), p.note + 7] : [p.note];
    return { voice: p.voice, notes, freqs: notes.map(freq), drum: isDrum(p.voice) };
  }
  function setPad(i, patch) {
    const p = sy.pads[i]; if (!p) return;
    if (patch.voice && VOICES.includes(patch.voice)) p.voice = patch.voice;
    if (patch.note != null) p.note = clamp(Math.round(patch.note), 24, 96);
  }
  function toggleStep(track, i) {
    if (!sy.pattern[track] || i < 0 || i > 15) return;
    sy.pattern[track][i] = !sy.pattern[track][i];
  }
  // the hits on step i of the bar: [{ track, voice, note }]
  function hitsAt(i) {
    const k = ((i % 16) + 16) % 16, out = [];
    for (const t of TRACKS) if (sy.pattern[t][k]) out.push({ track: t, voice: t, note: t === 'bass' ? sy.notes[k] : t === 'kick' ? 36 : t === 'snare' ? 38 : 42 });
    return out;
  }
  const stepDur = () => 60 / sy.bpm / 4;
  function setBpm(b) { sy.bpm = clamp(Math.round(+b), 60, 180); }
  function play(v = !sy.playing) { sy.playing = !!v; on('play', { playing: sy.playing }); }
  // the clock is the page's (the audio clock schedules ahead), so there is nothing to step
  function step() {}
  loadGroove('drive');
  Object.assign(sy, { step, setKnob, padSound, setPad, toggleStep, hitsAt, stepDur, setBpm, play, loadGroove, freq, isDrum });
  return sy;
}
// roots in A natural minor whose triad is minor (A, D, E, B dim counts as minor here)
const MINOR_THIRD = new Set([9, 2, 4, 11]);
