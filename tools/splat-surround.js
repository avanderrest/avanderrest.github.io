/* Bake an invented equirectangular surround into a Photo Splats scene.

       node tools/splat-surround.js photo-splats/gallery/lizards.splat \
         photo-splats/gallery/surrounds/lizards.jpg photo-splats/gallery/lizards.splat

   The surround picture is whatever you (or an LLM) imagined around the photo — interesting,
   not accurate. This wraps it onto a sphere of splats just past the rebuilt world, so
   turning past what the photo saw shows the invented hinterland instead of the clear.
   Decodes the picture through the page's Chrome (nothing to install), then merges in Node.

   Prints gallery.json fields including a wider orbit (default 180°, a full turn round the
   back). The shell fills the whole sphere by default — the photo sits in front of it and
   covers it, so the first view stays the photo and turning never shows a hole. Flags:
     --keep n       total splats after merge (default 400000)
     --shell n      budget reserved for the surround (default 70000)
     --step n       sample every nth pixel of the surround (default 3)
     --orbit deg    orbit limit to print (default 180)
     --front f      clear a forward cone (cos of its half-angle) instead of filling
                    everything, if the first view needs it kept clear
*/
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { open, ROOT } = require('./cdp');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const words = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [src, surround, out] = words;
if (!src || !surround || !out) {
  console.error('usage: node tools/splat-surround.js <in.splat> <surround.jpg|png> <out.splat> [--keep n] [--shell n] [--step n] [--orbit deg]');
  process.exit(2);
}

const keep = Number(opt('keep', 400000));
const shell = Number(opt('shell', 70000));
const step = Number(opt('step', 3));
const orbit = Number(opt('orbit', 180));
// by default the shell fills the whole sphere; --front clears a forward cone instead
const front = args.includes('--front') ? Number(opt('front', 0)) : undefined;

function repoUrl(file) {
  const rel = path.relative(ROOT, path.resolve(file)).split(path.sep).join('/');
  if (rel.startsWith('..')) throw new Error('Files have to be inside the repo so the page can load them: ' + file);
  return '/' + rel;
}

(async () => {
  const P = await import(pathToFileURL(path.join(__dirname, '..', 'photo-splats', 'splats.js')).href);
  const raw = fs.readFileSync(src);
  const scene = P.fromSplat(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const before = scene.count;

  const page = await open({ path: '/photo-splats/', size: [800, 600] });
  let img;
  try {
    const url = repoUrl(surround);
    const got = await page.eval(`
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = ${JSON.stringify(url)};
      await img.decode();
      const maxW = 1024;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const w = Math.max(2, Math.round(img.width * scale));
      const h = Math.max(2, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let s = '';
      for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode.apply(null, d.subarray(i, i + 32768));
      return JSON.stringify({ w, h, b64: btoa(s) });`);
    img = JSON.parse(got);
  } finally {
    await page.close();
  }

  const bin = Buffer.from(img.b64, 'base64');
  const rgba = new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength);
  const merged = P.withSurround(scene, {
    rgba, width: img.w, height: img.h, keep, shell, step, frontFade: front,
  });
  const bytes = Buffer.from(P.toSplat(merged));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, bytes);

  const m = merged.meta;
  const fields = {
    file: path.basename(out),
    made: opt('made', 'sharp'),
    surround: true,
    orbit,
  };
  if (m.width && m.height && m.focal) Object.assign(fields, { width: m.width, height: m.height, focal: +m.focal.toFixed(4) });
  console.log(`${before.toLocaleString()} photo + surround ${img.w}x${img.h} → ${merged.count.toLocaleString()} splats → ${out} (${(bytes.length / 1048576).toFixed(1)} MB)`);
  console.log(front != null
    ? `clear cone ${front.toFixed(3)} (${(Math.acos(Math.min(1, front)) * 57.2958).toFixed(0)}° half-angle)`
    : 'shell fills the whole sphere (nothing cleared)');
  console.log('gallery.json fields: ' + JSON.stringify(fields) + '  (keep width/height/focal from the existing entry if the .splat has no meta)');
})().catch((e) => { console.error(e.message || e); process.exit(1); });