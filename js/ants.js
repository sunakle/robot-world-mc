'use strict';
// ================= Колония как у муравьёв: матка, касты, подземное гнездо, общий склад еды =================
// У каждой стоянки своя матка — только она откладывает яйца (за еду со склада). Остальные бесплодны и с рождения
// получают должность. Иерархия: матка → солдаты → строители → фуражиры → няньки; разведчики — особняком.
const ROLES = {
  queen: { ru: 'Матка', rank: 0, col: '#ffd54f', desc: 'Единственная, кто откладывает яйца. Живёт втрое дольше, сидит в гнезде.' },
  soldier: { ru: 'Солдат', rank: 1, col: '#e57373', desc: 'Охраняет стоянку, первым бросается на зомби и чужаков.' },
  builder: { ru: 'Строитель', rank: 2, col: '#ffb74d', desc: 'Роет подземное гнездо: ход, камеры, своды; землю выносит наверх в муравейник.' },
  forager: { ru: 'Фуражир', rank: 3, col: '#81c784', desc: 'Собирает плоды и мясо и несёт на общий склад гнезда.' },
  nurse: { ru: 'Нянька', rank: 4, col: '#ce93d8', desc: 'Держится возле матки и малышей в гнезде.' },
  scout: { ru: 'Разведчик', rank: 5, col: '#4fc3f7', desc: 'Странник: ищет новые места и основывает стоянки.' },
  young: { ru: 'Малыш', rank: 6, col: '#9e9e9e', desc: 'Ещё растёт; должность получит, когда повзрослеет.' },
};
const ROLE_SHARE = { builder: 0.24, forager: 0.4, soldier: 0.2, nurse: 0.16 };
const EGG_COST = 1, QUEEN_LIFE = 3;
const roleOf = r => ROLES[r.role] || ROLES.young;
const foodCount = st => { let n = 0; for (const k in st || {}) n += st[k]; return n; };

function setRole(r, role, why) {
  if (r.role === role) return;
  r.role = role;
  if (role === 'queen') r.goal = null; // стареет втрое медленнее (см. updateRobot)
  if (why) lifeEvent(r, `Должность: ${ROLES[role].ru}${why === true ? '' : ' (' + why + ')'}`);
}
// новая особь: разведчик по гену, иначе — должность, которой в колонии не хватает
function assignRole(r) {
  if (isExplorer(r)) return setRole(r, 'scout', true);
  const cnt = { builder: 0, forager: 0, soldier: 0, nurse: 0 }; let n = 0;
  for (const o of robots) if (o !== r && o.camp === r.camp && cnt[o.role] !== undefined) { cnt[o.role]++; n++; }
  let best = 'forager', bd = -9;
  const c = campById(r.camp), built = c && c.nest && !nestNext(c.nest);
  for (const k in ROLE_SHARE) { if (k === 'builder' && built && cnt.builder) continue; const d = ROLE_SHARE[k] * (n + 1) - cnt[k]; if (d > bd) { bd = d; best = k; } }
  setRole(r, best, true);
}
const queenOf = c => robots.find(r => r.role === 'queen' && r.camp === c.id && !r.dead);

// ---------- гнездо: ход вниз и камеры под сводом ----------
// клетка плана: колонна (i,k), до какого пола рыть (f) и нужен ли свод на уровне поверхности
function planNest(c) {
  const ci = Math.floor(c.x + HX), ck = Math.floor(c.z + HZ);
  const T = (i, k) => world.top[k * MAPX + i];
  const free = (i, k) => i > 2 && k > 2 && i < MAPX - 3 && k < MAPZ - 3 && world.wl[k * MAPX + i] <= T(i, k) && world.get(i, T(i, k) - 1, k) !== B_LOG && !world.wetNear(i - HX + 0.5, k - HZ + 0.5);
  // площадка: главная камера 5×5, коридор и кладовая к западу, вход ступенями к востоку
  const area = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) area.push([dx, dz]);
  for (const dx of [-3, -4]) area.push([dx, 0]);
  for (let dx = -5; dx >= -7; dx--) for (const dz of [-1, 0, 1]) area.push([dx, dz]);
  let best = null, bs = -1e9, tried = 0;
  for (let d = 0; d < 30 && tried < 12; d++) for (let a = 0; a < 16; a++) {
    const i = ci + Math.round(Math.sin(a / 16 * 6.283) * d), k = ck + Math.round(Math.cos(a / 16 * 6.283) * d);
    if (i < 10 || k < 6 || i > MAPX - 10 || k > MAPZ - 6) continue;
    let h = 1e9, hx = 0, good = true;
    for (const [dx, dz] of area) { if (!free(i + dx, k + dz)) { good = false; break; } const t = T(i + dx, k + dz); h = Math.min(h, t); hx = Math.max(hx, t); }
    if (!good || hx - h > 2 || h < world.sea + 4 || h < 6) continue; // рельеф гуляет не больше чем на 2 блока
    for (let dx = 3; dx <= 6; dx++) if (!free(i + dx, k) || T(i + dx, k) > h + 3) good = false;
    if (!good) continue;
    if (!route(c.x, c.z, i + 6 - HX + 0.5, k - HZ + 0.5)) continue; // от стоянки до входа должна быть тропа
    // из годных мест выбираем то, где вода недалеко (но не вплотную) и ближе к стоянке
    tried++;
    const w = nearestWaterTo(i - HX + 0.5, k - HZ + 0.5), wd = w ? Math.hypot(w.x - (i - HX), w.z - (k - HZ)) : 99;
    const sc = -Math.max(0, wd - 8) * 1.5 - d * 1.5;
    if (sc <= bs) continue;
    bs = sc;
    const cells = [];
    for (let dx = 6; dx >= 3; dx--) cells.push({ i: i + dx, k, f: h - 2 + (dx - 3) }); // вход: ступени вниз
    const room = (dx, dz) => cells.push({ i: i + dx, k: k + dz, f: h - 3, ry: T(i + dx, k + dz) - 1 }); // свод — верхний блок колонны
    for (let dx = 2; dx >= -2; dx--) for (const dz of [0, -1, 1, -2, 2]) room(dx, dz);
    for (const dx of [-3, -4]) room(dx, 0);
    for (let dx = -5; dx >= -7; dx--) for (const dz of [0, -1, 1]) room(dx, dz);
    best = { i, k, h, x: i - HX + 0.5, z: k - HZ + 0.5, cells, next: 0, dug: 0, mound: 0 };
  }
  return best;
}
const nestCellDone = (n, cl) => world.top[cl.k * MAPX + cl.i] <= cl.f && (cl.ry === undefined || world.get(cl.i, cl.ry, cl.k) === B_ROOF);
function nestNext(n) {
  while (n.next < n.cells.length && nestCellDone(n, n.cells[n.next])) n.next++;
  return n.cells[n.next] || null;
}
// один «укус» строителя: укрепить свод или вынуть блок
function nestStep(r, n, cl) {
  practice(r, 'dig', 2); r.st.digs++; r.energy -= 1.5;
  if (Math.random() > 0.45 + 0.5 * r.skill.dig + r.tools.shovel * 0.1) { annoy(r, 0.01); return; }
  if (cl.ry !== undefined && world.get(cl.i, cl.ry, cl.k) !== B_ROOF) { if (world.get(cl.i, cl.ry, cl.k)) world.setB(cl.i, cl.ry, cl.k, B_ROOF); else cl.ry = undefined; return; }
  const t = world.top[cl.k * MAPX + cl.i]; if (t <= cl.f) return;
  const id = world.get(cl.i, t - 1, cl.k); if (!DIGGABLE(id) || id === B_ROOF) { cl.f = t; return; }
  world.setB(cl.i, t - 1, cl.k, B_AIR);
  n.dug++; G.mined++; r.st.nest = (r.st.nest || 0) + 1; r.d[9] = Math.max(0, r.d[9] - 0.05);
  if (DROP[id]) bagAdd(r, DROP[id]);
  first('nest', `${r.name} начал рыть первое подземное гнездо`);
  if (!nestNext(n)) { const c = campById(r.camp); diplo(`Колония ${(tribeOf(r.tribe) || {}).name} достроила гнездо (${c ? c.biome : ''}): вход, камера, коридор и кладовая под землёй`); }
}
// яма рядом с гнездом (не часть его плана): колонна ниже соседей хотя бы на блок
function findHole(r, n) {
  if (r.hole && world.top[r.hole.q] < r.hole.t + 1) return r.hole;
  r.hole = null;
  if (!n.cellSet) n.cellSet = new Set(n.cells.map(c => c.k * MAPX + c.i));
  for (let t = 0; t < 40; t++) {
    const i = n.i + Math.round(rnd(-13, 13)), k = n.k + Math.round(rnd(-13, 13)), q = k * MAPX + i;
    if (i < 1 || k < 1 || i >= MAPX - 1 || k >= MAPZ - 1 || n.cellSet.has(q) || Math.abs(i - n.i - 6) + Math.abs(k - n.k) <= 2) continue;
    if (world.wl[q] > world.top[q] || world.hi[q] > world.top[q] + 1) continue; // вода и колонны под сводом/кроной — не трогаем
    let sum = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) sum += world.top[q + dz * MAPX + dx];
    if (sum / 8 - world.top[q] >= 0.9) return (r.hole = { q, t: world.top[q], x: i - HX + 0.5, z: k - HZ + 0.5 });
  }
  return null;
}
// землю — наверх, в холмик муравейника у входа
function moundSpot(n) { const a = n.mound * 2.4; return { x: n.x + 6 + Math.round(Math.sin(a) * 1.5), z: n.z + Math.round(Math.cos(a) * 1.5) }; }
function dumpSoil(r, n) {
  const p = moundSpot(n), k = ['dirt', 'gravel', 'sand', 'clay', 'cobble'].find(k => r.inv[k]);
  if (!k) return;
  if (world.height(p.x, p.z) < n.h + 3 && world.place(p.x, p.z, k === 'cobble' ? B_COBBLE : B_DIRT)) { bagTake(r, k); r.st.built++; G.built++; }
  else bagTake(r, k);
  n.mound++;
}
const soilIn = r => (r.inv.dirt || 0) + (r.inv.gravel || 0) + (r.inv.sand || 0) + (r.inv.clay || 0) + (r.inv.cobble || 0);
const homeOf = c => c.nest && c.nest.dug > 8 ? { x: c.nest.x - 1, z: c.nest.z } : { x: c.x, z: c.z }; // где матка, склад и ночлег

// ---------- склад ----------
function depositFood(r, c) {
  c.food = c.food || {}; let n = 0;
  for (const k of [...Object.keys(FOODS), 'meat', 'cooked']) if (r.inv[k]) { c.food[k] = (c.food[k] || 0) + r.inv[k]; n += r.inv[k]; delete r.inv[k]; }
  if (n) { r.st.stored = (r.st.stored || 0) + n; r.d[9] = Math.max(0, r.d[9] - 0.1); r.chem.reward += 0.2; first('store', `${r.name} первым принёс еду на склад колонии`); }
}
function eatFromStore(r, c) {
  const st = c.food; if (!st) return false;
  const k = ['cooked', ...Object.keys(FOODS), 'meat'].find(k => st[k] > 0); if (!k) return false;
  if (!--st[k]) delete st[k];
  r.energy = Math.min(100, r.energy + (k === 'cooked' ? 50 : FOODS[k] ? FOODS[k].e : 25)); r.st.food++;
  if (FOODS[k]) giveBuff(r, FOODS[k].buff);
  return true;
}

// ---------- такт колонии: матки, яйца, должности ----------
let colonyT = 0;
function colonyTick() {
  if (!G.camps) return;
  if (simTime < colonyT) colonyT = 0;
  if (simTime - colonyT < 1) return;
  colonyT = simTime;
  for (const c of G.camps) {
    const res = robots.filter(r => r.camp === c.id && !r.dead);
    let q = res.find(r => r.role === 'queen');
    // нет матки — через 20 с её место занимает самая крепкая взрослая особь стоянки
    if (!q) {
      c.noQueen = (c.noQueen || 0) + 1;
      const cand = res.filter(r => isAdult(r) && r.role !== 'scout' && stageOf(r) !== 'Старик');
      if (c.noQueen >= 20 && cand.length >= 2) {
        q = cand.reduce((a, b) => (b.health + b.energy > a.health + a.energy ? b : a));
        setRole(q, 'queen', 'новая матка стоянки'); c.noQueen = 0;
        diplo(`У стоянки «${c.biome}» племени ${(tribeOf(c.tribe) || {}).name} новая матка — ${q.name}`);
      }
    } else c.noQueen = 0;
    // матку кормят: со склада и из сумок тех, кто рядом (трофаллаксис — как у муравьёв)
    if (q && q.energy < 75) {
      if (Math.hypot(q.x - homeOf(c).x, q.z - homeOf(c).z) < 4 && eatFromStore(q, c)) lifeEvent(q, 'Поела со склада');
      else for (const o of res) if (o !== q && Math.hypot(o.x - q.x, o.z - q.z) < 3) { const k = Object.keys(FOODS).find(k => o.inv[k]) || (o.inv.meat && 'meat'); if (k) { bagTake(o, k); q.energy = Math.min(100, q.energy + (FOODS[k] ? FOODS[k].e : 25)); o.st.fed = (o.st.fed || 0) + 1; o.chem.reward += 0.2; first('feed', `${o.name} первым покормил матку`); break; } }
    }
    // матка откладывает яйцо, если на складе есть еда (или она сама сыта)
    if (q && isAdult(q) && simTime > (q.eggT || 0) && robots.length + births.length < SET.maxPop) {
      const have = foodCount(c.food);
      if (have >= EGG_COST + 1 || q.energy > 60) { // яйцо — из запасов склада или из сил самой матки
        if (have >= EGG_COST + 1) for (let n = 0; n < EGG_COST && foodCount(c.food); n++) { const k = Object.keys(c.food)[0]; if (!--c.food[k]) delete c.food[k]; }
        if (have < EGG_COST + 1) q.energy -= 10;
        const mates = res.filter(r => r !== q && isAdult(r));
        const ch = makeChild(q, mates.length ? pick(mates) : q);
        births.push(ch); q.st.kids++;
        q.eggT = simTime + 6 + (1 - q.genes.fertility) * 8 + res.length * 0.15;
        first('egg', `Матка ${q.name} отложила первое яйцо`);
      }
    }
    // повзрослевшие получают должность; строители появляются, если гнезда ещё нет
    for (const r of res) if ((!r.role || r.role === 'young') && isAdult(r)) assignRole(r);
    // гнездо готово — лишние строители уходят в фуражиры
    if (c.nest && !nestNext(c.nest)) res.filter(r => r.role === 'builder').slice(2).forEach(r => setRole(r, 'forager', 'гнездо достроено'));
    if (!c.nest && res.filter(r => r.role === 'builder').length === 0) {
      const w = res.find(r => r.role === 'forager' || r.role === 'nurse');
      if (w && res.length >= 3) setRole(w, 'builder', 'колонии нужно гнездо');
    }
  }
}

// ---------- работа по должности: куда идти и что делать ----------
// возвращает { x, z, label, act, near } или null — тогда робот живёт по обычным влечениям
function roleJob(r) {
  const c = campById(r.camp); if (!c || !r.role || r.role === 'young' || r.role === 'scout' || r.goal) return null;
  const home = homeOf(c), dh = Math.hypot(home.x - r.x, home.z - r.z), R = reach(r);
  const job = (x, z, label, act, nearD = R + 0.4) => ({ x, z, label, act, near: Math.hypot(x - r.x, z - r.z) < nearD });
  // хочет есть, а на складе есть еда — к складу (последние запасы — матке и малышам)
  if (r.d[0] > 0.4 && foodCount(c.food) > (r.role === 'queen' || stageOf(r) === 'Малыш' ? 0 : 3)) { if (dh < 3) { eatFromStore(r, c); return null; } return job(home.x, home.z, 'идёт поесть на склад', null); }
  // ночь — все, кроме солдат, ночуют в гнезде
  if (isNight() && c.nest && c.nest.dug > 8 && r.role !== 'soldier') { // у каждого своё место в камерах, а не куча в одной точке
    const beds = c.nest.cells.filter(b => b.ry !== undefined && world.top[b.k * MAPX + b.i] <= b.f), b = beds.length ? beds[r.id % beds.length] : null;
    const bx = b ? b.i - HX + 0.5 : home.x, bz = b ? b.k - HZ + 0.5 : home.z;
    return job(bx, bz, 'ночует в гнезде', 8, 1.2);
  }
  switch (r.role) {
    case 'queen': if (r.energy < 55 && !foodCount(c.food)) return null; // никто не кормит — сама идёт за едой
      return dh > 2 ? job(home.x, home.z, 'матка возвращается в гнездо', null) : job(home.x, home.z, 'матка в гнезде', 8, 3);
    case 'nurse': {
      const q = queenOf(c), t = q || home;
      const has = Object.keys(FOODS).some(k => r.inv[k]);
      if (q && q.energy < 70 && !has) { const f = r.near.food; if (f && f.t === 'fruit') return job(f.x, f.z, 'нянька ищет еду для матки', 5, R - 0.2); }
      return job(t.x, t.z, Math.hypot(t.x - r.x, t.z - r.z) > 3 ? 'нянька идёт к матке' : 'нянька возле матки', null, 3);
    }
    case 'soldier': {
      const z = nearestZombie(r, 14), en = r.near.enemy;
      const foe = z && Math.hypot(z.x - c.x, z.z - c.z) < campRadius(c) + 6 ? z : en;
      if (foe) return job(foe.x, foe.z, 'солдат защищает колонию', 9, R - 0.1);
      return Math.hypot(c.x - r.x, c.z - r.z) > campRadius(c) * 0.6 ? job(c.x, c.z, 'солдат в дозоре', null) : null;
    }
    case 'builder': {
      if (!c.nest) { if (simTime - (c.nestTry || -99) < 30) return null; c.nestTry = simTime; c.nest = planNest(c); if (!c.nest) return null; } // место ищем не чаще раза в 30 с
      const n = c.nest;
      if (soilIn(r) >= 4 || (soilIn(r) && !nestNext(n))) { const p = moundSpot(n); const j = job(p.x, p.z, 'выносит землю в муравейник', null, 2); if (j.near) dumpSoil(r, n); return j; }
      const cl = nestNext(n);
      if (!cl) { // гнездо готово — засыпаем ямы вокруг, чтобы у муравейника было ровно
        const hole = findHole(r, n); if (!hole) return null;
        const j = job(hole.x, hole.z, 'засыпает яму у гнезда', null, R + 0.6);
        if (j.near && world.place(hole.x, hole.z, B_DIRT)) { r.st.built++; G.built++; r.hole = null; }
        return j;
      }
      return job(cl.i - HX + 0.5, cl.k - HZ + 0.5, 'роет гнездо', 4, R + 1.2);
    }
    case 'forager': {
      const carried = Object.keys(FOODS).reduce((s, k) => s + (r.inv[k] || 0), 0) + (r.inv.meat || 0);
      if (carried >= 2 || (carried && (isNight() || r.d[3] > 0.6))) { const j = job(home.x, home.z, 'несёт еду на склад', null, 2.5); if (j.near) depositFood(r, c); return j; }
      const f = r.near.food; if (f && f.t !== 'melon') return job(f.x, f.z, 'собирает еду', 5, R - 0.2);
      const t = r.near.tree; if (t && t.apples > 0) return job(t.x, t.z, 'трясёт дерево', 3, R + 0.8);
      if (r.mem.tree && Math.hypot(r.mem.tree.x - r.x, r.mem.tree.z - r.z) > 6) return job(r.mem.tree.x, r.mem.tree.z, 'идёт за едой к дереву', null);
      return null;
    }
  }
  return null;
}

// ---------- поиск пути по рельефу: шаг вверх не больше блока, вниз — до трёх, глубокую воду обходим ----------
// (как муравьи, что ходят по своим тропам; без этого роботы упирались в склоны)
const PF_R = 48, PF_N = PF_R * 2 + 1, PF_PREV = new Int32Array(PF_N * PF_N), PF_Q = new Int32Array(PF_N * PF_N);
function route(x0, z0, x1, z1) {
  const ci = Math.floor(x0 + HX), ck = Math.floor(z0 + HZ), ti = Math.floor(x1 + HX), tk = Math.floor(z1 + HZ);
  if (Math.abs(ti - ci) >= PF_R || Math.abs(tk - ck) >= PF_R) return null;
  const oi = ci - PF_R, ok = ck - PF_R, id = (i, k) => (k - ok) * PF_N + (i - oi);
  const H = (i, k) => world.top[k * MAPX + i], wet = (i, k) => world.wl[k * MAPX + i] - world.top[k * MAPX + i] > 0.8;
  PF_PREV.fill(-1);
  // ищем от цели к роботу: тогда у каждой клетки «следующая» — её родитель
  let qh = 0, qt = 0; const s = id(ti, tk); PF_PREV[s] = s; PF_Q[qt++] = s;
  const goal = id(ci, ck);
  while (qh < qt) {
    const c = PF_Q[qh++]; if (c === goal) break;
    const i = c % PF_N + oi, k = (c / PF_N | 0) + ok, h = H(i, k);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + dx, b = k + dz;
      if (a < 0 || b < 0 || a >= MAPX || b >= MAPZ || Math.abs(a - ci) > PF_R || Math.abs(b - ck) > PF_R) continue;
      const n = id(a, b); if (PF_PREV[n] >= 0) continue;
      const ha = H(a, b);
      if (h - ha > 1 || (ha - h > 3 && n !== goal) || (wet(a, b) && n !== goal)) continue; // робот пойдёт из (a,b) в (i,k)
      PF_PREV[n] = c; PF_Q[qt++] = n;
    }
  }
  if (PF_PREV[goal] < 0) return null;
  const out = []; let c = goal;
  while (c !== s && out.length < 200) { c = PF_PREV[c]; out.push([c % PF_N + oi - HX + 0.5, (c / PF_N | 0) + ok - HZ + 0.5]); }
  return out;
}
// следующая точка пути к цели (путь пересчитываем раз в 3 с или когда цель сдвинулась)
function pathTo(r, x, z) {
  const P = r.path;
  if (!P || Math.hypot(P.x - x, P.z - z) > 2 || simTime - P.t > 3) {
    const pts = route(r.x, r.z, x, z);
    r.path = { x, z, t: simTime, pts: pts || [], i: 0 };
  }
  const p = r.path;
  while (p.i < p.pts.length - 1 && Math.hypot(p.pts[p.i][0] - r.x, p.pts[p.i][1] - r.z) < 0.8) p.i++;
  const w = p.pts[Math.min(p.i + 2, p.pts.length - 1)]; // смотрим на пару клеток вперёд — меньше петляния
  return w ? { x: w[0], z: w[1] } : { x, z };
}
