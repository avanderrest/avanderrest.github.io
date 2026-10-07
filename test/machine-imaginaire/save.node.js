/* The link and the save each carry the whole picture.

   In Node, through sim.js: analyse a made-up photo (four flat bands of colour) and
   check its palette and maps; set a seed, a style and a moved slider over it; render the
   picture as SVG. Then, on a fresh machine, read the share link's query back
   (fromQuery) and render: the same SVG. The same again through the save (toSave as JSON,
   fromSave). A link with a broken palette or a style that doesn't exist falls back
   rather than throwing. link.js checks the same on the page, in pixels. */
import { createMachine } from '../../machine-imaginaire/sim.js';

function bands(w, h, cols) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cols[Math.floor((x / w) * cols.length)], i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

export default function () {
  const problems = [];
  const a = createMachine();
  const photo = a.analyse(bands(120, 80, [[200, 40, 40], [40, 40, 200], [240, 240, 230], [30, 30, 30]]));
  if (!photo || photo.palette.length < 3) problems.push(`the photo gave ${photo ? photo.palette.length : 0} colours`);
  if (!photo || photo.lum.length !== 160) problems.push(`the light map is ${photo && photo.lum.length} digits, not 160`);
  a.S.seed = 'tidal-kite-555';
  a.S.style = 'morellet';
  const k = a.STYLES.morellet.params[0];
  a.S.params.morellet[k.k] = k.max != null ? k.max : a.S.params.morellet[k.k];
  a.S.photo = { pal: photo.palette, lum: photo.lum, tone: photo.tone, name: 'bands' };
  const svgOf = (m) => m.pictureSvg(m.buildScene().scene, 0);
  const first = svgOf(a);

  const query = a.toQuery();
  const b = createMachine();
  b.fromQuery(query);
  const fromLink = svgOf(b);
  if (fromLink !== first) problems.push('the picture from the link is not the picture');
  if (b.S.style !== 'morellet' || b.S.seed !== 'tidal-kite-555') problems.push(`the link opened ${b.S.style} on ${b.S.seed}`);

  const kept = JSON.parse(JSON.stringify(a.toSave(false)));
  const c = createMachine();
  c.fromSave(kept);
  const fromSave = svgOf(c);
  if (fromSave !== first) problems.push('the picture from the save is not the picture');

  const d = createMachine();
  let threw = null;
  try { d.fromQuery('seed=x&style=nonsense&pal=zz-qq'); svgOf(d); } catch (e) { threw = e.message; }
  if (threw) problems.push(`a broken link threw: ${threw}`);
  else if (d.S.photo) problems.push('a broken palette was kept');

  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      `photo: ${photo && photo.palette.map((p) => p.hex).join(' ')}; link of ${query.length} chars and the save both rebuilt the same ${(first.length / 1024).toFixed(0)}KB SVG; a broken link fell back to ${d.S.style}`,
  };
}
