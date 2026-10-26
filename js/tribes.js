'use strict';
// ================= Племена: рождаются из разошедшихся языков и расстояния, делят землю, ведут дипломатию =================
const TRIBE_HUES = [205, 28, 125, 285, 355, 52, 170, 320, 90, 240];
const TERR = 10; // размер клетки территории, блоков
const REL_STATUS = [[-0.5, 'война', '#e57373'], [-0.15, 'вражда', '#ffb74d'], [0.3, 'нейтралитет', '#9e9e9e'], [0.6, 'дружба', '#81c784'], [9, 'союз', '#4fc3f7']];
const relStatus = v => REL_STATUS.find(s => v < s[0]);

function tribeColor(id) {
  const h = (TRIBE_HUES[(id - 1) % TRIBE_HUES.length] + Math.floor((id - 1) / TRIBE_HUES.length) * 17) % 360;
  return hsl(h, 0.75, 0.55);
}
const tribeCss = id => `rgb(${tribeColor(id).map(v => Math.round(v * 255)).join(',')})`;
const tribeOf = id => G.tribes && G.tribes[id];

// название — из букв, которые знает сама группа (без букв — просто звуки)
function makeTribeName(rs) {
  const known = new Set();
  for (const r of rs) for (let k = 0; k < 26; k++) if (r.letters[k] >= 0.5) known.add(LETTERS[k]);
  let V = [...known].filter(c => VOWELS.has(c)), C = [...known].filter(c => !VOWELS.has(c));
  if (V.length < 1 || C.length < 2) { V = [...'AEIOU']; C = [...'BDGKLMNPRSTVZ']; }
  for (let tries = 0; tries < 20; tries++) {
    let s = ''; const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) s += pick(C) + pick(V);
    s = s[0] + s.slice(1).toLowerCase();
    if (!Object.values(G.tribes || {}).some(t => t.name === s)) return s;
  }
  return 'Племя ' + ((G.tribeSeq || 0) + 1);
}
function newTribe(rs, parentId = null) {
  G.tribes = G.tribes || {}; G.rel = G.rel || {};
  const id = G.tribeSeq = (G.tribeSeq || 0) + 1;
  G.tribes[id] = { id, name: makeTribeName(rs), born: simTime, parent: parentId, founder: rs[0] ? rs[0].name : '', alive: true };
  G.rel[id] = {};
  for (const k in G.tribes) {
    if (+k === id) continue;
    const base = +k === parentId ? 0.15 : 0; // с родным племенем поначалу тепло
    G.rel[id][k] = base; G.rel[k] = G.rel[k] || {}; G.rel[k][id] = base;
  }
  for (const r of rs) r.tribe = id;
  return id;
}
function getRel(a, b) { return a === b ? 1 : (G.rel && G.rel[a] && G.rel[a][b]) || 0; }
function changeRel(a, b, dv, why) {
  if (!a || !b || a === b || !G.rel[a]) return;
  const before = getRel(a, b), v = clamp(before + dv, -1, 1);
  G.rel[a][b] = v; G.rel[b][a] = v;
  // статус меняется с запасом 0.06 — чтобы не «мигал» на границе
  G.relSt = G.relSt || {}; const pk = Math.min(a, b) + '-' + Math.max(a, b);
  const s0 = G.relSt[pk] || relStatus(before)[1], cand = relStatus(v)[1];
  const order = REL_STATUS.map(x => x[1]), i0 = order.indexOf(s0), i1 = order.indexOf(cand);
  const edge = i1 > i0 ? REL_STATUS[i0][0] : REL_STATUS[i1][0]; // порог между старым и новым статусом
  if (i1 !== i0 && Math.abs(v - edge) < 0.06) return;
  const s1 = cand; G.relSt[pk] = s1;
  if (s0 !== s1) {
    const A = tribeOf(a).name, B = tribeOf(b).name, up = i1 > i0;
    const txt = up
      ? { вражда: `${A} и ${B} заключили перемирие, но остались врагами`, нейтралитет: `${A} и ${B} помирились`, дружба: `${A} и ${B} подружились`, союз: `${A} и ${B} заключили союз` }[s1]
      : { война: `Племена ${A} и ${B} начали войну`, вражда: `Отношения ${A} и ${B} испортились: вражда`, нейтралитет: `Дружба ${A} и ${B} остыла`, дружба: `Союз ${A} и ${B} распался` }[s1];
    G.diplo = G.diplo || []; G.diplo.unshift({ t: simTime, text: txt + (why ? ` (${why})` : '') }); if (G.diplo.length > 60) G.diplo.pop();
    pushEvent(txt + (why ? ` (${why})` : ''));
  }
}
const canMateTribes = (a, b) => a.tribe === b.tribe || getRel(a.tribe, b.tribe) >= 0.3;
const isEnemy = (a, b) => a.tribe !== b.tribe && getRel(a.tribe, b.tribe) <= -0.15;

// словарь племени: самое частое слово на каждое понятие
function vocabOf(rs) {
  const out = {};
  for (const c of CONCEPTS) {
    const cnt = new Map();
    for (const r of rs) { const e = r.vocab[c.k]; if (e) cnt.set(e.w, (cnt.get(e.w) || 0) + 1); }
    let best = null, bn = 0; for (const [w, n] of cnt) if (n > bn) { bn = n; best = w; }
    if (best) out[c.k] = best;
  }
  return out;
}
// похожесть языков: доля общих понятий, названных одинаково (null — сравнивать нечего)
function langSim(va, vb) {
  let both = 0, same = 0;
  for (const k in va) if (vb[k]) { both++; if (va[k] === vb[k]) same++; }
  return both >= 2 ? same / both : null;
}

let tribeT = 0, terrT = 0;
function tribeTick() {
  if (!G.tribes) return;
  if (simTime < tribeT || simTime < terrT) { tribeT = 0; terrT = 0; } // новый мир или загрузка — таймеры заново
  // территория: где роботы племени бывают чаще, там их земля
  if (simTime - terrT >= 5) {
    terrT = simTime;
    const T = G.terr = G.terr || {};
    for (const key in T) { const cell = T[key]; for (const t in cell) { cell[t] *= 0.93; if (cell[t] < 0.3) delete cell[t]; } if (!Object.keys(cell).length) delete T[key]; }
    for (const r of robots) { const key = Math.floor((r.x + HX) / TERR) + ',' + Math.floor((r.z + HZ) / TERR); const cell = T[key] || (T[key] = {}); cell[r.tribe] = (cell[r.tribe] || 0) + 1; }
    // спорные земли портят отношения
    const contested = {};
    for (const key in T) { const ts = Object.keys(T[key]).filter(t => T[key][t] > 2); for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) contested[Math.min(ts[i], ts[j]) + '-' + Math.max(ts[i], ts[j])] = 1; }
    for (const pk in contested) { const [a, b] = pk.split('-').map(Number); changeRel(a, b, -0.006, 'спор за землю'); } // один раз на пару, а не за каждую клетку
  }
  if (simTime - tribeT < 15) return;
  tribeT = simTime;
  const byTribe = {};
  for (const r of robots) (byTribe[r.tribe] = byTribe[r.tribe] || []).push(r);
  // вымершие племена
  for (const id in G.tribes) if (G.tribes[id].alive && !byTribe[id]) { G.tribes[id].alive = false; G.tribes[id].died = simTime; pushEvent(`Племя ${G.tribes[id].name} исчезло`); }
  // похожий язык сближает, разный — отдаляет
  const vocabs = {}; for (const id in byTribe) vocabs[id] = vocabOf(byTribe[id]);
  const ids = Object.keys(byTribe);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const s = langSim(vocabs[ids[i]], vocabs[ids[j]]); if (s !== null) changeRel(+ids[i], +ids[j], (s - 0.4) * 0.04, s > 0.5 ? 'похожий язык' : 'не понимают друг друга'); }
  splitCheck(byTribe);
}
// группа далеко от своих + язык разошёлся (или ушли очень далеко) → новое племя
function splitCheck(byTribe) {
  // группируем по «дому» (дерево, которое робот считает своим), а не по тому, где он сейчас бродит
  const n = robots.length, parent = robots.map((_, i) => i), home = robots.map(r => r.home ? [r.home.x, r.home.z] : [r.x, r.z]);
  const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if ((home[i][0] - home[j][0]) ** 2 + (home[i][1] - home[j][1]) ** 2 < 225) parent[find(i)] = find(j);
  const groups = {}; robots.forEach((r, i) => (groups[find(i)] = groups[find(i)] || []).push(r));
  const clusters = Object.values(groups).filter(g => g.length >= 4);
  G.splitT = G.splitT || {};
  const seen = {};
  for (const tid in byTribe) {
    const own = clusters.map(g => ({ g, m: g.filter(r => r.tribe === +tid) })).filter(o => o.m.length >= 4).sort((a, b) => b.m.length - a.m.length);
    if (own.length < 2) continue;
    const main = own[0].m, mc = homeCentroid(main), mv = vocabOf(main);
    for (const o of own.slice(1)) {
      const c = homeCentroid(o.m), dist = Math.hypot(c[0] - mc[0], c[1] - mc[1]), sim = langSim(vocabOf(o.m), mv);
      // с языком: разошёлся язык и живут отдельно; без языка (нет алфавита) — просто долго живут далеко
      const apart = sim !== null ? (sim <= 0.5 && dist > 18) || dist > 40 : dist > 24;
      const need = sim !== null ? 45 : 90;
      const key = tid + ':' + Math.round(c[0] / 20) + ',' + Math.round(c[1] / 20);
      seen[key] = true;
      if (!apart) continue;
      G.splitT[key] = (G.splitT[key] || 0) + 15;
      if (G.splitT[key] >= need) {
        const nid = newTribe(o.m, +tid);
        const why = sim !== null ? `язык разошёлся на ${Math.round((1 - sim) * 100)}%` : `ушли за ${Math.round(dist)} блоков`;
        pushEvent(`Группа из ${o.m.length} роботов отделилась от племени ${G.tribes[tid].name} и основала племя ${G.tribes[nid].name} (${why})`);
        G.diplo = G.diplo || []; G.diplo.unshift({ t: simTime, text: `Основано племя ${G.tribes[nid].name} — откололось от ${G.tribes[tid].name}, ${why}` });
        delete G.splitT[key];
      }
    }
  }
  for (const k in G.splitT) if (!seen[k]) delete G.splitT[k];
}
function centroid(rs) { let x = 0, z = 0; for (const r of rs) { x += r.x; z += r.z; } return [x / rs.length, z / rs.length]; }
function homeCentroid(rs) { let x = 0, z = 0; for (const r of rs) { const h = r.home || r; x += h.x; z += h.z; } return [x / rs.length, z / rs.length]; }
function territoryOwner(key) {
  const cell = G.terr && G.terr[key]; if (!cell) return 0;
  let best = 0, bv = 2; for (const t in cell) if (cell[t] > bv) { bv = cell[t]; best = +t; }
  return best;
}
function territorySize(tid) { let n = 0; for (const key in G.terr || {}) if (territoryOwner(key) === tid) n++; return n; }

// ---------- миникарта ----------
let miniBase = null;
function buildMiniBase() {
  const c = document.createElement('canvas'); c.width = MAPX; c.height = MAPZ;
  const x = c.getContext('2d'), img = x.createImageData(MAPX, MAPZ), d = img.data;
  for (let k = 0; k < MAPZ; k++) for (let i = 0; i < MAPX; i++) {
    const q = k * MAPX + i, o = q * 4, t = world.top[q], id = world.b[((t - 1) * MAPZ + k) * MAPX + i];
    let col;
    if (world.wl[q] > t) { const dp = Math.min(1, (world.wl[q] - t) / 6); col = [40 - dp * 20, 110 - dp * 40, 170 - dp * 30]; }
    else if (world.hi[q] > t + 1) col = [38, 92, 40]; // крона
    else col = id === B_GRASS ? [96, 150, 70] : id === B_SAND ? [210, 196, 150] : id === B_STONE || id === B_COBBLE ? [120, 120, 120] : [130, 98, 70];
    const sh = 0.75 + Math.min(0.4, (t - world.sea) * 0.025);
    d[o] = col[0] * sh; d[o + 1] = col[1] * sh; d[o + 2] = col[2] * sh; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  miniBase = c;
}
function drawMinimap(cv) {
  if (!miniBase) buildMiniBase();
  const x = cv.getContext('2d'), sx = cv.width / MAPX, sz = cv.height / MAPZ;
  x.imageSmoothingEnabled = false; x.drawImage(miniBase, 0, 0, cv.width, cv.height);
  // территории
  for (const key in G.terr || {}) {
    const t = territoryOwner(key); if (!t) continue;
    const [ci, ck] = key.split(',').map(Number), col = tribeColor(t);
    x.fillStyle = `rgba(${col.map(v => Math.round(v * 255)).join(',')},0.38)`;
    x.fillRect(ci * TERR * sx, ck * TERR * sz, TERR * sx, TERR * sz);
    x.strokeStyle = `rgba(${col.map(v => Math.round(v * 255)).join(',')},0.9)`; x.lineWidth = 1;
    x.strokeRect(ci * TERR * sx + 0.5, ck * TERR * sz + 0.5, TERR * sx - 1, TERR * sz - 1);
  }
  // роботы
  for (const r of robots) { x.fillStyle = tribeCss(r.tribe); x.fillRect((r.x + HX) * sx - 2, (r.z + HZ) * sz - 2, 4, 4); }
  for (const zb of world.zombies) { x.fillStyle = '#76ff03'; x.fillRect((zb.x + HX) * sx - 1.5, (zb.z + HZ) * sz - 1.5, 3, 3); }
  // названия племён в центре их жителей
  const byTribe = {}; for (const r of robots) (byTribe[r.tribe] = byTribe[r.tribe] || []).push(r);
  x.font = 'bold 15px Segoe UI, sans-serif'; x.textAlign = 'center';
  for (const id in byTribe) {
    const c = centroid(byTribe[id]), px = (c[0] + HX) * sx, pz = (c[1] + HZ) * sz - 10;
    x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.strokeText(G.tribes[id].name, px, pz);
    x.fillStyle = tribeCss(+id); x.fillText(G.tribes[id].name, px, pz);
  }
  // где сейчас камера
  x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc((cam.tx + HX) * sx, (cam.tz + HZ) * sz, 6, 0, 7); x.stroke();
}
