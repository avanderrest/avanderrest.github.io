/* Pull a baked invented surround in to the photo's own background depth, or strip it.

       node tools/splat-pull-surround.js photo-splats/gallery/lizards.splat \
         photo-splats/gallery/lizards.splat
       node tools/splat-pull-surround.js photo-splats/gallery/lizards.splat \
         photo-splats/gallery/lizards.splat --strip

   `splat-surround.js` bakes a surround onto a sphere just past the rebuilt world (it used
   to go 30% past the farthest splat). If the depth rule later changes, a baked scene cannot
   follow it on its own: the shell is already in the file. This finds the baked shell (the
   dense, constant-radius ring at the far end) and leaves the photo splats alone.

   By default it scales the shell's positions and splat sizes in to just behind the photo's
   own background. The angular layout and colours are unchanged, so the painted picture
   still reads the same, only nearer. With --strip it removes the shell altogether, for a
   scene that should use the page's photo-derived surround instead (remove "surround": true
   from gallery.json so the page wraps it).

   Flags:
     --back f   how far behind the photo's background the shell sits (default 1.02)
     --strip    remove the shell instead of moving it
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const words = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [src, out] = words;
if (!src || !out) {
  console.error('usage: node tools/splat-pull-surround.js <in.splat> <out.splat> [--back 1.02 | --strip]');
  process.exit(2);
}
const back = Number(opt('back', 1.02));
const strip = args.includes('--strip');

(async () => {
  const P = await import(pathToFileURL(path.join(__dirname, '..', 'photo-splats', 'splats.js')).href);
  const raw = fs.readFileSync(src);
  const scene = P.fromSplat(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const n = scene.count;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.hypot(scene.pos[i * 3], scene.pos[i * 3 + 1], scene.pos[i * 3 + 2]);

  // the shell is a dense ring at one radius behind the photo's middle; find it by distance bin
  const sorted = Float32Array.from(d).sort();
  const lo = sorted[0], hi = sorted[n - 1], B = 4096;
  const counts = new Uint32Array(B);
  for (let i = 0; i < n; i++) counts[Math.min(B - 1, Math.floor(((d[i] - lo) / (hi - lo || 1)) * B))]++;
  const median = sorted[Math.floor(n * 0.5)];
  let bin = -1, best = 0;
  for (let b = 0; b < B; b++) {
    const centre = lo + ((b + 0.5) / B) * (hi - lo);
    if (centre < median) continue;
    if (counts[b] > best) { best = counts[b]; bin = b; }
  }
  const binLo = lo + (bin / B) * (hi - lo), binHi = lo + ((bin + 1) / B) * (hi - lo);
  const shell = [];
  let sum = 0;
  for (let i = 0; i < n; i++) if (d[i] >= binLo && d[i] <= binHi) { shell.push(i); sum += d[i]; }
  if (shell.length < n * 0.01) throw new Error(`no baked surround found (only ${shell.length} splats at one radius)`);
  const shellR = sum / shell.length;

  let written = scene;
  if (strip) {
    const shellMask = new Uint8Array(n);
    for (const i of shell) shellMask[i] = 1;
    written = P.emptyScene(n - shell.length, scene.meta);
    for (let i = 0, w = 0; i < n; i++) {
      if (shellMask[i]) continue;
      written.pos.set(scene.pos.subarray(i * 3, i * 3 + 3), w * 3);
      written.scale.set(scene.scale.subarray(i * 3, i * 3 + 3), w * 3);
      written.rot.set(scene.rot.subarray(i * 4, i * 4 + 4), w * 4);
      written.color.set(scene.color.subarray(i * 4, i * 4 + 4), w * 4);
      w++;
    }
  } else {
    // the photo's own background, from the splats that are not the shell
    const rest = [];
    for (let i = 0; i < n; i++) if (d[i] < binLo || d[i] > binHi) rest.push(d[i]);
    rest.sort((a, b) => a - b);
    const bg = rest[Math.min(rest.length - 1, Math.floor(rest.length * 0.999))] || shellR;
    const newR = bg * back;
    const k = newR / shellR;
    for (const i of shell) {
      for (let c = 0; c < 3; c++) {
        scene.pos[i * 3 + c] *= k;
        scene.scale[i * 3 + c] *= k;
      }
    }
    console.log(`${n.toLocaleString()} splats: ${(n - shell.length).toLocaleString()} photo + ${shell.length.toLocaleString()} shell`);
    console.log(`shell ${shellR.toFixed(3)} → ${newR.toFixed(3)} (photo background ${bg.toFixed(3)}, ×${back}); scale ×${k.toFixed(3)}`);
  }
  const bytes = Buffer.from(P.toSplat(written));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, bytes);
  if (strip) console.log(`${n.toLocaleString()} splats: removed ${shell.length.toLocaleString()} shell at ${shellR.toFixed(3)}, kept ${written.count.toLocaleString()} photo`);
  console.log(`wrote ${out} (${(bytes.length / 1048576).toFixed(1)} MB)`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
