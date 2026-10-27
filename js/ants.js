'use strict';
// ================= Колония как у муравьёв: матка, касты, подземный муравейник, склад-кучки еды =================
// У каждой стоянки своя матка — только она откладывает яйца. Остальные бесплодны и с рождения получают должность.
// Иерархия: матка → солдаты → строители → фуражиры → няньки; разведчики — особняком.
const ROLES = {
  queen: { ru: 'Матка', rank: 0, col: '#ffd54f', desc: 'Единственная, кто откладывает яйца. Живёт втрое дольше, сидит в царской камере.' },
  soldier: { ru: 'Солдат', rank: 1, col: '#e57373', desc: 'Охраняет стоянку и входы, первым бросается на зомби и чужаков.' },
  builder: { ru: 'Строитель', rank: 2, col: '#ffb74d', desc: 'Роет муравейник по «архитектуре» своего племени, землю выносит наверх в холм.' },
  forager: { ru: 'Фуражир', rank: 3, col: '#81c784', desc: 'Собирает плоды и мясо и складывает в кучки в кладовой.' },
  nurse: { ru: 'Нянька', rank: 4, col: '#ce93d8', desc: 'Держится возле матки и малышей, носит матке еду.' },
  scout: { ru: 'Разведчик', rank: 5, col: '#4fc3f7', desc: 'Странник: ищет новые места и основывает стоянки.' },
  young: { ru: 'Малыш', rank: 6, col: '#9e9e9e', desc: 'Ещё растёт в детской камере; должность получит, когда повзрослеет.' },
};
const ROLE_SHARE = { builder: 0.24, forager: 0.4, soldier: 0.2, nurse: 0.16 };
const EGG_COST = 1, QUEEN_LIFE = 3;
const roleOf = r => ROLES[r.role] || ROLES.young;
const ROOM_RU = { store: 'Кладовая', queen: 'Царская камера', nursery: 'Детская', winter: 'Зимовальная', solar: 'Солярий', new: 'Новая камера' };

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
  for (const k in ROLE_SHARE) { if (k === 'builder' && built && cnt.builder >= 2) continue; const d = ROLE_SHARE[k] * (n + 1) - cnt[k]; if (d > bd) { bd = d; best = k; } }
  setRole(r, best, true);
}
const queenOf = c => robots.find(r => r.role === 'queen' && r.camp === c.id && !r.dead);

// ---------- «архитектура» племени: у каждого племени свой стиль муравейника (наследуется с мутациями) ----------
function randomArch() {
  return { depth: 7 + (Math.random() * 5 | 0), cw: Math.random() < 0.5, roomW: 2 + (Math.random() * 3 | 0), roomH: 2 + (Math.random() < 0.5 ? 1 : 0),
    branchLen: 2 + (Math.random() * 4 | 0), slope: Math.random(), fork: Math.random(), entr: 1 + (Math.random() * 3 | 0), mound: 2 + (Math.random() * 3 | 0), side: Math.random() < 0.5 ? 1 : -1 };
}
function mutateArch(a) {
  const m = { ...a }, j = (v, d, lo, hi) => clamp(Math.round(v + (Math.random() - 0.5) * 2 * d), lo, hi);
  m.depth = j(a.depth, 1.5, 6, 12); m.roomW = j(a.roomW, 1, 2, 4); m.branchLen = j(a.branchLen, 1.5, 2, 7); m.entr = j(a.entr, 1, 1, 3); m.mound = j(a.mound, 1, 1, 4);
  m.slope = clamp(a.slope + (Math.random() - 0.5) * 0.5, 0, 1); m.fork = clamp(a.fork + (Math.random() - 0.5) * 0.5, 0, 1);
  if (Math.random() < 0.3) m.cw = !a.cw; if (Math.random() < 0.3) m.side = -a.side; if (Math.random() < 0.25) m.roomH = a.roomH === 2 ? 3 : 2;
  return m;
}
function archOf(tid) {
  const t = G.tribes && G.tribes[tid]; if (!t) return randomArch();
  if (!t.arch) { const p = t.parent && G.tribes[t.parent]; t.arch = p && p.arch ? mutateArch(p.arch) : randomArch(); }
  return t.arch;
}
const ARCH_RU = a => `глубина ${a.depth}, камеры ${a.roomW * 2 + 1}×${a.roomH}, ветки ${a.branchLen}, входов ${a.entr}, ствол ${a.cw ? 'по часовой' : 'против часовой'}, ${a.slope > 0.5 ? 'ходы уходят вниз' : 'ходы ровные'}${a.fork > 0.5 ? ', ветвятся' : ''}`;

// ---------- муравейник: план в плоскости (u — вдоль, v — поперёк, y — глубина) ----------
// Ствол — винтовая лестница 3×3 вокруг земляного столба (вниз на блок за шаг), от неё в стороны — ходы и камеры,
// сверху — наклонные входы и холм из вынесенной земли. Каждая клетка: пол f и высота h (пусто от f до f+h-1).
const RING = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];
function nestFrame(n) {
  const du = n.ax ? [0, n.sg] : [n.sg, 0], dv = n.ax ? [n.sg, 0] : [0, -n.sg];
  return (u, v) => [n.i + u * du[0] + v * dv[0], n.k + u * du[1] + v * dv[1]];
}
function planNest(c, arch, from) {
  const ci = Math.floor(c.x + HX), ck = Math.floor(c.z + HZ);
  let best = null, bs = -1e9, tried = 0;
  for (let d = 2; d < 30 && tried < 14; d++) for (let a = 0; a < 12; a++) for (const ax of [0, 1]) {
    const i = ci + Math.round(Math.sin(a / 12 * 6.283) * d), k = ck + Math.round(Math.cos(a / 12 * 6.283) * d);
    const n = { i, k, ax, sg: arch.side, arch: { ...arch } };
    const plan = buildPlan(n);
    if (!plan) continue;
    for (let g = 0; g < 4 && plan.rooms.length < 4; g++) growNest(plan, { ...plan.arch, slope: Math.max(plan.arch.slope, 0.5) }, 'new');
    assignPurposes(plan);
    if (from && !route(from.x, from.z, plan.exit.x, plan.exit.z, plan.exit.y, from.y)) continue; // от строителя до входа должна быть тропа
    tried++;
    const w = nearestWaterTo(i - HX, k - HZ), wd = w ? Math.hypot(w.x - (i - HX), w.z - (k - HZ)) : 99;
    const sc = -Math.max(0, wd - 10) * 1.2 - d * 1.2 + plan.rooms.length * 3;
    if (sc > bs) { bs = sc; best = plan; }
  }
  return best;
}
function buildPlan(n) {
  let A = n.arch; const at = nestFrame(n), T = (i, k) => world.top[k * MAPX + i];
  const okCol = (i, k) => i > 2 && k > 2 && i < MAPX - 3 && k < MAPZ - 3 && world.wl[k * MAPX + i] <= T(i, k); // под деревом рыть можно
  const noLog = (i, k) => world.get(i, T(i, k) - 1, k) !== B_LOG;
  // поверхность над стволом: ровная, не у воды, с запасом грунта на глубину
  let S0 = 1e9, Sx = 0;
  for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { const [i, k] = at(u, v); if (!okCol(i, k) || !noLog(i, k)) return null; S0 = Math.min(S0, T(i, k)); Sx = Math.max(Sx, T(i, k)); }
  if (Sx - S0 > 1 || S0 < world.sea + 3 || S0 < 12) return null;
  if (S0 - A.depth - 3 < 2) A = n.arch = { ...A, depth: S0 - 5 }; // грунта мало — роем, сколько есть
  if (world.wetNear(n.i - HX + 0.5, n.k - HZ + 0.5)) return null;
  const air = new Map(), floors = new Map(), K = (i, y, k) => (k * MAPX + i) * 64 + y;
  const cells = [], rooms = [], segs = [];
  // клетка годится: её пустоты не съедают чужой пол, её пол не висит над пустотой, сверху остаётся грунт
  const no = () => false;
  const fits = (i, k, f, h, open) => {
    if (!okCol(i, k) || f < 2) return no('col');
    if (open && !noLog(i, k)) return no('log');
    if (!open && f + h > T(i, k) - 1) return no('ceil');
    if (air.has(K(i, f - 1, k))) return no('floorAir');
    for (let y = f; y < f + h; y++) if (floors.has(K(i, y, k))) return no('eatFloor');
    return true;
  };
  const add = (seg, i, k, f, h, from, extra) => {
    const cl = { i, k, f, h, seg, from, ...extra };
    for (let y = f; y < f + h; y++) air.set(K(i, y, k), seg);
    floors.set(K(i, f - 1, k), seg);
    cells.push(cl); return cl;
  };
  const ft = S0 - 4; // верх ствола: под одним блоком грунта
  // 1) главный вход: наклонный ход с поверхности к верху ствола (со стороны -u)
  const ramp = [];
  for (let j = 0, u = -2; j < 8; j++, u--) {
    const [i, k] = at(u, 0), f = ft + j, s = T(i, k), open = f + 3 > s - 1;
    ramp.push({ i, k, f: Math.min(f, s), h: open ? Math.max(3, s - f + 1) : 3, open });
    if (f >= s - 1) break;
  }
  if (ramp[ramp.length - 1].f < T(ramp[ramp.length - 1].i, ramp[ramp.length - 1].k) - 1) return null;
  let prev = null;
  for (let j = ramp.length - 1; j >= 0; j--) { // роют от входа вглубь
    const r = ramp[j]; if (!fits(r.i, r.k, r.f, r.h, r.open)) return null;
    prev = add('entrance', r.i, r.k, r.f, r.h, prev);
  }
  const exitCell = cells[0];
  // 2) ствол: винтовая лестница вниз
  const ring = A.cw ? RING : [RING[0], ...RING.slice(1).reverse()];
  const fb = S0 - A.depth, trunk = [];
  for (let s = 0, f = ft; f >= fb; s++, f--) {
    const [u, v] = ring[s % 8], [i, k] = at(u, v);
    if (!fits(i, k, f, 3)) return null;
    prev = add('trunk', i, k, f, 3, prev, { u, v }); trunk.push(prev);
  }
  // 3) ветки к камерам: от клеток ствола, что смотрят в стороны (u = ±1, v = 0)
  const branch = (from, side, f0, len, slope, purpose) => {
    const segId = 'b' + segs.length, tmp = []; let f = f0, pr = from, u = from.u;
    for (let s = 0; s < len; s++) {
      u += side; const fn = s > 0 && Math.random() < slope ? f - 1 : f;
      for (const v of [0, -1]) { const [i, k] = at(u, v); if (!fits(i, k, fn, 3)) return false; }
      tmp.push({ u, f: fn }); f = fn;
    }
    // камера: сплюснутый овал шириной 2W+1, высотой H, толщиной 3
    const W = A.roomW, H = A.roomH, uc = u + side * (W + 1), roomCells = [];
    for (let du = -W; du <= W; du++) for (const v of [0, -1, 1]) {
      const [i, k] = at(uc + du, v), h = Math.abs(du) === W || v === 1 ? Math.max(2, H - 1) : H;
      if (!fits(i, k, f, h)) return false;
      roomCells.push({ u: uc + du, v, i, k, h });
    }
    // всё влезло — записываем
    for (const t of tmp) for (const v of [0, -1]) { const [i, k] = at(t.u, v); pr = add(segId, i, k, t.f, 3, pr); }
    const door = pr;
    roomCells.sort((a, b) => Math.abs(a.u - (uc - side * W)) - Math.abs(b.u - (uc - side * W)) || Math.abs(a.v) - Math.abs(b.v));
    const rc = [];
    for (const q of roomCells) rc.push(add(segId + 'r', q.i, q.k, f, q.h, nearestDug(rc, q, door), { u: q.u, v: q.v })); // копают с соседней, уже вырытой клетки
    const [ci, ck] = at(uc, 0);
    rooms.push({ purpose, seg: segId + 'r', x: ci - HX + 0.5, z: ck - HZ + 0.5, y: f, cells: rc.length, uc, side, f });
    segs.push(segId);
    return { u, f, door };
  };
  // ветки — от клеток ствола на боковых гранях (u = ±1); после удачной — пропускаем несколько уровней
  let made = 0, skip = 2, lastSide = 0;
  for (let s = 0; s < trunk.length && made < 4; s++) {
    const t = trunk[s]; if (skip > 0) { skip--; continue; }
    if (Math.abs(t.u) !== 1 || (A.fork > 0.5 && t.u === lastSide)) continue; // «ветвистые» племена чередуют стороны
    if (branch(t, t.u, t.f, A.branchLen + (Math.random() * 2 | 0), A.slope, 'new')) { made++; skip = 1; lastSide = t.u; }
  }
  // со дна ствола — ещё одна камера (туда обычно и селится матка)
  for (let s = trunk.length - 1; s >= Math.max(0, trunk.length - 4); s--) {
    const t = trunk[s]; if (Math.abs(t.u) !== 1) continue;
    if (branch(t, t.u, t.f, 2, 0, 'queen') || branch(t, t.u, t.f, 1, 0, 'queen')) break;
  }
  if (!rooms.length) return null;
  // царская камера — самая глубокая, кладовая — ближе всех к входу
  rooms.sort((a, b) => b.y - a.y);
  const order = ['store', 'nursery', 'winter', 'solar'];
  rooms.forEach((r, idx) => { r.purpose = order[idx] || 'new'; });
  rooms[rooms.length - 1].purpose = 'queen';
  if (rooms.length === 1) rooms[0].purpose = 'queen';
  // 4) запасные входы: с поверхности к камерам дальней стороны
  for (let e = 1; e < A.entr && e < rooms.length; e++) {
    const rm = rooms[e - 1], tmp = []; let f = rm.f, u = rm.uc + rm.side * (A.roomW + 1);
    for (let s = 0; s < 14; s++) {
      const [i, k] = at(u, 0), sT = T(i, k), open = f + 3 > sT - 1;
      tmp.push({ i, k, f: Math.min(f, sT), h: open ? Math.max(3, sT - f + 1) : 3, open });
      if (f >= sT - 1) break;
      u += rm.side; f++;
    }
    const last = tmp[tmp.length - 1];
    if (!last || last.f < T(last.i, last.k) - 1 || !tmp.every(t => fits(t.i, t.k, t.f, t.h, t.open))) continue;
    let pr = cells.filter(c => c.seg === rm.seg && c.v === 0).sort((a, b) => (b.u - a.u) * rm.side)[0];
    for (const t of tmp) pr = add('entrance' + e, t.i, t.k, t.f, t.h, pr);
  }
  return {
    i: n.i, k: n.k, ax: n.ax, sg: n.sg, arch: A, h: S0, x: n.i - HX + 0.5, z: n.k - HZ + 0.5, cells, rooms, next: 0, dug: 0, mound: 0,
    exit: { x: exitCell.i - HX + 0.5, z: exitCell.k - HZ + 0.5, y: T(exitCell.i, exitCell.k) },
  };
}
// назначения камер: ближе к входу — кладовая, глубже — детская и зимовальная, в самой глубокой — матка
function assignPurposes(n) {
  const rs = n.rooms.slice().sort((a, b) => b.y - a.y || Math.abs(a.uc) - Math.abs(b.uc));
  const order = ['store', 'nursery', 'winter', 'solar', 'new', 'new', 'new', 'new'];
  rs.forEach((r, i) => { r.purpose = order[i]; });
  rs[rs.length - 1].purpose = 'queen';
  if (rs.length === 2) rs[0].purpose = 'store';
}
// ближайшая из уже запланированных клеток (откуда дотянуться), иначе — дверь
function nearestDug(list, q, door) {
  let best = door, bd = Math.abs(door.i - q.i) + Math.abs(door.k - q.k);
  for (const c of list) { const d = Math.abs(c.i - q.i) + Math.abs(c.k - q.k); if (d < bd) { bd = d; best = c; } }
  return best;
}
// клетка вырыта, когда всё от пола до потолка пусто
const cellDone = cl => { for (let y = cl.f; y < cl.f + cl.h; y++) if (world.solid(cl.i, y, cl.k)) return false; return true; };
function nestNext(n) {
  if (!n || !n.cells) return null;
  while (n.next < n.cells.length && cellDone(n.cells[n.next])) n.next++;
  return n.cells[n.next] || null;
}
const cellPos = cl => cl ? { x: cl.i - HX + 0.5, z: cl.k - HZ + 0.5, y: cl.f } : null;
// где стоять, чтобы рыть клетку: предыдущая вырытая клетка (или поверхность рядом с входом)
function digSpot(n, cl) { return cl.from ? cellPos(cl.from) : { x: cl.i - HX + 0.5, z: cl.k - HZ + 0.5 }; } // самый первый — стоя на поверхности над входом
// один «укус» строителя: вынуть верхний ещё целый блок клетки
function nestStep(r, n, cl) {
  practice(r, 'dig', 2); r.st.digs++; r.energy -= 1.2;
  if (Math.random() > 0.65 + 0.35 * r.skill.dig + r.tools.shovel * 0.1) { annoy(r, 0.01); return; }
  let y = -1;
  for (let yy = cl.f + cl.h - 1; yy >= cl.f; yy--) if (world.solid(cl.i, yy, cl.k)) { y = yy; break; }
  if (y < 0) return;
  const id = world.get(cl.i, y, cl.k);
  if (id === B_BEDROCK) { cl.h = y - cl.f; return; }
  world.setB(cl.i, y, cl.k, B_AIR);
  n.dug++; G.mined++; r.st.nest = (r.st.nest || 0) + 1; r.d[9] = Math.max(0, r.d[9] - 0.05);
  if (DROP[id]) bagAdd(r, DROP[id]);
  first('nest', `${r.name} начал рыть первый муравейник`);
  const room = n.rooms.find(rm => rm.seg === cl.seg);
  if (room && !room.ready && n.cells.filter(c => c.seg === cl.seg).every(cellDone)) {
    room.ready = true; const c = campById(r.camp);
    diplo(`Колония ${(tribeOf(r.tribe) || {}).name} вырыла камеру «${ROOM_RU[room.purpose]}» на глубине ${n.h - room.y}`);
    if (room.purpose === 'store' && c) moveStore(c);
  }
}
// рост муравейника: строитель добавляет новую камеру — по архитектуре племени, но со своим «почерком» (гены)
function extendNest(c, r) {
  const n = c.nest; if (!n || n.rooms.length >= 9) return false;
  const A = { ...n.arch, branchLen: clamp(n.arch.branchLen + Math.round((r.genes.curiosity - 0.5) * 3), 2, 8), roomW: clamp(n.arch.roomW + Math.round((r.genes.size - 1) * 4), 2, 4),
    slope: clamp(n.arch.slope + (r.genes.nerves - 0.5) * 0.6, 0, 1) };
  const purpose = n.rooms.some(rm => rm.purpose === 'winter') ? 'new' : 'winter';
  if (!growNest(n, A, purpose, r.name)) return false;
  lifeEvent(r, `Задумал новую камеру «${ROOM_RU[purpose]}»`);
  return true;
}
// новая ветка — от дальнего края одной из камер: дальше и (чаще) глубже, с камерой на конце
function growNest(n, A, purpose, by) {
  const tmpN = { i: n.i, k: n.k, ax: n.ax, sg: n.sg, arch: A };
  const at = nestFrame(tmpN), T = (i, k) => world.top[k * MAPX + i];
  const air = new Set(), floors = new Set(), K = (i, y, k) => (k * MAPX + i) * 64 + y;
  for (const cl of n.cells) { for (let y = cl.f; y < cl.f + cl.h; y++) air.add(K(cl.i, y, cl.k)); floors.add(K(cl.i, cl.f - 1, cl.k)); }
  const fits = (i, k, f, h) => i > 2 && k > 2 && i < MAPX - 3 && k < MAPZ - 3 && f >= 2 && f + h <= T(i, k) - 1 && !air.has(K(i, f - 1, k)) && !floors.has(K(i, f + h - 1 + 0, k)) && ![...Array(h).keys()].some(d => floors.has(K(i, f + d, k)));
  for (let attempt = 0; attempt < 10; attempt++) {
    const room = pick(n.rooms), side = room.side, W = A.roomW, H = A.roomH;
    let u = room.uc + side * ((room.w || n.arch.roomW) + 1), f = room.f; const tmp = [];
    const dir = Math.random() < 0.6 ? -1 : 0; // чаще — глубже
    let bad = false;
    for (let s = 0; s < A.branchLen; s++) { const fn = Math.random() < A.slope + 0.2 ? f + dir : f; for (const v of [0, -1]) { const [i, k] = at(u, v); if (!fits(i, k, fn, 3)) bad = true; } tmp.push({ u, f: fn }); f = fn; u += side; }
    if (bad) continue;
    const uc = u + side * W, rc = [];
    for (let du = -W; du <= W && !bad; du++) for (const v of [0, -1, 1]) { const [i, k] = at(uc + du, v), h = Math.abs(du) === W || v === 1 ? Math.max(2, H - 1) : H; if (!fits(i, k, f, h)) { bad = true; break; } rc.push({ u: uc + du, v, i, k, h }); }
    if (bad) continue;
    const segId = 'x' + n.cells.length;
    let pr = n.cells.filter(cl => cl.seg === room.seg).sort((a, b) => Math.abs(b.i - n.i) + Math.abs(b.k - n.k) - Math.abs(a.i - n.i) - Math.abs(a.k - n.k))[0];
    for (const t of tmp) for (const v of [0, -1]) { const [i, k] = at(t.u, v); pr = { i, k, f: t.f, h: 3, seg: segId, from: pr }; n.cells.push(pr); }
    const door = pr;
    rc.sort((a, b) => Math.abs(a.u - (uc - side * W)) - Math.abs(b.u - (uc - side * W)));
    const done = [];
    for (const q of rc) { const cl = { i: q.i, k: q.k, f, h: q.h, seg: segId + 'r', from: nearestDug(done, q, door) }; done.push(cl); n.cells.push(cl); }
    const [ci, ck] = at(uc, 0);
    n.rooms.push({ purpose, seg: segId + 'r', x: ci - HX + 0.5, z: ck - HZ + 0.5, y: f, uc, side, f, by, w: W });
    return true;
  }
  return false;
}
// землю — наверх: холм-конус над стволом (на сам вход не сыплем)
function moundSpot(n) {
  if (!n.noMound) n.noMound = new Set(n.cells.filter(c => c.f + c.h >= world.top[c.k * MAPX + c.i] - 1).map(c => c.k * MAPX + c.i));
  const M = n.arch.mound;
  let best = null, bd = 1e9;
  for (let t = 0; t < 24; t++) {
    const di = Math.round(rnd(-M - 1, M + 1)), dk = Math.round(rnd(-M - 1, M + 1)), i = n.i + di, k = n.k + dk, q = k * MAPX + i;
    if (i < 1 || k < 1 || i >= MAPX - 1 || k >= MAPZ - 1 || n.noMound.has(q) || world.wl[q] > world.top[q]) continue;
    const cap = n.h + M - Math.round(Math.hypot(di, dk)); if (world.top[q] >= cap) continue;
    const sc = world.top[q] - cap + Math.random() * 0.5; if (sc < bd) { bd = sc; best = { x: i - HX + 0.5, z: k - HZ + 0.5 }; }
  }
  return best;
}
function dumpSoil(r, n, p) {
  const k = ['dirt', 'gravel', 'sand', 'clay', 'cobble'].find(k => r.inv[k]); if (!k) return;
  bagTake(r, k);
  if (p && world.place(p.x, p.z, k === 'cobble' ? B_COBBLE : k === 'gravel' ? B_GRAVEL : B_DIRT)) { r.st.built++; G.built++; n.mound++; }
}
const soilIn = r => (r.inv.dirt || 0) + (r.inv.gravel || 0) + (r.inv.sand || 0) + (r.inv.clay || 0) + (r.inv.cobble || 0);
const roomOf = (c, purpose) => c.nest && c.nest.rooms && (c.nest.rooms.find(rm => rm.purpose === purpose && rm.ready) || null);
// где матка, склад и ночлег (камера, если вырыта; иначе — стоянка на поверхности)
function homeOf(c, purpose = 'queen') {
  const rm = roomOf(c, purpose) || roomOf(c, 'queen') || roomOf(c, 'store') || (c.nest && c.nest.rooms.find(r => r.ready));
  return rm ? { x: rm.x, z: rm.z, y: rm.y } : { x: c.x, z: c.z };
}

// ---------- склад: еда лежит кучками, у каждой кучки — счётчик ----------
const PILE_KINDS = () => [...Object.keys(FOODS), 'meat'];
const pilesOf = c => world.objects.filter(o => !o.dead && o.camp === c.id && (o.t === 'fruit' || o.t === 'meat'));
const foodOf = c => c ? pilesOf(c).reduce((s, o) => s + (o.n || 1), 0) : 0;
function storeSpot(c) { const rm = roomOf(c, 'store'); return rm ? { x: rm.x, z: rm.z, y: rm.y } : { x: c.x + 1.5, z: c.z + 1.5 }; }
function pileFor(c, kind) {
  let o = pilesOf(c).find(o => (o.kind || (o.t === 'meat' ? 'meat' : 'apple')) === kind);
  if (!o) {
    const sp = storeSpot(c), idx = PILE_KINDS().indexOf(kind), a = idx * 1.3;
    o = { t: kind === 'meat' ? 'meat' : 'fruit', kind, x: sp.x + Math.sin(a) * 0.9, z: sp.z + Math.cos(a) * 0.9, y: sp.y, n: 0, camp: c.id, age: 0 };
    world.add(o);
  }
  return o;
}
function moveStore(c) { const sp = storeSpot(c); pilesOf(c).forEach((o, idx) => { const a = idx * 1.3; o.x = sp.x + Math.sin(a) * 0.9; o.z = sp.z + Math.cos(a) * 0.9; o.y = sp.y; }); }
function depositFood(r, c) {
  let n = 0;
  for (const k of PILE_KINDS()) if (r.inv[k]) { const o = pileFor(c, k); o.n += r.inv[k]; n += r.inv[k]; delete r.inv[k]; }
  if (n) { r.st.stored = (r.st.stored || 0) + n; r.d[9] = Math.max(0, r.d[9] - 0.1); r.chem.reward += 0.2; first('store', `${r.name} первым сложил еду в кучку на складе`); }
}
function eatFromStore(r, c) {
  const o = pilesOf(c).find(o => (o.n || 1) > 0); if (!o) return false;
  const k = o.kind || (o.t === 'meat' ? 'meat' : 'apple');
  if (--o.n <= 0) { o.dead = true; world.removed = true; }
  r.energy = Math.min(100, r.energy + (FOODS[k] ? FOODS[k].e : 25)); r.st.food++;
  if (FOODS[k]) giveBuff(r, FOODS[k].buff);
  return true;
}
// старые сохранения: числа на «складе» превращаются в настоящие кучки; старые гнёзда (со сводами) — перестраиваются
function migrateColonies() {
  for (const c of G.camps || []) {
    if (c.food) { for (const k in c.food) if (c.food[k] > 0) pileFor(c, k).n += c.food[k]; delete c.food; }
    if (c.nest && !c.nest.rooms) { delete c.nest; c.nestTry = -99; }
  }
}

// ---------- такт колонии: матки, яйца, должности, рост муравейника ----------
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
      const st = storeSpot(c);
      if (Math.hypot(q.x - st.x, q.z - st.z) < 4 && eatFromStore(q, c)) lifeEvent(q, 'Поела со склада');
      else for (const o of res) if (o !== q && Math.hypot(o.x - q.x, o.z - q.z) < 3 && Math.abs(o.y - q.y) < 2) { const k = Object.keys(FOODS).find(k => o.inv[k]) || (o.inv.meat && 'meat'); if (k) { bagTake(o, k); q.energy = Math.min(100, q.energy + (FOODS[k] ? FOODS[k].e : 25)); o.st.fed = (o.st.fed || 0) + 1; o.chem.reward += 0.2; first('feed', `${o.name} первым покормил матку`); break; } }
    }
    // матка откладывает яйцо: из запасов склада или из своих сил. Малыш появляется в детской камере
    if (q && isAdult(q) && simTime > (q.eggT || 0) && robots.length + births.length < SET.maxPop) {
      const have = foodOf(c);
      if (have >= EGG_COST + 1 || q.energy > 60) {
        if (have >= EGG_COST + 1) { const o = pilesOf(c)[0]; if (--o.n <= 0) { o.dead = true; world.removed = true; } } else q.energy -= 10;
        const mates = res.filter(r => r !== q && isAdult(r));
        const ch = makeChild(q, mates.length ? pick(mates) : q);
        const nur = roomOf(c, 'nursery');
        if (nur) { ch.x = nur.x + rnd(-1, 1); ch.z = nur.z + rnd(-0.4, 0.4); ch.y = nur.y; } else { ch.x = q.x; ch.z = q.z; ch.y = q.y; }
        births.push(ch); q.st.kids++;
        q.eggT = simTime + 6 + (1 - q.genes.fertility) * 8 + res.length * 0.15;
        first('egg', `Матка ${q.name} отложила первое яйцо`);
      }
    }
    // повзрослевшие получают должность
    for (const r of res) if ((!r.role || r.role === 'young') && isAdult(r)) assignRole(r);
    const builders = res.filter(r => r.role === 'builder');
    // ремонт: засыпанный ход (обвал, чужой блок) — снова в работу
    if (c.nest && c.nest.cells && simTime - (c.fixT || 0) > 10) { c.fixT = simTime; const j = c.nest.cells.findIndex((cl, idx) => idx < c.nest.next && !cellDone(cl)); if (j >= 0) c.nest.next = j; }
    if (c.nest && !nestNext(c.nest)) {
      // всё вырыто: колония выросла — строитель задумывает новую камеру; иначе лишние строители идут в фуражиры
      const cap = c.nest.rooms.length * 7;
      if (res.length > cap && builders.length && simTime - (c.extT || 0) > 30) { c.extT = simTime; extendNest(c, pick(builders)); }
      else builders.slice(2).forEach(r => setRole(r, 'forager', 'муравейник достроен'));
    }
    if (!c.nest && builders.length === 0) {
      const w = res.find(r => r.role === 'forager' || r.role === 'nurse');
      if (w && res.length >= 3) setRole(w, 'builder', 'колонии нужен муравейник');
    }
  }
}

// ---------- работа по должности: куда идти и что делать ----------
// возвращает { x, z, y, label, act, near } или null — тогда робот живёт по обычным влечениям
function roleJob(r) {
  const c = campById(r.camp); if (!c || !r.role || r.role === 'young' || r.role === 'scout' || r.goal) return null;
  const R = reach(r);
  const job = (x, z, label, act, nearD = R + 0.4, y) => ({ x, z, y, label, act, near: Math.hypot(x - r.x, z - r.z) < nearD && (y === undefined || Math.abs(r.y - y) < 1.5) });
  const st = storeSpot(c);
  // хочет есть, а на складе есть еда — к кучкам (последние запасы — матке и малышам)
  if (r.d[0] > 0.4 && foodOf(c) > (r.role === 'queen' || stageOf(r) === 'Малыш' ? 0 : 3)) {
    const j = job(st.x, st.z, 'идёт поесть на склад', null, 2.2, st.y); if (j.near) { eatFromStore(r, c); return null; } return j;
  }
  // ночь (и зима) — все, кроме солдат, ночуют в муравейнике: у каждого своё место в камерах
  if ((isNight() || (season() === 3 && r.role !== 'builder')) && c.nest && c.nest.rooms.some(rm => rm.ready) && r.role !== 'soldier') { // зимой под землёй копают — там тепло
    const rm = roomOf(c, 'winter') || roomOf(c, 'nursery') || homeOf(c);
    const beds = c.nest.cells.filter(cl => cl.seg === (rm.seg || '') && cellDone(cl));
    const b = beds.length ? beds[r.id % beds.length] : null, p = b ? cellPos(b) : rm;
    return job(p.x, p.z, 'ночует в муравейнике', 8, 1, p.y);
  }
  switch (r.role) {
    case 'queen': {
      if (r.energy < 55 && !foodOf(c)) return null; // никто не кормит — сама идёт за едой
      const h = homeOf(c, 'queen');
      return job(h.x, h.z, Math.hypot(h.x - r.x, h.z - r.z) > 2 ? 'матка идёт в царскую камеру' : 'матка в царской камере', 8, 2, h.y);
    }
    case 'nurse': {
      const q = queenOf(c), nur = roomOf(c, 'nursery'), t = q || nur || homeOf(c);
      const has = Object.keys(FOODS).some(k => r.inv[k]);
      if (q && q.energy < 70 && !has && foodOf(c) === 0) { const f = r.near.food; if (f && f.t === 'fruit') return job(f.x, f.z, 'нянька ищет еду для матки', 5, R - 0.2); }
      return job(t.x, t.z, Math.hypot(t.x - r.x, t.z - r.z) > 3 ? 'нянька идёт к матке' : 'нянька возле матки', null, 3, t.y);
    }
    case 'soldier': {
      const z = nearestZombie(r, 14), en = r.near.enemy;
      const foe = z && Math.hypot(z.x - c.x, z.z - c.z) < campRadius(c) + 6 ? z : en;
      if (foe) return job(foe.x, foe.z, 'солдат защищает колонию', 9, R - 0.1);
      const post = c.nest ? c.nest.exit : c; // караулит у входа
      return Math.hypot(post.x - r.x, post.z - r.z) > 5 ? job(post.x + rnd(-2, 2), post.z + rnd(-2, 2), 'солдат на посту у входа', null, 3) : null;
    }
    case 'builder': {
      if (!c.nest) { if (simTime - (c.nestTry || -99) < 30) return null; c.nestTry = simTime; c.nest = planNest(c, archOf(c.tribe), r); if (!c.nest) return null; diplo(`Колония ${(tribeOf(c.tribe) || {}).name} заложила муравейник: ${ARCH_RU(c.nest.arch)}`); }
      const n = c.nest;
      // полная сумка земли — наверх, на холм
      if (soilIn(r) >= 12 || (soilIn(r) && !nestNext(n))) { // набрал полную ношу — наверх
        if (world.under(r.x, r.z, r.y)) return job(n.exit.x, n.exit.z, 'несёт землю наверх', null, 1.5, n.exit.y);
        const p = r.moundP && simTime - r.moundP.t < 20 ? r.moundP : (r.moundP = { ...(moundSpot(n) || n.exit), t: simTime });
        const j = job(p.x, p.z, 'насыпает холм муравейника', null, R + 0.8);
        if (j.near) { dumpSoil(r, n, p); r.moundP = null; }
        return j;
      }
      const cl = nestNext(n);
      if (!cl) return null;
      const sp = digSpot(n, cl);
      return { ...job(sp.x, sp.z, 'роет муравейник', 4, 0.9, sp.y), dig: cl };
    }
    case 'forager': {
      const carried = PILE_KINDS().reduce((s, k) => s + (r.inv[k] || 0), 0);
      if (carried >= 3 || (carried && (isNight() || r.d[3] > 0.6))) { const j = job(st.x, st.z, 'несёт еду на склад', null, 2.2, st.y); if (j.near) depositFood(r, c); return j; }
      const f = r.near.food; if (f && f.t !== 'melon' && !f.camp) return job(f.x, f.z, 'собирает еду', 5, R - 0.2);
      const t = r.near.tree; if (t && t.apples > 0) return job(t.x, t.z, 'трясёт дерево', 3, R + 0.8);
      if (r.mem.tree && Math.hypot(r.mem.tree.x - r.x, r.mem.tree.z - r.z) > 6) return job(r.mem.tree.x, r.mem.tree.z, 'идёт за едой к дереву', null);
      return null;
    }
  }
  return null;
}
// под землёй, а дело наверху — путь к выходу своего муравейника
function nestExitFor(r) {
  const c = campById(r.camp); if (c && c.nest) return c.nest.exit;
  let best = null, bd = 30;
  for (const cc of G.camps || []) if (cc.nest) { const d = Math.hypot(cc.nest.x - r.x, cc.nest.z - r.z); if (d < bd) { bd = d; best = cc.nest.exit; } }
  return best;
}

// ---------- поиск пути в 3D: по поверхности и по подземным ходам ----------
// шаг вверх — на блок, вниз — до трёх, глубокую воду обходим (как муравьи по своим тропам)
const PF_R = 48, PF_N = PF_R * 2 + 1, PF_Y = 64, PF_SZ = PF_N * PF_N * PF_Y;
const PF_PREV = new Int32Array(PF_SZ), PF_STAMP = new Uint32Array(PF_SZ), PF_Q = new Int32Array(60000);
let PF_GEN = 1;
function stepFloor(i, k, f) { const t = world.top[k * MAPX + i]; return f >= t - 0.5 ? t : world.floorCell(i, k, f); } // пол в соседней колонне, если идти с высоты f (как у тела робота)
function route(x0, z0, x1, z1, y1, y0) {
  const ci = Math.floor(x0 + HX), ck = Math.floor(z0 + HZ), ti = Math.floor(x1 + HX), tk = Math.floor(z1 + HZ);
  if (ci < 0 || ck < 0 || ci >= MAPX || ck >= MAPZ || Math.abs(ti - ci) >= PF_R || Math.abs(tk - ck) >= PF_R) return null;
  const f0 = Math.round(y0 === undefined ? world.top[ck * MAPX + ci] : y0);
  const tf = y1 === undefined ? null : Math.round(y1);
  const oi = ci - PF_R, ok = ck - PF_R, id = (i, k, f) => ((k - ok) * PF_N + (i - oi)) * PF_Y + f;
  const gen = ++PF_GEN; if (gen > 4e9) { PF_STAMP.fill(0); PF_GEN = 1; }
  let qh = 0, qt = 0; const s = id(ci, ck, f0); PF_STAMP[s] = gen; PF_PREV[s] = s; PF_Q[qt++] = s;
  let goal = -1;
  while (qh < qt) {
    const c = PF_Q[qh++], f = c % PF_Y, cc = (c / PF_Y) | 0, i = cc % PF_N + oi, k = (cc / PF_N | 0) + ok;
    if (i === ti && k === tk && (tf === null || Math.abs(f - tf) <= 1)) { goal = c; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + dx, b = k + dz;
      if (a < 0 || b < 0 || a >= MAPX || b >= MAPZ || Math.abs(a - ci) > PF_R || Math.abs(b - ck) > PF_R) continue;
      const fa = stepFloor(a, b, f);
      if (fa > MAPY || fa >= PF_Y || fa - f > 1 || f - fa > 3) continue;
      const q = b * MAPX + a; if (fa === world.top[q] && world.wl[q] - fa > 0.8 && !(a === ti && b === tk)) continue;
      const n = id(a, b, fa); if (PF_STAMP[n] === gen) continue;
      PF_STAMP[n] = gen; PF_PREV[n] = c; if (qt < PF_Q.length) PF_Q[qt++] = n;
    }
  }
  if (goal < 0) return null;
  const out = []; let c = goal;
  while (c !== s && out.length < 400) { const cc = (c / PF_Y) | 0; out.push([cc % PF_N + oi - HX + 0.5, (cc / PF_N | 0) + ok - HZ + 0.5, c % PF_Y]); c = PF_PREV[c]; }
  return out.reverse();
}
// следующая точка пути к цели (путь пересчитываем раз в 3 с или когда цель сдвинулась)
function pathTo(r, x, z, y) {
  const P = r.path;
  if (!P || Math.hypot(P.x - x, P.z - z) > 1.5 || (y !== undefined && P.y !== y) || simTime - P.t > 3) {
    const pts = route(r.x, r.z, x, z, y, r.y);
    r.path = { x, z, y, t: simTime, pts: pts || [], i: 0 };
  }
  const p = r.path;
  while (p.i < p.pts.length - 1 && Math.hypot(p.pts[p.i][0] - r.x, p.pts[p.i][1] - r.z) < 0.6 && Math.abs(p.pts[p.i][2] - r.y) < 1.2) p.i++;
  const under = world.under(r.x, r.z, r.y) || (p.pts[p.i] && p.pts[p.i][2] < world.height(p.pts[p.i][0], p.pts[p.i][1]) - 1.5);
  const w = p.pts[Math.min(p.i + (under ? 0 : 1), p.pts.length - 1)]; // под землёй — точно по клеткам, наверху — чуть вперёд
  return w ? { x: w[0], z: w[1] } : { x, z };
}
