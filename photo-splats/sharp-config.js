/* Where SHARP's weights live. Shared by sharp-worker.js (which fetches them) and view.js
   (which only asks whether this browser has them). Keeping it here means the page can check
   without starting the worker, so a visitor who never installs SHARP never loads ONNX
   Runtime.

   Apple's SHARP through buildoak/sharp-onnx on Hugging Face, pinned to one revision: a
   1.9 MB graph and a 2.6 GB sidecar, kept in Cache Storage after the first download. */
export const REV = '24724392737153f5ec7022b166f327f0b67770f9';
export const BASE = `https://huggingface.co/buildoak/sharp-onnx/resolve/${REV}/`;
export const GRAPH = BASE + 'sharp.onnx';
export const DATA = BASE + 'sharp.onnx.data';
export const DATA_BYTES = 2615734016;
export const CACHE = 'photo-splats-sharp-v1';
