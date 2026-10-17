/* Photo Splats: the quick way, run in a worker. Depth Anything V2 Small (Apache-2.0,
   about 27 MB quantised) guesses how far away each part of the photo is, through
   Transformers.js from jsDelivr, the same build Pocket Pal uses for Whisper. Only the depth
   map comes back; splats.js turns it into splats, so the depth slider can rebuild a scene
   without running the model again. The model is cached by the browser after the first
   visit. */
import { pipeline, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';

const MODEL = 'onnx-community/depth-anything-v2-small';
let depth = null;

async function load() {
  if (depth) return;
  depth = await pipeline('depth-estimation', MODEL, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
    },
  });
}

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type !== 'depth') return;
  try {
    await load();
    self.postMessage({ type: 'status', text: 'Working out how far away everything is…' });
    const img = await RawImage.fromBlob(m.blob);
    const out = await depth(img);
    const t = out.predicted_depth;
    const dims = t.dims.slice(-2);
    const data = Float32Array.from(t.data);
    self.postMessage({ type: 'depth', id: m.id, data, dh: dims[0], dw: dims[1] }, [data.buffer]);
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, why: 'The depth model would not run: ' + String((e && e.message) || e).slice(0, 160) });
  }
};
