'use strict';
// ================= Племена и стоянки =================
// Земля племени — круги вокруг его стоянок (чем больше жителей, тем шире). Стоянки основывают странники.
// Чужую стоянку берут только осадой: враждебное племя вдвое многочисленнее держит её 45 с. Брошенную — занимают мирно.
// Новое племя рождается лишь на далёкой стоянке (50+ блоков от чужих, 45+ от столицы), когда язык разошёлся
// или (если языка ещё нет) когда она прожила отдельно 2 игровых дня. Племя исчезает, только когда умер последний.
const TRIBE_HUES = [205, 28, 125, 285, 355, 52, 170, 320, 90, 240];
const REL_STATUS = [[-0.5, 'война', '#e57373'], [-0.15, 'вражда', '#ffb74d'], [0.3, 'нейтралитет', '#9e9e9e'], [0.6, 'дружба', '#81c784'], [9, 'союз', '#4fc3f7']];
const relStatus = v => REL_STATUS.find(s => v < s[0]);
const CAMP_R0 = 14;

function tribeColor(id) {
  if (!id) return [0.6, 0.6, 0.6];
  const h = (TRIBE_HUES[(id - 1) % TRIBE_HUES.length] + Math.floor((id - 1) / TRIBE_HUES.length) * 17) % 360;
  return hsl(h, 0.75, 0.55);
}
const tribeCss = id => `rgb(${tribeColor(id).map(v => Math.round(v * 255)).join(',')})`;
const tribeOf = id => G.tribes && G.tribes[id];

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
function newTribe(rs, parentId = null, camp = null) {
  G.tribes = G.tribes || {}; G.rel = G.rel || {};
  const id = G.tribeSeq = (G.tribeSeq || 0) + 1;
  G.tribes[id] = { id, name: makeTribeName(rs), born: simTime, parent: parentId, founder: rs[0] ? rs[0].name : '', alive: true, capital: camp ? camp.id : null };
  G.rel[id] = {};
  for (const k in G.tribes) {
    if (+k === id) continue;
    const base = +k === parentId ? 0.1 : 0;
    G.rel[id][k] = base; G.rel[k] = G.rel[k] || {}; G.rel[k][id] = base;
  }
  for (const r of rs) r.tribe = id;
  if (camp) camp.tribe = id;
  return id;
}
function getRel(a, b) { return a === b ? 1 : (G.rel && G.rel[a] && G.rel[a][b]) || 0; }
function diplo(text) { G.diplo = G.diplo || []; G.diplo.unshift({ t: simTime, text }); if (G.diplo.length > 80) G.diplo.pop(); pushEvent(text); }
function changeRel(a, b, dv, why) {
  if (!a || !b || a === b || !G.rel || !G.rel[a] || !G.tribes[a] || !G.tribes[b]) return;
  const before = getRel(a, b), v = clamp(before + dv, -1, 1);
  G.rel[a][b] = v; G.rel[b][a] = v;
  G.relSt = G.relSt || {}; const pk = Math.min(a, b) + '-' + Math.max(a, b);
  const order = REL_STATUS.map(x => x[1]), s0 = G.relSt[pk] || relStatus(before)[1], cand = relStatus(v)[1];
  const i0 = order.indexOf(s0), i1 = order.indexOf(cand);
  if (i1 === i0) return;
  const edge = i1 > i0 ? REL_STATUS[i0][0] : REL_STATUS[i1][0];
  if (Math.abs(v - edge) < 0.06) return; // с запасом, чтобы статус не мигал
  G.relSt[pk] = cand;
  const A = G.tribes[a].name, B = G.tribes[b].name, up = i1 > i0;
  const txt = up
    ? { вражда: `${A} и ${B} заключили перемирие, но остались врагами`, нейтралитет: `${A} и ${B} помирились`, дружба: `${A} и ${B} подружились`, союз: `${A} и ${B} заключили союз` }[cand]
    : { война: `Племена ${A} и ${B} начали войну`, вражда: `Отношения ${A} и ${B} испортились: вражда`, нейтралитет: `Дружба ${A} и ${B} остыла`, дружба: `Союз ${A} и ${B} распался` }[cand];
  diplo(txt + (why ? ` (${why})` : ''));
}
const canMateTribes = (a, b) => a.tribe === b.tribe || getRel(a.tribe, b.tribe) >= 0.3;
const isEnemy = (a, b) => a.tribe !== b.tribe && getRel(a.tribe, b.tribe) <= -0.15;

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
function langSim(va, vb) {
  let both = 0, same = 0;
  for (const k in va) if (vb[k]) { both++; if (va[k] === vb[k]) same++; }
  return both >= 2 ? same / both : null;
}
function centroid(rs) { let x = 0, z = 0; for (const r of rs) { x += r.x; z += r.z; } return [x / rs.length, z / rs.length]; }

// ---------- стоянки ----------
const campRadius = c => CAMP_R0 + Math.min(14, Math.sqrt(c.pop || 0) * 3);
function newCamp(tribe, x, z, founder) {
  G.camps = G.camps || []; G.campSeq = (G.campSeq || 0) + 1;
  const c = { id: G.campSeq, tribe, x, z, founded: simTime, founder, pop: 0, siege: {}, empty: 0, lonely: 0, biome: BIOMES[biomeAt(x, z)].ru };
  G.camps.push(c);
  return c;
}
const campById = id => (G.camps || []).find(c => c.id === id);
function campAt(x, z) {
  let best = null, bd = 1e9;
  for (const c of G.camps || []) { const d = Math.hypot(x - c.x, z - c.z); if (d < campRadius(c) && d < bd) { bd = d; best = c; } }
  return best;
}
const territoryOwnerXZ = (x, z) => { const c = campAt(x, z); return c ? c.tribe : 0; };
function territorySize(tid) { let n = 0; for (const c of G.camps || []) if (c.tribe === tid) n += Math.round(Math.PI * campRadius(c) ** 2 / 100); return n; }
// робот дошёл до нового места: присоединиться к своей стоянке, основать новую (если он странник) или просто осесть
function arriveAt(r, x, z, explorer) {
  let near = null, nd = 1e9;
  for (const c of G.camps || []) { const d = Math.hypot(x - c.x, z - c.z); if (d < nd) { nd = d; near = c; } }
  if (near && near.tribe === r.tribe && nd < 30) { r.camp = near.id; }
  else if (explorer && (!near || nd >= 30)) {
    const c = newCamp(r.tribe, x, z, r.name); r.camp = c.id;
    diplo(`${r.name} из племени ${(tribeOf(r.tribe) || {}).name} основал стоянку в биоме «${c.biome}»`);
    lifeEvent(r, 'Основал новую стоянку: ' + c.biome);
  }
  const c = campById(r.camp);
  if (c) r.home = { x: c.x, z: c.z };
}

let tribeT = 0, campT = 0;
function tribeTick() {
  if (!G.tribes) return;
  if (simTime < tribeT || simTime < campT) { tribeT = 0; campT = 0; }
  if (simTime - campT >= 5) { campT = simTime; campsTick(5); }
  if (simTime - tribeT < 15) return;
  tribeT = simTime;
  const byTribe = {};
  for (const r of robots) (byTribe[r.tribe] = byTribe[r.tribe] || []).push(r);
  for (const id in G.tribes) if (G.tribes[id].alive && !byTribe[id]) {
    G.tribes[id].alive = false; G.tribes[id].died = simTime;
    for (const c of G.camps) if (c.tribe === +id) c.tribe = 0; // стоянки становятся ничьими
    diplo(`Племя ${G.tribes[id].name} исчезло: умер последний житель`);
  }
  const vocabs = {}; for (const id in byTribe) vocabs[id] = vocabOf(byTribe[id]);
  const ids = Object.keys(byTribe);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const s = langSim(vocabs[ids[i]], vocabs[ids[j]]); if (s !== null) changeRel(+ids[i], +ids[j], (s - 0.4) * 0.03, s > 0.5 ? 'похожий язык' : 'не понимают друг друга'); }
  splitCheck();
}
function campsTick(dt) {
  const camps = G.camps || [];
  for (const c of camps) {
    c.pop = 0; const present = {};
    for (const r of robots) {
      if (r.camp === c.id) c.pop++;
      if (isAdult(r) && Math.hypot(r.x - c.x, r.z - c.z) < campRadius(c)) present[r.tribe] = (present[r.tribe] || 0) + 1;
    }
    const def = present[c.tribe] || 0;
    // осада: враждебное племя вдвое многочисленнее держит стоянку
    let attacker = 0, an = 0;
    for (const t in present) if (+t !== c.tribe && (c.tribe === 0 || getRel(+t, c.tribe) <= -0.15) && present[t] > an) { an = present[t]; attacker = +t; }
    if (attacker && an >= 3 && an >= def * 2) {
      c.siege[attacker] = (c.siege[attacker] || 0) + dt;
      if (c.siege[attacker] >= 45) captureCamp(c, attacker, 'захватили осадой');
    } else for (const t in c.siege) { c.siege[t] -= dt; if (c.siege[t] <= 0) delete c.siege[t]; }
    // брошенная стоянка: мирно занимают те, кто там живёт; совсем пустая — исчезает
    if (c.pop === 0 && def === 0) {
      c.empty += dt;
      let other = 0, on = 0; for (const t in present) if (present[t] > on) { on = present[t]; other = +t; }
      if (other && c.empty > DAY) { captureCamp(c, other, 'заняли брошенную стоянку'); c.empty = 0; }
      else if (!other && c.empty > DAY * 2 && camps.filter(x => x.tribe === c.tribe).length > 1) { c.dead = true; diplo(`Стоянка «${c.biome}» племени ${(tribeOf(c.tribe) || { name: 'без племени' }).name} заброшена`); }
    } else c.empty = 0;
  }
  G.camps = camps.filter(c => !c.dead);
  for (const r of robots) if (r.camp && !campById(r.camp)) r.camp = null;
  // соседние стоянки разных племён — спор за землю (один раз на пару)
  const pairs = {};
  for (let i = 0; i < G.camps.length; i++) for (let j = i + 1; j < G.camps.length; j++) {
    const a = G.camps[i], b = G.camps[j];
    if (a.tribe && b.tribe && a.tribe !== b.tribe && Math.hypot(a.x - b.x, a.z - b.z) < (campRadius(a) + campRadius(b)) * 0.9) pairs[Math.min(a.tribe, b.tribe) + '-' + Math.max(a.tribe, b.tribe)] = 1;
  }
  for (const pk in pairs) { const [a, b] = pk.split('-').map(Number); changeRel(a, b, -0.004, 'спор за землю'); }
}
function captureCamp(c, tribe, how) {
  const old = c.tribe;
  c.tribe = tribe; c.siege = {};
  const oldName = old ? (tribeOf(old) || {}).name : 'без племени', newName = (tribeOf(tribe) || {}).name;
  diplo(`Племя ${newName} ${how} «${c.biome}» у ${oldName}`);
  if (old) changeRel(old, tribe, -0.3, 'потеряли стоянку');
  // жители проигравшего племени уходят к своим
  for (const r of robots) if (r.camp === c.id && r.tribe !== tribe) {
    const own = G.camps.filter(x => x.tribe === r.tribe && x !== c).sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z))[0];
    r.camp = own ? own.id : null; if (own) { r.home = { x: own.x, z: own.z }; r.goal = { x: own.x, z: own.z, until: simTime + 300 }; }
  }
}
// новое племя: далёкая стоянка + разошедшийся язык (или без языка — 2 дня отдельной жизни)
function splitCheck() {
  for (const c of G.camps || []) {
    if (!c.tribe) continue;
    const t = tribeOf(c.tribe); if (!t || t.capital === c.id) continue;
    const residents = robots.filter(r => r.camp === c.id && r.tribe === c.tribe);
    if (residents.length < 5) { c.lonely = 0; continue; }
    const cap = campById(t.capital) || G.camps.find(x => x.tribe === c.tribe && x !== c);
    const dCap = cap ? Math.hypot(c.x - cap.x, c.z - cap.z) : 999;
    const dOther = Math.min(999, ...G.camps.filter(x => x.tribe && x.tribe !== c.tribe).map(x => Math.hypot(c.x - x.x, c.z - x.z)));
    if (dCap < 45 || dOther < 50) { c.lonely = 0; continue; }
    c.lonely += 15;
    const capRes = robots.filter(r => cap && r.camp === cap.id);
    const sim = capRes.length ? langSim(vocabOf(residents), vocabOf(capRes)) : null;
    const diverged = sim !== null ? sim <= 0.5 && c.lonely >= 60 : c.lonely >= DAY * 2;
    if (!diverged) continue;
    const old = c.tribe, nid = newTribe(residents, old, c);
    G.tribes[nid].capital = c.id;
    const why = sim !== null ? `язык разошёлся на ${Math.round((1 - sim) * 100)}%` : `два дня жили отдельно, в ${Math.round(dCap)} блоках от столицы`;
    diplo(`Жители стоянки «${c.biome}» отделились от племени ${G.tribes[old].name} и основали племя ${G.tribes[nid].name} (${why})`);
    c.lonely = 0;
  }
}

// ---------- миникарта ----------
let miniBase = null;
function buildMiniBase() {
  const c = document.createElement('canvas'); c.width = MAPX; c.height = MAPZ;
  const x = c.getContext('2d'), img = x.createImageData(MAPX, MAPZ), d = img.data;
  for (let k = 0; k < MAPZ; k++) for (let i = 0; i < MAPX; i++) {
    const q = k * MAPX + i, o = q * 4, t = world.top[q], id = world.b[((t - 1) * MAPZ + k) * MAPX + i], bt = BIOMES[world.biome[q]];
    let col;
    if (world.wl[q] > t) { const dp = Math.min(1, (world.wl[q] - t) / 6); col = [40 - dp * 20, 110 - dp * 40, 170 - dp * 30]; }
    else if (world.hi[q] > t + 1) col = [38 * bt.leaf[0], 92 * bt.leaf[1], 40 * bt.leaf[2]];
    else col = id === B_GRASS ? [96 * bt.tint[0], 150 * bt.tint[1], 70 * bt.tint[2]] : id === B_SAND ? [210, 196, 150] : id === B_STONE || id === B_COBBLE ? [120, 120, 120] : [130, 98, 70];
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
  x.font = 'italic 12px Segoe UI, sans-serif'; x.textAlign = 'center';
  for (const f of world.forests || []) { x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillText(f.ru, (f.x + HX) * sx, Math.min(cv.height - 4, (f.z + HZ) * sz + f.r * sz + 12)); }
  for (const c of G.camps || []) {
    const col = tribeColor(c.tribe).map(v => Math.round(v * 255)).join(','), R = campRadius(c);
    x.fillStyle = `rgba(${col},0.28)`; x.strokeStyle = `rgba(${col},0.95)`; x.lineWidth = 1.5;
    x.beginPath(); x.ellipse((c.x + HX) * sx, (c.z + HZ) * sz, R * sx, R * sz, 0, 0, 7); x.fill(); x.stroke();
    if (Object.keys(c.siege).length) { x.strokeStyle = '#e57373'; x.setLineDash([4, 3]); x.lineWidth = 2.5; x.stroke(); x.setLineDash([]); }
    const px = (c.x + HX) * sx, pz = (c.z + HZ) * sz;
    x.fillStyle = '#fff'; x.fillRect(px - 0.5, pz - 9, 1.5, 9);
    x.fillStyle = `rgb(${col})`; x.beginPath(); x.moveTo(px + 1, pz - 9); x.lineTo(px + 8, pz - 6.5); x.lineTo(px + 1, pz - 4); x.fill();
  }
  for (const r of robots) { x.fillStyle = tribeCss(r.tribe); x.fillRect((r.x + HX) * sx - 2, (r.z + HZ) * sz - 2, 4, 4); if (r.genes.wander >= 0.6) { x.strokeStyle = '#fff'; x.lineWidth = 1; x.strokeRect((r.x + HX) * sx - 2.5, (r.z + HZ) * sz - 2.5, 5, 5); } }
  for (const zb of world.zombies) { x.fillStyle = '#76ff03'; x.fillRect((zb.x + HX) * sx - 1.5, (zb.z + HZ) * sz - 1.5, 3, 3); }
  x.font = 'bold 15px Segoe UI, sans-serif'; x.textAlign = 'center';
  for (const id in G.tribes) {
    const t = G.tribes[id]; if (!t.alive) continue;
    const c = campById(t.capital) || (G.camps || []).find(c => c.tribe === +id); if (!c) continue;
    const px = (c.x + HX) * sx, pz = (c.z + HZ) * sz - 13;
    x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(t.name, px, pz);
    x.fillStyle = tribeCss(+id); x.fillText(t.name, px, pz);
  }
  x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.beginPath(); x.arc((cam.tx + HX) * sx, (cam.tz + HZ) * sz, 6, 0, 7); x.stroke();
}
