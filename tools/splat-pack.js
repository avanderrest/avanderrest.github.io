/* Shrink a Gaussian splat .ply into a .splat small enough to commit.

       node tools/splat-pack.js scene.ply photo-splats/gallery/scene.splat
       node tools/splat-pack.js lgm-object.ply photo-splats/gallery/teapot.splat --keep 200000 --flip

   Reads any 3DGS .ply: SHARP's own `sharp predict` output, LGM, Brush, a Polycam or
   Luma export. Keeps the --keep most visible splats (default 350000, about 11 MB; opacity
   times size on screen from the original camera) and writes the 32-byte .splat layout.
   Higher spherical harmonics are dropped (a single photo has nothing to put in them).
   --flip turns a y-up scene (LGM and most object generators) over to y-down. Prints the
   gallery.json fields to paste. */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const words = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--flip'));
const [src, out] = words;
if (!src || !out) { console.error('usage: node tools/splat-pack.js <in.ply|in.splat> <out.splat> [--keep n] [--flip]'); process.exit(2); }

(async () => {
  const P = await import(pathToFileURL(path.join(__dirname, '..', 'photo-splats', 'splats.js')).href);
  const raw = fs.readFileSync(src);
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  let s = /\.ply$/i.test(src) ? P.fromPly(buf) : P.fromSplat(buf);
  if (args.includes('--flip')) P.flipYZ(s);
  const total = s.count;
  s = P.prune(s, Number(opt('keep', 350000)));
  const bytes = Buffer.from(P.toSplat(s));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, bytes);
  console.log(`${total.toLocaleString()} splats in, ${s.count.toLocaleString()} kept → ${out} (${(bytes.length / 1048576).toFixed(1)} MB)`);
  const m = s.meta, fields = { file: path.basename(out) };
  if (m.focal) Object.assign(fields, { made: 'sharp', width: m.width, height: m.height, focal: +m.focal.toFixed(4) });
  else Object.assign(fields, { object: true, orbit: 180 });
  console.log('gallery.json fields: ' + JSON.stringify(fields));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
