/* Photo Splats: the WebGL2 splat renderer.

   Each Gaussian is drawn as one screen-facing quad. The vertex shader projects its 3D
   covariance to the screen (the EWA splatting of Zwicker et al., as every 3DGS viewer
   does), takes the ellipse's two axes and stretches the quad to three sigma along them;
   the fragment shader paints the falloff. Quads are blended back to front, in the order a
   worker sorts them (sort-worker.js), so a stale order for a frame or two only shows as a
   faint shimmer while the view swings.

   The splats sit in four textures, 1024 to a row: centre, the covariance in two parts,
   and colour. One instanced attribute carries the sorted index. */

// ---------- constants ----------
const ROW = 1024;
const SIGMAS = 3;

const VERT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uPos, uCovA, uCovB;
uniform lowp sampler2D uCol;
uniform vec3 uEye, uRight, uDown, uFwd;
uniform vec2 uFocal, uHalf;
in vec2 aCorner;
in uint aIndex;
out vec4 vColor;
out vec2 vUV;
void main() {
  ivec2 tc = ivec2(int(aIndex & ${ROW - 1}u), int(aIndex >> ${Math.log2(ROW)}u));
  vec3 d = texelFetch(uPos, tc, 0).xyz - uEye;
  vec3 c = vec3(dot(uRight, d), dot(uDown, d), dot(uFwd, d));
  if (c.z < 0.01) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec2 px = uFocal * c.xy / c.z;
  if (abs(px.x) > uHalf.x * 1.3 + 64.0 || abs(px.y) > uHalf.y * 1.3 + 64.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
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
  float r1 = min(${SIGMAS}.0 * sqrt(l1), 1024.0), r2 = min(${SIGMAS}.0 * sqrt(l2), 1024.0);
  vec2 off = aCorner.x * ax1 * r1 + aCorner.y * ax2 * r2;
  vec2 ndc = (px + off) / uHalf;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  vColor = texelFetch(uCol, tc, 0);
  vUV = aCorner * ${SIGMAS}.0;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vUV;
out vec4 outColor;
void main() {
  float a = vColor.a * exp(-0.5 * dot(vUV, vUV));
  if (a < 1.0 / 255.0) discard;
  outColor = vec4(vColor.rgb * a, a);
}`;

function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
  return s;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {};
  for (const n of ['uPos', 'uCovA', 'uCovB', 'uCol', 'uEye', 'uRight', 'uDown', 'uFwd', 'uFocal', 'uHalf']) U[n] = gl.getUniformLocation(prog, n);

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

  let count = 0, drawn = 0;
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
    count = n; drawn = 0;
    return n;
  }

  function setOrder(order) {
    gl.bindBuffer(gl.ARRAY_BUFFER, orderBuf);
    gl.bufferData(gl.ARRAY_BUFFER, order, gl.DYNAMIC_DRAW);
    drawn = Math.min(count, order.length);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h, dpr };
  }

  /* pose from sim.pose(); focal in device pixels */
  function draw(pose, focal) {
    const { w, h } = resize();
    gl.viewport(0, 0, w, h);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!drawn) return;
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform3fv(U.uEye, pose.eye); gl.uniform3fv(U.uRight, pose.right);
    gl.uniform3fv(U.uDown, pose.down); gl.uniform3fv(U.uFwd, pose.fwd);
    gl.uniform2f(U.uFocal, focal, focal); gl.uniform2f(U.uHalf, w / 2, h / 2);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawn);
  }

  function setBackground(r, g, b) { bg[0] = r; bg[1] = g; bg[2] = b; }

  return { gl, setScene, setOrder, draw, resize, setBackground, maxSplats, get count() { return count; } };
}
