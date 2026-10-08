/* Pocket Pal: the ears. The microphone through Web Audio (a level meter, and a simple
   voice-activity gate so silence is never sent to be transcribed), and two ways to turn a
   spoken word into text:

   - 'whisper': OpenAI's Whisper (tiny, English) running in the player's own browser through
     Transformers.js, in a worker (voice-worker.js). Nothing leaves the machine. The library
     comes from jsDelivr and the weights (about 40 MB) from Hugging Face the first time; the
     browser keeps both, so later visits load from disk.
   - 'browser': the Web Speech API, where the browser has one (Chrome, Edge, Safari). Quick,
     but Chrome and Edge send the audio to their own speech service.

   One utterance at a time: listen() opens the mic, waits for speech, stops a moment after
   it ends (or after a few seconds of nothing), closes the mic and resolves to the text
   (or '' if nothing was said). Every failure resolves to '' with a status saying why. */

// ---------- constants ----------
const RATE = 16000;            // what Whisper wants
const MAX_SECONDS = 5;         // the longest one utterance can be
const GIVE_UP = 4.5;           // seconds of nothing before it stops listening
const TAIL = 0.55;             // seconds of quiet after speech that end it
const MIN_VOICE = 0.12;        // seconds above the gate that count as speech
const PRE_ROLL = 0.25;         // seconds kept from before the speech started

export const ENGINES = {
  whisper: { name: 'Whisper, on this device', note: 'Private: runs in your browser. About 40 MB the first time.' },
  browser: { name: "Your browser's speech service", note: 'Quick to start. Chrome and Edge send the audio to their speech service.' },
};
export const hasMic = () => typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const SR = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
export const hasBrowserSpeech = () => !!SR();

export function createVoice({ onStatus = () => {}, onLevel = () => {} } = {}) {
  let engine = 'whisper';
  let worker = null, ready = false, loading = null, nextId = 1;
  const pending = new Map();
  let active = null;              // the utterance being listened to
  const status = (state, extra = {}) => onStatus({ state, engine, ...extra });

  // ---------- whisper ----------
  function loadWhisper() {
    if (ready) return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise((resolve) => {
      try {
        worker = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module' });
      } catch (e) { status('error', { why: 'This browser could not start the speech worker.' }); loading = null; resolve(false); return; }
      const files = new Map();
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'progress') {
          if (m.file && m.total) files.set(m.file, [m.loaded || 0, m.total]);
          let got = 0, all = 0; for (const [a, b] of files.values()) { got += a; all += b; }
          status('loading', { progress: all ? got / all : 0, mb: all / 1048576 });
        } else if (m.type === 'ready') { ready = true; status('ready', { device: m.device }); resolve(true); }
        else if (m.type === 'error') {
          status('error', { why: m.why }); loading = null; ready = false;
          try { worker.terminate(); } catch (e) { /* gone */ }
          worker = null; resolve(false);
        } else if (m.type === 'text') { const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.text || ''); } }
      };
      worker.onerror = (e) => { status('error', { why: 'The speech model would not load (' + (e.message || 'worker error') + ').' }); loading = null; resolve(false); };
      status('loading', { progress: 0 });
      worker.postMessage({ type: 'load' });
    });
    return loading;
  }
  function transcribe(audio) {
    if (!ready || !worker) return Promise.resolve('');
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      worker.postMessage({ type: 'hear', id, audio }, [audio.buffer]);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve(''); } }, 20000);
    });
  }

  // ---------- the microphone ----------
  async function openMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    return { stream, ctx, src, proc, close() { try { proc.disconnect(); src.disconnect(); } catch (e) { /* fine */ } stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}); } };
  }

  // capture one utterance: resolves to { audio: Float32Array at the context's rate, rate } or null
  function capture(mic) {
    return new Promise((resolve) => {
      const rate = mic.ctx.sampleRate, chunks = [];
      let t = 0, voiced = 0, quiet = 0, started = -1, floor = 0.004, done = false;
      const finish = (ok) => {
        if (done) return; done = true;
        mic.proc.onaudioprocess = null; onLevel(0);
        if (!ok) { resolve(null); return; }
        const from = Math.max(0, Math.floor((started - PRE_ROLL) * rate));
        let len = 0; for (const c of chunks) len += c.length;
        const all = new Float32Array(len); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
        resolve({ audio: all.subarray(from), rate });
      };
      active = { stop: () => finish(started >= 0), cancel: () => finish(false) };
      mic.proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0), copy = new Float32Array(d);
        chunks.push(copy);
        let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
        const rms = Math.sqrt(sum / d.length), dt = d.length / rate;
        t += dt;
        // the noise floor follows the quiet slowly, so a humming fan does not count as speech
        if (rms < floor * 2) floor = floor * 0.95 + rms * 0.05;
        const gate = Math.max(0.012, floor * 3.2);
        onLevel(Math.min(1, rms / 0.12));
        if (rms > gate) { voiced += dt; quiet = 0; if (started < 0 && voiced >= MIN_VOICE) started = Math.max(0, t - voiced); }
        else { quiet += dt; if (started < 0) voiced = Math.max(0, voiced - dt * 0.5); }
        if (started >= 0 && quiet > TAIL) finish(true);
        else if (started >= 0 && t - started > MAX_SECONDS) finish(true);
        else if (started < 0 && t > GIVE_UP) finish(false);
      };
    });
  }

  async function to16k(audio, rate) {
    if (rate === RATE) return new Float32Array(audio);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new OAC(1, Math.max(1, Math.ceil(audio.length * RATE / rate)), RATE);
    const buf = off.createBuffer(1, audio.length, rate);
    buf.copyToChannel(audio, 0);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const out = await off.startRendering();
    return new Float32Array(out.getChannelData(0));
  }

  // ---------- the browser's own recogniser ----------
  function browserListen(mic) {
    return new Promise((resolve) => {
      const R = SR(); if (!R) { resolve(''); return; }
      const rec = new R();
      rec.lang = (navigator.language || 'en-GB').startsWith('en') ? navigator.language : 'en-GB';
      rec.interimResults = false; rec.maxAlternatives = 4; rec.continuous = false;
      let alts = [], over = false;
      const end = () => { if (over) return; over = true; if (active) active.cancel(); resolve(alts); };
      rec.onresult = (e) => { const r = e.results[0]; alts = Array.from({ length: r.length }, (_, i) => r[i].transcript); };
      rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') status('error', { why: 'The browser would not let its speech service run here.' }); end(); };
      rec.onend = end;
      // the level meter still runs off our own capture
      capture(mic).then(() => { try { rec.stop(); } catch (e) { /* ended */ } });
      try { rec.start(); } catch (e) { end(); }
      setTimeout(() => { try { rec.stop(); } catch (e) { /* ended */ } }, (MAX_SECONDS + GIVE_UP) * 1000);
    });
  }

  // ---------- one utterance ----------
  async function listen() {
    if (active) return [];
    if (!hasMic()) { status('error', { why: 'No microphone is available on this page.' }); return []; }
    if (engine === 'whisper' && !ready) {
      const ok = await loadWhisper();
      if (!ok) return [];
    }
    let mic;
    try { mic = await openMic(); }
    catch (e) {
      status('error', { why: e && e.name === 'NotAllowedError' ? 'Microphone permission was turned down. You can still tap the word to say it.' : 'The microphone would not open.' });
      return [];
    }
    status('listening');
    try {
      if (engine === 'browser') {
        const alts = await browserListen(mic);
        status('ready');
        return alts;
      }
      const got = await capture(mic);
      mic.close(); mic = null;
      if (!got) { status('ready', { quiet: true }); return []; }
      status('thinking');
      const pcm = await to16k(got.audio, got.rate);
      const text = await transcribe(pcm);
      status('ready');
      return text ? [text] : [];
    } finally { if (mic) mic.close(); active = null; }
  }
  function stop() { if (active) active.stop(); }
  function cancel() { if (active) active.cancel(); }

  return {
    listen, stop, cancel, transcribe, to16k, loadWhisper,
    get engine() { return engine; },
    setEngine(e) { if (ENGINES[e]) engine = e; status(engine === 'whisper' ? (ready ? 'ready' : 'off') : 'ready'); return engine; },
    get ready() { return engine === 'browser' ? hasBrowserSpeech() : ready; },
    get listening() { return !!active; },
  };
}
