/* The camera turns about the subject, not whatever holds most of the splats.

   A near ball in front of a far wall: the old 30th-percentile focus landed on the wall
   (the ball is only 24% of the splats), so the view swung about the background. The
   subject focus finds the near, central patch instead. It still finds a subject off to
   one side, ignores an invented surround shell behind it, and falls back to the old
   percentile when there is no photo frame or no depth range to read. */
import * as P from '../../photo-splats/splats.js';

const close = (a, b, eps) => Math.abs(a - b) <= eps;

function make({ sx = 0, sy = 0, sz = 2, sn = 3000, wz = 5, wn = 9600, meta = true, shell = false } = {}) {
  const W = 1200, H = 800, focal = 1.2;
  const s = P.emptyScene(sn + wn, meta ? { width: W, height: H, focal } : {});
  let r = 7;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < sn; i++) {
    const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, rad = 0.25 * Math.cbrt(rnd());
    const q = Math.sqrt(1 - u * u);
    s.pos.set([sx + q * Math.cos(t) * rad, sy + q * Math.sin(t) * rad, sz + u * rad], i * 3);
  }
  for (let j = 0; j < wn; j++) {
    const i = sn + j, x = (j % 120) / 119 - 0.5, y = Math.floor(j / 120) / 79 - 0.5;
    s.pos.set([x * 6, y * 4, wz], i * 3);
  }
  if (!shell) return s;
  const eqW = 64, eqH = 32, rgba = new Uint8ClampedArray(eqW * eqH * 4).fill(160);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return P.concatScenes(s, P.surroundShell({ rgba, width: eqW, height: eqH, radius: 7, step: 1 }));
}

export default function () {
  const problems = [], notes = [];

  const wall = make();
  const f = P.focusDepth(wall);
  notes.push(`ball and wall ${f.toFixed(2)} (wall at 5, ball at 2)`);
  if (!close(f, 2, 0.15)) problems.push(`focused on ${f.toFixed(2)}, not the ball at 2`);

  const left = make({ sx: -0.9 });
  const fl = P.focusDepth(left);
  notes.push(`off-centre subject ${fl.toFixed(2)}`);
  if (!close(fl, 2, 0.15)) problems.push(`an off-centre subject gave ${fl.toFixed(2)}, not 2`);

  const framed = make({ shell: true });
  const fs = P.focusDepth(framed);
  notes.push(`with surround ${fs.toFixed(2)}`);
  if (!close(fs, 2, 0.15)) problems.push(`the surround shell stole the focus: ${fs.toFixed(2)}`);

  const flat = make({ sn: 0, wz: 3 });
  const ff = P.focusDepth(flat);
  notes.push(`flat scene ${ff.toFixed(2)}`);
  if (!close(ff, 3, 0.05)) problems.push(`a flat scene fell to ${ff.toFixed(2)}, not 3`);

  const noFrame = make({ meta: false });
  const fn = P.focusDepth(noFrame);
  notes.push(`no photo frame ${fn.toFixed(2)} (old percentile)`);
  if (!close(fn, 5, 0.05)) problems.push(`a scene with no frame should keep the percentile fallback (5), got ${fn.toFixed(2)}`);

  return {
    pass: problems.length === 0,
    detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(', '),
  };
}
