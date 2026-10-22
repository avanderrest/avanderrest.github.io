/* Make a Photo Splats scene from a photo, through the real page, and save it as .splat.

       node tools/photo-splat.js images/journal/the-forest.jpg photo-splats/gallery/the-forest.splat
       node tools/photo-splat.js <photo> <out.splat> --how depth --keep 300000 --shot look.png

   Opens photo-splats/ in its own headless Chrome with the real GPU and WebGPU on, and asks
   the page's debug handle to make the scene exactly as a visitor's "Make your own" would
   (--how sharp by default; depth for the quick way). Then it keeps the --keep most visible
   splats (default 350000, about 11 MB) and writes them out. It prints the gallery.json
   fields the file needs (.splat has no room for the photo's size and lens).

   The Chrome profile is fixed (photo-splat-chrome in the temp folder), so SHARP's 2.6 GB
   is only downloaded on the first run. Delete that folder to get the space back. */
'use strict';

const fs = require('fs');
const path = require('path');
const { open, ROOT } = require('./cdp');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const words = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [photo, out] = words;
if (!photo || !out) { console.error('usage: node tools/photo-splat.js <photo in the repo> <out.splat> [--how sharp|depth] [--keep n] [--shot file.png]'); process.exit(2); }
const how = opt('how', 'sharp'), keep = Number(opt('keep', 350000)), shot = opt('shot');
const rel = path.relative(ROOT, path.resolve(photo)).split(path.sep).join('/');
if (rel.startsWith('..')) { console.error('The photo has to be inside the repo, so the page can load it.'); process.exit(2); }

(async () => {
  const started = Date.now();
  const page = await open({ path: '/photo-splats/', gpu: how === 'sharp', profile: 'photo-splat-chrome', size: [1300, 800] });
  // report the page's progress while SHARP downloads and runs
  const ticker = setInterval(async () => {
    try {
      const t = await page.eval("const b = document.getElementById('ps-busy'); return b.hidden ? '' : document.getElementById('ps-busy-text').textContent");
      if (t) process.stdout.write(`\r  ${t.slice(0, 110).padEnd(110)}`);
    } catch (e) { /* busy */ }
  }, 2000);
  try {
    const made = await page.eval(`return JSON.stringify(await window.__splats.makeFromUrl('/${rel}', '${how}'))`);
    clearInterval(ticker);
    process.stdout.write('\n');
    const info = JSON.parse(made || 'null');
    if (!info) throw new Error('nothing was made: ' + (await page.eval("return document.getElementById('ps-hint').textContent")));
    const meta = JSON.parse(await page.eval(`
      const G = window.__splats, s = G.P.prune(G.current.scene, ${keep});
      window.__bytes = new Uint8Array(G.P.toSplat(s));
      return JSON.stringify({ count: s.count, total: G.current.scene.count, meta: s.meta, bytes: window.__bytes.length });`));
    const parts = [];
    const CHUNK = 3 * 1024 * 1024;
    for (let o = 0; o < meta.bytes; o += CHUNK) {
      const b64 = await page.eval(`
        const u = window.__bytes.subarray(${o}, ${o + CHUNK}); let s = '';
        for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
        return btoa(s);`);
      parts.push(Buffer.from(b64, 'base64'));
    }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, Buffer.concat(parts));
    if (shot) {
      await page.eval('window.__splats.sim.setSway(false); window.__splats.sim.reset(); await new Promise(r => setTimeout(r, 800));');
      await page.shot(shot);
    }
    const m = meta.meta;
    console.log(`${how}: ${meta.total.toLocaleString()} splats made${info.secs ? ` (model ran in ${info.secs.toFixed(1)} s)` : ''}, ` +
      `kept ${meta.count.toLocaleString()} → ${out} (${(meta.bytes / 1048576).toFixed(1)} MB) in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    console.log('gallery.json fields: ' + JSON.stringify({ file: path.basename(out), made: how, width: m.width, height: m.height, focal: +m.focal.toFixed(4) }));
  } catch (e) {
    clearInterval(ticker);
    console.error('\n' + (e.message || e));
    process.exitCode = 1;
  } finally {
    await page.close();
  }
})();
