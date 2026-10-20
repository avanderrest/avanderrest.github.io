/* Photo Splats: what a splat scene is, and every way one is made, read or written.

   No page access at all, so the page, the workers, the tools and the Node tests share it.

   A scene is plain typed arrays, one entry per Gaussian:

     { count,
       pos:   Float32Array(3n)  centre, x right, y down, z forward (OpenCV, as SHARP does)
       scale: Float32Array(3n)  standard deviation along each local axis (not the log)
       rot:   Float32Array(4n)  unit quaternion, w x y z
       color: Uint8Array(4n)    sRGB and opacity, 0-255
       meta:  { width, height, focal } the photo it came from, if known; focal is the
              focal length over the image height, so the first view can match the photo }

   Made from:   fromPly (any 3DGS .ply: SHARP, LGM, Brush, Polycam...), fromSplat (.splat),
                fromDepth (a photo and a depth map), fromSharp (SHARP's raw outputs),
                surroundShell / withSurround (an invented equirectangular wrap).
   Written as:  toSplat (.splat, 32 bytes a splat), toPly (standard 3DGS .ply).
   Also:        covariances (for the renderer), sortByDepth (back to front), prune,
                concatScenes, backgroundDepth, focusDepth, exifFocal35. */

// ---------- constants ----------
const SH_C0 = 0.28209479177387814;       // zeroth spherical harmonic: f_dc = (colour - 0.5) / SH_C0
export const DEFAULT_FOCAL_MM = 30;      // what SHARP assumes when a photo has no EXIF
const FILM_DIAG_MM = Math.hypot(36, 24);
export const SPLAT_BYTES = 32;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toByte = (v) => clamp(Math.round(v * 255), 0, 255);

export function emptyScene(n, meta = {}) {
  return {
    count: n,
    pos: new Float32Array(n * 3), scale: new Float32Array(n * 3),
    rot: new Float32Array(n * 4), color: new Uint8Array(n * 4),
    meta: { width: 0, height: 0, focal: 0, ...meta },
  };
}

/* focal length in pixels for a photo, from its 35mm-equivalent focal length (SHARP's rule) */
export function focalPx(width, height, mm35 = DEFAULT_FOCAL_MM) {
  return (mm35 * Math.hypot(width, height)) / FILM_DIAG_MM;
}

// ---------- .splat ----------
/* The antimatter15 layout every web viewer reads: position 3 x f32, scale 3 x f32,
   colour 4 x u8 (rgba), rotation 4 x u8 (w x y z, each q * 128 + 128). */
export function toSplat(s) {
  const buf = new ArrayBuffer(s.count * SPLAT_BYTES);
  const f = new Float32Array(buf), u = new Uint8Array(buf);
  for (let i = 0; i < s.count; i++) {
    const fo = i * 8, bo = i * 32;
    f[fo] = s.pos[i * 3]; f[fo + 1] = s.pos[i * 3 + 1]; f[fo + 2] = s.pos[i * 3 + 2];
    f[fo + 3] = s.scale[i * 3]; f[fo + 4] = s.scale[i * 3 + 1]; f[fo + 5] = s.scale[i * 3 + 2];
    u[bo + 24] = s.color[i * 4]; u[bo + 25] = s.color[i * 4 + 1]; u[bo + 26] = s.color[i * 4 + 2]; u[bo + 27] = s.color[i * 4 + 3];
    for (let k = 0; k < 4; k++) u[bo + 28 + k] = clamp(Math.round(s.rot[i * 4 + k] * 128 + 128), 0, 255);
  }
  return buf;
}

export function fromSplat(buffer, meta = {}) {
  const n = Math.floor(buffer.byteLength / SPLAT_BYTES);
  const f = new Float32Array(buffer, 0, n * 8), u = new Uint8Array(buffer, 0, n * 32);
  const s = emptyScene(n, meta);
  for (let i = 0; i < n; i++) {
    const fo = i * 8, bo = i * 32;
    s.pos[i * 3] = f[fo]; s.pos[i * 3 + 1] = f[fo + 1]; s.pos[i * 3 + 2] = f[fo + 2];
    s.scale[i * 3] = f[fo + 3]; s.scale[i * 3 + 1] = f[fo + 4]; s.scale[i * 3 + 2] = f[fo + 5];
    for (let k = 0; k < 4; k++) s.color[i * 4 + k] = u[bo + 24 + k];
    let w = (u[bo + 28] - 128) / 128, x = (u[bo + 29] - 128) / 128, y = (u[bo + 30] - 128) / 128, z = (u[bo + 31] - 128) / 128;
    const len = Math.hypot(w, x, y, z) || 1;
    s.rot[i * 4] = w / len; s.rot[i * 4 + 1] = x / len; s.rot[i * 4 + 2] = y / len; s.rot[i * 4 + 3] = z / len;
  }
  return s;
}

// ---------- .ply ----------
const PLY_TYPES = {
  char: ['getInt8', 1], int8: ['getInt8', 1], uchar: ['getUint8', 1], uint8: ['getUint8', 1],
  short: ['getInt16', 2], int16: ['getInt16', 2], ushort: ['getUint16', 2], uint16: ['getUint16', 2],
  int: ['getInt32', 4], int32: ['getInt32', 4], uint: ['getUint32', 4], uint32: ['getUint32', 4],
  float: ['getFloat32', 4], float32: ['getFloat32', 4], double: ['getFloat64', 8], float64: ['getFloat64', 8],
};

function plyHeader(bytes) {
  // the header is ASCII and ends at "end_header\n"
  let end = -1;
  const lim = Math.min(bytes.length, 1 << 16);
  for (let i = 0; i < lim - 10; i++) {
    if (bytes[i] === 101 && String.fromCharCode(...bytes.subarray(i, i + 10)) === 'end_header') {
      end = i + 10; while (end < bytes.length && bytes[end] !== 10) end++; end++;
      break;
    }
  }
  if (end < 0) throw new Error('Not a .ply file (no end_header).');
  const text = String.fromCharCode(...bytes.subarray(0, end));
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines[0] !== 'ply') throw new Error('Not a .ply file.');
  const fmt = (lines.find((l) => l.startsWith('format ')) || '').split(/\s+/)[1];
  if (fmt !== 'binary_little_endian') throw new Error(`Only binary little-endian .ply is read (this one is ${fmt || 'unknown'}).`);
  const elements = [];
  for (const l of lines) {
    const w = l.split(/\s+/);
    if (w[0] === 'element') elements.push({ name: w[1], count: +w[2], props: [], stride: 0 });
    else if (w[0] === 'property' && elements.length) {
      const el = elements[elements.length - 1];
      if (w[1] === 'list') { el.list = true; continue; }
      const t = PLY_TYPES[w[1]];
      if (!t) throw new Error(`Unknown .ply property type ${w[1]}.`);
      el.props.push({ name: w[2], get: t[0], off: el.stride });
      el.stride += t[1];
    }
  }
  return { start: end, elements };
}

/* Reads the vertex element of a 3DGS .ply, plus SHARP's image_size and intrinsic elements
   when they are there (so a SHARP file opens on the photo's own view). A plain coloured
   point cloud (red/green/blue, no scales) reads too, as small round dots. */
export function fromPly(buffer) {
  const bytes = new Uint8Array(buffer);
  const { start, elements } = plyHeader(bytes);
  const dv = new DataView(buffer);
  let off = start, vertex = null;
  const extra = {};
  for (const el of elements) {
    if (el.list) {
      if (!vertex && el.name !== 'vertex') throw new Error(`Cannot skip the list element "${el.name}" before the vertices.`);
      break;
    }
    if (el.name === 'vertex') vertex = { el, off };
    else if (el.props.length === 1) {
      const p = el.props[0], vals = [];
      for (let i = 0; i < el.count; i++) vals.push(dv[p.get](off + i * el.stride + p.off, true));
      extra[el.name] = vals;
    }
    off += el.count * el.stride;
  }
  if (!vertex) throw new Error('This .ply has no vertex element.');
  const { el } = vertex;
  const P = Object.fromEntries(el.props.map((p) => [p.name, p]));
  const need = ['x', 'y', 'z'];
  for (const k of need) if (!P[k]) throw new Error(`This .ply has no ${k} property.`);
  const n = el.count, st = el.stride, base = vertex.off;
  const rd = (i, p) => dv[p.get](base + i * st + p.off, true);
  const hasSH = P.f_dc_0 && P.f_dc_1 && P.f_dc_2;
  const hasRGB = P.red && P.green && P.blue;
  const rgbMax = hasRGB && P.red.get === 'getUint8' ? 255 : 1;
  const hasScale = P.scale_0 && P.scale_1 && P.scale_2;
  const hasRot = P.rot_0 && P.rot_1 && P.rot_2 && P.rot_3;

  const meta = {};
  if (extra.image_size && extra.image_size.length >= 2) { meta.width = extra.image_size[0]; meta.height = extra.image_size[1]; }
  if (extra.intrinsic && extra.intrinsic.length >= 9 && meta.height) meta.focal = extra.intrinsic[4] / meta.height;
  const s = emptyScene(n, meta);

  // a point cloud has no sizes: give each dot a share of the cloud's spread
  let dot = 0.01;
  if (!hasScale && n > 0) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i += Math.max(1, (n / 2000) | 0)) {
      const v = [rd(i, P.x), rd(i, P.y), rd(i, P.z)];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    }
    dot = Math.max(1e-4, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / Math.cbrt(n) / 3);
  }

  for (let i = 0; i < n; i++) {
    s.pos[i * 3] = rd(i, P.x); s.pos[i * 3 + 1] = rd(i, P.y); s.pos[i * 3 + 2] = rd(i, P.z);
    if (hasScale) {
      s.scale[i * 3] = Math.exp(rd(i, P.scale_0)); s.scale[i * 3 + 1] = Math.exp(rd(i, P.scale_1)); s.scale[i * 3 + 2] = Math.exp(rd(i, P.scale_2));
    } else { s.scale[i * 3] = s.scale[i * 3 + 1] = s.scale[i * 3 + 2] = dot; }
    if (hasRot) {
      const w = rd(i, P.rot_0), x = rd(i, P.rot_1), y = rd(i, P.rot_2), z = rd(i, P.rot_3);
      const len = Math.hypot(w, x, y, z) || 1;
      s.rot[i * 4] = w / len; s.rot[i * 4 + 1] = x / len; s.rot[i * 4 + 2] = y / len; s.rot[i * 4 + 3] = z / len;
    } else s.rot[i * 4] = 1;
    if (hasSH) {
      s.color[i * 4] = toByte(0.5 + SH_C0 * rd(i, P.f_dc_0));
      s.color[i * 4 + 1] = toByte(0.5 + SH_C0 * rd(i, P.f_dc_1));
      s.color[i * 4 + 2] = toByte(0.5 + SH_C0 * rd(i, P.f_dc_2));
    } else if (hasRGB) {
      s.color[i * 4] = toByte(rd(i, P.red) / rgbMax); s.color[i * 4 + 1] = toByte(rd(i, P.green) / rgbMax); s.color[i * 4 + 2] = toByte(rd(i, P.blue) / rgbMax);
    } else { s.color[i * 4] = s.color[i * 4 + 1] = s.color[i * 4 + 2] = 200; }
    s.color[i * 4 + 3] = P.opacity ? toByte(1 / (1 + Math.exp(-rd(i, P.opacity)))) : 255;
  }
  return s;
}

/* The standard 3DGS layout (no higher spherical harmonics), so SuperSplat, Brush, Blender
   add-ons and the rest open it. Colours go in as sRGB, the way SHARP itself writes them. */
export function toPly(s) {
  const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = 'ply\nformat binary_little_endian 1.0\n' + `element vertex ${s.count}\n` +
    props.map((p) => `property float ${p}\n`).join('') + 'end_header\n';
  const hb = new Uint8Array(header.length);
  for (let i = 0; i < header.length; i++) hb[i] = header.charCodeAt(i);
  const buf = new ArrayBuffer(hb.length + s.count * props.length * 4);
  new Uint8Array(buf).set(hb);
  const dv = new DataView(buf);
  let o = hb.length;
  const put = (v) => { dv.setFloat32(o, v, true); o += 4; };
  for (let i = 0; i < s.count; i++) {
    put(s.pos[i * 3]); put(s.pos[i * 3 + 1]); put(s.pos[i * 3 + 2]);
    for (let k = 0; k < 3; k++) put((s.color[i * 4 + k] / 255 - 0.5) / SH_C0);
    const a = clamp(s.color[i * 4 + 3] / 255, 1 / 512, 1 - 1 / 512);
    put(Math.log(a / (1 - a)));
    for (let k = 0; k < 3; k++) put(Math.log(Math.max(1e-12, s.scale[i * 3 + k])));
    for (let k = 0; k < 4; k++) put(s.rot[i * 4 + k]);
  }
  return buf;
}

// ---------- maths ----------
function quatToMat(w, x, y, z, m) {
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - w * z); m[2] = 2 * (x * z + w * y);
  m[3] = 2 * (x * y + w * z); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - w * x);
  m[6] = 2 * (x * z - w * y); m[7] = 2 * (y * z + w * x); m[8] = 1 - 2 * (x * x + y * y);
}

/* Each Gaussian's 3D covariance R S S R^T, as its six distinct entries
   (xx, xy, xz, yy, yz, zz): what the renderer projects to the screen. */
export function covariances(s) {
  const out = new Float32Array(s.count * 6), m = new Float64Array(9);
  for (let i = 0; i < s.count; i++) {
    quatToMat(s.rot[i * 4], s.rot[i * 4 + 1], s.rot[i * 4 + 2], s.rot[i * 4 + 3], m);
    const a = s.scale[i * 3] ** 2, b = s.scale[i * 3 + 1] ** 2, c = s.scale[i * 3 + 2] ** 2;
    const o = i * 6;
    out[o] = m[0] * m[0] * a + m[1] * m[1] * b + m[2] * m[2] * c;
    out[o + 1] = m[0] * m[3] * a + m[1] * m[4] * b + m[2] * m[5] * c;
    out[o + 2] = m[0] * m[6] * a + m[1] * m[7] * b + m[2] * m[8] * c;
    out[o + 3] = m[3] * m[3] * a + m[4] * m[4] * b + m[5] * m[5] * c;
    out[o + 4] = m[3] * m[6] * a + m[4] * m[7] * b + m[5] * m[8] * c;
    out[o + 5] = m[6] * m[6] * a + m[7] * m[7] * b + m[8] * m[8] * c;
  }
  return out;
}

/* Eigen-decomposition of a symmetric 3x3 (row-major, in place) by Jacobi sweeps: the
   eigenvalues end on the diagonal, the eigenvectors in the columns of v. */
function jacobi3(a, v) {
  v.fill(0); v[0] = v[4] = v[8] = 1;
  for (let sweep = 0; sweep < 12; sweep++) {
    if (Math.abs(a[1]) + Math.abs(a[2]) + Math.abs(a[5]) < 1e-20) return;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q];
      if (Math.abs(apq) < 1e-30) continue;
      const app = a[p * 4], aqq = a[q * 4];
      const tau = (aqq - app) / (2 * apq);
      const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), sn = t * c;
      for (let k = 0; k < 3; k++) {
        if (k === p || k === q) continue;
        const akp = a[k * 3 + p], akq = a[k * 3 + q];
        a[k * 3 + p] = a[p * 3 + k] = c * akp - sn * akq;
        a[k * 3 + q] = a[q * 3 + k] = sn * akp + c * akq;
      }
      a[p * 4] = app - t * apq; a[q * 4] = aqq + t * apq;
      a[p * 3 + q] = a[q * 3 + p] = 0;
      for (let k = 0; k < 3; k++) {
        const vkp = v[k * 3 + p], vkq = v[k * 3 + q];
        v[k * 3 + p] = c * vkp - sn * vkq; v[k * 3 + q] = sn * vkp + c * vkq;
      }
    }
  }
}

function matToQuat(m, out, o) {
  // m row-major, a proper rotation
  const tr = m[0] + m[4] + m[8];
  let w, x, y, z;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = S / 4; x = (m[7] - m[5]) / S; y = (m[2] - m[6]) / S; z = (m[3] - m[1]) / S; }
  else if (m[0] > m[4] && m[0] > m[8]) { const S = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / S; x = S / 4; y = (m[1] + m[3]) / S; z = (m[2] + m[6]) / S; }
  else if (m[4] > m[8]) { const S = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / S; x = (m[1] + m[3]) / S; y = S / 4; z = (m[5] + m[7]) / S; }
  else { const S = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / S; x = (m[2] + m[6]) / S; y = (m[5] + m[7]) / S; z = S / 4; }
  const len = Math.hypot(w, x, y, z) || 1;
  out[o] = w / len; out[o + 1] = x / len; out[o + 2] = y / len; out[o + 3] = z / len;
}

/* Squash each Gaussian by a diagonal (ax, ay, az), as SHARP's NDC-to-metric step does:
   centres scale, covariances become A C A, and scale + rotation are read back out. */
function squash(s, ax, ay, az) {
  const m = new Float64Array(9), c = new Float64Array(9), v = new Float64Array(9);
  const A = [ax, ay, az];
  for (let i = 0; i < s.count; i++) {
    s.pos[i * 3] *= ax; s.pos[i * 3 + 1] *= ay; s.pos[i * 3 + 2] *= az;
    quatToMat(s.rot[i * 4], s.rot[i * 4 + 1], s.rot[i * 4 + 2], s.rot[i * 4 + 3], m);
    const d = [s.scale[i * 3] ** 2, s.scale[i * 3 + 1] ** 2, s.scale[i * 3 + 2] ** 2];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
      c[r * 3 + k] = (m[r * 3] * m[k * 3] * d[0] + m[r * 3 + 1] * m[k * 3 + 1] * d[1] + m[r * 3 + 2] * m[k * 3 + 2] * d[2]) * A[r] * A[k];
    }
    jacobi3(c, v);
    if (v[0] * (v[4] * v[8] - v[5] * v[7]) - v[1] * (v[3] * v[8] - v[5] * v[6]) + v[2] * (v[3] * v[7] - v[4] * v[6]) < 0) {
      v[2] = -v[2]; v[5] = -v[5]; v[8] = -v[8];
    }
    s.scale[i * 3] = Math.sqrt(Math.max(c[0], 1e-14));
    s.scale[i * 3 + 1] = Math.sqrt(Math.max(c[4], 1e-14));
    s.scale[i * 3 + 2] = Math.sqrt(Math.max(c[8], 1e-14));
    matToQuat(v, s.rot, i * 4);
  }
  return s;
}

// ---------- SHARP ----------
const linToSrgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/* SHARP's raw outputs (NDC space, linear colour) to a scene in metres, the way Apple's
   predict_image does it: the unprojection for a photo of width W, height H and focal f
   (pixels) is diag(W / 2f, H / 2f, 1). Colours go to sRGB, as SHARP's own .ply export
   does. `keep` caps the count (most visible first); faint ones (opacity < minAlpha) go. */
export function fromSharp({ means, scales, quats, colors, opacities }, { width, height, focal, keep = 0, minAlpha = 0.02 }) {
  const total = opacities.length;
  let idx = [];
  for (let i = 0; i < total; i++) if (opacities[i] >= minAlpha) idx.push(i);
  if (keep && idx.length > keep) {
    const score = (i) => opacities[i] * Math.sqrt(Math.max(scales[i * 3] * scales[i * 3 + 1], scales[i * 3 + 1] * scales[i * 3 + 2], scales[i * 3] * scales[i * 3 + 2])) / Math.max(1e-3, means[i * 3 + 2]);
    idx = topK(idx, score, keep);
  }
  const s = emptyScene(idx.length, { width, height, focal: focal / height });
  idx.forEach((j, i) => {
    for (let k = 0; k < 3; k++) {
      s.pos[i * 3 + k] = means[j * 3 + k];
      s.scale[i * 3 + k] = scales[j * 3 + k];
      s.color[i * 4 + k] = toByte(linToSrgb(clamp(colors[j * 3 + k], 0, 1)));
    }
    const w = quats[j * 4], x = quats[j * 4 + 1], y = quats[j * 4 + 2], z = quats[j * 4 + 3];
    const len = Math.hypot(w, x, y, z) || 1;
    s.rot[i * 4] = w / len; s.rot[i * 4 + 1] = x / len; s.rot[i * 4 + 2] = y / len; s.rot[i * 4 + 3] = z / len;
    s.color[i * 4 + 3] = toByte(opacities[j]);
  });
  return squash(s, width / (2 * focal), height / (2 * focal), 1);
}

function topK(idx, score, k) {
  const sc = new Float32Array(idx.length);
  idx.forEach((j, i) => { sc[i] = score(j); });
  const sorted = Float32Array.from(sc).sort();
  const cut = sorted[sorted.length - k];
  const out = [];
  for (let i = 0; i < idx.length && out.length < k; i++) if (sc[i] > cut) out.push(idx[i]);
  for (let i = 0; i < idx.length && out.length < k; i++) if (sc[i] === cut) out.push(idx[i]);
  return out.sort((a, b) => a - b);
}

/* Keep the `keep` most visible splats of any scene (opacity times on-screen size from the
   origin camera). The tools use it to make gallery files small enough to commit. */
export function prune(s, keep, minAlpha = 0.02) {
  const idx = [];
  for (let i = 0; i < s.count; i++) if (s.color[i * 4 + 3] >= minAlpha * 255) idx.push(i);
  const score = (i) => {
    const a = s.scale[i * 3], b = s.scale[i * 3 + 1], c = s.scale[i * 3 + 2];
    const z = Math.max(1e-3, Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]));
    return (s.color[i * 4 + 3] / 255) * Math.sqrt(Math.max(a * b, b * c, a * c)) / z;
  };
  const chosen = keep && idx.length > keep ? topK(idx, score, keep) : idx;
  const o = emptyScene(chosen.length, s.meta);
  chosen.forEach((j, i) => {
    o.pos.set(s.pos.subarray(j * 3, j * 3 + 3), i * 3);
    o.scale.set(s.scale.subarray(j * 3, j * 3 + 3), i * 3);
    o.rot.set(s.rot.subarray(j * 4, j * 4 + 4), i * 4);
    o.color.set(s.color.subarray(j * 4, j * 4 + 4), i * 4);
  });
  return o;
}

// ---------- depth ----------
function sampleBilinear(d, dw, dh, u, v) {
  const x = clamp(u * dw - 0.5, 0, dw - 1), y = clamp(v * dh - 0.5, 0, dh - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(dw - 1, x0 + 1), y1 = Math.min(dh - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  return (d[y0 * dw + x0] * (1 - fx) + d[y0 * dw + x1] * fx) * (1 - fy) + (d[y1 * dw + x0] * (1 - fx) + d[y1 * dw + x1] * fx) * fy;
}

/* A photo plus a relative depth map (Depth Anything's output: bigger is nearer, any scale,
   any resolution) to one splat per pixel, pushed back to its depth.

     rgba     Uint8ClampedArray, width x height (the grid of splats)
     depth    Float32Array, dw x dh
     range    how much further the far end is than the near end (1.2 flat ... 6 deep)
     mm35     the lens, for the field of view (SHARP's 30mm guess by default)
     fill     where depth jumps (the edge of the subject), lay extra splats in the
              background's colour across the jump, so turning the view shows a smear of
              background rather than a hole

   Near is 1 unit away. The depth model's numbers are disparity-like, so they are mapped
   between 1/near and 1/far and inverted, which keeps the near subject round and the
   distance flat, as a real lens sees it. */
export function fromDepth({ rgba, width, height, depth, dw, dh, range = 3, mm35 = DEFAULT_FOCAL_MM, fill = true }) {
  // robust ends: the 2nd and 98th percentiles, so a few wild pixels do not flatten the rest
  const sample = [];
  const stepD = Math.max(1, Math.floor(depth.length / 20000));
  for (let i = 0; i < depth.length; i += stepD) if (Number.isFinite(depth[i])) sample.push(depth[i]);
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.02)] ?? 0, hi = sample[Math.floor(sample.length * 0.98)] ?? 1;
  const span = hi - lo || 1;
  const near = 1, far = near * Math.max(1.05, range);
  const f = focalPx(width, height, mm35);
  const z = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = clamp((sampleBilinear(depth, dw, dh, (x + 0.5) / width, (y + 0.5) / height) - lo) / span, 0, 1);
    z[y * width + x] = 1 / (t / near + (1 - t) / far);
  }

  // where the depth jumps, the far side gets a short wall of its own colour
  const walls = [];
  if (fill) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, zi = z[i];
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const zn = z[ny * width + nx];
        if (zn < zi * 0.93) { walls.push(i, zn); break; } // a neighbour this much nearer: i is behind an edge
      }
    }
  }
  const per = 3; // splats along each wall
  const n = width * height + (walls.length / 2) * per;
  const s = emptyScene(n, { width, height, focal: f / height });
  const put = (k, px, py, zz, pixel, alpha, deep) => {
    // each splat faces down its own line of sight, so from the photo's viewpoint a wall
    // stretched along that line is a dot, not a streak
    const rx = (px + 0.5 - width / 2) / f, ry = (py + 0.5 - height / 2) / f;
    const sz = (zz / f) * 0.62 * Math.hypot(rx, ry, 1);
    s.pos[k * 3] = rx * zz;
    s.pos[k * 3 + 1] = ry * zz;
    s.pos[k * 3 + 2] = zz;
    s.scale[k * 3] = sz; s.scale[k * 3 + 1] = sz; s.scale[k * 3 + 2] = deep ? deep * Math.hypot(rx, ry, 1) : sz * 0.6;
    // the quaternion turning +z onto the ray (rx, ry, 1)
    const len = Math.hypot(rx, ry, 1), dx = rx / len, dy = ry / len, dz = 1 / len;
    const qw = 1 + dz, qn = Math.hypot(qw, dy, dx);
    s.rot[k * 4] = qw / qn; s.rot[k * 4 + 1] = -dy / qn; s.rot[k * 4 + 2] = dx / qn; s.rot[k * 4 + 3] = 0;
    s.color[k * 4] = rgba[pixel * 4]; s.color[k * 4 + 1] = rgba[pixel * 4 + 1]; s.color[k * 4 + 2] = rgba[pixel * 4 + 2];
    s.color[k * 4 + 3] = Math.round(alpha * 255);
  };
  for (let i = 0; i < width * height; i++) put(i, i % width, Math.floor(i / width), z[i], i, 1, 0);
  let k = width * height;
  for (let w = 0; w < walls.length; w += 2) {
    const i = walls[w], zFar = z[i], zNear = walls[w + 1], x = i % width, y = Math.floor(i / width);
    for (let j = 0; j < per; j++) {
      // spread from just behind the near edge back to the far pixel, stretched along z
      const zz = zNear + ((zFar - zNear) * (j + 0.5)) / per;
      put(k++, x, y, zz, i, 0.9, ((zFar - zNear) / per) * 0.7);
    }
  }
  return s;
}

/* The depth to orbit round and focus on: the subject's own depth, not a count percentile.
   A scene that is mostly background should still turn about the thing in it, so splats
   are projected back onto the photo (its size and lens come from the scene's meta), left
   as a coarse grid of median depths, and each cell is scored by how near it is and how
   close to the middle of the frame. The weighted median depth of the best cells wins: the
   near subject, not the wall behind it. A scene with no photo frame (a dropped .ply) or no
   clear near patch falls back to the old 30th percentile. */
export function focusDepth(s, q = 0.3) {
  const n = s.count;
  if (!n) return 1;
  const step = Math.max(1, Math.floor(n / 40000));
  const fallback = () => {
    const zs = [];
    for (let i = 0; i < n; i += step) if (s.pos[i * 3 + 2] > 0) zs.push(s.pos[i * 3 + 2]);
    if (!zs.length) return 1;
    zs.sort((a, b) => a - b);
    return zs[Math.floor(zs.length * q)];
  };
  const { width: W, height: H, focal: fh } = s.meta || {};
  if (!(W > 0 && H > 0 && fh > 0)) return fallback();
  const fpx = fh * H;
  const GW = 32, GH = clamp(Math.round((GW * H) / W), 8, 48);
  const cells = Array.from({ length: GW * GH }, () => []), all = [];
  for (let i = 0; i < n; i += step) {
    const z = s.pos[i * 3 + 2];
    if (!(z > 1e-6)) continue;
    const u = (s.pos[i * 3] / z) * fpx + W / 2, v = (s.pos[i * 3 + 1] / z) * fpx + H / 2;
    if (u < 0 || v < 0 || u >= W || v >= H) continue;   // outside the photo
    const gx = Math.min(GW - 1, Math.floor((u / W) * GW));
    const gy = Math.min(GH - 1, Math.floor((v / H) * GH));
    cells[gy * GW + gx].push(z);
    all.push(z);
  }
  if (all.length < 50) return fallback();
  all.sort((a, b) => a - b);
  const zlo = all[Math.floor(all.length * 0.01)], zbg = all[Math.floor(all.length * 0.8)];
  if (!(zbg > zlo * 1.05)) return fallback();     // no depth range to find a subject in
  const med = new Float32Array(GW * GH), mass = new Float32Array(GW * GH);
  for (let c = 0; c < med.length; c++) {
    const a = cells[c];
    if (!a.length) { med[c] = Infinity; continue; }
    a.sort((x, y) => x - y);
    med[c] = a[a.length >> 1];
    mass[c] = a.length;
  }
  // nearness relative to the background, times a soft bias to the middle of the frame
  let best = 0;
  const scored = [];
  for (let c = 0; c < med.length; c++) {
    if (!Number.isFinite(med[c])) continue;
    const x = (c % GW + 0.5) / GW, y = (Math.floor(c / GW) + 0.5) / GH;
    const near = clamp((zbg - med[c]) / (zbg - zlo), 0, 1);
    const centre = Math.exp(-0.5 * (((x - 0.5) / 0.20) ** 2 + ((y - 0.45) / 0.24) ** 2));
    const score = near * centre;
    scored.push({ z: med[c], w: mass[c], score });
    if (score > best) best = score;
  }
  if (!best) return fallback();
  const keep = scored.filter((o) => o.score >= best * 0.6).sort((a, b) => a.z - b.z);
  let total = 0;
  for (const o of keep) total += o.w * o.score;
  let run = 0, z = keep[keep.length - 1].z;
  for (const o of keep) { run += o.w * o.score; if (run >= total * 0.5) { z = o.z; break; } }
  return clamp(z, zlo, zbg);
}

/* centre and size of a scene, for files that do not start at a camera (LGM's objects) */
export function bounds(s) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const step = Math.max(1, Math.floor(s.count / 50000));
  for (let i = 0; i < s.count; i += step) for (let k = 0; k < 3; k++) {
    const v = s.pos[i * 3 + k];
    if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
  }
  return { centre: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), size: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1 };
}

/* Turn a y-up scene (LGM, most object generators) over to this file's y-down: a half turn
   about x, positions and rotations both. */
export function flipYZ(s) {
  for (let i = 0; i < s.count; i++) {
    s.pos[i * 3 + 1] = -s.pos[i * 3 + 1]; s.pos[i * 3 + 2] = -s.pos[i * 3 + 2];
    const w = s.rot[i * 4], x = s.rot[i * 4 + 1], y = s.rot[i * 4 + 2], z = s.rot[i * 4 + 3];
    s.rot[i * 4] = -x; s.rot[i * 4 + 1] = w; s.rot[i * 4 + 2] = -z; s.rot[i * 4 + 3] = y;
  }
  return s;
}

/* The depth of the photo's own background: a high percentile of splat distance, not the
   single farthest splat. A few strays at the far edge would otherwise park an invented
   surround far out in the distance; 999 in 1000 splats are nearer than this. */
export function backgroundDepth(s, q = 0.999) {
  const n = s.count;
  if (!n) return 1;
  const step = Math.max(1, Math.floor(n / 80000)), ds = [];
  for (let i = 0; i < n; i += step) {
    const d = Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
    if (d > 0) ds.push(d);
  }
  if (!ds.length) return 1;
  ds.sort((a, b) => a - b);
  return ds[Math.min(ds.length - 1, Math.floor(ds.length * q))] || 1;
}

/* Join two scenes. Meta comes from `a` (the photo scene). */
export function concatScenes(a, b) {
  const n = a.count + b.count;
  const o = emptyScene(n, a.meta);
  o.pos.set(a.pos.subarray(0, a.count * 3));
  o.pos.set(b.pos.subarray(0, b.count * 3), a.count * 3);
  o.scale.set(a.scale.subarray(0, a.count * 3));
  o.scale.set(b.scale.subarray(0, b.count * 3), a.count * 3);
  o.rot.set(a.rot.subarray(0, a.count * 4));
  o.rot.set(b.rot.subarray(0, b.count * 4), a.count * 4);
  o.color.set(a.color.subarray(0, a.count * 4));
  o.color.set(b.color.subarray(0, b.count * 4), a.count * 4);
  return o;
}

/* Invented surround: an equirectangular picture as a sphere of splats around the photo
   camera. Turning past what the photo saw shows the invented world instead of the clear.
   Interesting, not accurate — an LLM (or anything) paints the picture; this only wraps it.

     rgba      Uint8ClampedArray / Uint8Array, width x height, RGBA
     radius    sphere radius (just past the photo's background, see backgroundDepth)
     step      sample every Nth pixel (2 ≈ dense, 4 ≈ light)
     opacity   0..1
     frontFade cos of a forward half-angle (+z) to clear, so the surround does not muddy
               the first view. Nothing is cleared by default: the shell fills the whole
               sphere and the photo, sitting in front of it, covers it from the opening
               view — clearing any region instead leaves a hole there once the view turns.

   u = 0.5, v = 0.5 is +z (the photo's forward). v = 0 is the sky (−y). */
export function surroundShell({ rgba, width, height, radius, step = 3, opacity = 0.88, frontFade }) {
  const pts = [];
  const R = Math.max(0.01, radius);
  const ang = (step / height) * Math.PI;
  const sz = R * ang * 1.5;
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const u = (x + 0.5) / width, v = (y + 0.5) / height;
    const lon = (u - 0.5) * Math.PI * 2, lat = (0.5 - v) * Math.PI;
    const cl = Math.cos(lat), dx = cl * Math.sin(lon), dy = -Math.sin(lat), dz = cl * Math.cos(lon);
    if (frontFade != null && dz > frontFade) continue;
    const i = (y * width + x) * 4;
    pts.push(dx * R, dy * R, dz * R, rgba[i], rgba[i + 1], rgba[i + 2], Math.round(opacity * 255));
  }
  const s = emptyScene(pts.length / 7);
  for (let k = 0; k < s.count; k++) {
    const p = k * 7;
    const x = pts[p], y = pts[p + 1], z = pts[p + 2];
    s.pos[k * 3] = x; s.pos[k * 3 + 1] = y; s.pos[k * 3 + 2] = z;
    s.scale[k * 3] = sz; s.scale[k * 3 + 1] = sz; s.scale[k * 3 + 2] = sz * 0.45;
    // face the camera (origin): rotate +z onto −position
    const len = Math.hypot(x, y, z) || 1;
    const dx = -x / len, dy = -y / len, dz = -z / len;
    const qw = 1 + dz, qn = Math.hypot(qw, dy, dx) || 1;
    s.rot[k * 4] = qw / qn; s.rot[k * 4 + 1] = -dy / qn; s.rot[k * 4 + 2] = dx / qn; s.rot[k * 4 + 3] = 0;
    s.color[k * 4] = pts[p + 3]; s.color[k * 4 + 1] = pts[p + 4]; s.color[k * 4 + 2] = pts[p + 5]; s.color[k * 4 + 3] = pts[p + 6];
  }
  return s;
}

/* Photo scene plus an invented equirectangular surround. Shrinks the photo scene if needed
   so the total stays near `keep`, then wraps the picture just past the photo's own
   background (a little behind it, so the invented hinterland reads at the same depth and
   never covers the photo's background). */
export function withSurround(scene, { rgba, width, height, keep = 400000, shell = 70000, step = 3, opacity = 0.88, frontFade, radius }) {
  const R = radius || backgroundDepth(scene) * 1.02;
  const shellN = Math.max(1000, shell);
  const photoKeep = keep > shellN ? keep - shellN : Math.max(1000, Math.floor(keep * 0.8));
  const photo = prune(scene, Math.min(scene.count, photoKeep));
  let env = surroundShell({ rgba, width, height, radius: R, step, opacity, frontFade });
  if (env.count > shellN) env = prune(env, shellN);
  return concatScenes(photo, env);
}

// ---------- invented surround from the photo itself ----------
/* A separable box blur, so an equirect made from a photo reads as a soft haze of its own
   colours rather than a smeared hard edge. */
function boxBlur(rgba, w, h, radius) {
  if (radius < 1) return;
  const n = radius * 2 + 1;
  const tmp = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let k = -radius; k <= radius; k++) {
      const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
      const o = (y * w + xx) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2];
    }
    const o = (y * w + x) * 4;
    tmp[o] = r / n; tmp[o + 1] = g / n; tmp[o + 2] = b / n; tmp[o + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
      const o = (yy * w + x) * 4;
      r += tmp[o]; g += tmp[o + 1]; b += tmp[o + 2];
    }
    const o = (y * w + x) * 4;
    rgba[o] = r / n; rgba[o + 1] = g / n; rgba[o + 2] = b / n; rgba[o + 3] = 255;
  }
}

/* Stretch a photo into an equirectangular picture: within the photo's field of view it is
   the photo, beyond it the nearest edge keeps going (so the backdrop keeps the photo's own
   colours), and the back mirrors the front. Blurred, it reads as the photo's haze.
   `halfW`/`halfH` are the half field of view as ray extents (x/z, y/z); without them a
   ~27° half-height is assumed, widened to the photo's aspect. */
export function equirectFromPhoto(rgba, width, height, { eqW = 640, eqH = 320, halfW, halfH, blur = 10 } = {}) {
  const hH = halfH || 0.5;
  const hW = halfW || hH * (width / height);
  const out = new Uint8ClampedArray(eqW * eqH * 4);
  for (let y = 0; y < eqH; y++) for (let x = 0; x < eqW; x++) {
    const u = (x + 0.5) / eqW, v = (y + 0.5) / eqH;
    const lon = (u - 0.5) * Math.PI * 2, lat = (0.5 - v) * Math.PI;
    const cl = Math.cos(lat);
    let dx = cl * Math.sin(lon), dy = -Math.sin(lat), dz = cl * Math.cos(lon);
    if (dz < 0) { dx = -dx; dy = -dy; dz = -dz; }      // the back shows a mirrored front
    const rx = clamp(dx / dz, -hW, hW), ry = clamp(dy / dz, -hH, hH);
    const px = clamp((rx / (2 * hW) + 0.5) * width, 0, width - 1);
    const py = clamp((ry / (2 * hH) + 0.5) * height, 0, height - 1);
    const si = (Math.round(py) * width + Math.round(px)) * 4, o = (y * eqW + x) * 4;
    out[o] = rgba[si]; out[o + 1] = rgba[si + 1]; out[o + 2] = rgba[si + 2]; out[o + 3] = 255;
  }
  boxBlur(out, eqW, eqH, Math.round(blur));
  return { rgba: out, width: eqW, height: eqH };
}

/* A scene plus a surround derived from the photo that made it (see equirectFromPhoto), so
   the photo turns all the way round into its own colours. `focal` is the lens as
   focal-over-height; from it and the photo's size the field of view is taken. */
export function withPhotoSurround(scene, rgba, width, height, { focal = 1, keep, shell = 60000, step = 2, radius } = {}) {
  const fpx = focal * height;
  const eq = equirectFromPhoto(rgba, width, height, { halfW: width / (2 * fpx), halfH: height / (2 * fpx) });
  return withSurround(scene, { rgba: eq.rgba, width: eq.width, height: eq.height, keep: keep || scene.count + shell, shell, step, radius });
}

// ---------- sorting ----------
/* Back-to-front order for blending: a 16-bit counting sort on distance along the view
   direction, so a million splats sort in a few tens of milliseconds. `out` is reused. */
export function sortByDepth(pos, count, eye, fwd, out) {
  const order = out && out.length >= count ? out : new Uint32Array(count);
  const keys = new Float32Array(count);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < count; i++) {
    const d = (pos[i * 3] - eye[0]) * fwd[0] + (pos[i * 3 + 1] - eye[1]) * fwd[1] + (pos[i * 3 + 2] - eye[2]) * fwd[2];
    keys[i] = d;
    if (d < lo) lo = d; if (d > hi) hi = d;
  }
  const B = 65536, counts = new Uint32Array(B), k = (B - 1) / (hi - lo || 1);
  const bucket = new Uint16Array(count);
  for (let i = 0; i < count; i++) { const b = ((hi - keys[i]) * k) | 0; bucket[i] = b; counts[b]++; } // far first
  for (let b = 1; b < B; b++) counts[b] += counts[b - 1];
  for (let i = count - 1; i >= 0; i--) order[--counts[bucket[i]]] = i;
  return order;
}

// ---------- EXIF ----------
/* The 35mm-equivalent focal length from a JPEG's EXIF, or null. Just enough of TIFF to
   find tag 0xA405 (FocalLengthIn35mmFilm) in the Exif sub-IFD. */
export function exifFocal35(bytes) {
  try {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u[0] !== 0xff || u[1] !== 0xd8) return null;
    let p = 2;
    while (p + 4 < u.length) {
      if (u[p] !== 0xff) return null;
      const marker = u[p + 1], len = (u[p + 2] << 8) | u[p + 3];
      if (marker === 0xe1 && u[p + 4] === 0x45 && u[p + 5] === 0x78 && u[p + 6] === 0x69 && u[p + 7] === 0x66) {
        const t = p + 10, dv = new DataView(u.buffer, u.byteOffset + t, Math.min(len - 8, u.length - t));
        const le = dv.getUint16(0) === 0x4949;
        const g16 = (o) => dv.getUint16(o, le), g32 = (o) => dv.getUint32(o, le);
        const find = (ifd, tag) => {
          const n = g16(ifd);
          for (let e = 0; e < n; e++) { const o = ifd + 2 + e * 12; if (g16(o) === tag) return o; }
          return -1;
        };
        const exifPtr = find(g32(4), 0x8769);
        if (exifPtr < 0) return null;
        const f = find(g32(exifPtr + 8), 0xa405);
        if (f < 0) return null;
        const v = g16(f + 8);
        return v >= 8 && v <= 1200 ? v : null;
      }
      if (marker === 0xda) return null;
      p += 2 + len;
    }
  } catch (e) { /* not an EXIF we can read */ }
  return null;
}
