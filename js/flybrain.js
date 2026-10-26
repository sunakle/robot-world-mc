'use strict';
// ================= Мозг размером с мозг плодовой мушки: 139 255 нейронов (как в коннектоме FlyWire) =================
// Связи не хранятся: их задаёт «геном связей» (seed) через хеш — у каждого робота свой коннектом, памяти почти не нужно.
// Активность разреженная (как у настоящей мухи), считаем только то, что реально «зажглось».
// Учатся связи клеток Кеньона (грибовидное тело) с выходом — дофамин (награда) их усиливает, как у мухи.
const FLY = [
  { k: 'retina', ru: 'Фоторецепторы (глаза)', n: 6000, act: 0.03 },
  { k: 'lamina', ru: 'Ламина', n: 12000, act: 0.02 },
  { k: 'medulla', ru: 'Медулла', n: 40000, act: 0.015 },
  { k: 'lobula', ru: 'Лобула', n: 19000, act: 0.02 },
  { k: 'al', ru: 'Антеннальные доли (чувства тела)', n: 3200, act: 0.04 },
  { k: 'lh', ru: 'Латеральный рог (врождённое)', n: 1700, act: 0.03 },
  { k: 'proto', ru: 'Протоцеребрум (связующие)', n: 50855, act: 0.01 },
  { k: 'mb', ru: 'Грибовидные тела (память, обучение)', n: 2200, act: 0.05 },
  { k: 'cx', ru: 'Центральный комплекс (навигация, выбор)', n: 3000, act: 0.03 },
  { k: 'motor', ru: 'Нисходящие и моторные нейроны', n: 1300, act: 0.04 },
];
const FLY_TOTAL = FLY.reduce((s, r) => s + r.n, 0); // 139 255
const FI = Object.fromEntries(FLY.map((r, i) => [r.k, i]));
// проводящие пути: откуда → куда, сколько выходных синапсов у нейрона
const FLY_PATHS = [['retina', 'lamina', 6], ['lamina', 'medulla', 8], ['medulla', 'lobula', 6], ['lobula', 'proto', 8],
  ['al', 'lh', 6], ['al', 'mb', 7], ['al', 'proto', 6], ['proto', 'mb', 4], ['proto', 'cx', 4], ['mb', 'cx', 3], ['lh', 'motor', 5], ['cx', 'motor', 5]];
const VIS_RAYS = 24, VIS_FEAT = 8; // 24 направления × 8 признаков (свет, рельеф, вода, робот, яблоко, дерево, зомби, предмет)
const MB_N = FLY[FI.mb].n;

const hash32 = (a, b, c) => { let h = (a ^ 0x9e3779b9) + Math.imul(b, 0x85ebca6b) + Math.imul(c, 0xc2b2ae35); h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; return h >>> 0; };
// общие буферы для подсчёта (мозги считаются по очереди)
const FLY_ACC = FLY.map(r => new Uint8Array(r.n));
const FLY_TOUCH = FLY.map(r => new Int32Array(Math.min(r.n, 60000))), FLY_TN = new Int32Array(FLY.length);
const FLY_LAST = Object.fromEntries(FLY.map(r => [r.k, FLY_PATHS.filter(p => p[1] === r.k).slice(-1)[0]]));

function newFly(seed) { return { seed: seed >>> 0, W: new Float32Array(MB_N * 16), active: FLY.map(() => []), out: new Float32Array(16), trace: [] }; }
function childFly(a, b) {
  const f = newFly(Math.random() < 0.5 ? a.seed : b.seed);
  if (Math.random() < 0.1 * SET.mut) f.seed = hash32(f.seed, 7, Math.random() * 1e9 | 0); // мутация проводки
  if (SET.lamarck) for (let i = 0; i < f.W.length; i++) f.W[i] = (a.W[i] + b.W[i]) / 2;
  return f;
}
// k-победителей по счётчику совпадений (без сортировки: гистограмма уровней)
const FLY_HIST = new Uint32Array(17);
function flyPick(ri, k) {
  const acc = FLY_ACC[ri], tl = FLY_TOUCH[ri], n = FLY_TN[ri], hist = FLY_HIST;
  hist.fill(0);
  for (let i = 0; i < n; i++) hist[Math.min(16, acc[tl[i]])]++;
  let thr = 16, c = 0;
  while (thr > 1 && c + hist[thr] < k) { c += hist[thr]; thr--; }
  const out = [];
  for (let i = 0; i < n; i++) { const t = tl[i]; if (acc[t] >= thr && out.length < k) out.push(t); acc[t] = 0; }
  FLY_TN[ri] = 0;
  return out;
}
// настройка входных нейронов зависит только от генома связей — считаем один раз
const FLY_TUNE = new Map();
function flyTuning(seed, nb) {
  let t = FLY_TUNE.get(seed);
  if (t) return t;
  const nR = FLY[FI.retina].n, nA = FLY[FI.al].n;
  t = { rf: new Uint16Array(nR), rt: new Float32Array(nR), af: new Uint16Array(nA), at: new Float32Array(nA) };
  for (let i = 0; i < nR; i++) { const h = hash32(seed, 1, i); t.rf[i] = (h % VIS_RAYS) * VIS_FEAT + ((h >>> 8) % VIS_FEAT); t.rt[i] = ((h >>> 16) & 1023) / 1100; }
  for (let i = 0; i < nA; i++) { const h = hash32(seed, 2, i); t.af[i] = h % nb; t.at[i] = ((h >>> 12) & 1023) / 1100; }
  if (FLY_TUNE.size > 400) FLY_TUNE.clear();
  FLY_TUNE.set(seed, t);
  return t;
}
// один «такт» мозга: глаза + чувства тела → все отделы → клетки Кеньона → вклад в выбор действия
function flyThink(r, vision, body, na) {
  const F = r.fly, seed = F.seed, act = F.active;
  for (let i = 0; i < FLY.length; i++) act[i] = [];
  const tu = flyTuning(seed, body.length);
  // фоторецепторы: каждый настроен на свой луч, признак и порог
  const ret = act[FI.retina], nR = FLY[FI.retina].n, capR = nR * FLY[FI.retina].act * 2;
  for (let i = 0; i < nR && ret.length < capR; i++) { const v = vision[tu.rf[i]]; if (v > 0 && v > tu.rt[i]) ret.push(i); }
  // антеннальные доли: внутренние ощущения (драйвы, сытость, ночь…)
  const al = act[FI.al], nA = FLY[FI.al].n;
  for (let i = 0; i < nA; i++) { const v = body[tu.af[i]]; if (v > 0.05 && v > tu.at[i]) al.push(i); }
  if (al.length > nA * 0.08) al.length = nA * 0.08 | 0;
  // распространение по путям
  for (const path of FLY_PATHS) {
    const [from, to, fan] = path, fi = FI[from], ti = FI[to], acc = FLY_ACC[ti], n = FLY[ti].n, tl = FLY_TOUCH[ti], cap = tl.length, src = act[fi];
    const salt = hash32(seed, fi * 31 + ti, 77) | 0; // свой «рисунок» связей у каждого пути и робота
    let tn = FLY_TN[ti];
    for (let q = 0; q < src.length; q++) {
      const a = src[q] * 16;
      for (let f = 0; f < fan; f++) {
        let h = Math.imul((a + f) ^ salt, 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA77); h ^= h >>> 13;
        const t = (h >>> 0) % n;
        if (acc[t] === 0) { if (tn >= cap) continue; tl[tn++] = t; }
        if (acc[t] < 255) acc[t]++;
      }
    }
    FLY_TN[ti] = tn;
    // слой готов, когда в него пришли все входящие пути
    if (FLY_LAST[to] === path) act[ti] = flyPick(ti, Math.max(8, FLY[ti].n * FLY[ti].act | 0));
  }
  // выход грибовидных тел (обучаемый)
  const out = F.out, mb = act[FI.mb];
  out.fill(0);
  for (const kc of mb) for (let a = 0; a < na; a++) out[a] += F.W[kc * 16 + a];
  for (let a = 0; a < na; a++) out[a] = Math.tanh(out[a] / 2);
  return out;
}
// дофамин: усиливает (или ослабляет) связи недавно активных клеток Кеньона с выбранным действием
function flyTrace(r, dz, na) { const F = r.fly; F.trace.unshift({ kc: F.active[FI.mb].slice(), dz: Array.from(dz).slice(0, na) }); if (F.trace.length > 4) F.trace.pop(); }
function flyLearn(r, lr, na) {
  const F = r.fly; let decay = 1;
  for (const e of F.trace) {
    for (const kc of e.kc) for (let a = 0; a < na; a++) { const w = F.W[kc * 16 + a] + lr * decay * e.dz[a]; F.W[kc * 16 + a] = w > 3 ? 3 : w < -3 ? -3 : w; }
    decay *= LAMBDA;
  }
}
