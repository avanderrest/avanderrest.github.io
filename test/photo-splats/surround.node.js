/* The invented surround sits at the photo's own background depth, just behind it.

   A background plane at 5 with five stray splats at 40: the shell used to go 30% past
   the farthest splat (52), which read as a second, much deeper room. Now it sits just
   past the 99.9th percentile (about 6), so it blends with the background and covers none
   of it but the strays. */
import * as P from '../../photo-splats/splats.js';

export default function () {
  const problems = [], notes = [];
  const W = 1200, H = 800, focal = 1.2, n = 20000;
  const s = P.emptyScene(n + 5, { width: W, height: H, focal });
  const fpx = focal * H;
  for (let i = 0; i < n; i++) {
    const u = (i % 100) / 99 - 0.5, v = Math.floor(i / 100) / 199 - 0.5;
    s.pos.set([(u * W / fpx) * 5, (v * H / fpx) * 5, 5], i * 3);
    s.color[i * 4 + 3] = 255;
  }
  for (let i = 0; i < 5; i++) {
    s.pos.set([(i - 2) * 0.01, 0, 40], (n + i) * 3);
    s.color[(n + i) * 4 + 3] = 255;
  }

  const d = P.backgroundDepth(s);
  notes.push(`background ${d.toFixed(2)} (plane at 5, strays at 40)`);
  if (!(d > 5 && d < 7)) problems.push(`background depth ${d.toFixed(2)}, wanted the plane's far edge`);

  const sw = 64, sh = 32, rgba = new Uint8ClampedArray(sw * sh * 4).fill(120);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const shell = 1000;
  const wrapped = P.withSurround(s, { rgba, width: sw, height: sh, keep: s.count + shell, shell, step: 2 });
  const shellN = wrapped.count - s.count;
  let rMin = Infinity, rMax = 0;
  for (let i = wrapped.count - shellN; i < wrapped.count; i++) {
    const r = Math.hypot(wrapped.pos[i * 3], wrapped.pos[i * 3 + 1], wrapped.pos[i * 3 + 2]);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  let beyond = 0;
  for (let i = 0; i < n; i++) {
    if (Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]) > rMin) beyond++;
  }
  notes.push(`shell ${shellN} at ${rMin.toFixed(2)}, ${beyond} photo splats behind it`);
  if (!(rMax - rMin < 1e-3)) problems.push(`the shell is not one sphere: ${rMin.toFixed(2)}..${rMax.toFixed(2)}`);
  if (!(rMin >= d && rMin <= d * 1.05)) problems.push(`shell at ${rMin.toFixed(2)}, not just behind the background ${d.toFixed(2)}`);
  if (rMin > 8) problems.push(`shell still far out at ${rMin.toFixed(2)}`);
  if (beyond > 5) problems.push(`the shell covers ${beyond} background splats, wanted only the 5 strays`);

  return { pass: problems.length === 0, detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(', ') };
}
