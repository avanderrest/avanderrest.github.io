/* Every style makes a picture in Node, the same one every time for its seed.

   In Node, through sim.js and its SVG stand-in for a canvas (the one the SVG download
   uses), for each of the thirteen styles on two seeds: build the scene, render the still
   picture as SVG and render it again from a fresh build. The two have to be identical,
   the other seed different, and half the drawing-in (upto = half the pieces) has to be
   something between nothing and the whole. Reas's process paints through an offscreen
   canvas and Path2D; here the canvas is a recorder that draws nothing, and its picture in
   the SVG is a hash of every call it took. determinism.js and every-style.js check the pixels in the page. */
import { createMachine } from '../../machine-imaginaire/sim.js';

// a context that draws nothing but writes down every call and setting it is given; a
// path it strokes is written down whole, and a full-size opaque fill wipes the record,
// the way it wipes a real canvas
const arg = (x) => (typeof x === 'number' ? x.toFixed(2) : x && x.__log ? hash(x.__log.join(';')) : typeof x);
const recorder = (log, w, h) => new Proxy({}, {
  get: (o, k) => {
    if (k === '__log') return log;
    if (k in o) return o[k];
    return (...a) => {
      if (k === 'fillRect' && w && a[0] === 0 && a[1] === 0 && a[2] === w && a[3] === h && (o.globalAlpha == null || o.globalAlpha === 1)) log.length = 0;
      log.push(String(k) + '(' + a.map(arg).join() + ')');
    };
  },
  set: (o, k, v) => { o[k] = v; log.push(String(k) + '=' + v); return true; },
});
const sink = () => recorder([]);
// the offscreen canvas's picture, as a data URL, is a hash of what was drawn on it
const makeCanvas = (w, h) => {
  const log = [];
  const ctx = recorder(log, w, h);
  return { width: w, height: h, getContext: () => ctx, toDataURL: () => 'data:text/plain,' + hash(log.join(';')) };
};

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

export default function () {
  const problems = [], notes = [];
  const mi = createMachine({ makeCanvas, makePath: sink });
  const svgOf = (seed, style, upto) => {
    mi.S.seed = seed; mi.S.style = style; mi.S.photo = null;
    const { scene } = mi.buildScene();
    if (upto == null) return { svg: mi.pictureSvg(scene, 0), scene };
    const svg = mi.svgContext();
    svg.save();
    scene.paint(svg, 0, Math.floor(scene.total * upto));
    svg.restore();
    return { svg: svg.result(), scene };
  };
  for (const style of mi.ORDER) {
    const t0 = Date.now();
    const a = svgOf('quiet-grid-101', style).svg;
    const b = svgOf('quiet-grid-101', style).svg;
    const c = svgOf('salt-moth-202', style).svg;
    const { scene } = svgOf('quiet-grid-101', style);
    if (a !== b) problems.push(`${style}: the same seed made two pictures`);
    if (a === c) problems.push(`${style}: two seeds made one picture`);
    const image = a.includes('<image');   // Reas: one offscreen picture, embedded whole
    if (!image && a.length < 500) problems.push(`${style}: a picture of ${a.length} bytes`);
    if (!(scene.total > 0)) problems.push(`${style}: a scene of ${scene.total} pieces`);
    const none = svgOf('quiet-grid-101', style, 0).svg, half = svgOf('quiet-grid-101', style, 0.5).svg;
    if (image ? (none === half || half === a) : !(none.length <= half.length && half.length <= a.length && none.length < a.length)) {
      problems.push(`${style}: drawing in went ${none.length} / ${half.length} / ${a.length} bytes`);
    }
    notes.push(`${style} ${hash(a)} ${(a.length / 1024).toFixed(0)}KB ${scene.total} pieces ${Date.now() - t0}ms`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') + notes.join('; '),
  };
}
