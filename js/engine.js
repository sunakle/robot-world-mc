'use strict';
// ================= Мини-движок на чистом WebGL2 (без библиотек — работает офлайн) =================

// ---------- матрицы 4x4 (column-major) ----------
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy(a) { return new Float32Array(a); },
  mul(a, b, o = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  persp(fov, asp, n, f) {
    const t = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
    return m;
  },
  lookAt(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
    zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  },
  // все преобразования «справа»: m = m * T (удобно для иерархий)
  translate(m, x, y, z) { for (let i = 0; i < 4; i++) m[12 + i] += m[i] * x + m[4 + i] * y + m[8 + i] * z; return m; },
  rotX(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const y = m[4 + i], z = m[8 + i]; m[4 + i] = y * c + z * s; m[8 + i] = z * c - y * s; } return m; },
  rotY(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const x = m[i], z = m[8 + i]; m[i] = x * c - z * s; m[8 + i] = x * s + z * c; } return m; },
  rotZ(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 4; i++) { const x = m[i], y = m[4 + i]; m[i] = x * c + y * s; m[4 + i] = y * c - x * s; } return m; },
  scale(m, x, y = x, z = x) { for (let i = 0; i < 4; i++) { m[i] *= x; m[4 + i] *= y; m[8 + i] *= z; } return m; },
  invert(m) {
    const o = new Float32Array(16), a = m;
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5],
      b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6], b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12],
      b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null; det = 1 / det;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
    o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
    o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
    o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
    o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
    return o;
  },
  apply(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; },
};
const T = (x, y, z) => M4.translate(M4.create(), x, y, z);

// обратно-транспонированная 3x3 для нормалей
function normalMat(m) {
  const a = [m[0], m[1], m[2]], b = [m[4], m[5], m[6]], c = [m[8], m[9], m[10]];
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const x = cr(b, c), y = cr(c, a), z = cr(a, b);
  const sg = Math.sign(a[0] * x[0] + a[1] * x[1] + a[2] * x[2]) || 1;
  return [...x, ...y, ...z].map(v => v * sg);
}

// ---------- геометрия ----------
class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.t = []; this.i = []; }
  get vcount() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, r = 1, g = 1, b = 1, u = 0, v = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b); this.t.push(u, v);
    return this.vcount - 1;
  }
  add(g, m = null, col = null) {
    const base = this.vcount, nm = m ? normalMat(m) : null;
    for (let k = 0; k < g.vcount; k++) {
      let x = g.p[k * 3], y = g.p[k * 3 + 1], z = g.p[k * 3 + 2], nx = g.n[k * 3], ny = g.n[k * 3 + 1], nz = g.n[k * 3 + 2];
      if (m) {
        [x, y, z] = M4.apply(m, x, y, z);
        const tx = nm[0] * nx + nm[3] * ny + nm[6] * nz, ty = nm[1] * nx + nm[4] * ny + nm[7] * nz, tz = nm[2] * nx + nm[5] * ny + nm[8] * nz;
        const l = Math.hypot(tx, ty, tz) || 1; nx = tx / l; ny = ty / l; nz = tz / l;
      }
      const c = col || [g.c[k * 3], g.c[k * 3 + 1], g.c[k * 3 + 2]];
      this.vert(x, y, z, nx, ny, nz, c[0], c[1], c[2], g.t[k * 2], g.t[k * 2 + 1]);
    }
    for (const i of g.i) this.i.push(base + i);
    return this;
  }
}

function gBox(w, h, d) {
  const g = new Geo();
  const F = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
  for (const [n, u, v] of F) {
    const b = g.vcount;
    for (const [su, sv, tu, tv] of [[-1, -1, 0, 1], [1, -1, 1, 1], [1, 1, 1, 0], [-1, 1, 0, 0]]) {
      g.vert((n[0] + su * u[0] + sv * v[0]) * w / 2, (n[1] + su * u[1] + sv * v[1]) * h / 2, (n[2] + su * u[2] + sv * v[2]) * d / 2,
        n[0], n[1], n[2], 1, 1, 1, tu, tv);
    }
    g.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return g;
}

// цилиндр/конус вдоль Y от 0 до h
function gCyl(r1, r2, h, seg = 12) {
  const g = new Geo(), ny = (r1 - r2) / h, nl = Math.hypot(1, ny);
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    g.vert(c * r1, 0, s * r1, c / nl, ny / nl, s / nl);
    g.vert(c * r2, h, s * r2, c / nl, ny / nl, s / nl);
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; g.i.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  for (const [y, r, n] of [[0, r1, -1], [h, r2, 1]]) {
    if (r <= 0) continue;
    const c0 = g.vert(0, y, 0, 0, n, 0);
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; g.vert(Math.cos(a) * r, y, Math.sin(a) * r, 0, n, 0); }
    for (let i = 0; i < seg; i++) g.i.push(c0, c0 + 1 + i, c0 + 2 + i);
  }
  return g;
}

// сфера; flatY — срез снизу (доля радиуса), jitter — «каменная» неровность
function gSphere(r, seg = 16, rings = 10, flatY = -2, jitter = 0) {
  const g = new Geo();
  for (let j = 0; j <= rings; j++) {
    const ph = j / rings * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const th = i / seg * Math.PI * 2;
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      const k = jitter ? 1 + jitter * (Math.sin(nx * 5.1 + nz * 3.3) * 0.6 + Math.sin(ny * 7.7 + nx * 2.1) * 0.4) : 1;
      if (ny < flatY) g.vert(nx * r * k, flatY * r, nz * r * k, 0, -1, 0);
      else g.vert(nx * r * k, ny * r * k, nz * r * k, nx, ny, nz);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + seg + 1;
    g.i.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return g;
}

// плоское кольцо/диск в плоскости XZ
function gRing(r1, r2, seg = 32) {
  const g = new Geo();
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    g.vert(c * r1, 0, s * r1, 0, 1, 0); g.vert(c * r2, 0, s * r2, 0, 1, 0);
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; g.i.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  return g;
}

// ---------- шейдеры ----------
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aUV;
layout(location=4) in vec4 iM0; layout(location=5) in vec4 iM1; layout(location=6) in vec4 iM2; layout(location=7) in vec4 iM3;
layout(location=8) in vec3 iTint; layout(location=9) in vec3 iUV;
uniform mat4 uVP; uniform vec2 uCell;
out vec3 vNor; out vec3 vCol; out vec3 vW; out vec2 vUV; out float vTex;
void main(){
  mat4 M = mat4(iM0, iM1, iM2, iM3);
  vec4 w = M * vec4(aPos, 1.0);
  vW = w.xyz; vNor = mat3(M) * aNor; vCol = aCol * iTint;
  // режимы текстуры: 1 — буквы, 2 — блоки мира (uv прямо в атласе), 3 — блок-предмет (ячейка атласа 4x4)
  vec2 cell = iUV.z > 2.5 ? vec2(0.125, 0.25) : uCell;
  vUV = (iUV.z > 1.5 && iUV.z < 2.5) ? aUV : iUV.xy + aUV * cell; vTex = iUV.z;
  gl_Position = uVP * w;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vNor; in vec3 vCol; in vec3 vW; in vec2 vUV; in float vTex;
uniform vec3 uSun, uSunCol, uSky, uGnd, uFog, uEye; uniform float uFogD, uAlpha; uniform sampler2D uAtlas, uBlocks;
out vec4 o;
void main(){
  vec3 n = normalize(vNor);
  vec3 c = vCol;
  if (vTex > 1.5) { vec4 tx = texture(uBlocks, vUV); if (tx.a < 0.5) discard; c *= tx.rgb; }
  else if (vTex > 0.5) { float g = texture(uAtlas, vUV).a; c = mix(c, vec3(0.07), g); }
  float d = max(dot(n, uSun), 0.0);
  vec3 amb = mix(uGnd, uSky, n.y * 0.5 + 0.5);
  vec3 col = c * (amb + uSunCol * d);
  vec3 v = normalize(uEye - vW), hl = normalize(v + uSun);
  col += uSunCol * pow(max(dot(n, hl), 0.0), 40.0) * 0.12;
  float f = 1.0 - exp(-length(vW - uEye) * uFogD);
  o = vec4(mix(col, uFog, clamp(f, 0.0, 1.0)), uAlpha);
}`;

// ---------- вода: волны, глубина, отражение неба (Френель), блики солнца, пена у берега ----------
const WVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=2) in vec3 aCol;
uniform mat4 uVP; uniform float uTime;
out vec3 vW; out float vDepth;
void main(){
  vec3 p = aPos; float d = clamp(aCol.x, 0.0, 1.0);
  p.y += (sin(p.x*0.8 + uTime*1.3)*0.5 + sin(p.z*1.1 - uTime*1.7)*0.35 + sin((p.x+p.z)*0.55 + uTime*0.9)*0.4) * 0.05 * d;
  vW = p; vDepth = aCol.x;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const WFS = `#version 300 es
precision highp float;
in vec3 vW; in float vDepth;
uniform vec3 uSun, uSunCol, uSky, uFog, uEye; uniform float uTime, uFogD;
out vec4 o;
float h(vec2 p){ float t = uTime;
  return sin(p.x*0.8 + t*1.3)*0.5 + sin(p.y*1.1 - t*1.7)*0.35 + sin((p.x+p.y)*0.55 + t*0.9)*0.4
       + sin(p.x*3.1 - p.y*2.3 + t*3.1)*0.12 + sin(-p.x*2.7 + p.y*3.7 + t*2.6)*0.1 + sin(p.x*6.3 + p.y*5.1 - t*4.2)*0.05 + sin(p.x*9.7 - p.y*8.3 + t*5.3)*0.03; }
void main(){
  vec2 p = vW.xz; float e = 0.04;
  float dx = (h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0))) / (2.0*e), dz = (h(p + vec2(0.0, e)) - h(p - vec2(0.0, e))) / (2.0*e);
  vec3 n = normalize(vec3(-dx*0.14, 1.0, -dz*0.14));
  vec3 v = normalize(uEye - vW);
  float fres = 0.02 + 0.98*pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uFog, uSky*1.3 + vec3(0.04, 0.07, 0.12), clamp(r.y*2.0, 0.0, 1.0));
  float df = 1.0 - exp(-vDepth*0.55);
  float light = dot(uSunCol, vec3(0.33)) + 0.25;
  vec3 base = mix(vec3(0.17, 0.55, 0.52), vec3(0.02, 0.1, 0.19), df) * light;
  vec3 col = mix(base, sky, fres*0.9);
  col += uSunCol * pow(max(dot(r, uSun), 0.0), 180.0) * 2.5;
  float foam = smoothstep(0.45, 0.0, vDepth) * (0.55 + 0.45*sin(p.x*4.0 + p.y*3.0 + uTime*2.0));
  col = mix(col, vec3(0.93), foam*0.65);
  float a = clamp(mix(0.42, 0.95, max(df, fres)) + foam*0.3, 0.0, 1.0);
  float f = 1.0 - exp(-length(vW - uEye)*uFogD);
  o = vec4(mix(col, uFog, clamp(f, 0.0, 1.0)), a);
}`;

const INST = 22; // float'ов на экземпляр: матрица 16 + цвет 3 + uv-смещение 2 + флаг текстуры 1

class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('Ваш браузер не поддерживает WebGL2');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const link = (vs, fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    };
    const p = this.prog = link(VS, FS);
    this.u = {};
    for (const n of ['uVP', 'uCell', 'uSun', 'uSunCol', 'uSky', 'uGnd', 'uFog', 'uEye', 'uFogD', 'uAlpha', 'uAtlas', 'uBlocks']) this.u[n] = gl.getUniformLocation(p, n);
    const wp = this.wprog = link(WVS, WFS);
    this.wu = {};
    for (const n of ['uVP', 'uTime', 'uSun', 'uSunCol', 'uSky', 'uFog', 'uEye', 'uFogD']) this.wu[n] = gl.getUniformLocation(wp, n);
    this.instBuf = gl.createBuffer();
    this.one = new Float32Array(INST); this.one.set(M4.create()); this.one[16] = this.one[17] = this.one[18] = 1;
  }
  mesh(geo, dynamic = false) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const mk = (data, loc, size) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    const bufs = { p: mk(geo.p, 0, 3), n: mk(geo.n, 1, 3), c: mk(geo.c, 2, 3), t: mk(geo.t, 3, 2) };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(4 + k); gl.vertexAttribPointer(4 + k, 4, gl.FLOAT, false, INST * 4, k * 16); gl.vertexAttribDivisor(4 + k, 1); }
    gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 3, gl.FLOAT, false, INST * 4, 64); gl.vertexAttribDivisor(8, 1);
    gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 3, gl.FLOAT, false, INST * 4, 76); gl.vertexAttribDivisor(9, 1);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(geo.i), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, bufs, count: geo.i.length };
  }
  update(mesh, key, data) { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bufs[key]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); }
  setAtlas(chars) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.font = 'bold 50px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < chars.length; i++) x.fillText(chars[i], (i % 8) * 64 + 32, (i / 8 | 0) * 64 + 34);
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlas = t;
  }
  setBlocks(img) { // атлас текстур блоков 4x4, пиксельный как в Minecraft
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.blocks = t;
  }
  drawWater(mesh, vp, eye, env, time) {
    if (!mesh || !mesh.count) return;
    const gl = this.gl, u = this.wu;
    gl.useProgram(this.wprog);
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform1f(u.uTime, time);
    gl.uniform3fv(u.uSun, env.sun); gl.uniform3fv(u.uSunCol, env.sunCol); gl.uniform3fv(u.uSky, env.sky);
    gl.uniform3fv(u.uFog, env.fog); gl.uniform3fv(u.uEye, eye); gl.uniform1f(u.uFogD, env.fogD);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    gl.useProgram(this.prog);
  }
  free(mesh) {
    const gl = this.gl;
    for (const k in mesh.bufs) gl.deleteBuffer(mesh.bufs[k]);
    gl.deleteVertexArray(mesh.vao);
  }
  begin(vp, eye, env, w, h) {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, w, h);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniform2f(u.uCell, 1 / 8, 1 / 4);
    gl.uniform3fv(u.uSun, env.sun); gl.uniform3fv(u.uSunCol, env.sunCol); gl.uniform3fv(u.uSky, env.sky);
    gl.uniform3fv(u.uGnd, env.gnd); gl.uniform3fv(u.uFog, env.fog); gl.uniform3fv(u.uEye, eye);
    gl.uniform1f(u.uFogD, env.fogD); gl.uniform1f(u.uAlpha, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(u.uAtlas, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.blocks || this.atlas); gl.uniform1i(u.uBlocks, 1);
  }
  blend(on) {
    const gl = this.gl;
    if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    else { gl.disable(gl.BLEND); gl.depthMask(true); }
  }
  drawInst(mesh, data, n, alpha = 1) {
    if (!n) return;
    const gl = this.gl;
    gl.uniform1f(this.u.uAlpha, alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * INST), gl.STREAM_DRAW);
    gl.bindVertexArray(mesh.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0, n);
    gl.bindVertexArray(null);
  }
  drawOne(mesh, alpha = 1) { this.drawInst(mesh, this.one, 1, alpha); }
  drawBatch(b, alpha = 1) { this.drawInst(b.mesh, b.d, b.n, alpha); }
}

// набор экземпляров одной модели за кадр
class Batch {
  constructor(mesh) { this.mesh = mesh; this.d = new Float32Array(INST * 64); this.n = 0; }
  push(m, r = 1, g = 1, b = 1, ux = 0, uy = 0, tex = 0) {
    if ((this.n + 1) * INST > this.d.length) { const nd = new Float32Array(this.d.length * 2); nd.set(this.d); this.d = nd; }
    const o = this.n * INST, d = this.d;
    d.set(m, o); d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = ux; d[o + 20] = uy; d[o + 21] = tex;
    this.n++;
  }
}
