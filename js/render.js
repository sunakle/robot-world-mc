'use strict';
// ================= Отрисовка: блочный мир, вода, роботы-утки и их анимация =================
let R, B = {};
const OPAQUE = ['thigh', 'pad', 'shin', 'footTop', 'sole', 'body', 'bodyFix', 'neck', 'dome', 'headFix', 'eye', 'jaw',
  'fruit', 'cone', 'berry', 'cocoa', 'root', 'letter', 'block', 'meat', 'tuft', 'melon', 'sprout', 'zHead', 'zBody', 'zArm', 'zLeg'];
const DARK = [0.13, 0.13, 0.15], METAL = [0.62, 0.64, 0.68];

function initRender(canvas) {
  R = new Renderer(canvas);
  R.setAtlas(LETTERS);
  const S = (x, y, z) => M4.scale(M4.create(), x, y, z);
  const at = (x, y, z, f) => { const m = T(x, y, z); if (f) f(m); return m; };
  const mk = (key, geo) => { B[key] = new Batch(R.mesh(geo)); };

  // ----- части робота (размеры для робота размера 1) -----
  mk('dome', new Geo().add(gSphere(1, 24, 14, -0.3), S(0.34, 0.27, 0.52)));
  const face = new Geo()
    .add(gCyl(1, 1, 1, 24), at(0, 0, 0.455, m => { M4.rotX(m, Math.PI / 2); M4.scale(m, 0.22, 0.03, 0.17); }), [0.55, 0.56, 0.58])
    .add(gCyl(1, 1, 1, 18), at(0.06, 0.01, 0.5, m => { M4.rotX(m, Math.PI / 2); M4.scale(m, 0.042, 0.02, 0.042); }), [0.04, 0.04, 0.05])
    .add(gSphere(0.012, 6, 4), T(0.075, 0.03, 0.525), [1, 1, 1]);
  mk('headFix', face);
  mk('eye', new Geo().add(gCyl(1, 1, 1, 22), at(0.06, 0.01, 0.48, m => { M4.rotX(m, Math.PI / 2); M4.scale(m, 0.085, 0.035, 0.085); })));
  mk('jaw', new Geo().add(gBox(0.6, 0.055, 0.9)).add(gBox(0.62, 0.09, 0.05), T(0, 0.02, 0.44)));
  mk('neck', new Geo().add(gBox(0.13, 0.3, 0.11), null, DARK).add(gBox(0.16, 0.06, 0.13), T(0, 0.12, 0), METAL).add(gBox(0.16, 0.06, 0.13), T(0, -0.12, 0), METAL)
    .add(gCyl(0.008, 0.008, 0.28, 5), T(0.075, -0.14, -0.04), [0.05, 0.05, 0.05]));
  mk('body', new Geo().add(gBox(0.42, 0.24, 0.32)).add(gSphere(0.025, 6, 4), T(0.12, 0.04, 0.165), [0.25, 0.25, 0.27]).add(gSphere(0.025, 6, 4), T(0.06, 0.04, 0.165), [0.25, 0.25, 0.27]).add(gSphere(0.025, 6, 4), T(0.09, -0.02, 0.165), [0.25, 0.25, 0.27]));
  const hipDisc = s => at(s * 0.13, -0.16, 0, m => { M4.rotZ(m, Math.PI / 2); M4.translate(m, 0, -0.04, 0); });
  mk('bodyFix', new Geo().add(gBox(0.34, 0.1, 0.22), T(0, -0.14, 0), DARK).add(gCyl(0.06, 0.06, 0.08, 14), hipDisc(1), METAL).add(gCyl(0.06, 0.06, 0.08, 14), hipDisc(-1), METAL));
  const knob = y => at(0, y, 0, m => { M4.rotZ(m, Math.PI / 2); M4.translate(m, 0, -0.065, 0); });
  mk('thigh', new Geo().add(gBox(0.1, 0.27, 0.12), null, DARK).add(gCyl(0.05, 0.05, 0.13, 12), knob(0.12), METAL).add(gCyl(0.045, 0.045, 0.13, 12), knob(-0.13), METAL));
  mk('pad', new Geo().add(gBox(0.03, 0.2, 0.17)));
  mk('shin', new Geo().add(gBox(0.09, 0.27, 0.1), null, DARK).add(gBox(0.11, 0.06, 0.11), T(0, -0.1, 0), METAL));
  mk('footTop', new Geo().add(gBox(0.19, 0.05, 0.28)));
  mk('sole', new Geo().add(gBox(0.21, 0.04, 0.31)));
  // ----- предметы -----
  {
    const ap = gSphere(1, 16, 12);
    for (let k = 0; k < ap.vcount; k++) {
      const y = ap.p[k * 3 + 1], rr = Math.hypot(ap.p[k * 3], ap.p[k * 3 + 2]);
      ap.p[k * 3 + 1] = y * 0.86 - Math.max(0, y - 0.75) * 0.9 * (1 - rr) - Math.max(0, -y - 0.8) * 0.5; // ямка сверху и снизу
      const t = (y + 1) / 2, side = ap.p[k * 3] * 0.5 + 0.5; // переход цвета: тёмно-красный низ, яркий верх, жёлто-зелёный бочок
      ap.c[k * 3] = 0.72 + 0.2 * t; ap.c[k * 3 + 1] = 0.06 + 0.1 * t + 0.18 * Math.max(0, side - 0.75); ap.c[k * 3 + 2] = 0.05 + 0.04 * t;
    }
    const leaf = gSphere(1, 8, 4);
    mk('fruit', new Geo().add(ap, M4.scale(M4.create(), 0.13))
      .add(gCyl(0.012, 0.008, 0.08, 6), at(0.005, 0.1, 0, m => M4.rotZ(m, -0.25)), [0.36, 0.22, 0.1])
      .add(leaf, at(0.045, 0.16, 0, m => { M4.rotZ(m, -0.6); M4.scale(m, 0.055, 0.012, 0.028); }), [0.25, 0.62, 0.18]));
  }
  // плоды других лесов: шишка тайги, гроздь черники, стручок какао
  mk('cone', new Geo().add(gSphere(1, 10, 8), S(0.08, 0.15, 0.08), [0.45, 0.27, 0.11]).add(gSphere(1, 8, 6), at(0, 0.06, 0, m => M4.scale(m, 0.085, 0.07, 0.085)), [0.55, 0.35, 0.15])
    .add(gCyl(0.01, 0.008, 0.06, 5), at(0, 0.15, 0), [0.3, 0.2, 0.1]));
  {
    const bg = new Geo();
    for (const [x, y, z] of [[0, 0, 0], [0.07, 0.02, 0.03], [-0.05, 0.03, 0.05], [0.02, 0.07, -0.04], [-0.04, -0.01, -0.05]]) bg.add(gSphere(1, 8, 6), at(x, y, z, m => M4.scale(m, 0.055, 0.055, 0.055)), [0.2, 0.24, 0.62]);
    bg.add(gSphere(1, 8, 4), at(0.02, 0.1, 0, m => M4.scale(m, 0.07, 0.012, 0.035)), [0.25, 0.55, 0.2]);
    mk('berry', bg);
  }
  mk('cocoa', new Geo().add(gSphere(1, 12, 8), S(0.09, 0.15, 0.09), [0.78, 0.45, 0.14]).add(gSphere(1, 10, 6), at(0, -0.04, 0, m => M4.scale(m, 0.085, 0.08, 0.085)), [0.62, 0.32, 0.1])
    .add(gCyl(0.012, 0.01, 0.07, 5), at(0, 0.15, 0), [0.35, 0.5, 0.15]));
  mk('root', new Geo().add(gSphere(1, 8, 6), S(0.08, 0.06, 0.2)));
  mk('letter', gBox(0.45, 0.45, 0.45));
  mk('block', gBox(0.32, 0.32, 0.32));
  // пучок травы: несколько тонких «лезвий» крест-накрест
  {
    const tuft = new Geo();
    for (let i = 0; i < 5; i++) { const a = i * 1.26, h = 0.35 + (i % 3) * 0.12; tuft.add(gBox(0.05, h, 0.012), at(Math.sin(a) * 0.06, h / 2, Math.cos(a) * 0.06, m => { M4.rotY(m, a); M4.rotZ(m, (i % 2 ? 0.2 : -0.2)); }), [0.3 + i * 0.03, 0.62 + i * 0.03, 0.22]); }
    mk('tuft', tuft);
  }
  // арбуз: полосатый зелёный, росток и плеть
  {
    const ml = gSphere(1, 14, 10);
    for (let k = 0; k < ml.vcount; k++) { const a = Math.atan2(ml.p[k * 3 + 1], ml.p[k * 3]), st = Math.sin(a * 6) > 0.2; ml.c[k * 3] = st ? 0.14 : 0.32; ml.c[k * 3 + 1] = st ? 0.4 : 0.62; ml.c[k * 3 + 2] = st ? 0.12 : 0.22; }
    mk('melon', new Geo().add(ml, M4.scale(T(0, 0.24, 0), 0.32, 0.26, 0.4)).add(gCyl(0.015, 0.01, 0.12, 5), T(0, 0.48, -0.25), [0.4, 0.3, 0.12]));
    mk('sprout', new Geo().add(gCyl(0.015, 0.012, 0.18, 5), null, [0.3, 0.6, 0.2]).add(gBox(0.16, 0.012, 0.09), T(0.06, 0.17, 0), [0.32, 0.66, 0.24]).add(gBox(0.14, 0.012, 0.08), T(-0.05, 0.13, 0.02), [0.28, 0.6, 0.2]));
  }
  mk('meat', new Geo().add(gBox(0.32, 0.12, 0.22), null, [0.85, 0.35, 0.35]).add(gBox(0.08, 0.08, 0.3), T(0.12, 0.02, 0), [0.95, 0.9, 0.85]));
  // зомби из Minecraft (по скину): зелёная голова и руки, бирюзовая рубашка, синие штаны
  const ZG = [0.33, 0.55, 0.3], ZS = [0.15, 0.62, 0.65], ZP = [0.25, 0.25, 0.6];
  mk('zHead', new Geo().add(gBox(0.5, 0.5, 0.5), null, ZG).add(gBox(0.12, 0.06, 0.02), T(-0.12, 0.02, 0.255), [0.05, 0.05, 0.05]).add(gBox(0.12, 0.06, 0.02), T(0.12, 0.02, 0.255), [0.05, 0.05, 0.05]).add(gBox(0.2, 0.05, 0.02), T(0, -0.13, 0.255), [0.2, 0.32, 0.18]));
  mk('zBody', new Geo().add(gBox(0.5, 0.75, 0.26), null, ZS));
  mk('zArm', new Geo().add(gBox(0.24, 0.72, 0.24), T(0, -0.3, 0), ZG).add(gBox(0.25, 0.25, 0.25), T(0, 0.05, 0), ZS));
  mk('zLeg', new Geo().add(gBox(0.25, 0.75, 0.25), T(0, -0.375, 0), ZP).add(gBox(0.26, 0.1, 0.26), T(0, -0.7, 0), [0.35, 0.35, 0.4]));
  mk('shadow', gRing(0, 0.55, 20));
  mk('ring', gRing(0.62, 0.75, 32));
  buildWorldMeshes();
}
function loadBlockTexture() {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = MCMAP.tex; });
}

// ----- воксели: чанки 16x16, видны только открытые грани, мягкие тени в углах (AO) -----
const CH = 16, chunks = new Map();
let waterMesh = null, lastWaterUp = 0;
const FACES = [
  { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];
const AO = [0.42, 0.6, 0.8, 1];
// «непрозрачный» сосед закрывает грань; листва прозрачная
// режим наблюдателя: в круглом «окне» вокруг камеры всё выше среза не рисуется — видно ходы и камеры под землёй,
// а остальной мир остаётся целым
const CUT_R = 9;
let CUT = null; // { y, i, k } — высота среза и центр окна в клетках карты
const inCut = (i, k) => CUT !== null && (i - CUT.i) ** 2 + (k - CUT.k) ** 2 <= CUT_R * CUT_R;
const cutTop = (i, k) => inCut(i, k) ? CUT.y : Infinity;
const cutHides = (x, z, y) => CUT !== null && y > CUT.y + 0.5 && inCut(Math.floor(x + HX), Math.floor(z + HZ));
function setCut(c) {
  const old = CUT;
  if ((!old && !c) || (old && c && old.y === c.y && old.i === c.i && old.k === c.k)) return;
  CUT = c;
  // перестраиваем только чанки под старым и новым окном
  for (const w of [old, c]) if (w) for (let cz = (w.k - CUT_R - 1) >> 4; cz <= (w.k + CUT_R + 1) >> 4; cz++) for (let cx = (w.i - CUT_R - 1) >> 4; cx <= (w.i + CUT_R + 1) >> 4; cx++) world.dirtyChunks.add(cx + ',' + cz);
  world.waterDirty = true;
}
function solidAt(i, y, k) {
  if (y < 0) return true;
  if (i < 0 || k < 0 || i >= MAPX || k >= MAPZ || y >= MAPY || y >= cutTop(i, k)) return false;
  const id = world.b[(y * MAPZ + k) * MAPX + i];
  return id !== 0 && id !== B_LEAVES;
}
function buildChunk(cx, cz) {
  const p = [], nn = [], c = [], t = [], ix = [];
  const e = 0.3 / 128; // отступ от края тайла, чтобы не было швов
  for (let k = cz * CH; k < Math.min(MAPZ, cz * CH + CH); k++) for (let i = cx * CH; i < Math.min(MAPX, cx * CH + CH); i++) {
    const top = world.hi[k * MAPX + i], bio = BIOMES[world.biome ? world.biome[k * MAPX + i] : 0];
    for (let y = 0, ye = Math.min(top, cutTop(i, k)); y < ye; y++) {
      const id = world.b[(y * MAPZ + k) * MAPX + i]; if (!id) continue;
      for (const f of FACES) {
        const tile = TILES[id][f.n[1] > 0 ? 0 : f.n[1] < 0 ? 2 : 1], tx = tile % ATL, ty = tile / ATL | 0;
        const tint = id === B_LEAVES ? bio.leaf : (id === B_GRASS || id === B_ROOF) && f.n[1] > 0 ? bio.tint : null; // у каждого биома свой цвет травы и листвы
        const [n0, n1, n2] = f.n, ni = i + n0, ny = y + n1, nk = k + n2;
        if (solidAt(ni, ny, nk)) continue;
        const u = f.u, v = f.v, base = p.length / 3, ao = [];
        for (const [cu, cv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
          const px = i + Math.max(n0, 0) + cu * u[0] + cv * v[0], py = y + Math.max(n1, 0) + cu * u[1] + cv * v[1], pz = k + Math.max(n2, 0) + cu * u[2] + cv * v[2];
          const su = cu ? 1 : -1, sv = cv ? 1 : -1;
          const s1 = solidAt(ni + su * u[0], ny + su * u[1], nk + su * u[2]), s2 = solidAt(ni + sv * v[0], ny + sv * v[1], nk + sv * v[2]);
          const s3 = solidAt(ni + su * u[0] + sv * v[0], ny + su * u[1] + sv * v[1], nk + su * u[2] + sv * v[2]);
          const a = s1 && s2 ? 0 : 3 - (s1 + s2 + s3); ao.push(a);
          const b = AO[a] * (n1 > 0 ? 1 : 0.92);
          p.push(px - HX, py, pz - HZ); nn.push(n0, n1, n2); if (tint) c.push(b * tint[0], b * tint[1], b * tint[2]); else c.push(b, b, b);
          const fu = cu ? 1 - e * 4 : e * 4, fv = n1 ? (cv ? 1 - e * 4 : e * 4) : (cv ? e * 4 : 1 - e * 4);
          t.push((tx + fu) / ATL, (ty + fv) / 4);
        }
        if (ao[0] + ao[2] < ao[1] + ao[3]) ix.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        else ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const key = cx + ',' + cz, old = chunks.get(key);
  if (old) R.free(old);
  if (ix.length) chunks.set(key, R.mesh({ p, n: nn, c, t, i: ix })); else chunks.delete(key);
}
// поверхность воды: квадрат на каждую водяную колонну, глубина в вершине — для цвета и пены
function buildWater() {
  const p = [], c = [], n = [], t = [], ix = [];
  const dep = (i, k) => { if (i < 0 || k < 0 || i >= MAPX || k >= MAPZ) return 3; const q = k * MAPX + i; return Math.max(0, world.wl[q] - world.top[q]); };
  for (let k = 0; k < MAPZ; k++) for (let i = 0; i < MAPX; i++) {
    const q = k * MAPX + i, lvl = world.wl[q];
    if (lvl <= world.top[q] || lvl > cutTop(i, k)) continue;
    const base = p.length / 3;
    for (const [du, dv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const ci = i + du, ck = k + dv;
      const d = Math.min(dep(ci - 1, ck - 1), dep(ci, ck - 1), dep(ci - 1, ck), dep(ci, ck));
      p.push(ci - HX, lvl - 0.12, ck - HZ); c.push(d, 0, 0); n.push(0, 1, 0); t.push(0, 0);
    }
    ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (waterMesh) R.free(waterMesh);
  waterMesh = R.mesh({ p, n, c, t, i: ix });
  world.waterDirty = false;
}
function buildWorldMeshes() {
  for (const m of chunks.values()) R.free(m);
  chunks.clear();
  for (let cz = 0; cz < Math.ceil(MAPZ / CH); cz++) for (let cx = 0; cx < Math.ceil(MAPX / CH); cx++) buildChunk(cx, cz);
  buildWater();
  world.allDirty = false; world.dirtyChunks.clear();
}

// ----- небо и день/ночь -----
// ночь есть в симуляции (холод, сон), но визуально всегда светлый день
function skyEnv() {
  const sun = [0.45, 0.8, 0.4], l = Math.hypot(...sun);
  const sky = [0.55, 0.75, 0.95];
  return { sun: sun.map(v => v / l), sunCol: [0.95, 0.9, 0.8], sky: [0.5, 0.58, 0.73], gnd: [0.3, 0.27, 0.22], fog: sky, fogD: 0.0045 };
}

// ----- анимация робота (как на гифках: присед, шаг уткой, кивок головой) -----
function animRobot(r, dt, mul) {
  const A = r.anim, k = Math.min(1, dt * 8);
  A.walk += ((r.moving ? 1 : 0) - A.walk) * k;
  A.sit += ((r.action === 8 ? 1 : 0) - A.sit) * k * 0.6;
  A.dig += ((r.action === 4 ? 1 : 0) - A.dig) * k;
  A.ph += dt * (6 + r.spd * 2.5) * A.walk * Math.min(mul, 3);
  A.t += dt * Math.min(mul, 3);
  A.jump = Math.max(0, (A.jump || 0) - dt * 2.2);
  // плавный подъём/спуск по блокам
  if (A.y === undefined || Math.abs(A.y - r.y) > 3) A.y = r.y;
  A.y += (r.y - A.y) * Math.min(1, dt * 10 * Math.max(1, Math.min(mul, 4)));
}
function legAngles(A, side) {
  const ph = A.ph + (side > 0 ? Math.PI : 0), w = A.walk;
  let a1 = 0.5 + 0.42 * Math.sin(ph) * w, kk = 1.0 + 0.75 * Math.max(0, Math.cos(ph)) * w;
  a1 += (1.35 - a1) * A.sit; kk += (2.5 - kk) * A.sit;
  a1 += 0.25 * A.dig; kk += 0.45 * A.dig;
  return [a1, kk];
}
function drawRobot(r, now) {
  const g = r.genes, A = r.anim, s = g.size * (0.55 + 0.45 * growth(r));
  const sh = PAL_SHELL[g.shell], ac = PAL_ACC[g.acc], ft = PAL_ACC[g.foot], ey = PAL_EYE[g.eye];
  const side0 = r.id % 2 ? 1 : -1, Lb = 0.36 * g.leg;
  const legs = [-1, 1].map(side => { const L = side === side0 ? 1 - g.asym * 0.3 : 1; const [a1, kk] = legAngles(A, side); return { side, a1, kk, Lt: Lb * L, Ls: Lb * L }; });
  const hipY = 0.09 + Math.max(...legs.map(l => l.Lt * Math.cos(l.a1) + l.Ls * Math.cos(l.kk - l.a1)));
  const ry = (A.y ?? r.y) + Math.sin((A.jump || 0) * Math.PI) * 0.9, root = T(r.x, ry, r.z); M4.rotY(root, r.yaw); M4.scale(root, s);
  for (const l of legs) {
    const hip = M4.rotX(M4.translate(M4.copy(root), l.side * 0.12, hipY, 0), -l.a1);
    B.thigh.push(M4.scale(M4.translate(M4.copy(hip), 0, -l.Lt / 2, 0), 1, l.Lt / 0.27, 1));
    B.pad.push(M4.translate(M4.copy(hip), l.side * 0.07, -l.Lt * 0.5, 0.02), ...sh);
    const knee = M4.rotX(M4.translate(M4.copy(hip), 0, -l.Lt, 0), l.kk);
    B.shin.push(M4.scale(M4.translate(M4.copy(knee), 0, -l.Ls / 2, 0), 1, l.Ls / 0.27, 1));
    const ankle = M4.rotX(M4.translate(M4.copy(knee), 0, -l.Ls, 0), l.a1 - l.kk);
    const fc = g.asym > 0.45 && l.side === side0 ? PAL_ACC[(g.foot + 2) % PAL_ACC.length] : ft;
    B.footTop.push(M4.translate(M4.copy(ankle), 0, -0.03, 0.04), ...ac);
    B.sole.push(M4.translate(M4.copy(ankle), 0, -0.07, 0.04), ...fc);
  }
  const body = M4.translate(M4.copy(root), 0, hipY + 0.1, 0);
  M4.rotX(body, 0.08 * A.walk + 0.35 * A.dig - 0.05 * A.sit); M4.rotZ(body, Math.sin(A.ph) * 0.06 * A.walk);
  B.body.push(M4.translate(M4.copy(body), 0, 0.03, 0), ...sh);
  B.bodyFix.push(body);
  const neckP = 0.12 + 0.1 * Math.sin(A.ph * 2) * A.walk + A.dig * (0.85 + 0.15 * Math.sin(A.t * 14)) + A.sit * 0.1;
  const nb = M4.rotX(M4.translate(M4.copy(body), 0, 0.14, -0.02), neckP);
  B.neck.push(M4.translate(M4.copy(nb), 0, 0.15, 0));
  const head = M4.translate(M4.copy(nb), 0, 0.3, 0);
  M4.rotX(head, -neckP * 0.6 - 0.08 * A.walk * Math.sin(A.ph * 2)); M4.rotZ(head, g.asym * 0.45 * side0); M4.scale(head, g.head);
  const hc = M4.translate(M4.copy(head), 0, 0.14, 0.1);
  B.dome.push(hc, ...sh); B.headFix.push(hc); B.eye.push(hc, ...ey);
  const talking = r.say && r.say.until > now && r.action === 6;
  const jaw = M4.translate(M4.copy(head), 0, 0.04, -0.32);
  M4.rotX(jaw, talking ? 0.35 * Math.abs(Math.sin(A.t * 16)) : 0); M4.translate(jaw, 0, 0, 0.42);
  B.jaw.push(jaw, ...ac);
  if (r.carry) pushItem(r.carry, M4.translate(M4.copy(head), 0, -0.12, 0.62));
  B.shadow.push(M4.scale(T(r.x, ry + 0.03, r.z), s * 1.15), ...(G.tribes ? tribeColor(r.tribe).map(v => v * 0.8) : [0, 0, 0]));
}

function drawZombie(zb, dt) {
  zb.ay = zb.ay === undefined ? zb.y : zb.ay + (zb.y - zb.ay) * Math.min(1, dt * 8);
  const root = M4.rotY(T(zb.x, zb.ay, zb.z), zb.yaw), sw = zb.moving ? Math.sin(zb.ph) * 0.6 : 0;
  const tint = zb.burn ? [1.4, 0.8, 0.5] : [1, 1, 1];
  for (const sd of [-1, 1]) {
    B.zLeg.push(M4.rotX(M4.translate(M4.copy(root), sd * 0.125, 0.75, 0), sw * sd), ...tint);
    B.zArm.push(M4.rotX(M4.translate(M4.copy(root), sd * 0.37, 1.4, 0), -Math.PI / 2 + Math.sin(zb.ph * 0.5 + sd) * 0.1), ...tint);
  }
  B.zBody.push(M4.translate(M4.copy(root), 0, 1.125, 0), ...tint);
  B.zHead.push(M4.translate(M4.copy(root), 0, 1.75, 0), ...tint);
  B.shadow.push(M4.scale(T(zb.x, zb.ay + 0.03, zb.z), 0.8), 0, 0, 0);
}
function hsl(h, s, l) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}
function pushItem(o, m) {
  if (!m) m = M4.rotY(T(o.x, world.height(o.x, o.z), o.z), o.rot || 0);
  switch (o.t) {
    case 'block': { const tl = TILES[o.id][1]; B.block.push(M4.translate(M4.copy(m), 0, 0.16, 0), 1, 1, 1, (tl % ATL) / ATL, (tl / ATL | 0) / 4, 3); break; }
    case 'meat': B.meat.push(M4.translate(M4.copy(m), 0, 0.06, 0)); break;
    case 'grass': B.tuft.push(m); break;
    case 'melon': if (o.g >= MELON_RIPE) B.melon.push(m); else B.sprout.push(M4.scale(M4.copy(m), 0.6 + o.g / MELON_RIPE * 1.6)); break;
    case 'fruit': B[FRUIT_MESH[o.kind] || 'fruit'].push(M4.translate(M4.copy(m), 0, 0.11, 0)); break;
    case 'root': B.root.push(M4.translate(M4.copy(m), 0, 0.06, 0), 0.56, 0.38, 0.22); break;
    case 'letter': { // яркий, крупный, парит и медленно вращается
      const bob = o.carried ? 0 : Math.sin(performance.now() / 600 + o.ch) * 0.06, sc = 1.35 * clamp((LETTER_LIFE - (o.age || 0)) / 60, 0.15, 1);
      B.letter.push(M4.rotY(M4.scale(M4.translate(M4.copy(m), 0, 0.42 + bob, 0), sc), performance.now() / 2500 + o.ch), ...hsl(o.ch * 360 / 26, 1, 0.6).map(v => v * 1.9), (o.ch % 8) / 8, (o.ch / 8 | 0) / 4, 1); break;
    }
  }
}

function camEye(c) {
  const e = [c.tx + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.ty + c.dist * Math.sin(c.pitch), c.tz + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw)];
  const hx = Math.max(-HX, Math.min(HX - 0.01, e[0])), hz = Math.max(-HZ, Math.min(HZ - 0.01, e[2]));
  e[1] = Math.max(e[1], world.height(hx, hz) + 0.4, world.waterLevel(hx, hz) + 0.3); // камера не уходит под землю и воду
  return e;
}
const FRUIT_MESH = { apple: 'fruit', cone: 'cone', berry: 'berry', cocoa: 'cocoa' };
const APPLE_SPOTS = [[1.6, 2.85, 0.4], [-1.55, 2.85, -0.6], [0.5, 2.85, 1.6], [-0.6, 2.85, -1.55], [1.5, 3.4, -1.2]];
const CHUNK_INST = (() => { const d = new Float32Array(INST); d.set(M4.create()); d[16] = d[17] = d[18] = 1; d[21] = 2; return d; })();
function renderFrame(cam, dt, mul, selected, W, H) {
  const now = performance.now(), env = skyEnv(), eye = camEye(cam);
  const vp = M4.mul(M4.persp(0.9, W / H, 0.1, 600), M4.lookAt(eye, [cam.tx, cam.ty, cam.tz], [0, 1, 0]));
  R.begin(vp, eye, env, W, H);
  // перестраиваем изменённые чанки (копание, стройка) — понемногу за кадр
  if (world.allDirty) buildWorldMeshes();
  let n = 0;
  for (const key of world.dirtyChunks) {
    world.dirtyChunks.delete(key);
    const [cx, cz] = key.split(',').map(Number);
    if (cx >= 0 && cz >= 0 && cx * CH < MAPX && cz * CH < MAPZ) buildChunk(cx, cz);
    if (++n >= 8) break;
  }
  if (world.waterDirty && now - lastWaterUp > 400) { buildWater(); lastWaterUp = now; }
  for (const m of chunks.values()) R.drawInst(m, CHUNK_INST, 1);
  for (const k in B) B[k].n = 0;
  for (const r of robots) { animRobot(r, dt, mul); if (!cutHides(r.x, r.z, r.y)) drawRobot(r, now); } // в окне выше среза — не видно
  for (const o of world.objects) if (!o.dead && !o.carried && !cutHides(o.x, o.z, world.height(o.x, o.z))) pushItem(o);
  for (const zb of world.zombies) drawZombie(zb, dt);
  for (const t of world.trees) for (let n = 0; n < t.apples; n++) { const f = APPLE_SPOTS[n]; if (cutHides(t.x + f[0], t.z + f[2], t.y + f[1])) continue; B[FRUIT_MESH[t.fruit] || 'fruit'].push(M4.rotY(T(t.x + f[0], t.y + f[1], t.z + f[2]), n * 1.7)); }
  for (const k of OPAQUE) R.drawBatch(B[k]);
  R.blend(true);
  R.drawBatch(B.shadow, 0.28);
  if (selected) {
    B.ring.n = 0;
    B.ring.push(M4.scale(T(selected.x, (selected.anim.y ?? selected.y) + 0.06, selected.z), selected.genes.size), 0.35, 0.7, 1);
    // куда идёт: жёлтая цель и пунктир до неё
    const it = selected.intent;
    if (it) {
      B.ring.push(M4.scale(T(it.x, world.height(it.x, it.z) + 0.07, it.z), 0.8), 1, 0.85, 0.2);
      for (let k = 1; k < 8; k++) { const f = k / 8, px = selected.x + (it.x - selected.x) * f, pz = selected.z + (it.z - selected.z) * f; B.ring.push(M4.scale(T(px, world.height(px, pz) + 0.07, pz), 0.18), 1, 0.85, 0.2); }
    }
    R.drawBatch(B.ring, 0.85);
  }
  R.drawWater(waterMesh, vp, eye, env, now / 1000);
  R.blend(false);
  return vp;
}
