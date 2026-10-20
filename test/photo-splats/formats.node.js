/* Every way a scene is made, read or written comes out right.

   SHARP's NDC-to-metric step: the covariance after the squash equals A C A for every
   Gaussian (checked against covariances() of the raw ones). .splat and .ply round-trip
   (colour exact, scale within float error), and a .ply carrying SHARP's image_size and
   intrinsic elements opens on the photo's own lens. A depth scene seen from the origin
   lands every pixel's splat back on that pixel. The sort is back to front with no
   inversions. EXIF's 35mm focal length is found. */
import * as P from '../../photo-splats/splats.js';
import { mulberry32 } from '../../lib/rng.js';

export default function () {
  const problems = [], notes = [];
  const r = mulberry32(11), n = 3000;
  const means = new Float32Array(n * 3), scales = new Float32Array(n * 3), quats = new Float32Array(n * 4), colors = new Float32Array(n * 3), op = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    means[i * 3] = r() * 2 - 1; means[i * 3 + 1] = r() * 2 - 1; means[i * 3 + 2] = 1 + r() * 4;
    for (let k = 0; k < 3; k++) { scales[i * 3 + k] = 0.001 + r() * 0.03; colors[i * 3 + k] = r(); }
    for (let k = 0; k < 4; k++) quats[i * 4 + k] = r() - 0.5;
    op[i] = r();
  }
  const W = 1200, H = 800, f = P.focalPx(W, H);
  const s = P.fromSharp({ means, scales, quats, colors, opacities: op }, { width: W, height: H, focal: f });
  const raw = P.emptyScene(n);
  raw.scale.set(scales);
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(quats[i * 4], quats[i * 4 + 1], quats[i * 4 + 2], quats[i * 4 + 3]);
    for (let k = 0; k < 4; k++) raw.rot[i * 4 + k] = quats[i * 4 + k] / l;
  }
  const C0 = P.covariances(raw), C1 = P.covariances(s);
  const A = [W / (2 * f), H / (2 * f), 1], pairs = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
  const kept = [];
  for (let i = 0; i < n; i++) if (op[i] >= 0.02) kept.push(i);
  if (kept.length !== s.count) problems.push(`kept ${s.count}, expected ${kept.length}`);
  let worst = 0;
  kept.forEach((j, i) => pairs.forEach(([a, b], e) => {
    const want = C0[j * 6 + e] * A[a] * A[b], scaleRef = C0[j * 6] * A[0] * A[0] + C0[j * 6 + 5];
    worst = Math.max(worst, Math.abs(want - C1[i * 6 + e]) / scaleRef);
  }));
  if (worst > 1e-4) problems.push(`SHARP squash covariance off by ${worst.toExponential(2)}`);
  notes.push(`squash err ${worst.toExponential(1)}`);
  if (Math.abs(s.meta.focal - f / H) > 1e-9) problems.push('fromSharp lost the focal length');

  // .splat and .ply
  const s2 = P.fromSplat(P.toSplat(s), s.meta);
  if (s2.count !== s.count || s2.pos[30] !== s.pos[30] || s2.color[41] !== s.color[41]) problems.push('.splat did not round-trip');
  const s3 = P.fromPly(P.toPly(s));
  let ce = 0, se = 0, qe = 0;
  for (let i = 0; i < s.count * 4; i++) ce = Math.max(ce, Math.abs(s3.color[i] - s.color[i]));
  for (let i = 0; i < s.count * 3; i++) se = Math.max(se, Math.abs(s3.scale[i] / s.scale[i] - 1));
  for (let i = 0; i < s.count * 4; i++) qe = Math.max(qe, Math.abs(s3.rot[i] - s.rot[i]));
  if (ce > 0 || se > 1e-5 || qe > 1e-6) problems.push(`.ply round trip: colour ${ce}, scale ${se.toExponential(1)}, rot ${qe.toExponential(1)}`);

  // a SHARP-style .ply with its extra elements after the vertices
  const base = new Uint8Array(P.toPly(s));
  const txt = new TextDecoder().decode(base.subarray(0, 600));
  const hdrEnd = txt.indexOf('end_header\n') + 11;
  const header = txt.slice(0, hdrEnd).replace('end_header\n', 'element image_size 2\nproperty uint image_size\nelement intrinsic 9\nproperty float intrinsic\nend_header\n');
  const extra = new DataView(new ArrayBuffer(8 + 36));
  extra.setUint32(0, W, true); extra.setUint32(4, H, true);
  [f, 0, W / 2, 0, f, H / 2, 0, 0, 1].forEach((v, i) => extra.setFloat32(8 + i * 4, v, true));
  const sharpPly = new Uint8Array(header.length + (base.length - hdrEnd) + 44);
  sharpPly.set(new TextEncoder().encode(header)); sharpPly.set(base.subarray(hdrEnd), header.length); sharpPly.set(new Uint8Array(extra.buffer), header.length + base.length - hdrEnd);
  const s4 = P.fromPly(sharpPly.buffer);
  if (s4.meta.width !== W || s4.meta.height !== H || Math.abs(s4.meta.focal - f / H) > 1e-5) problems.push(`SHARP .ply meta read as ${JSON.stringify(s4.meta)}`);
  if (s4.count !== s.count) problems.push('SHARP .ply lost vertices');

  // depth: from the photo's own camera, each pixel's splat sits on that pixel
  const w = 40, h = 30, rgba = new Uint8ClampedArray(w * h * 4).fill(200);
  const depth = new Float32Array(20 * 15).map((_, i) => ((i % 20) > 9 ? 1 : 0.2));
  const ds = P.fromDepth({ rgba, width: w, height: h, depth, dw: 20, dh: 15, range: 3 });
  const fp = ds.meta.focal * h;
  let miss = 0;
  for (let i = 0; i < w * h; i++) {
    const px = (ds.pos[i * 3] / ds.pos[i * 3 + 2]) * fp + w / 2 - 0.5, py = (ds.pos[i * 3 + 1] / ds.pos[i * 3 + 2]) * fp + h / 2 - 0.5;
    miss = Math.max(miss, Math.abs(px - (i % w)), Math.abs(py - Math.floor(i / w)));
  }
  if (miss > 1e-3) problems.push(`depth splats miss their pixels by ${miss.toFixed(4)}`);
  const zs = [];
  for (let i = 0; i < w * h; i++) zs.push(ds.pos[i * 3 + 2]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  if (Math.abs(zmin - 1) > 0.01 || Math.abs(zmax - 3) > 0.05) problems.push(`depth range ${zmin.toFixed(2)}..${zmax.toFixed(2)}, wanted 1..3`);
  if (ds.count <= w * h) problems.push('no fill splats laid across the depth edge');
  notes.push(`depth ${w * h} pixels + ${ds.count - w * h} fill`);

  // sort
  const order = P.sortByDepth(s.pos, s.count, [0, 0, 0], [0, 0, 1]);
  let inv = 0;
  for (let i = 1; i < s.count; i++) if (s.pos[order[i] * 3 + 2] > s.pos[order[i - 1] * 3 + 2] + 1e-3) inv++;
  if (inv) problems.push(`${inv} sort inversions`);
  if (new Set(order).size !== s.count) problems.push('sort lost or doubled splats');

  // prune keeps the most visible
  const pr = P.prune(s, 500);
  if (pr.count !== 500) problems.push(`prune kept ${pr.count}`);

  // invented surround: equirect wraps past the photo, forward cone stays clear
  const sw = 64, sh = 32;
  const envRgba = new Uint8ClampedArray(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) {
    envRgba[i * 4] = (i * 17) & 255; envRgba[i * 4 + 1] = (i * 31) & 255; envRgba[i * 4 + 2] = 180; envRgba[i * 4 + 3] = 255;
  }
  const env = P.surroundShell({ rgba: envRgba, width: sw, height: sh, radius: 10, step: 4, frontFade: 0.55 });
  if (!env.count) problems.push('surround shell was empty');
  let inFront = 0;
  for (let i = 0; i < env.count; i++) {
    const L = Math.hypot(env.pos[i * 3], env.pos[i * 3 + 1], env.pos[i * 3 + 2]);
    if (Math.abs(L - 10) > 0.05) { problems.push('surround splat off the sphere'); break; }
    if (env.pos[i * 3 + 2] / L > 0.55) inFront++;
  }
  if (inFront) problems.push(`${inFront} surround splats inside the forward cone`);
  const tiny = P.prune(s, 200);
  const wrapped = P.withSurround(tiny, { rgba: envRgba, width: sw, height: sh, keep: 400, shell: 200, step: 4 });
  if (wrapped.count <= tiny.count) problems.push('withSurround did not add shell splats');
  if (wrapped.count > 400) problems.push(`withSurround kept ${wrapped.count}, over budget`);
  notes.push(`surround ${env.count} shell, wrapped ${wrapped.count}`);

  // EXIF
  const ex = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 52, 0x45, 0x78, 0x69, 0x66, 0, 0,
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0,
    1, 0, 0x69, 0x87, 4, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 0,
    1, 0, 0x05, 0xa4, 3, 0, 1, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
  const mm = P.exifFocal35(ex);
  if (mm !== 50) problems.push(`EXIF 35mm focal read as ${mm}`);
  if (P.exifFocal35(new Uint8Array([0xff, 0xd8, 0xff, 0xda])) !== null) problems.push('EXIF found in a JPEG without one');

  // the photo-as-surround: an equirect built from the photo's own pixels, its centre the
  // photo's centre, its edges clamped to the photo's rim and everything blurred
  const pw = 32, ph = 24;
  const prgba = new Uint8ClampedArray(pw * ph * 4);
  for (let i = 0; i < pw * ph; i++) { prgba[i * 4] = (i % pw) < pw / 2 ? 200 : 30; prgba[i * 4 + 1] = 60; prgba[i * 4 + 2] = 30; }
  const eq = P.equirectFromPhoto(prgba, pw, ph, { eqW: 64, eqH: 32, halfW: 0.5, halfH: 0.5, blur: 2 });
  if (eq.width !== 64 || eq.height !== 32 || eq.rgba.length !== 64 * 32 * 4) problems.push(`photo equirect came out ${eq.width}x${eq.height}`);
  const centre = eq.rgba[((eq.height / 2 | 0) * eq.width + (eq.width / 2 | 0)) * 4];
  if (!(centre > 60 && centre < 160)) problems.push(`photo equirect centre red ${centre}, wanted the blurred mid-tone`);
  const corner = eq.rgba[0];
  if (!(corner > 20 && corner < 200)) problems.push(`photo equirect corner red ${corner}, wanted a clamped photo colour`);
  notes.push(`photo equirect ${eq.width}x${eq.height}`);

  return { pass: problems.length === 0, detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(', ') + `, ${s.count} SHARP splats` };
}
