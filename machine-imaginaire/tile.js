/* Machine Imaginaire on the wall: the flow field, moving, in the same oak frame the
   thumbnail hangs in. It is the game's own sim (never a copy), given the palette the
   thumbnail was painted with and a fixed seed, so the tile shows one of the pictures
   the machine makes rather than a recording of one. Clicking it opens the machine.
   Still under reduced motion, and the loop waits until the tile is on screen. */
import { createMachine } from './sim.js';

const canvas = document.getElementById('mi-tile-canvas');
if (canvas) {
  const mi = createMachine({
    makeCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }),
    makePath: () => new Path2D(),
  });

  // the thumbnail's own colours: cream paper, teal and rust inks, a navy one for depth
  mi.S.photo = {
    pal: mi.canon([
      { hex: '#f2ece0', w: 0.42 },
      { hex: '#2a7f86', w: 0.18 },
      { hex: '#c46b45', w: 0.16 },
      { hex: '#1f3b57', w: 0.12 },
      { hex: '#7fb5b3', w: 0.12 },
    ]),
    lum: null, tone: null, name: null,
  };
  mi.S.seed = 'machine-imaginaire-wall-260';
  mi.S.style = 'hobbs';
  // fewer, broader strands than the picture: the tile is read from across the room
  Object.assign(mi.S.params.hobbs, { lines: 260, length: 190, scale: 3, turn: 42, width: 9, spacing: 11 });

  const ctx = canvas.getContext('2d');
  const calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const scene = mi.buildScene().scene;
  let t = 0;
  let seen = false;
  let raf = 0;
  let last = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.round(w * mi.H / mi.W);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function paint() {
    if (!canvas.width) resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const f = canvas.width / mi.W;
    ctx.setTransform(f, 0, 0, f, 0, 0);
    ctx.save();
    scene.paint(ctx, t, scene.total);
    ctx.restore();
  }

  function loop(now) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    paint();
    if (seen) raf = requestAnimationFrame(loop);
    else last = 0;
  }
  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  resize();
  paint();

  if (!calm) {
    if (typeof IntersectionObserver === 'undefined') {
      seen = true;
      kick();
    } else {
      new IntersectionObserver((entries) => entries.forEach((en) => {
        seen = en.isIntersecting;
        if (seen) kick();
      }), { rootMargin: '60px' }).observe(canvas);
    }
  }

  window.addEventListener('resize', () => {
    resize();
    paint();
  });
  // a visitor who switches reduced motion on mid-visit gets the still picture
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onCalm = (e) => { if (e.matches) { seen = false; if (raf) cancelAnimationFrame(raf); raf = 0; t = 0; paint(); } };
    if (mq.addEventListener) mq.addEventListener('change', onCalm);
  }
}
