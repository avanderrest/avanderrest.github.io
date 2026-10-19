/* Photo Splats: the WebGL2 splat renderer.

   Each Gaussian is drawn as one screen-facing quad. The vertex shader projects its 3D
   covariance to the screen (the EWA splatting of Zwicker et al., as every 3DGS viewer
   does), takes the ellipse's two axes and stretches the quad to three sigma along them;
   the fragment shader paints the falloff. Quads are blended back to front, in the order a
   worker sorts them (sort-worker.js), so a stale order for a frame or two only shows as a
   faint shimmer while the view swings.

   The splats sit in four textures, 1024 to a row: centre, the covariance in two parts,
   and colour. One instanced attribute carries the sorted index.

   A look (STYLES) changes two things. The splat pass can draw each splat as something
   other than a Gaussian: a brush stroke laid along its long axis (oil), a wash with a
   ragged pigment edge (watercolour), a hard round dot (pointillist). And a screen pass
   then finishes the picture on its ground: canvas, paper, ink. The photo look skips the
   screen pass and draws straight to the canvas, as before. */

// ---------- constants ----------
const ROW = 1024;
const SIGMAS = 3;
// look name -> [splat footprint, screen pass]; 0 is the plain Gaussian / no pass
export const STYLES = { photo: [0, 0], oil: [1, 1], watercolour: [2, 2], dots: [3, 3], pencil: [0, 4], comic: [0, 5] };

const HASH = `
float hashU(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return float(x >> 8) / 16777215.0; }`;

const VERT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uPos, uCovA, uCovB;
uniform lowp sampler2D uCol;
uniform vec3 uEye, uRight, uDown, uFwd;
uniform vec2 uFocal, uHalf;
uniform int uFoot;
uniform float uPx;
in vec2 aCorner;
in uint aIndex;
out vec4 vColor;
out vec2 vUV;
flat out float vRnd;
${HASH}
vec3 saturate(vec3 c, float k) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return clamp(mix(vec3(l), c, k), 0.0, 1.0); }
void main() {
  ivec2 tc = ivec2(int(aIndex & ${ROW - 1}u), int(aIndex >> ${Math.log2(ROW)}u));
  vec3 p = texelFetch(uPos, tc, 0).xyz;
  vec3 d = p - uEye;
  vec3 c = vec3(dot(uRight, d), dot(uDown, d), dot(uFwd, d));
  if (c.z < 0.01) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec2 px = uFocal * c.xy / c.z;
  if (abs(px.x) > uHalf.x * 1.3 + 64.0 || abs(px.y) > uHalf.y * 1.3 + 64.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vColor = texelFetch(uCol, tc, 0);
  float h = hashU(aIndex);
  vRnd = h;
  // a stroke or a dot needs a solid splat behind it; the faint ones only add mud
  if ((uFoot == 1 && (vColor.a < 0.3 || h < 0.45)) || (uFoot == 3 && (vColor.a < 0.35 || h < 0.45))) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec4 a = texelFetch(uCovA, tc, 0);
  vec2 b = texelFetch(uCovB, tc, 0).xy;
  mat3 S = mat3(a.x, a.y, a.z,  a.y, a.w, b.x,  a.z, b.x, b.y);
  mat3 M = transpose(mat3(uRight, uDown, uFwd));
  float iz = 1.0 / c.z;
  mat3 J = mat3(uFocal.x * iz, 0.0, 0.0,
                0.0, uFocal.y * iz, 0.0,
                -uFocal.x * c.x * iz * iz, -uFocal.y * c.y * iz * iz, 0.0);
  mat3 T = J * M;
  mat3 V = T * S * transpose(T);
  // a low-pass of 0.3 px, as the reference renderer does, so tiny splats never vanish
  float A = V[0][0] + 0.3, B = V[0][1], C = V[1][1] + 0.3;
  float mid = 0.5 * (A + C), rad = length(vec2(0.5 * (A - C), B));
  float l1 = mid + rad, l2 = max(mid - rad, 0.1);
  vec2 ax1 = abs(B) < 1e-9 ? (A >= C ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : normalize(vec2(B, l1 - A));
  vec2 ax2 = vec2(-ax1.y, ax1.x);
  float s1 = sqrt(l1), s2 = sqrt(l2);
  vec2 off;
  if (uFoot == 1) {
    // oil: a stroke along the splat's long axis; a round splat takes its direction from a
    // slow swirl through the scene, so neighbouring strokes lie the same way
    float len = clamp(s1 * 4.5, 13.0 * uPx, 90.0 * uPx);
    float wid = clamp(max(s2 * 3.0, len * 0.3), 3.0 * uPx, len * 0.5);
    vec2 dir = ax1;
    if (s1 < s2 * 1.6) {
      float ang = 1.3 * sin(p.x * 2.3 + 1.7 * sin(p.y * 1.9)) + 1.1 * sin(p.y * 3.1 - p.z * 1.4) + (h - 0.5) * 0.6;
      dir = vec2(cos(ang), sin(ang));
    }
    off = aCorner.x * dir * len + aCorner.y * vec2(-dir.y, dir.x) * wid;
    vColor.rgb = saturate(vColor.rgb, 1.25);
    vUV = aCorner;
  } else if (uFoot == 2) {
    // watercolour: a wider, thinner wash
    float r1 = min(${SIGMAS}.0 * max(s1 * 2.2, 3.0 * uPx), 1024.0), r2 = min(${SIGMAS}.0 * max(s2 * 2.2, 3.0 * uPx), 1024.0);
    vColor.rgb = saturate(vColor.rgb, 1.35);
    off = aCorner.x * ax1 * r1 + aCorner.y * ax2 * r2;
    vUV = aCorner;
  } else if (uFoot == 3) {
    // pointillist: a dot of about the splat's size, never smaller than a dab of a brush
    float r = clamp(sqrt(s1 * s2) * 2.5, 3.6 * uPx, 9.0 * uPx);
    off = aCorner * r;
    vColor.rgb = saturate(vColor.rgb, 1.7);
    vUV = aCorner;
  } else {
    float r1 = min(${SIGMAS}.0 * s1, 1024.0), r2 = min(${SIGMAS}.0 * s2, 1024.0);
    off = aCorner.x * ax1 * r1 + aCorner.y * ax2 * r2;
    vUV = aCorner * ${SIGMAS}.0;
  }
  vec2 ndc = (px + off) / uHalf;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform int uFoot;
in vec4 vColor;
in vec2 vUV;
flat in float vRnd;
out vec4 outColor;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  vec3 col = vColor.rgb;
  float a;
  if (uFoot == 1) {
    // a brush stroke: a rounded head at -x that thins to a dry, bristly tail at +x
    float u = vUV.x, prof = mix(1.0, 0.45, smoothstep(-0.5, 1.0, u));
    float v = vUV.y / prof;
    float shape = 1.0 - smoothstep(0.82, 1.0, length(vec2(u, v)));
    float bristle = n1(v * 7.0 + vRnd * 91.0) * 0.6 + n1(v * 19.0 + vRnd * 37.0) * 0.4;
    float dry = 1.0 - smoothstep(0.1, 1.0, u) * (1.0 - smoothstep(0.35, 0.75, bristle));
    a = vColor.a * 0.95 * shape * dry * mix(0.75, 1.0, bristle);
    // thicker paint down the middle: lighter, with the bristle grooves darker
    col *= 0.86 + 0.2 * (1.0 - v * v) + 0.12 * (bristle - 0.5);
  } else if (uFoot == 2) {
    // a wash: a wobbly edge where the pigment pools darker
    float ang = atan(vUV.y, vUV.x);
    float r = length(vUV) * (1.0 + 0.18 * (n1(ang * 2.0 + vRnd * 50.0) - 0.5));
    float body = 1.0 - smoothstep(0.75, 1.0, r);
    a = vColor.a * 0.55 * body * (0.75 + 0.5 * smoothstep(0.45, 0.92, r));
    col *= 1.0 - 0.18 * smoothstep(0.5, 0.95, r);
  } else if (uFoot == 3) {
    float r = length(vUV);
    a = (1.0 - smoothstep(0.78, 1.0, r)) * min(1.0, vColor.a * 1.3);
  } else {
    a = vColor.a * exp(-0.5 * dot(vUV, vUV));
  }
  if (a < 1.0 / 255.0) discard;
  outColor = vec4(min(col, 1.0) * a, a);
}`;

/* the screen pass: the splats, premultiplied over nothing, finished onto their ground */
const POST_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform int uPass;
uniform float uPx;
out vec4 outColor;
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// photos are mostly dark: lift the tones before deciding where the pencil or ink goes
float tone(float L) { return pow(clamp((L - 0.03) / 0.62, 0.0, 1.0), 0.75); }
vec4 at(vec2 px) { return texture(uTex, px / uRes); }
// the splats laid over a ground colour
vec3 over(vec2 px, vec3 ground) { vec4 s = at(px); return s.rgb + ground * (1.0 - s.a); }
float sobel(vec2 px, float k, vec3 ground) {
  float tl = lum(over(px + vec2(-k, -k), ground)), t = lum(over(px + vec2(0, -k), ground)), tr = lum(over(px + vec2(k, -k), ground));
  float l = lum(over(px + vec2(-k, 0), ground)), r = lum(over(px + vec2(k, 0), ground));
  float bl = lum(over(px + vec2(-k, k), ground)), b = lum(over(px + vec2(0, k), ground)), br = lum(over(px + vec2(k, k), ground));
  float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl), gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
  return length(vec2(gx, gy));
}
float stripes(vec2 px, float ang, float gap, float width) {
  vec2 d = vec2(cos(ang), sin(ang));
  float s = dot(px, vec2(-d.y, d.x)) / gap + 0.6 * n2(px * 0.02 + ang);
  float off = abs(fract(s) - 0.5) * 2.0;   // 0 down the middle of a line, 1 between lines
  return 1.0 - smoothstep(width, width + 0.3, off);
}
void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 q = px / uPx;           // CSS pixels, so a texture keeps its grain on any screen
  vec3 col;
  if (uPass == 1) {
    // oil on canvas: the weave, and the paint lit from the top left by its own ridges
    vec3 canvas = vec3(0.80, 0.74, 0.63) * (0.94 + 0.06 * fbm(q * 0.05));
    float weave = 0.5 + 0.25 * (sin(q.x * 2.2) + sin(q.y * 2.2));
    canvas *= 0.93 + 0.07 * weave;
    vec4 s = at(px);
    float k = 1.5 * uPx;
    float hx = lum(at(px + vec2(k, 0)).rgb) - lum(at(px - vec2(k, 0)).rgb);
    float hy = lum(at(px + vec2(0, k)).rgb) - lum(at(px - vec2(0, k)).rgb);
    vec3 n = normalize(vec3(-hx * 3.0, -hy * 3.0, 1.0));
    float light = clamp(dot(n, normalize(vec3(-0.5, 0.55, 0.75))) / 0.75, 0.6, 1.35);
    vec3 paint = s.rgb * light * (0.96 + 0.04 * weave);
    col = paint + canvas * (1.0 - s.a);
  } else if (uPass == 2) {
    // watercolour: the washes bleed a little, pool at their edges, granulate in the
    // shadows and stay transparent, so the paper shows through everything
    vec3 paper = vec3(0.97, 0.95, 0.90) * (0.95 + 0.05 * fbm(q * 0.08));
    vec2 wob = (vec2(fbm(q * 0.012), fbm(q * 0.012 + 9.0)) - 0.5) * 12.0 * uPx;
    vec3 c = over(px + wob, vec3(1.0));
    vec3 blur = vec3(0.0);
    for (int i = 0; i < 8; i++) { float t = float(i) * 0.785; blur += over(px + wob + vec2(cos(t), sin(t)) * 5.0 * uPx, vec3(1.0)); }
    blur /= 8.0;
    float edge = clamp(length(c - blur) * 2.2, 0.0, 1.0);
    c = 1.0 - (1.0 - c) * 0.72;                       // thinned with water
    c = mix(c, 1.0 - (1.0 - c) * 0.6, smoothstep(0.55, 0.8, lum(c)));   // the lights go to bare paper
    c = mix(c, c * c, edge * 0.7);                     // darker where a wash ends
    float grain = n2(q * 0.9) * n2(q * 0.35 + 3.0);
    c *= 1.0 - 0.22 * (1.0 - lum(c)) * grain;
    col = c * paper;
  } else if (uPass == 3) {
    // pointillist: the dots on cream paper
    vec3 paper = vec3(0.95, 0.92, 0.85) * (0.96 + 0.04 * fbm(q * 0.1));
    col = over(px, paper);
  } else if (uPass == 4) {
    // pencil: outlines where the picture changes, hatching for its tones
    vec3 paper = vec3(0.96, 0.95, 0.92) * (0.93 + 0.07 * fbm(q * 0.15));
    vec3 c = over(px, vec3(1.0));
    vec3 cb = (c + over(px + vec2(uPx, 0), vec3(1.0)) + over(px - vec2(uPx, 0), vec3(1.0)) + over(px + vec2(0, uPx), vec3(1.0)) + over(px - vec2(0, uPx), vec3(1.0))) / 5.0;
    float L = tone(lum(cb)) * 0.85;
    float edge = smoothstep(0.22, 0.6, sobel(px, 2.0 * uPx, vec3(1.0)));
    float gap = 6.0 * uPx;
    float ink = 0.0;
    ink = max(ink, (1.0 - smoothstep(0.55, 0.75, L)) * stripes(px, 0.785, gap, 0.16) * 0.7);
    ink = max(ink, (1.0 - smoothstep(0.32, 0.48, L)) * stripes(px, -0.785, gap, 0.18) * 0.85);
    ink = max(ink, (1.0 - smoothstep(0.1, 0.22, L)) * stripes(px, 0.2, gap * 0.7, 0.22));
    ink *= 0.5 + 0.5 * smoothstep(0.3, 0.7, n2(q * vec2(0.05, 0.3)));   // strokes start and stop
    ink = max(ink, edge * 0.95);
    vec3 lead = vec3(0.22, 0.22, 0.26);
    col = mix(paper, lead, ink * 0.92);
    col = mix(col, col * mix(vec3(1.0), c / max(L, 0.05), 0.12), 1.0 - ink);   // a breath of the colours
  } else {
    // comic: flat bands of colour, black outlines, a halftone in the shadows
    vec3 paper = vec3(0.98, 0.96, 0.90);
    vec3 c = over(px, paper);
    float L0 = max(lum(c), 1e-3), L = tone(L0);
    float Lq = floor(L * 4.0 + 0.5) / 4.0;
    vec3 band = clamp(c / L0 * max(Lq, 0.12), 0.0, 1.0);
    float sl = lum(band);
    band = clamp(mix(vec3(sl), band, 1.35), 0.0, 1.0);
    float edge = smoothstep(0.4, 0.8, sobel(px, 1.8 * uPx, paper));
    float a = 0.26;
    mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 cell = rot * px / (6.0 * uPx);
    float dist = length(fract(cell) - 0.5);
    float dotR = clamp((0.35 - L) * 1.4, 0.0, 0.5);
    float halftone = 1.0 - smoothstep(dotR - 0.06, dotR + 0.06, dist);
    col = mix(band, band * 0.35, halftone * 0.8);
    col = mix(col, vec3(0.06, 0.05, 0.08), edge);
  }
  outColor = vec4(col, 1.0);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(p));
  return p;
}

const GL_ERR = {
  [0x0500]: 'INVALID_ENUM', [0x0501]: 'INVALID_VALUE', [0x0502]: 'INVALID_OPERATION',
  [0x0503]: 'STACK_OVERFLOW', [0x0504]: 'STACK_UNDERFLOW', [0x0505]: 'OUT_OF_MEMORY',
  [0x0506]: 'INVALID_FRAMEBUFFER_OPERATION', [0x0507]: 'CONTEXT_LOST',
};

/* Drain gl.getError(). Open with ?webgl to log every check; otherwise only the first
   failure is logged (WebGL errors never throw, so they are easy to miss). */
function glCheck(gl, where, verbose) {
  let e = gl.getError(), n = 0;
  while (e !== gl.NO_ERROR && n++ < 8) {
    const msg = `WebGL ${GL_ERR[e] || '0x' + e.toString(16)} at ${where}`;
    if (verbose || !glCheck._told) console.warn(msg);
    glCheck._told = true;
    e = gl.getError();
  }
}

export function createRenderer(canvas, opts = {}) {
  const verbose = !!opts.webglLog;
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  if (verbose) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    console.info('[photo-splats WebGL]', {
      vendor: gl.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      renderer: gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES),
    });
  }
  const prog = program(gl, VERT, FRAG);
  glCheck(gl, 'program link', verbose);
  gl.useProgram(prog);
  const U = {};
  for (const n of ['uPos', 'uCovA', 'uCovB', 'uCol', 'uEye', 'uRight', 'uDown', 'uFwd', 'uFocal', 'uHalf', 'uFoot', 'uPx']) U[n] = gl.getUniformLocation(prog, n);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aCorner = gl.getAttribLocation(prog, 'aCorner');
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
  const orderBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, orderBuf);
  const aIndex = gl.getAttribLocation(prog, 'aIndex');
  gl.enableVertexAttribArray(aIndex);
  gl.vertexAttribIPointer(aIndex, 1, gl.UNSIGNED_INT, 0, 0);
  gl.vertexAttribDivisor(aIndex, 1);

  const maxRows = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxSplats = maxRows * ROW;
  const tex = ['uPos', 'uCovA', 'uCovB', 'uCol'].map((name, unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U[name], unit);
    return t;
  });

  // the screen pass: the splats go to a texture first, then through it to the canvas
  const post = program(gl, POST_VERT, POST_FRAG);
  const PU = {};
  for (const n of ['uTex', 'uRes', 'uPass', 'uPx']) PU[n] = gl.getUniformLocation(post, n);
  const postVao = gl.createVertexArray();
  const POST_UNIT = 4;
  const fboTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + POST_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, fboTex);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  let fboSize = '';
  function target(w, h) {
    if (fboSize !== w + 'x' + h) {
      gl.activeTexture(gl.TEXTURE0 + POST_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      fboSize = w + 'x' + h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  }

  let count = 0, drawn = 0, style = 'photo';
  const bg = [0.07, 0.07, 0.09];

  /* upload a scene (see splats.js), with its covariances already worked out */
  function setScene(scene, cov) {
    const n = Math.min(scene.count, maxSplats);
    const rows = Math.max(1, Math.ceil(n / ROW)), cells = rows * ROW;
    const pos = new Float32Array(cells * 4), ca = new Float32Array(cells * 4), cb = new Float32Array(cells * 2), col = new Uint8Array(cells * 4);
    for (let i = 0; i < n; i++) {
      pos[i * 4] = scene.pos[i * 3]; pos[i * 4 + 1] = scene.pos[i * 3 + 1]; pos[i * 4 + 2] = scene.pos[i * 3 + 2];
      ca[i * 4] = cov[i * 6]; ca[i * 4 + 1] = cov[i * 6 + 1]; ca[i * 4 + 2] = cov[i * 6 + 2]; ca[i * 4 + 3] = cov[i * 6 + 3];
      cb[i * 2] = cov[i * 6 + 4]; cb[i * 2 + 1] = cov[i * 6 + 5];
    }
    col.set(scene.color.subarray(0, n * 4));
    const up = (unit, fmt, f, type, data) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex[unit]);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, ROW, rows, 0, f, type, data);
    };
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    up(0, gl.RGBA32F, gl.RGBA, gl.FLOAT, pos);
    up(1, gl.RGBA32F, gl.RGBA, gl.FLOAT, ca);
    up(2, gl.RG32F, gl.RG, gl.FLOAT, cb);
    up(3, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, col);
    glCheck(gl, `setScene n=${n} rows=${rows} tex=${ROW}x${rows}`, verbose);
    count = n; drawn = 0;
    return n;
  }

  function setOrder(order) {
    gl.bindBuffer(gl.ARRAY_BUFFER, orderBuf);
    gl.bufferData(gl.ARRAY_BUFFER, order, gl.DYNAMIC_DRAW);
    drawn = Math.min(count, order.length);
    glCheck(gl, `setOrder drawn=${drawn} order=${order.length} bytes=${order.byteLength}`, verbose);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h, dpr };
  }

  /* pose from sim.pose(); focal in device pixels */
  function draw(pose, focal) {
    const { w, h, dpr } = resize();
    const [foot, pass] = STYLES[style] || STYLES.photo;
    if (pass) target(w, h); else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    if (pass) gl.clearColor(0, 0, 0, 0); else gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (drawn) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.uniform3fv(U.uEye, pose.eye); gl.uniform3fv(U.uRight, pose.right);
      gl.uniform3fv(U.uDown, pose.down); gl.uniform3fv(U.uFwd, pose.fwd);
      gl.uniform2f(U.uFocal, focal, focal); gl.uniform2f(U.uHalf, w / 2, h / 2);
      gl.uniform1i(U.uFoot, foot); gl.uniform1f(U.uPx, dpr);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawn);
      glCheck(gl, `draw splats ${w}x${h} dpr=${dpr} drawn=${drawn} style=${style}`, verbose);
    }
    if (!pass) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(post);
    gl.bindVertexArray(postVao);
    gl.activeTexture(gl.TEXTURE0 + POST_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(PU.uTex, POST_UNIT);
    gl.uniform2f(PU.uRes, w, h); gl.uniform1i(PU.uPass, pass); gl.uniform1f(PU.uPx, dpr);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    glCheck(gl, `draw post pass=${pass} ${w}x${h}`, verbose);
  }

  function setBackground(r, g, b) { bg[0] = r; bg[1] = g; bg[2] = b; }
  function setStyle(name) { style = STYLES[name] ? name : 'photo'; }

  return { gl, setScene, setOrder, draw, resize, setBackground, setStyle, maxSplats, get count() { return count; }, get style() { return style; } };
}
