/* Photo Splats: the full way, run in a worker. Apple's SHARP (a single photo to about a
   million 3D Gaussians) through ONNX Runtime Web on WebGPU.

   The weights are a community ONNX export on Hugging Face (buildoak/sharp-onnx, pinned to
   one revision): a 1.9 MB graph and a 2.6 GB sidecar. They are not ours to host and are
   too big for GitHub Pages anyway, and Apple's licence for them is research-use only.
   The sidecar is kept in Cache Storage after the first download, so a second visit only
   reads it from disk. If the browser will not keep 2.6 GB, ONNX Runtime fetches it each
   time instead.

   In: an ImageBitmap and the focal length. Out: the scene's arrays, made by
   splats.js fromSharp exactly as Apple's predict_image does it. */
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.webgpu.min.mjs';
import { fromSharp } from './splats.js';

const REV = '24724392737153f5ec7022b166f327f0b67770f9';
const BASE = `https://huggingface.co/buildoak/sharp-onnx/resolve/${REV}/`;
const GRAPH = BASE + 'sharp.onnx', DATA = BASE + 'sharp.onnx.data';
const DATA_BYTES = 2615734016;
const CACHE = 'photo-splats-sharp-v1';
const SIZE = 1536;

ort.env.wasm.numThreads = 1;
let session = null;

const say = (text, extra = {}) => self.postMessage({ type: 'status', text, ...extra });

async function cached(url, label, bytes) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { cache = null; }
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return { cache, blob: await hit.blob() };
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      if (est && est.quota && est.quota - (est.usage || 0) < bytes * 1.1) cache = null;
    } catch (e) { /* no estimate: try anyway */ }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || bytes;
  let got = 0, last = 0;
  const counted = res.body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      got += chunk.byteLength;
      const now = Date.now();
      if (now - last > 250) { last = now; self.postMessage({ type: 'progress', file: label, loaded: got, total }); }
      ctl.enqueue(chunk);
    },
  }));
  if (cache) {
    try {
      await cache.put(url, new Response(counted, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(total) } }));
      const hit = await cache.match(url);
      if (hit) return { cache, blob: await hit.blob() };
    } catch (e) { /* out of room part-way: fall through to a plain download */ }
  }
  return { cache: null, blob: await new Response(counted).blob() };
}

async function load() {
  if (session) return session;
  say('Fetching the SHARP model (2.6 GB the first time, then from this browser’s cache)…');
  const graph = await cached(GRAPH, 'sharp.onnx', 2e6);
  let dataUrl = DATA, blobUrl = null;
  try {
    const data = await cached(DATA, 'sharp.onnx.data', DATA_BYTES);
    blobUrl = dataUrl = URL.createObjectURL(data.blob);
  } catch (e) {
    // a stream that broke part-way: let ONNX Runtime fetch the file itself
    say('Could not keep a copy of the model; loading it straight from Hugging Face…');
  }
  say('Starting SHARP on the GPU (this takes a minute)…');
  const opts = { executionProviders: ['webgpu'], graphOptimizationLevel: 'all', externalData: [{ path: 'sharp.onnx.data', data: dataUrl }] };
  try {
    session = await ort.InferenceSession.create(new Uint8Array(await graph.blob.arrayBuffer()), opts);
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }
  return session;
}

function tensorFor(bitmap) {
  // SHARP squashes every photo to 1536 x 1536; the unprojection undoes the squash
  const c = new OffscreenCanvas(SIZE, SIZE), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const px = g.getImageData(0, 0, SIZE, SIZE).data, n = SIZE * SIZE, t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { t[i] = px[i * 4] / 255; t[n + i] = px[i * 4 + 1] / 255; t[2 * n + i] = px[i * 4 + 2] / 255; }
  return t;
}

const pick = (outs, word) => {
  const k = Object.keys(outs).find((n) => n.toLowerCase().includes(word));
  if (!k) throw new Error(`SHARP gave no "${word}" output (it gave ${Object.keys(outs).join(', ')})`);
  return outs[k].data;
};

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'check') {
    let ok = false, why = 'This browser has no WebGPU.';
    try {
      const a = navigator.gpu && (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }));
      if (a) { ok = true; why = ''; if (a.limits.maxBufferSize < 1 << 30) why = 'This GPU may be too small for SHARP.'; }
    } catch (e) { ok = false; }
    let isCached = false;
    try { isCached = !!(await (await caches.open(CACHE)).match(DATA)); } catch (e) { /* no cache */ }
    self.postMessage({ type: 'check', ok, why, cached: isCached });
    return;
  }
  if (m.type === 'forget') {
    try { await caches.delete(CACHE); } catch (e) { /* nothing kept */ }
    session = null;
    self.postMessage({ type: 'forgot' });
    return;
  }
  if (m.type !== 'sharp') return;
  try {
    const s = await load();
    say('SHARP is looking at the photo…');
    const { bitmap, focal, keep } = m;
    const W = bitmap.width, H = bitmap.height;
    const feeds = {
      [s.inputNames[0]]: new ort.Tensor('float32', tensorFor(bitmap), [1, 3, SIZE, SIZE]),
      [s.inputNames[1]]: new ort.Tensor('float32', new Float32Array([focal / W]), [1]),
    };
    bitmap.close();
    const t0 = performance.now();
    const outs = await s.run(feeds);
    const secs = (performance.now() - t0) / 1000;
    say('Turning SHARP’s answer into splats…');
    const scene = fromSharp({
      means: pick(outs, 'mean'), scales: pick(outs, 'singular'), quats: pick(outs, 'quaternion'),
      colors: pick(outs, 'color'), opacities: pick(outs, 'opacit'),
    }, { width: W, height: H, focal, keep });
    for (const k of Object.keys(outs)) { try { outs[k].dispose(); } catch (e) { /* cpu tensor */ } }
    const { pos, scale, rot, color } = scene;
    self.postMessage({ type: 'scene', id: m.id, scene, secs }, [pos.buffer, scale.buffer, rot.buffer, color.buffer]);
  } catch (e) {
    self.postMessage({ type: 'error', id: m.id, why: 'SHARP could not run: ' + String((e && e.message) || e).slice(0, 200) });
  }
};
