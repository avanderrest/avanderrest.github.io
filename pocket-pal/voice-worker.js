/* Pocket Pal: the worker Whisper runs in (see voice.js), so the room keeps moving while it
   listens. Transformers.js does all the work; this only loads the model and hands it audio
   (16 kHz mono floats) to write down. */
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

const MODEL = 'onnx-community/whisper-tiny.en';
let asr = null;

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'load') {
    try {
      asr = await pipeline('automatic-speech-recognition', MODEL, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (p) => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); },
      });
      // one tiny warm-up so the first real word is not slow
      await asr(new Float32Array(8000));
      self.postMessage({ type: 'ready', device: 'wasm' });
    } catch (e) {
      self.postMessage({ type: 'error', why: 'The speech model would not load: ' + String((e && e.message) || e).slice(0, 140) });
    }
  } else if (m.type === 'hear') {
    let text = '';
    try { if (asr) text = (await asr(m.audio)).text || ''; } catch (e) { text = ''; }
    self.postMessage({ type: 'text', id: m.id, text: text.trim() });
  }
};
