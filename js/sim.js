'use strict';
// ================= Роботы как норны из Creatures: драйвы, химия, здоровье, психика, мозг, гены =================
// Обучение «бихевиористское», как в Creatures: рост драйва — наказание, снижение — награда.
// Ходить, носить, копать и строить никто не учит: навыки растут от практики, а польза — из драйвов.
const DT = 0.05, DAY = 240, NA = 12, LAMBDA = 0.75;
const ACTIONS = ['Идти вперёд', 'Поворот влево', 'Поворот вправо', 'Взаимодействие', 'Копать / рубить', 'Взять / поставить', 'Говорить', 'Спариться', 'Отдых / сон', 'Атаковать', 'Крафт / готовить', 'Прыжок'];
const ACT_DUR = [0.3, 0.3, 0.3, 0.6, 1.2, 0.5, 0.9, 0.5, 1.5, 0.6, 1.5, 0.6];
const DRIVES = [
  ['hunger', 'Голод', 3], ['thirst', 'Жажда', 3], ['pain', 'Боль', 2], ['tired', 'Усталость', 1], ['sleepy', 'Сонливость', 1],
  ['cold', 'Холод', 1.5], ['lonely', 'Одиночество', 0.8], ['crowded', 'Теснота', 1.1], ['fear', 'Страх', 1.5],
  ['boredom', 'Скука', 0.9], ['anger', 'Злость', 0.6], ['sex', 'Влечение', 0.7],
];
const ND = DRIVES.length;
const STAGES = [[0.05, 'Малыш'], [0.13, 'Ребёнок'], [0.22, 'Подросток'], [0.32, 'Юность'], [0.72, 'Взрослый'], [0.9, 'Пожилой'], [9, 'Старик']];
const IN_NAMES = [...DRIVES.map(d => d[1]), 'несёт предмет', 'ночь', 'смещение', 'в укрытии',
  'яблоко: sin', 'яблоко: cos', 'яблоко: близость', 'вода: sin', 'вода: cos', 'вода: близость', 'робот: sin', 'робот: cos', 'робот: близость',
  'буква: sin', 'буква: cos', 'буква: близость', 'дерево: sin', 'дерево: cos', 'дерево: близость', 'стена: sin', 'стена: cos', 'стена: близость',
  'блок: sin', 'блок: cos', 'блок: близость', 'зов «еда»', 'можно копать', 'можно поставить', 'шум',
  'зомби: sin', 'зомби: cos', 'зомби: близость', 'верстак рядом', 'печь рядом', 'еда в сумке', 'блоки в сумке', 'есть меч',
  'в глубокой воде', 'трава: sin', 'трава: cos', 'трава: близость', 'враг рядом', 'семена в сумке'];
const NI = IN_NAMES.length;
const SET = { mut: 0.5, food: 1, maxPop: 70, lamarck: true };
const PAL_SHELL = [[0.93, 0.93, 0.9], [0.6, 0.84, 0.92], [0.76, 0.68, 0.92], [0.42, 0.44, 0.48], [0.95, 0.88, 0.74], [0.97, 0.74, 0.8]];
const PAL_ACC = [[0.98, 0.42, 0.1], [0.98, 0.78, 0.12], [0.52, 0.32, 0.78], [0.86, 0.2, 0.2], [0.2, 0.72, 0.45], [0.16, 0.55, 0.92]];
const PAL_EYE = [[1, 0.74, 0.1], [0.52, 0.36, 0.86], [0.3, 0.8, 0.95], [0.95, 0.32, 0.3]];
const GENE_RANGE = { size: [0.75, 1.35], leg: [0.8, 1.25], head: [0.8, 1.3], strength: [0, 1], speed: [0, 1], stamina: [0, 1], brain: [6, 64], learn: [0, 1], instinct: [0, 1], curiosity: [0, 1], social: [0, 1], temper: [0, 1], nerves: [0, 1], immunity: [0, 1], fertility: [0, 1], lifespan: [0, 1], asym: [0, 1], wander: [0, 1] };
const GENE_NAMES = { size: 'Размер тела', leg: 'Длина ног', head: 'Голова / камера', strength: 'Сила', speed: 'Скорость', stamina: 'Выносливость', brain: 'Нейронов (врождённо)', learn: 'Обучаемость', instinct: 'Сила инстинктов', curiosity: 'Любопытство', social: 'Общительность', temper: 'Вспыльчивость', nerves: 'Тревожность', immunity: 'Иммунитет', fertility: 'Плодовитость', lifespan: 'Долголетие', asym: 'Асимметрия (уродство)', wander: 'Тяга к странствиям' };
const SKILLS = [['walk', 'Ходьба'], ['carry', 'Носить вещи'], ['dig', 'Копать'], ['build', 'Ставить блоки'], ['craft', 'Крафт'], ['fight', 'Драка'], ['jump', 'Прыжки'], ['swim', 'Плавание'], ['farm', 'Земледелие']];

let world, robots, births, simTime, nextId, events, convLog, history, G, objGrid, robGrid, treeGrid, lastSample;

const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const pick = a => a[Math.random() * a.length | 0];
const isNight = () => Math.sin(((simTime % DAY) / DAY - 0.25) * Math.PI * 2) < -0.05;
// год = 4 дня: весна, лето, осень, зима. Зимой яблок почти нет и холодно даже днём
const SEASONS = ['весна', 'лето', 'осень', 'зима'], SEASON_FOOD = [1, 1.3, 0.8, 0.12];
const season = () => Math.floor(simTime / DAY) % 4;
const growth = r => Math.min(1, r.age / (r.lifespan * 0.22));
const stageOf = r => { const f = r.age / r.lifespan; return STAGES.find(s => f < s[0])[1]; };
const isExplorer = r => (r.genes.wander || 0) >= 0.6;
const isAdult = r => r.age / r.lifespan >= 0.22;

// ---------- пространственная сетка ----------
const GC = 5, GN = Math.ceil(WORLD / GC);
const gcell = v => clamp(((v + HALF) / GC) | 0, 0, GN - 1);
function makeGrid(list) {
  const g = Array.from({ length: GN * GN }, () => []);
  for (const o of list) if (!o.dead && !o.carried) g[gcell(o.z) * GN + gcell(o.x)].push(o);
  return g;
}
function near(g, x, z, R, fn) {
  const x0 = gcell(x - R), x1 = gcell(x + R), z0 = gcell(z - R), z1 = gcell(z + R);
  for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const c = g[j * GN + i]; for (let k = 0; k < c.length; k++) fn(c[k]); }
}

// ---------- гены ----------
function randomGenes() {
  const g = {};
  for (const k in GENE_RANGE) { const [a, b] = GENE_RANGE[k]; g[k] = rnd(a, a + (b - a) * (k === 'brain' ? 0.3 : k === 'asym' ? 0.3 : 1)); }
  g.brain = Math.round(g.brain); g.instinct = rnd(0.6, 1);
  g.wander = Math.random() < 0.2 ? rnd(0.65, 1) : rnd(0, 0.3); // странники — лишь каждый пятый
  g.shell = Math.random() * PAL_SHELL.length | 0; g.acc = Math.random() * PAL_ACC.length | 0;
  g.foot = Math.random() * PAL_ACC.length | 0; g.eye = Math.random() * PAL_EYE.length | 0;
  return g;
}
function mutateGenes(g) {
  const m = SET.mut;
  for (const k in GENE_RANGE) { const [a, b] = GENE_RANGE[k]; if (Math.random() < 0.6) g[k] = clamp(g[k] + gauss() * (b - a) * 0.12 * m, a, b); }
  if (Math.random() < 0.2 * m) g.brain += Math.random() < 0.5 ? 3 : -3;
  g.brain = clamp(Math.round(g.brain), 6, 64);
  for (const [k, n] of [['shell', PAL_SHELL.length], ['acc', PAL_ACC.length], ['foot', PAL_ACC.length], ['eye', PAL_EYE.length]]) if (Math.random() < 0.06 * m) g[k] = Math.random() * n | 0;
  return g;
}
function crossGenes(a, b) {
  const g = {};
  for (const k in a) g[k] = Math.random() < 0.5 ? a[k] : b[k];
  for (const k in GENE_RANGE) if (Math.random() < 0.3) g[k] = (a[k] + b[k]) / 2;
  return mutateGenes(g);
}

// ---------- мозг: входы → скрытый слой (растёт) → 9 действий ----------
function newBrain(H) { return { H, W1: new Float32Array(NI * H), b1: new Float32Array(H), W2: new Float32Array(H * NA), b2: new Float32Array(NA) }; }
function randomBrain(H) {
  const b = newBrain(H);
  for (let i = 0; i < b.W1.length; i++) b.W1[i] = gauss() * 0.45;
  for (let i = 0; i < b.W2.length; i++) b.W2[i] = gauss() * 0.3;
  b.b2[4] = -1; b.b2[5] = -0.5; b.b2[9] = -1.2; b.b2[10] = -1; b.b2[7] = -0.5; b.b2[11] = -0.5; // поначалу «странные» действия редки
  return b;
}
function cloneBrain(b) { return { H: b.H, W1: b.W1.slice(), b1: b.b1.slice(), W2: b.W2.slice(), b2: b.b2.slice() }; }
function childBrain(pa, pb, H) {
  const b = newBrain(H), m = SET.mut;
  for (let j = 0; j < H; j++) {
    let s = Math.random() < 0.5 ? pa : pb;
    if (j >= s.H) s = s === pa ? pb : pa;
    if (j < s.H) {
      for (let i = 0; i < NI; i++) b.W1[i * H + j] = s.W1[i * s.H + j];
      b.b1[j] = s.b1[j];
      for (let a = 0; a < NA; a++) b.W2[j * NA + a] = s.W2[j * NA + a];
    } else {
      for (let i = 0; i < NI; i++) b.W1[i * H + j] = gauss() * 0.3;
      for (let a = 0; a < NA; a++) b.W2[j * NA + a] = gauss() * 0.05;
    }
  }
  for (let a = 0; a < NA; a++) b.b2[a] = (pa.b2[a] + pb.b2[a]) / 2;
  const mw = w => { for (let i = 0; i < w.length; i++) if (Math.random() < 0.08 * m) w[i] += gauss() * 0.35 * m; };
  mw(b.W1); mw(b.b1); mw(b.W2); mw(b.b2);
  return b;
}
// мозг растёт при обучении: добавляется нейрон, выученное сохраняется
function growBrain(r) {
  const o = r.brain, H = o.H + 1;
  if (H > 64) return;
  const resize = (b, rand) => {
    const n = newBrain(H);
    for (let i = 0; i < NI; i++) { for (let j = 0; j < o.H; j++) n.W1[i * H + j] = b.W1[i * o.H + j]; if (rand) n.W1[i * H + o.H] = gauss() * 0.3; }
    n.b1.set(b.b1); n.W2.set(b.W2); n.b2.set(b.b2);
    if (rand) for (let a = 0; a < NA; a++) n.W2[o.H * NA + a] = gauss() * 0.05;
    return n;
  };
  r.brain = resize(o, true); r.tr = resize(r.tr, false); r.hid = new Float32Array(H);
  r.st.grown = (r.st.grown || 0) + 1;
}

// ---------- робот ----------
function makeName() {
  const C = 'BDGKLMNPRSTVZ', V = 'AEIOU';
  let s = ''; for (let i = 0; i < 2; i++) s += pick(C) + pick(V);
  return s[0] + s.slice(1).toLowerCase();
}
function makeRobot(genes, brain, x, z, gen = 0, parents = null) {
  const r = {
    id: nextId++, name: makeName(), genes, brain, innate: cloneBrain(brain), tr: newBrain(brain.H),
    hid: new Float32Array(brain.H), probs: new Float32Array(NA).fill(1 / NA), inp: new Float32Array(NI), nnOut: new Float32Array(NA),
    x, z, y: world.height(x, z), yaw: Math.random() * 6.283,
    energy: 75, water: 80, health: 100, mental: 80, age: 0, gen, parents,
    d: new Float32Array(ND), dPrev: new Float32Array(ND),
    chem: { adrenaline: 0, reward: 0, punish: 0, endorphin: 0, antigen: 0, antibody: 0.1 },
    skill: { walk: 0.15, carry: 0, dig: 0, build: 0, craft: 0, fight: 0, jump: 0, swim: 0, farm: 0 }, tribe: 1, goal: null, lastNew: 0,
    inv: {}, tools: { pick: 0, axe: 0, shovel: 0, sword: 0 }, rp: {}, known: {}, fly: newFly(Math.random() * 4294967295), mbOut: new Float32Array(NA),
    action: 8, actT: 0, rew: 0, base: 0, prox: { food: 0, water: 0, tree: 0 }, near: {},
    carry: null, mateWish: 0, mateCool: 20, heard: { t: 0, x: 0, z: 0 }, fallT: 0, cause: 'голод',
    letters: new Float32Array(26), vocab: {}, say: null, moving: false, dead: false, mem: {}, seen: new Set(), life: [],
    anim: { ph: Math.random() * 6, walk: 0, sit: 0, dig: 0, t: Math.random() * 10 },
    st: { food: 0, drink: 0, digs: 0, words: 0, heardN: 0, ok: 0, fail: 0, kids: 0, dist: 0, carried: 0, studied: 0, lettersLearned: 0, invented: 0, taught: 0, built: 0, falls: 0, shakes: 0, ill: 0, tickled: 0, slapped: 0, mined: {}, acts: new Array(NA).fill(0), rsum: 0, born: simTime },
  };
  r.spd = 1.1 + genes.speed * 1.6 - (genes.size - 1) * 0.4;
  r.lifespan = 300 + genes.lifespan * 480;
  lifeEvent(r, parents ? `Родился. Родители: ${parents.join(' и ')}` : 'Появился в мире');
  return r;
}
function lifeEvent(r, text) { r.life.push({ t: simTime, text }); if (r.life.length > 40) r.life.shift(); }
// первые предки уже взрослые и немного умеют ходить
function makeAncestor(x, z) {
  const g = randomGenes(), r = makeRobot(g, randomBrain(g.brain), x, z, 0);
  r.age = r.lifespan * rnd(0.22, 0.55); // разный возраст — предки не вымирают разом r.skill.walk = 0.35;
  return r;
}
function spawnRandom() { const p = world.land(); robots.push(makeAncestor(p[0], p[1])); }
// если племя почти вымерло — выжившие «почкуются», чтобы знания не терялись
function spawnBud() {
  if (!robots.length) return spawnRandom();
  const a = pick(robots), c = makeChild(a, a);
  c.x = inX(a.x + rnd(-2, 2)); c.z = inZ(a.z + rnd(-2, 2));
  robots.push(c);
}
function nearestWaterTo(x, z) {
  for (let d = 1; d < 120; d += 1.5) for (let a = 0; a < 6.28; a += 0.4 / Math.max(1, d / 6)) {
    const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    if (world.isWater(px, pz)) return { x: px, z: pz };
  }
  return null;
}

function initSim() {
  world = new World(); treeGrid = null;
  robots = []; births = []; simTime = DAY * 0.3; nextId = 1; events = []; convLog = [];
  history = { pop: [], iq: [], letters: [], lang: [], brain: [], gen: [], happy: [], skill: [] };
  G = { births: 0, deaths: 0, causes: { голод: 0, жажда: 0, старость: 0, болезнь: 0, зомби: 0, холод: 0, утонул: 0 }, maxGen: 0, bestIQ: 0, bestName: '', letterFirst: new Array(26).fill(false), firstWord: false, alphabet: false, mined: 0, built: 0, firsts: {} };
  lastSample = simTime;
  // племя начинает в самой густой части яблоневой рощи
  let bc = world.trees[0] || { x: 0, z: 0 }, bn = -1;
  for (const t of world.trees) { if (t.biome !== 'apple') continue; let n = 0; for (const u of world.trees) if ((u.x - t.x) ** 2 + (u.z - t.z) ** 2 < 625) n++; if (n > bn) { bn = n; bc = t; } }
  for (let i = 0; i < 26; i++) {
    let x = bc.x, z = bc.z;
    for (let t = 0; t < 60; t++) { x = inX(bc.x + rnd(-14, 14)); z = inZ(bc.z + rnd(-14, 14)); if (!world.isWater(x, z) && world.topBlock(x, z) !== B_LOG) break; }
    const r = makeAncestor(x, z);
    r.mem = { water: nearestWaterTo(x, z), tree: { x: bc.x, z: bc.z } }; r.home = { x: bc.x, z: bc.z }; // стоянка племени
    robots.push(r);
  }
  robots.forEach((r, i) => { r.genes.wander = i % 5 === 0 ? rnd(0.65, 1) : rnd(0, 0.3); }); // каждый пятый — странник
  G.tribes = {}; G.rel = {}; G.diplo = []; G.tribeSeq = 0; G.camps = []; G.campSeq = 0;
  const t1 = newTribe(robots), c1 = newCamp(t1, bc.x, bc.z, robots[0].name);
  G.tribes[t1].capital = c1.id; for (const r of robots) { r.camp = c1.id; r.biomes = { [biomeAt(r.x, r.z)]: true }; }
  // колония сразу распределяет должности: матка, разведчики (по гену), остальные — по долям каст
  c1.food = { apple: 14 };
  setRole(robots[1], 'queen', true); robots[1].x = bc.x; robots[1].z = bc.z;
  for (const r of robots) if (!r.role) assignRole(r);
  pushEvent(`Карта Minecraft: трава, деревья с яблоками, вода. 26 роботов начинают жизнь — первое племя ${G.tribes[t1].name}.`);
}
function pushEvent(text) { events.unshift({ t: simTime, text }); if (events.length > 100) events.pop(); }
function first(key, text) { if (!G.firsts[key]) { G.firsts[key] = true; pushEvent(text); } }
function say(r, text, kind = '') { r.say = { text, kind, until: performance.now() + 1900 }; }

// ---------- главный шаг ----------
function step() {
  simTime += DT;
  const sn = season();
  if (G.season !== sn) {
    G.season = sn;
    pushEvent(['Пришла весна: яблоки снова растут.', 'Лето: яблок больше всего.', 'Осень: яблок становится меньше — время запасаться.', 'Зима: яблок почти нет, ночи очень холодные. Выживут те, у кого есть укрытие и запасы.'][sn]);
  }
  world.tick(DT, SET.food * SEASON_FOOD[sn]);
  objGrid = makeGrid(world.objects); robGrid = makeGrid(robots);
  if (!treeGrid) treeGrid = makeGrid(world.trees);
  for (const r of robots) updateRobot(r);
  zombieTick(DT);
  tribeTick();
  colonyTick();
  let removed = false;
  for (const r of robots) if (r.dead) {
    removed = true; G.deaths++; G.causes[r.cause] = (G.causes[r.cause] || 0) + 1;
    if (r.carry) { r.carry.carried = false; r.carry = null; }
  }
  if (removed) robots = robots.filter(r => !r.dead);
  if (births.length) { for (const c of births) robots.push(c); births = []; }
  if (world.removed) { world.objects = world.objects.filter(o => !o.dead); world.removed = false; }
  while (robots.length < 10) spawnBud();
  if (simTime - lastSample >= 5) { lastSample = simTime; sample(); }
}

// ---------- тело: драйвы, химия, здоровье ----------
function body(r) {
  const g = r.genes, d = r.d, c = r.chem, night = isNight(), a = r.action, resting = a === 8;
  let close2 = 0, close6 = 0;
  near(robGrid, r.x, r.z, 6, o => { if (o === r) return; const q = (o.x - r.x) ** 2 + (o.z - r.z) ** 2; if (q < 36) close6++; if (q < 4) close2++; });
  let close3 = 0;
  near(robGrid, r.x, r.z, 3, o => { if (o !== r && (o.x - r.x) ** 2 + (o.z - r.z) ** 2 < 9) close3++; });
  // крона дерева греет лишь отчасти; стены вокруг и крыша над головой (построенные или яма) — по-настоящему
  const walls = shelterWalls(r), roof = hasRoof(r), canopy = world.covered(r.x, r.z, r.y);
  r.shelter = clamp((roof && walls >= 3) || walls >= 6 ? 1 : roof || walls >= 4 ? 0.7 : canopy ? 0.4 : walls >= 2 ? 0.25 : 0, 0, 1);
  if (close2 >= 2) r.shelter = Math.min(1, r.shelter + 0.2); // прижались друг к другу
  r.sheltered = r.shelter >= 0.7;
  const bio = r.bio = biomeAt(r.x, r.z), bk = BIOMES[bio].k;
  r.biomes = r.biomes || {};
  if (!r.biomes[bio]) { // новое место — радость открытия (странникам особенно)
    r.biomes[bio] = true; r.lastNew = simTime; d[9] = 0; c.reward += 0.4 + 0.6 * (g.wander || 0); c.endorphin += 0.3;
    lifeEvent(r, 'Открыл новый биом: ' + BIOMES[bio].ru); first('biome_' + bk, `${r.name} первым добрался до места «${BIOMES[bio].ru}»`);
  }
  if (r.shelter >= 0.7 && simTime - (r.homeCheck || 0) > 2) { r.homeCheck = simTime; checkHome(r, walls, roof); }
  const inWater = world.depth(r.x, r.z) > 0.3, deep = world.depth(r.x, r.z) > 0.8;
  if (deep) {
    // плавание: не умеет — тонет, страшно и больно; умеет — радость и удовольствие
    practice(r, 'swim', 0.035);
    const sw = r.skill.swim || 0;
    if (sw < 0.35) { r.health -= (0.35 - sw) * 7 * DT; d[8] = Math.min(1, d[8] + 0.12 * DT); d[2] = Math.min(1, d[2] + 0.05 * DT); if (r.health < 30) r.cause = 'утонул'; }
    else { d[9] = Math.max(0, d[9] - 0.04 * DT); c.endorphin += 0.08 * DT; d[8] = Math.max(0, d[8] - 0.02 * DT); }
  }
  // обмен веществ: тело, мозг, сила, движение
  const rest = resting ? 0.45 : 1;
  const se = g.size * (0.55 + 0.45 * growth(r)); // малыши тратят меньше
  r.energy -= (0.13 * se * se + 0.0008 * r.brain.H + g.strength * 0.04 + (r.moving ? 0.1 * r.spd * g.size : 0)) * rest * DT;
  r.water -= 0.24 * rest * (bk === 'jungle' ? 1.4 : 1) * DT; // в джунглях жарко
  r.energy = clamp(r.energy, 0, 100); r.water = clamp(r.water, 0, 100);
  d[0] = 1 - r.energy / 100; d[1] = 1 - r.water / 100;
  // боль: от голода/жажды и падений, утихает (эндорфин помогает)
  d[2] = Math.max(0, d[2] * Math.exp(-DT / 8) + ((r.energy <= 0 || r.water <= 0) ? 0.06 * DT : 0) - c.endorphin * 0.02 * DT);
  // усталость и сон
  d[3] += (r.moving ? 0.012 * (1.3 - g.stamina * 0.6) : 0) * DT - (resting ? 0.06 : 0.004) * DT;
  d[4] += (night ? 0.012 : 0.004) * DT - (resting ? (night ? 0.05 : 0.02) * (r.sheltered ? 1.3 : 0.8) : 0) * DT;
  // холод: ночью без укрытия и в воде; днём, в укрытии и рядом с другими — теплее
  const winter = season() === 3 ? 2 : 1;
  const chill = night ? 0.016 * winter * (bk === 'pine' ? 1.5 : 1) * (1 - r.shelter) : (winter > 1 ? 0.005 * (1 - r.shelter) : 0);
  d[5] += (chill > 0.001 ? chill : -0.02) * DT + (r.shelter >= 0.7 ? -0.015 * DT : 0) + (inWater ? (night || season() === 3 ? 0.025 : 0.004) * DT : 0);
  // одиночество и теснота
  d[6] += (close6 === 0 ? 0.005 * (0.3 + g.social) : -0.012) * DT;
  d[7] += (close3 > 3 ? 0.012 * (close3 - 3) : -0.02) * DT; // толпа раздражает
  // страх и злость остывают; ночью в одиночестве тревожно
  d[8] = d[8] * Math.exp(-DT / (buffOn(r, 'calm') ? 2.5 : 6)) + (night && close6 === 0 ? 0.003 * g.nerves : 0) * DT;
  d[10] = d[10] * Math.exp(-DT / 10);
  const zb = nearestZombie(r, 10); if (zb) d[8] += (0.08 * (0.5 + g.nerves) * (1 - Math.hypot(zb.x - r.x, zb.z - r.z) / 10)) * DT;
  // скука копится, если ничего нового
  d[9] += 0.006 * (0.3 + g.curiosity) * DT + (simTime - (r.lastNew || 0) > 40 ? 0.008 * g.curiosity * DT : 0); // засиделся на одном месте — тянет исследовать
  // влечение — у взрослых и сытых
  d[11] += (r.role === 'queen' && isAdult(r) && r.energy > 45 && r.mateCool <= 0 ? 0.012 * (0.4 + g.fertility) : -0.004) * DT;
  for (let i = 0; i < ND; i++) d[i] = clamp(d[i], 0, 1);
  // гормоны
  c.adrenaline += (Math.max(d[8], d[10], d[2]) - c.adrenaline) * DT * 0.5;
  c.endorphin *= Math.exp(-DT / 5);
  c.reward *= Math.exp(-DT / 3); c.punish *= Math.exp(-DT / 3);
  // болезни: подхватывает чаще, когда замёрз и слабый иммунитет
  if (c.antigen <= 0 && Math.random() < DT * 0.0006 * (1 + 3 * d[5]) * (1.4 - g.immunity) * (bk === 'birch' ? 1.8 : 1)) { c.antigen = 0.6 + Math.random() * 0.4; r.st.ill++; lifeEvent(r, 'Заболел'); }
  if (c.antigen > 0) {
    c.antibody = Math.min(1, c.antibody + DT * 0.015 * (0.4 + g.immunity));
    c.antigen = Math.max(0, c.antigen - DT * c.antibody * 0.04);
    d[3] = Math.min(1, d[3] + DT * 0.01 * c.antigen); d[5] = Math.min(1, d[5] + DT * 0.006 * c.antigen); // слабость и озноб
    if (c.antigen === 0) lifeEvent(r, 'Выздоровел');
  } else c.antibody = Math.max(0.1, c.antibody - DT * 0.002);
  // физическое здоровье
  let dh = (r.energy > 0 && r.water > 0 ? (resting ? 1.5 : 0.35) : 0) * (stageOf(r) === 'Старик' ? 0.3 : 1);
  if (r.energy <= 0) { dh -= 3; r.cause = 'голод'; }
  if (r.water <= 0) { dh -= 3; r.cause = 'жажда'; }
  if (c.antigen > 0) { dh -= 0.7 * c.antigen; if (r.health < 30) r.cause = 'болезнь'; }
  if (c.adrenaline > 0.75) dh -= 0.2;
  if (d[5] > 0.8) { dh -= 0.6 * (d[5] - 0.8) * 5; if (r.health < 25) r.cause = 'холод'; } // переохлаждение
  r.health = clamp(r.health + dh * DT, 0, 100);
  // психическое здоровье: хронический стресс его разрушает, спокойствие восстанавливает
  const stress = (d[2] + d[5] + d[6] + d[8] + d[9] + d[10]) / 6;
  r.mental = clamp(r.mental + (0.35 - stress * 1.6 + (buffOn(r, 'calm') ? 0.3 : 0) + (bk === 'birch' ? 0.15 : 0)) * DT * 1.2, 0, 100);
  r.happy = happiness(r);
  if (r.health <= 0) r.dead = true;
  if (r.age > r.lifespan) { r.dead = true; r.cause = 'старость'; }
  if (r.dead) lifeEvent(r, 'Умер: ' + r.cause);
}
function happiness(r) { let s = 0, w = 0; for (let i = 0; i < ND; i++) { s += r.d[i] * DRIVES[i][2]; w += DRIVES[i][2]; } return 1 - s / w; }
function shelterWalls(r) {
  let n = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) if (world.height(r.x + dx, r.z + dz) >= r.y + 1) n++;
  return n;
}

function updateRobot(r) {
  const g = r.genes;
  r.age += r.role === 'queen' ? DT / QUEEN_LIFE : DT; r.actT -= DT; r.mateCool -= DT; r.mateWish -= DT; r.heard.t -= DT; r.fallT -= DT; // матка стареет втрое медленнее
  if (r.actT <= 0 && r.fallT <= 0) decide(r);
  const a = r.action;
  r.moving = false;
  if (a <= 2 && r.fallT <= 0) {
    if (a === 1) r.yaw += 2.4 * DT; else if (a === 2) r.yaw -= 2.4 * DT;
    // скорость зависит от навыка ходьбы — малыши ковыляют
    const v = r.spd * (buffOn(r, 'speed') ? 1.3 : 1) * (a === 0 ? 1 : 0.5) * (0.2 + 0.8 * r.skill.walk) * (0.55 + 0.45 * growth(r));
    const dx = Math.sin(r.yaw) * v * DT, dz = Math.cos(r.yaw) * v * DT;
    // шаг с учётом толщины тела; упёрся в стену — скользит вдоль неё
    const f = stepBody(r, r.x + dx, r.z + dz) || stepBody(r, r.x + dx, r.z) || stepBody(r, r.x, r.z + dz);
    if (f > 0) {
      r.st.dist += v * f * DT; r.moving = true; r.stuckT = 0;
      practice(r, 'walk', 0.015);
      // неумелый робот спотыкается и падает: больно и страшно
      if (Math.random() < DT * (1 - r.skill.walk) * 0.35) {
        r.fallT = 1.2; r.d[2] = Math.min(1, r.d[2] + 0.12); r.d[8] = Math.min(1, r.d[8] + 0.1); r.st.falls++;
      }
      if ((r.carry || bagCount(r)) && Math.random() < DT * (1 - r.skill.carry) * 0.15) { dropCarry(r); } // уронил
      // новые места снимают скуку
      const cell = (Math.floor(r.x / 6) + 100) * 1000 + Math.floor(r.z / 6) + 100;
      if (!r.seen.has(cell)) { r.seen.add(cell); r.d[9] = Math.max(0, r.d[9] - 0.05); r.lastNew = simTime; }
    } else unstick(r);
  }
  near(robGrid, r.x, r.z, 1.5, o => {
    if (o === r) return;
    const dx = r.x - o.x, dz = r.z - o.z, dd = Math.hypot(dx, dz), m = 0.3 * (g.size + o.genes.size);
    // расталкивание — только туда, где можно стоять (не внутрь блока)
    if (dd < m && dd > 1e-4) { const p = (m - dd) * 0.5, x = inX(r.x + dx / dd * p), z = inZ(r.z + dz / dd * p); if (standable(r, x, z)) { r.x = x; r.z = z; } }
  });
  if (!standable({ ...r, y: world.height(r.x, r.z) }, r.x, r.z)) pushOut(r); // оказался в блоке — вытолкнуть
  r.y = world.height(r.x, r.z);
  if (r.carry && r.carry.dead) r.carry = null;
  if (r.carry) { r.carry.x = r.x; r.carry.z = r.z; }
  body(r);
}
// ---------- тело в мире блоков: не залезать в стены ----------
const BODY_R = r => 0.22 * r.genes.size * (0.55 + 0.45 * growth(r));
function climbLimit(r) { return world.depth(r.x, r.z) > 0.8 ? Math.max(1.05, world.waterLevel(r.x, r.z) - r.y + 1.05) : 1.05; }
// можно ли стоять в точке: центр и края тела не упираются в блоки выше «шага»
function standable(r, x, z) {
  const lim = climbLimit(r), rr = BODY_R(r), h0 = world.height(x, z);
  if (h0 - r.y > lim) return false;
  for (const [ox, oz] of [[rr, 0], [-rr, 0], [0, rr], [0, -rr]]) if (world.height(x + ox, z + oz) - r.y > lim) return false;
  return true;
}
// шаг в точку: возвращает долю пройденного (0 — нельзя)
function stepBody(r, nx, nz) {
  nx = inX(nx); nz = inZ(nz);
  const dep = world.depth(nx, nz), swimming = world.depth(r.x, r.z) > 0.8;
  let f = dep > 0.8 ? 0.2 + 0.6 * (r.skill.swim || 0) : dep > 0 ? 0.45 : 1; // в глубину может зайти любой, но плыть — уметь
  if (!f || !standable(r, nx, nz)) return 0;
  if (world.height(nx, nz) - r.y > 0.5) f *= 0.5;
  r.x += (nx - r.x) * f; r.z += (nz - r.z) * f;
  return f;
}
// вытолкнуть из блока на ближайшее место, где тело помещается
function pushOut(r) {
  for (let d = 0.25; d <= 2.5; d += 0.25) for (let k = 0; k < 12; k++) {
    const an = k / 12 * Math.PI * 2, x = inX(r.x + Math.sin(an) * d), z = inZ(r.z + Math.cos(an) * d), h = world.height(x, z);
    if (world.depth(x, z) < 0.8 && standable({ ...r, x, z, y: h }, x, z)) { r.x = x; r.z = z; return; }
  }
}
// застрял (яма, щель, зажали блоками) — найти ближайшее проходимое место и выбраться
function unstick(r) {
  r.stuckT = (r.stuckT || 0) + DT;
  if (r.stuckT < 4) return;
  let best = null;
  for (let d = 1; d <= 3 && !best; d++) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = inX(r.x + Math.sin(a) * d), z = inZ(r.z + Math.cos(a) * d), h = world.height(x, z);
    if (Math.abs(h - r.y) <= 1.05 && world.depth(x, z) < 0.8 && standable({ ...r, x, z, y: h }, x, z)) { best = [x, z, a]; break; }
  }
  if (best) {
    r.yaw = best[2];
    if (r.stuckT > 8) { r.x = best[0]; r.z = best[1]; r.stuckT = 0; } // долго не выходит — переступает
  } else if (r.stuckT > 10) { // заперт со всех сторон — выбирается наверх, как по лестнице
    r.y = world.height(r.x, r.z); r.stuckT = 0;
    for (let d = 1; d <= 6; d++) for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283, x = inX(r.x + Math.sin(a) * d), z = inZ(r.z + Math.cos(a) * d); if (!world.isWater(x, z)) { r.x = x; r.z = z; return; } }
  }
}
// ---------- прыжки: залезть на уступ в 2 блока. Навык растёт практикой, как ходьба ----------
function jumpTarget(r) {
  for (const s of [0.8, 1.2]) {
    const x = inX(r.x + Math.sin(r.yaw) * s), z = inZ(r.z + Math.cos(r.yaw) * s), dh = world.height(x, z) - r.y;
    if (dh > 0.5 && dh <= 2.05 && world.depth(x, z) < 0.8 && standable({ ...r, y: world.height(x, z) }, x, z)) return [x, z];
  }
  return null;
}
function jump(r) {
  const t = jumpTarget(r);
  r.energy -= 1.2; r.d[3] = Math.min(1, r.d[3] + 0.04);
  r.anim.jump = 1; r.st.jumps = (r.st.jumps || 0) + 1;
  practice(r, 'jump', 3);
  if (!t) return;
  const dh = world.height(t[0], t[1]) - r.y;
  const chance = (0.2 + 0.75 * r.skill.jump) * (0.6 + 0.5 * strOf(r)) * (dh > 1.05 ? 0.8 : 1.2) * (0.55 + 0.45 * growth(r));
  if (Math.random() < chance) {
    r.x = t[0]; r.z = t[1]; r.d[9] = Math.max(0, r.d[9] - 0.05);
    first('jump', `${r.name} первым запрыгнул на уступ`);
    discover(r, 'jump'); inspire(r, 'skill', 'jump');
  } else { r.fallT = 0.8; r.d[2] = Math.min(1, r.d[2] + 0.08); r.st.falls++; annoy(r, 0.03); } // не допрыгнул
}
// крыша: над головой (до 4 блоков) есть настоящий блок, не листва
function hasRoof(r) {
  const i = Math.floor(r.x + HX), k = Math.floor(r.z + HZ), y = Math.floor(r.y);
  for (let dy = 1; dy <= 4; dy++) { const b = world.get(i, y + dy, k); if (b && b !== B_LEAVES) return true; }
  return false;
}
// первый раз что-то получилось — сильная радость (снижает скуку, эндорфин)
function discover(r, key) {
  if (r.known['act_' + key]) return;
  r.known['act_' + key] = true; r.d[9] = Math.max(0, r.d[9] - 0.25); r.chem.endorphin += 0.4;
  lifeEvent(r, 'Впервые получилось: ' + { jump: 'прыгнуть на уступ', chop: 'добыть бревно', dig: 'выкопать блок', build: 'поставить блок', kill: 'победить зомби', plant: 'посадить арбуз' }[key]);
}
// подражание: кто рядом видел удачу — учится сам (культура передаётся без генов)
function inspire(r, kind, what) {
  near(robGrid, r.x, r.z, 6, o => {
    if (o === r || o.dead || (o.x - r.x) ** 2 + (o.z - r.z) ** 2 > 36) return;
    if (kind === 'craft') o.rp[what] = (o.rp[what] || 0) + 0.4;
    else o.skill[what] = Math.min(1, (o.skill[what] || 0) + 0.01 * learnFactor(o));
    o.d[9] = Math.max(0, o.d[9] - 0.02);
    o.seen = o.seen || new Set();
  });
}
// ---------- первое укрытие, сделанное руками роботов ----------
// землянка: робот в яме/выемке, которую выкопали; дом: стены или крыша из поставленных блоков
function checkHome(r, walls, roof) {
  const i0 = Math.floor(r.x + HX), k0 = Math.floor(r.z + HZ);
  let dug = 0, placed = 0;
  for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
    const i = i0 + di, k = k0 + dk; if (i < 0 || k < 0 || i >= MAPX || k >= MAPZ) continue;
    const m = world.mod[k * MAPX + i]; if (m & 1) dug++; if (m & 2) placed++;
  }
  const type = placed >= 3 ? 'дом' : dug >= 3 ? 'землянка' : null; // природная выемка в склоне не считается
  if (!type) return;
  G.homes = G.homes || {};
  const key = Math.round(r.x / 3) + ',' + Math.round(r.z / 3);
  if (!G.homes[key]) { G.homes[key] = { type, t: simTime, by: r.name }; G.homeCount = (G.homeCount || 0) + 1; }
  const fk = type === 'дом' ? 'firstHouse' : 'firstDugout';
  if (!G[fk]) {
    G[fk] = { t: simTime, day: Math.floor(simTime / DAY) + 1, by: r.name, gen: r.gen, walls, roof, dug, placed };
    pushEvent(`${r.name} (пок. ${r.gen}) первым укрылся в ${type === 'дом' ? 'построенном доме' : 'выкопанной землянке'} — день ${G[fk].day}`);
    lifeEvent(r, type === 'дом' ? 'Первым в племени укрылся в построенном доме' : 'Первым в племени укрылся в землянке');
  }
}
// ---------- исследование: любопытные уходят в дальние леса, других зовут с собой ----------
function nestUnder(r) {
  const q = world.col(r.x, r.z); if (q < 0 || world.hi[q] - world.top[q] < 2 || world.get(q % MAPX, world.hi[q] - 1, q / MAPX | 0) !== B_ROOF) return null;
  let best = null, bd = 14;
  for (const c of G.camps || []) if (c.nest) { const d = Math.hypot(c.nest.x - r.x, c.nest.z - r.z); if (d < bd) { bd = d; best = c.nest; } }
  return best;
}
function nestExit(r, n) {
  if (Math.abs(r.z - n.z) > 0.45 && Math.abs(r.x - n.x) > 2.5) return { x: r.x, z: n.z }; // сначала на ось хода
  if (Math.abs(r.z - n.z) > 0.45) return { x: Math.min(r.x + 1, n.x + 2), z: n.z };
  return { x: n.x + 5.5, z: n.z };
}
function steerTo(L, r, x, z, kb) {
  const n = nestUnder(r); if (n && Math.hypot(x - n.x, z - n.z) > 6) ({ x, z } = nestExit(r, n)); // из гнезда — только через ход
  const a = normA(Math.atan2(x - r.x, z - r.z) - r.yaw);
  L[1] += kb * Math.max(0, Math.sin(a)) * 1.6; L[2] += kb * Math.max(0, -Math.sin(a)) * 1.6; L[0] += kb * (Math.cos(a) * 0.9 + (Math.cos(a) > 0.4 ? 0.2 : -0.4)); // цель сбоку — сначала развернуться, не кружить
}
function exploreGoal(r) {
  const g = r.genes, I = r.inp;
  if (r.role === 'queen') return null; // матка не уходит
  if (r.goal && !isExplorer(r) && Math.max(I[0], I[1]) > 0.62) { r.goal = null; lifeEvent(r, 'Вернулся с полпути: голодно'); } // спутник сдаётся, странник — нет
  if (Math.max(I[0], I[1]) > (isExplorer(r) || (r.goal && r.goal.follow) ? 0.62 : 0.45) || ['Малыш', 'Ребёнок'].includes(stageOf(r))) return null;
  if (r.goal && simTime < r.goal.until) {
    if ((r.goal.x - r.x) ** 2 + (r.goal.z - r.z) ** 2 < 16) {
      r.mem.tree = { x: r.goal.x, z: r.goal.z }; const w = nearestWaterTo(r.x, r.z); if (w && Math.hypot(w.x - r.x, w.z - r.z) < 35) r.mem.water = w; // новый дом: здесь и вода рядом
      lifeEvent(r, 'Дошёл до места: ' + BIOMES[biomeAt(r.x, r.z)].ru);
      arriveAt(r, r.goal.x, r.goal.z, isExplorer(r) || !!r.goal.follow); // поход странника — новая стоянка, кто бы ни дошёл первым
      r.goal = null; r.settled = simTime + (isExplorer(r) ? 500 : 900); return null;
    }
    // в пути пьёт из ближайшей воды и ищет еду у цели, а не возвращается к старому дому
    if (I[1] > 0.25 && simTime > (r.wT || 0)) { r.wT = simTime + 8; const w = nearestWaterTo(r.x, r.z); if (w && Math.hypot(w.x - r.x, w.z - r.z) < 40) r.mem.water = w; }
    r.mem.tree = { x: r.goal.x, z: r.goal.z };
    return r.goal;
  }
  r.goal = null;
  if (simTime < (r.settled || 0)) return null; // осел на новом месте — живёт тут
  // в поход сами собираются только странники; остальные — лишь когда совсем тесно или голодно
  const ex = isExplorer(r);
  const crowded = I[7] > 0.25, scarce = I[0] > 0.3 && !r.near.food && !(r.near.tree && r.near.tree.apples > 0);
  if (!ex && !crowded && !scarce) return null;
  if (ex && season() >= 2) return null; // в дальний путь — только весной и летом
  if (Math.random() > (ex ? 0.004 + 0.01 * g.wander : 0.002 + 0.006 * g.curiosity)) return null;
  // цель: далёкий лес, лучше — в биоме, где ещё не бывал, и не на чужой земле
  let best = null, bs = -1;
  const unknown = ex ? world.trees.filter(t => t.biome && !(r.biomes || {})[BI[t.biome]]) : [];
  for (let i = 0; i < 16; i++) {
    const t = unknown.length && Math.random() < 0.6 ? pick(unknown) : pick(world.trees), dd = Math.hypot(t.x - r.x, t.z - r.z);
    if (dd < (ex ? 40 : 20) || dd > (ex ? 140 : 70)) continue; // дальние леса осваиваются ступеньками, через новые стоянки
    const owner = territoryOwnerXZ(t.x, t.z), bi = BI[t.biome || 'apple'] ?? 1;
    const sc = (owner && owner !== r.tribe ? (ex ? 0.15 : 0.3) : 1) * (ex && !(r.biomes || {})[bi] ? 3 : 1) * (1 + t.apples * 0.2) * (0.5 + Math.random());
    if (sc > bs) { bs = sc; best = t; }
  }
  if (!best) return null;
  r.goal = { x: best.x, z: best.z, until: simTime + (ex ? 900 : 320) };
  lifeEvent(r, ex ? 'Отправился исследовать: ' + BIOMES[BI[best.biome || 'apple'] ?? 1].ru : crowded ? 'Решил уйти: слишком тесно' : 'Решил уйти искать еду');
  // за странником идут несколько соплеменников — так возникают новые стоянки
  let nf = 0;
  if (ex) near(robGrid, r.x, r.z, 12, o => {
    if (nf >= 6 || o === r || o.tribe !== r.tribe || o.goal || isExplorer(o) || o.role === 'queen' || Math.max(o.d[0], o.d[1]) > 0.45 || ['Малыш', 'Ребёнок'].includes(stageOf(o))) return;
    if (simTime >= (o.settled || 0) && Math.random() < 0.35 + o.genes.social * 0.35 + o.genes.curiosity * 0.2 && ++nf) o.goal = { x: best.x + rnd(-3, 3), z: best.z + rnd(-3, 3), until: simTime + 940, follow: r.name };
  });
  return r.goal;
}
// ---------- трава, семена, арбузы ----------
const MELON_RIPE = 100;
function cutGrass(r, o) {
  o.dead = true; world.removed = true;
  bagAdd(r, 'seed'); practice(r, 'farm', 1); r.d[9] = Math.max(0, r.d[9] - 0.02);
  first('grass', `${r.name} первым сорвал траву и нашёл семечко арбуза`);
}
function nearWaterWithin(x, z, d) { for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; for (let s = 1; s <= d; s++) if (world.isWater(x + Math.sin(a) * s, z + Math.cos(a) * s)) return true; } return false; }
function farmSpot(r) {
  const [x, z] = front(r, 0.9);
  if (world.isWater(x, z)) return null;
  const b = world.topBlock(x, z);
  if (b !== B_GRASS && b !== B_DIRT) return null;
  if (!nearWaterWithin(x, z, 5)) return null; // арбузам нужна вода рядом
  if (nearestIn({ x, z }, 0.9, o => o.t === 'melon')) return null;
  return [x, z];
}
function plant(r) {
  const sp = farmSpot(r); if (!sp) return;
  practice(r, 'farm', 3);
  if (Math.random() > 0.3 + 0.7 * (r.skill.farm || 0)) { annoy(r, 0.02); return; } // семечко не прижилось
  bagTake(r, 'seed'); world.add({ t: 'melon', x: inX(sp[0]), z: inZ(sp[1]), g: 0, by: r.tribe });
  r.st.planted = (r.st.planted || 0) + 1; r.d[9] = Math.max(0, r.d[9] - 0.08);
  discover(r, 'plant'); inspire(r, 'skill', 'farm');
  first('plant', `${r.name} первым посадил арбуз у воды`);
}
function learnFactor(r) { return (buffOn(r, 'int') ? 1.5 : 1) * (0.25 + r.genes.learn) * (0.35 + r.brain.H / 50) * (0.5 + r.mental / 200); }
function practice(r, k, amt) {
  const before = r.skill[k];
  r.skill[k] = Math.min(1, before + amt * DT * learnFactor(r) * (1 - before * 0.5));
  if (before < 0.5 && r.skill[k] >= 0.5) {
    const nm = SKILLS.find(s => s[0] === k)[1];
    lifeEvent(r, `Научился: ${nm.toLowerCase()}`);
    r.d[9] = Math.max(0, r.d[9] - 0.3); r.chem.endorphin += 0.5; // радость: получилось!
    if (k !== 'walk') first('skill_' + k, `${r.name} первым освоил навык «${nm}»`);
  }
}

// ---------- органы чувств ----------
function sense(r) {
  const g = r.genes, night = isNight(), R = (7 + g.head * 4) * (night ? 0.7 : 1);
  const best = { food: null, letter: null, obst: null, robot: null, block: null }, bd = { food: R * R, letter: (R * 2.5) ** 2, obst: R * R, robot: R * R, block: R * R };
  near(objGrid, r.x, r.z, R * 2.5, o => {
    if (o.dead || o.carried) return;
    const c = isFood(o) ? 'food' : o.t === 'letter' ? 'letter' : o.t === 'block' ? 'block' : null;
    if (!c) return;
    const dd = (o.x - r.x) ** 2 + (o.z - r.z) ** 2;
    if (dd < bd[c]) { bd[c] = dd; best[c] = o; }
  });
  near(robGrid, r.x, r.z, R, o => {
    if (o === r || o.dead) return;
    const dd = (o.x - r.x) ** 2 + (o.z - r.z) ** 2;
    if (dd < bd.robot) { bd.robot = dd; best.robot = o; }
  });
  let tree = null, td = (R * 1.6) ** 2;
  near(treeGrid, r.x, r.z, R * 1.6, t => { const dd = (t.x - r.x) ** 2 + (t.z - r.z) ** 2; if (dd < td) { td = dd; tree = t; } });
  for (const s of [1, 2]) {
    const x = r.x + Math.sin(r.yaw) * s, z = r.z + Math.cos(r.yaw) * s;
    if (world.height(x, z) - r.y > 1.05 && s * s < bd.obst) { bd.obst = s * s; best.obst = { t: 'wall', x, z }; break; }
  }
  const RW = R * 2;
  let wbest = null, wd = RW;
  if (world.isWater(r.x, r.z)) { wbest = { x: r.x, z: r.z }; wd = 0; }
  else for (let k = 0; k < 12; k++) {
    const a = r.yaw + k * Math.PI / 6;
    for (let s = 1.5; s < wd; s += 1.5) {
      const x = r.x + Math.sin(a) * s, z = r.z + Math.cos(a) * s;
      if (world.isWater(x, z)) { wd = s; wbest = { x, z }; break; }
    }
  }
  const I = r.inp;
  for (let i = 0; i < ND; i++) I[i] = r.d[i];
  I[12] = r.carry ? 1 : 0; I[13] = night ? 1 : 0; I[14] = 1; I[15] = r.shelter || 0;
  const put = (o, base, d2, range = R) => {
    if (!o) { I[base] = I[base + 1] = I[base + 2] = 0; return 0; }
    const a = Math.atan2(o.x - r.x, o.z - r.z) - r.yaw, p = Math.max(0.01, 1 - Math.sqrt(d2) / range);
    I[base] = Math.sin(a); I[base + 1] = Math.cos(a); I[base + 2] = p;
    return p;
  };
  r.prox.food = put(best.food, 16, bd.food);
  r.prox.water = put(wbest, 19, wd * wd, RW);
  put(best.robot, 22, bd.robot);
  r.prox.letter = put(best.letter, 25, bd.letter, R * 2.5);
  r.prox.tree = put(tree, 28, td, R * 1.6);
  put(best.obst, 31, bd.obst);
  put(best.block, 34, bd.block);
  I[37] = r.heard.t > 0 ? r.heard.t / 5 : 0;
  I[38] = digValue(r); I[39] = placeValue(r);
  I[40] = Math.random() * 2 - 1;
  const zb = nearestZombie(r, R * 1.3);
  put(zb, 41, zb ? (zb.x - r.x) ** 2 + (zb.z - r.z) ** 2 : 0, R * 1.3);
  let grass = null, gd = R * R, enemy = null, ed = R * R;
  near(objGrid, r.x, r.z, R, o => { if (o.t !== 'grass' || o.dead) return; const q = (o.x - r.x) ** 2 + (o.z - r.z) ** 2; if (q < gd) { gd = q; grass = o; } });
  near(robGrid, r.x, r.z, R, o => { if (o === r || !isEnemy(r, o)) return; const q = (o.x - r.x) ** 2 + (o.z - r.z) ** 2; if (q < ed) { ed = q; enemy = o; } });
  I[49] = world.depth(r.x, r.z) > 0.8 ? 1 : 0;
  put(grass, 50, gd);
  I[53] = enemy ? Math.max(0.01, 1 - Math.sqrt(ed) / R) : 0; I[54] = r.inv.seed ? 1 : 0;
  best.grass = grass; best.enemy = enemy;
  if (I[49]) { best.land = null; for (let k = 0; k < 12 && !best.land; k++) for (let s2 = 1.5; s2 <= 12; s2 += 1.5) { const a2 = k / 12 * 6.283, lx = r.x + Math.sin(a2) * s2, lz = r.z + Math.cos(a2) * s2; if (!world.isWater(lx, lz) && world.height(lx, lz) - r.y < 1.6) { best.land = { x: lx, z: lz }; break; } } }
  I[44] = stationNear(r, B_TABLE) ? 1 : 0; I[45] = stationNear(r, B_FURNACE) ? 1 : 0;
  I[46] = (r.inv.cooked || r.inv.meat || Object.keys(FOODS).some(k => r.inv[k])) ? 1 : 0; I[47] = PLACEABLE.some(p => r.inv[p[0]]) ? 1 : 0; I[48] = r.tools.sword ? 1 : 0;
  // глаза муравья: 24 направления × 8 признаков
  const V = r.vision || (r.vision = new Float32Array(VIS_RAYS * VIS_FEAT));
  V.fill(0);
  for (let k = 0; k < VIS_RAYS; k++) {
    const a = r.yaw + (k / VIS_RAYS - 0.5) * Math.PI * 2, x = r.x + Math.sin(a) * 3, z = r.z + Math.cos(a) * 3;
    V[k * VIS_FEAT] = night ? 0.3 : 0.8;
    V[k * VIS_FEAT + 1] = clamp((world.height(x, z) - r.y) / 3 + 0.5, 0, 1);
    V[k * VIS_FEAT + 2] = world.isWater(x, z) ? 1 : 0;
  }
  const see = (o, f, rng) => { if (!o) return; const a = normA(Math.atan2(o.x - r.x, o.z - r.z) - r.yaw); const k = clamp(Math.floor((a / (Math.PI * 2) + 0.5) * VIS_RAYS), 0, VIS_RAYS - 1); V[k * VIS_FEAT + f] = Math.max(0.05, 1 - Math.hypot(o.x - r.x, o.z - r.z) / rng); };
  see(best.robot, 3, R); see(best.food, 4, R); see(tree, 5, R * 1.6); see(zb, 6, R * 1.3); see(best.block || best.letter, 7, R * 2.5);
  // что вообще можно сделать сейчас (как в Creatures: действие направлено на объект внимания)
  const av = r.avail || (r.avail = new Uint8Array(NA)); av.fill(1);
  const nearTrunk = tree && (tree.x - r.x) ** 2 + (tree.z - r.z) ** 2 < (reach(r) + 0.8) ** 2;
  const cN = campById(r.camp), farNest = !cN || !cN.nest || Math.hypot(cN.nest.x - r.x, cN.nest.z - r.z) > 16;
  av[4] = nearTrunk || (r.role === 'builder' && I[38] > 0 && farNest) ? 1 : 0; // копают только строители: у гнезда — по плану, вдали — камень и руду; рубить дерево может любой
  // «взаимодействие» — только когда есть с чем: еда, вода перед носом, дерево, буква, трава, сосед, блок (иначе робот тупо стоит и жмёт)
  const Rr = reach(r);
  av[3] = (r.energy < 97 && nearestIn(r, Rr, isFood)) || (r.water < 95 && nearWater(r)) || (r.energy < 80 && (r.inv.cooked || r.inv.meat || Object.keys(FOODS).some(k => r.inv[k]))) || nearTrunk ||
    nearestIn(r, Rr + 0.8, o => o.t === 'letter' && !o.carried) || nearestIn(r, Rr, o => o.t === 'grass' || o.t === 'block') || nearestRobot(r, Rr + 0.4) ? 1 : 0;
  av[5] = r.carry || nearestIn(r, reach(r), o => CARRY.has(o.t) || o.t === 'meat') || (I[47] && r.role === 'builder' && placeSpot(r)) ? 1 : 0; // ставить блоки — тоже дело строителей
  av[7] = 0; // спариваться некому: потомство даёт только матка (яйца)
  if (r.role === 'builder') { const c = campById(r.camp), n = c && c.nest, cl = n && nestNext(n); if (cl && Math.hypot(cl.i - HX + 0.5 - r.x, cl.k - HZ + 0.5 - r.z) < reach(r) + 1.4) av[4] = 1; }
  av[9] = nearestZombie(r, reach(r) + 0.6) || nearestRobot(r, reach(r)) ? 1 : 0;
  if (r.inv.seed && farmSpot(r)) av[5] = 1;
  av[10] = RECIPES.some(rc => canCraftQuick(r, rc, I[44], I[45])) ? 1 : 0;
  av[11] = jumpTarget(r) ? 1 : 0;
  // мозг муравья «тикает» ~2 раза в секунду (как реальные нейронные ритмы), решения используют последний результат
  if (!(simTime - (r.flyT || -9) < 0.5)) { r.flyT = simTime; const mo = flyThink(r, V, I, NA); for (let a = 0; a < NA; a++) r.mbOut[a] = mo[a]; }
  best.water = wbest; best.tree = tree; best.R = R;
  r.near = best;
  // память о местах
  if (wbest) r.mem.water = { x: wbest.x, z: wbest.z };
  if (tree && tree.apples > 0) r.mem.tree = { x: tree.x, z: tree.z };
}

// ---------- решение + обучение ----------
const DZ = new Float32Array(NA), NN_CAP = 2, INSTL = new Float32Array(NA);
const normA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const temp = r => (0.35 + r.genes.curiosity * 0.6) * (1 + (1 - r.mental / 100) * 0.8); // плохая психика — поведение хаотичнее
function decide(r) {
  const pf = r.prox.food, pw = r.prox.water;
  sense(r);
  // награда = снижение драйвов (как в Creatures), наказание = их рост
  let R = 0;
  for (let i = 0; i < ND; i++) R += (r.dPrev[i] - r.d[i]) * DRIVES[i][2] * 4;
  r.dPrev.set(r.d);
  R += (r.prox.food - pf) * 1.2 * r.d[0] + (r.prox.water - pw) * 1.2 * r.d[1];
  r.rew += R;
  if (r.rew > 0) r.chem.reward += r.rew * 0.3; else r.chem.punish -= r.rew * 0.3;
  learn(r);
  forward(r);
  let u = Math.random(), a = 0;
  for (; a < NA - 1; a++) { u -= r.probs[a]; if (u <= 0) break; }
  addTrace(r, a);
  r.action = a; r.actT = ACT_DUR[a]; r.st.acts[a]++;
  doAction(r, a);
}
// врождённые инстинкты: подойти к еде/воде/дереву, есть, пить, спать. Копать, носить, строить — НЕ инстинкт
function instinct(r) {
  const I = r.inp, L = INSTL, g = r.genes, k = 2.6 * g.instinct;
  L.fill(0);
  r.intent = null;
  if (k < 0.01) return L;
  const hunger = I[0], thirst = I[1], R0 = r.near.R || 9;
  const kk = k * (1 + 3 * Math.max(0, Math.max(hunger, thirst) - 0.35)); // отчаяние перебивает привычки
  const close = 1 - (reach(r) - 0.2) / R0;
  const needs = [
    [hunger * 1.2, 16, 3, close, true], [thirst * 1.3, 19, 3, 1 - 1.2 / (R0 * 2), true],
    [I[18] ? 0 : hunger * 0.9, 28, 3, 1 - 1.6 / (R0 * 1.6), true],              // яблок не видно — к дереву
    [I[37] > 0 ? hunger * 0.8 : 0, -2, 0, 2, true],                                // услышал зов «еда»
    [Math.max(I[6] * 0.7, isAdult(r) ? I[11] * 0.8 : 0), 22, I[11] > I[6] ? 7 : 3, close, false],
    [I[9] * g.curiosity * 0.6 * Math.min(1 - hunger, 1 - thirst), 25, 0, 2, false], // скучно — посмотреть на новое
    [I[49] ? 0 : I[9] * (0.3 + (r.skill.swim || 0)) * 0.8 * (1 - I[5]) * Math.min(1 - hunger, 1 - thirst) * (I[13] ? 0.2 : 1), 19, 0, 2, false, 'swim'], // плавать — приятно
  ];
  let best = null, bu = 0.05;
  for (const n of needs) if (n[0] > bu && (n[1] < 0 ? r.heard.t > 0 : I[n[1] + 2] > 0)) { bu = n[0]; best = n; }
  let ms = 0, mc = 0;
  const memo = (m, u, key) => {
    if (!m || u <= bu) return;
    if ((m.x - r.x) ** 2 + (m.z - r.z) ** 2 < 4) { r.mem[key] = null; return; }
    const a = Math.atan2(m.x - r.x, m.z - r.z) - r.yaw;
    bu = u; best = [u, -1, 0, 2, true]; ms = Math.sin(a); mc = Math.cos(a);
    r.intent = { label: key === 'water' ? 'к воде, которую помнит' : 'к дереву, которое помнит', x: m.x, z: m.z };
  };
  if (!I[21]) memo(r.mem.water, thirst * 1.3, 'water');
  if (!I[18] && !I[30]) memo(r.mem.tree, hunger * 0.8, 'tree');
  if (best && best[1] >= 0) { const o = { 16: r.near.food, 19: r.near.water, 28: r.near.tree, 22: r.near.robot, 25: r.near.letter }[best[1]], lb = { 16: 'к еде', 19: 'к воде', 28: 'к дереву с яблоками', 22: best[2] === 7 ? 'к партнёру' : 'к сородичу', 25: 'посмотреть на букву' }[best[1]]; if (o) r.intent = { label: best[5] === 'swim' ? 'поплавать' : lb, x: o.x, z: o.z }; }
  if (best && best[1] === -2) { r.intent = { label: 'на зов «еда»', x: r.heard.x, z: r.heard.z }; const a = Math.atan2(r.heard.x - r.x, r.heard.z - r.z) - r.yaw; best = [best[0], -1, 0, 2, true]; ms = Math.sin(a); mc = Math.cos(a); }
  // поход в новый лес перебивают только голод, жажда и опасность
  let exploring = false;
  const gl = exploreGoal(r);
  if (gl && (!best || !best[4] || bu < (isExplorer(r) || gl.follow ? 0.75 : 0.55))) { // в пути отвлекают только сильный голод/жажда, а не пара и не мелочи
    exploring = true; best = null; steerTo(L, r, gl.x, gl.z, k * 1.4); L[0] += k * 0.8; if (r.d[3] < 0.7) L[8] -= k * 2.5; // в пути не рассиживаться
    r.intent = { label: gl.follow ? 'идёт за ' + gl.follow + ' в новые места' : 'исследует новые места', x: gl.x, z: gl.z };
  }
  // работа по должности, как у муравьёв: перебивают её только сильный голод, жажда и страх
  if (!exploring && (!best || !best[4] || bu < 0.85) && I[8] < 0.5) { // долг перед колонией сильнее мелких нужд
    const jb = roleJob(r);
    if (jb) {
      best = null; exploring = true;
      if (jb.near && (jb.act == null || r.avail[jb.act])) { if (jb.act != null) L[jb.act] += k * 3; }
      else { const wp = pathTo(r, jb.x, jb.z); steerTo(L, r, wp.x, wp.z, k * 1.5); L[0] += k * 0.5; if (r.d[3] < 0.7) L[8] -= k * 1.5; } // по тропе, а не напролом
      r.intent = { label: jb.label, x: jb.x, z: jb.z };
    }
  }
  if (best) {
    const mem = best[1] < 0, s = mem ? ms : I[best[1]], c = mem ? mc : I[best[1] + 1], p = mem ? 0 : I[best[1] + 2];
    const kb = best[4] ? kk : k;
    L[1] += kb * Math.max(0, s) * 1.6; L[2] += kb * Math.max(0, -s) * 1.6; L[0] += kb * (c * 0.9 + 0.2);
    if (p > best[3] && best[2]) L[best[2]] += kb * 2.2;
  } else if (!exploring) L[0] += kk * 0.6;
  // тонет — к берегу
  if (I[49] && r.near.land && (I[8] > 0.3 || r.health < 70 || I[5] > 0.5 || (r.skill.swim || 0) < 0.35)) { steerTo(L, r, r.near.land.x, r.near.land.z, kk * 1.5); r.intent = { label: 'выбирается на берег', x: r.near.land.x, z: r.near.land.z }; }
  // враг рядом: страшно — бежать, злость и война — драться (драться ещё надо научиться)
  const en = r.near.enemy;
  if (en) {
    const war = getRel(r.tribe, en.tribe) <= -0.5;
    if (I[8] > 0.4) { const a = normA(Math.atan2(en.x - r.x, en.z - r.z) - r.yaw); L[Math.sin(a) > 0 ? 2 : 1] += k * I[8] * 2; L[0] += k * I[8]; }
    else if (war && I[10] + g.temper * 0.5 > 0.5) { steerTo(L, r, en.x, en.z, k); if (I[53] > 1 - (reach(r) + 0.3) / (r.near.R || 9)) L[9] += k * 1.5; r.intent = { label: 'нападает на чужака из ' + (tribeOf(en.tribe) || {}).name, x: en.x, z: en.z }; }
  }
  if (I[33] > 0.85 && I[32] > 0.6) { L[I[31] > 0 ? 2 : 1] += k; L[0] -= k * 0.5; }
  // врождённое бегство от зомби (драться — надо научиться)
  if (I[43] > 0.2 && I[8] > 0.2 && r.role !== 'soldier') { const f = k * I[8] * 2.5; L[I[41] > 0 ? 2 : 1] += f; L[0] += f * (I[42] < 0 ? 1 : -0.5); }
  // тесно — отойти от соседей (так племя расселяется по карте)
  if (I[7] > 0.35 && Math.max(hunger, thirst) < 0.5 && !exploring) { const f = k * I[7] * 2; L[0] += f; if (I[24] > 0.3) L[I[22] > 0 ? 2 : 1] += f; }
  // сон и отдых
  L[8] += k * (Math.max(0, I[3] - 0.5) * 3 + Math.max(0, I[4] - 0.5) * 3 + Math.max(0, 0.4 - r.health / 100) * 4);
  const need = Math.max(hunger, thirst);
  if (need > 0.5) { L[6] -= kk * need * 1.5; L[7] -= kk * need; L[8] -= kk * need; }
  // в гнезде, а дело снаружи — к выходу (ход идёт по оси гнезда)
  const nn = nestUnder(r);
  if (nn && !(r.intent && Math.hypot(r.intent.x - nn.x, r.intent.z - nn.z) < 6) && !(isNight() && r.role !== 'soldier')) {
    const ex = nestExit(r, nn); steerTo(L, r, ex.x, ex.z, k * 2); r.intent = { label: 'выходит из гнезда', x: ex.x, z: ex.z };
  }
  return L;
}
function forward(r) {
  const b = r.brain, H = b.H, x = r.inp, h = r.hid, p = r.probs, T = temp(r), L = instinct(r);
  for (let j = 0; j < H; j++) { let s = b.b1[j]; for (let i = 0; i < NI; i++) s += x[i] * b.W1[i * H + j]; h[j] = Math.tanh(s); }
  let mx = -1e9;
  for (let a = 0; a < NA; a++) {
    let s = b.b2[a]; for (let j = 0; j < H; j++) s += h[j] * b.W2[j * NA + a];
    const q = Math.tanh(s / NN_CAP); r.nnOut[a] = q;
    p[a] = (q * NN_CAP + r.mbOut[a] * 1.5 + L[a]) / T; if (p[a] > mx) mx = p[a];
  }
  let sum = 0;
  for (let a = 0; a < NA; a++) { p[a] = r.avail && !r.avail[a] ? 0 : Math.exp(p[a] - mx); sum += p[a]; }
  for (let a = 0; a < NA; a++) p[a] /= sum;
}
function addTrace(r, act) {
  const b = r.brain, t = r.tr, H = b.H, x = r.inp, h = r.hid, p = r.probs, T = temp(r);
  for (const k of ['W1', 'b1', 'W2', 'b2']) { const a = t[k]; for (let i = 0; i < a.length; i++) a[i] *= LAMBDA; }
  for (let a = 0; a < NA; a++) { DZ[a] = ((a === act ? 1 : 0) - p[a]) / T * (1 - r.nnOut[a] ** 2); t.b2[a] += DZ[a]; }
  for (let j = 0; j < H; j++) {
    let dh = 0;
    for (let a = 0; a < NA; a++) { t.W2[j * NA + a] += h[j] * DZ[a]; dh += b.W2[j * NA + a] * DZ[a]; }
    dh *= 1 - h[j] * h[j];
    t.b1[j] += dh;
    for (let i = 0; i < NI; i++) t.W1[i * H + j] += x[i] * dh;
  }
  for (let a = 0; a < NA; a++) DZ[a] = ((a === act ? 1 : 0) - p[a]) / T;
  flyTrace(r, DZ, NA);
}
function learn(r) {
  const R = r.rew; r.rew = 0; r.st.rsum += R;
  const adv = clamp(R - r.base, -4, 4);
  r.base += 0.02 * (R - r.base);
  const lr = (0.002 + r.genes.learn * 0.02) * (0.7 + r.brain.H / 64) * (0.5 + r.mental / 200) * adv;
  if (r.lastCraft) { r.rp[r.lastCraft] = (r.rp[r.lastCraft] || 0) + 0.3 * adv; r.lastCraft = null; } // понравился ли рецепт
  if (Math.abs(lr) < 1e-7) return;
  flyLearn(r, lr * 2, NA); // дофамин в грибовидных телах
  const b = r.brain, t = r.tr;
  for (const k of ['W1', 'b1', 'W2', 'b2']) {
    const w = b[k], e = t[k];
    for (let i = 0; i < w.length; i++) { const v = w[i] + lr * e[i]; w[i] = v > 4 ? 4 : v < -4 ? -4 : v; }
  }
}
// Рука игрока: погладить = награда, шлёпнуть = наказание за последнее действие
function handTickle(r) { r.rew += 2.5; r.d[9] = Math.max(0, r.d[9] - 0.1); r.chem.endorphin += 0.3; r.st.tickled++; }
function handSlap(r) { r.rew -= 2.5; r.d[2] = Math.min(1, r.d[2] + 0.15); r.d[10] = Math.min(1, r.d[10] + 0.1 * (0.5 + r.genes.temper)); r.st.slapped++; }

// ---------- действия ----------
function doAction(r, a) {
  if (a === 3) interact(r);
  else if (a === 4) dig(r);
  else if (a === 5) carryToggle(r);
  else if (a === 6) speak(r);
  else if (a === 7) tryMate(r);
  else if (a === 9) attack(r);
  else if (a === 10) craft(r);
  else if (a === 11) jump(r);
}
const reach = r => 1.0 + 0.45 * r.genes.size;
const isFood = o => o.t === 'fruit' || o.t === 'meat' || (o.t === 'melon' && o.g >= MELON_RIPE);
const front = (r, s) => [r.x + Math.sin(r.yaw) * s, r.z + Math.cos(r.yaw) * s];
const annoy = (r, x = 0.06) => { r.d[10] = Math.min(1, r.d[10] + x * (0.5 + r.genes.temper)); }; // неудача злит
function digValue(r) {
  const [x, z] = front(r, 0.6 + 0.3 * r.genes.size);
  if (world.isWater(x, z) || world.height(x, z) < r.y - 1 || (world.height(x, z) - 1 < world.sea && world.wetNear(x, z)) || world.height(x, z) <= 2) return 0;
  const id = world.topBlock(x, z);
  return !DIGGABLE(id) ? 0 : id === B_STONE ? 0.5 : 1;
}
function placeValue(r) {
  if (!r.carry || r.carry.t !== 'block') return 0;
  const [x, z] = front(r, 0.8);
  return !world.isWater(x, z) && world.height(x, z) <= r.y ? 1 : 0;
}
function nearestIn(r, R, pred) {
  let best = null, bd = R * R;
  near(objGrid, r.x, r.z, R, o => {
    if (o.dead || o.carried || !pred(o)) return;
    const dd = (o.x - r.x) ** 2 + (o.z - r.z) ** 2;
    if (dd < bd) { bd = dd; best = o; }
  });
  return best;
}
function nearestRobot(r, R) {
  let best = null, bd = R * R;
  near(robGrid, r.x, r.z, R, o => { if (o === r || o.dead) return; const dd = (o.x - r.x) ** 2 + (o.z - r.z) ** 2; if (dd < bd) { bd = dd; best = o; } });
  return best;
}
function nearWater(r) { for (const s of [0, 0.7, 1.4]) if (world.isWater(...front(r, s))) return true; return false; }
function interact(r) {
  const R = reach(r);
  let o = r.energy < 97 ? nearestIn(r, R, isFood) : null;
  if (o) return eat(r, o);
  if (r.carry && isFood(r.carry) && r.energy < 97) { const c = r.carry; r.carry = null; c.carried = false; return eat(r, c); }
  if (r.water < 95 && nearWater(r)) return drink(r);
  if (r.energy < 80 && eatFromBag(r)) return;
  // потрясти дерево — упадут яблоки
  const t = r.near.tree;
  if (t && (t.x - r.x) ** 2 + (t.z - r.z) ** 2 < (R + 0.8) ** 2) return shake(r, t);
  let lb = null;
  near(objGrid, r.x, r.z, R + 0.8, o => {
    if (o.t !== 'letter' || o.carried || (o.x - r.x) ** 2 + (o.z - r.z) ** 2 > (R + 0.8) ** 2) return;
    if (!lb || r.letters[o.ch] < r.letters[lb.ch]) lb = o;
  });
  if (lb && r.letters[lb.ch] < 1) return study(r, lb.ch);
  const gr = nearestIn(r, R, o => o.t === 'grass'); if (gr) return cutGrass(r, gr);
  const m = nearestRobot(r, R + 0.4); if (m) return greet(r, m);
  o = nearestIn(r, R, o => o.t === 'block');
  if (o) { o.x = inX(o.x + Math.sin(r.yaw) * 0.8); o.z = inZ(o.z + Math.cos(r.yaw) * 0.8); r.d[9] = Math.max(0, r.d[9] - 0.02); return; }
  annoy(r, 0.03);
}
function eat(r, o) {
  o.dead = true; world.removed = true;
  if (o.t === 'melon') { r.energy = Math.min(100, r.energy + 40); r.water = Math.min(100, r.water + 20); bagAdd(r, 'seed', 1 + (Math.random() < 0.5 ? 1 : 0)); r.st.food++; r.st.melons = (r.st.melons || 0) + 1; first('melon', `${r.name} первым съел выращенный арбуз`); return; }
  const fd = o.t === 'fruit' ? FOODS[o.kind || 'apple'] : null;
  r.energy = Math.min(100, r.energy + (fd ? fd.e : 25)); r.st.food++;
  if (fd) giveBuff(r, fd.buff);
  if (o.t === 'meat' && Math.random() < 0.3 && r.chem.antigen <= 0) { r.chem.antigen = 0.6; r.st.ill++; lifeEvent(r, 'Отравился сырым мясом'); }
  first('eat', `${r.name} первым поел плоды`);
}
function drink(r) { r.water = Math.min(100, r.water + 50); r.st.drink++; }
function shake(r, t) {
  r.st.shakes++; r.d[3] = Math.min(1, r.d[3] + 0.02);
  if (t.apples > 0 && Math.random() < 0.35 + strOf(r) * 0.5) {
    t.apples--; world.dropApple(t);
    first('shake', `${r.name} догадался трясти дерево, чтобы упали яблоки`);
  } else annoy(r, 0.02);
}
function knownCount(r) { let n = 0; for (let k = 0; k < 26; k++) if (r.letters[k] >= 0.5) n++; return n; }
function addLetter(r, k, amt) {
  const b = r.letters[k], a = Math.min(1, b + amt);
  r.letters[k] = a;
  if (b < 0.5 && a >= 0.5) {
    r.st.lettersLearned++;
    if (Math.random() < 0.5) growBrain(r);
    if (!G.letterFirst[k]) { G.letterFirst[k] = true; pushEvent(`${r.name} первым выучил букву «${LETTERS[k]}»`); }
    if (knownCount(r) === 26) { pushEvent(`${r.name} (пок. ${r.gen}) выучил весь алфавит!`); lifeEvent(r, 'Выучил весь алфавит'); }
  }
  return a - b;
}
function study(r, k) {
  addLetter(r, k, 0.14 * learnFactor(r));
  r.st.studied++; r.d[9] = Math.max(0, r.d[9] - 0.12); // учёба снимает скуку
  say(r, LETTERS[k] + '!', 'letter');
}
function greet(r, m) {
  r.d[6] = Math.max(0, r.d[6] - 0.25); m.d[6] = Math.max(0, m.d[6] - 0.15);
  if (r.tribe !== m.tribe) changeRel(r.tribe, m.tribe, 0.008, 'дружеская встреча');
  let best = -1, gap = 0.15;
  for (let k = 0; k < 26; k++) { const dd = r.letters[k] - m.letters[k]; if (r.letters[k] >= 0.5 && dd > gap) { gap = dd; best = k; } }
  if (best >= 0) { addLetter(m, best, 0.12 * learnFactor(m)); r.st.taught++; if (r.tribe !== m.tribe) changeRel(r.tribe, m.tribe, 0.006, 'учили буквам'); say(r, LETTERS[best] + '?', 'letter'); }
  // зараза передаётся при контакте
  if (r.chem.antigen > 0.3 && m.chem.antigen <= 0 && Math.random() < 0.15 * (1.3 - m.genes.immunity)) { m.chem.antigen = 0.5; m.st.ill++; lifeEvent(m, 'Заразился от ' + r.name); }
}
// копать тяжело: много энергии и усталости; успех — навык, сила и инструмент. Добыча идёт в сумку
function dig(r) {
  if (r.role === 'builder') { const c = campById(r.camp), n = c && c.nest, cl = n && nestNext(n); if (cl && Math.hypot(cl.i - HX + 0.5 - r.x, cl.k - HZ + 0.5 - r.z) < reach(r) + 1.4) return nestStep(r, n, cl); }
  const [x, z] = front(r, 0.6 + 0.3 * r.genes.size);
  r.energy -= 3; r.d[3] = Math.min(1, r.d[3] + 0.1);
  // рубка: перед роботом ствол
  const t = r.near.tree;
  if (t && world.topBlock(x, z) === B_LOG && (t.x - r.x) ** 2 + (t.z - r.z) ** 2 < (reach(r) + 0.8) ** 2) {
    r.st.digs++; practice(r, 'dig', 1);
    if (t.wood <= 0 || Math.random() > (0.2 + 0.4 * r.skill.dig) * (1 + r.tools.axe * 0.6)) { annoy(r, 0.03); return; }
    t.wood--; bagAdd(r, 'log'); r.st.chopped = (r.st.chopped || 0) + 1; r.d[9] = Math.max(0, r.d[9] - 0.08);
    first('chop', `${r.name} первым добыл бревно`);
    discover(r, 'chop'); inspire(r, 'skill', 'dig');
    return;
  }
  if (!digValue(r) || nearestIn(r, 3, o => o.t === 'letter')) { annoy(r); return; }
  const id = world.topBlock(x, z), hard = id === B_STONE || id === B_COBBLE || (id >= B_COAL && id <= B_AMETHYST) || id === B_FURNACE;
  r.st.digs++; practice(r, 'dig', 2);
  const tool = hard ? r.tools.pick : r.tools.shovel;
  // камень без кирки почти не поддаётся; железная руда — только каменной киркой и лучше (как в Minecraft)
  const chance = (0.15 + 0.75 * r.skill.dig) * (hard ? (tool ? 0.4 + tool * 0.2 : 0.06) * (0.6 + strOf(r) * 0.6) : 1 + tool * 0.3);
  if (Math.random() > chance) { annoy(r); return; }
  if (!world.dig(x, z)) return;
  r.st.mined[id] = (r.st.mined[id] || 0) + 1; G.mined++;
  r.d[9] = Math.max(0, r.d[9] - (id === B_AMETHYST ? 0.5 : id === B_COAL || id === B_IRON ? 0.2 : 0.06));
  first('dig', `${r.name} первым выкопал блок (${BLOCK_NAMES[id]})`);
  discover(r, 'dig'); inspire(r, 'skill', 'dig');
  if (id === B_AMETHYST) { first('amethyst', `${r.name} первым нашёл аметист!`); }
  let item = DROP[id];
  if (id === B_IRON && r.tools.pick < 2) item = null; // деревянной киркой железо не добыть
  if (item && !bagAdd(r, item) && world.objects.length < 300) world.add({ t: 'block', id: id === B_GRASS ? B_DIRT : id, x: inX(x), z: inZ(z), rot: Math.random() * 6 });
}
// «Взять / поставить»: подобрать предмет в сумку; если рядом нечего брать — поставить блок из сумки
function carryToggle(r) {
  if (r.carry) { const c = r.carry; c.carried = false; r.carry = null; const [x, z] = front(r, 0.8); c.x = inX(x); c.z = inZ(z); return; }
  const o = nearestIn(r, reach(r), o => CARRY.has(o.t) || o.t === 'meat');
  if (o) {
    if (o.t === 'letter') { o.carried = true; r.carry = o; }
    else {
      const k = o.t === 'fruit' ? (o.kind || 'apple') : o.t === 'meat' ? 'meat' : DROP[o.id] || 'dirt';
      if (!bagAdd(r, k)) { annoy(r, 0.02); return; }
      o.dead = true; world.removed = true;
    }
    r.st.carried++; practice(r, 'carry', 3); r.d[9] = Math.max(0, r.d[9] - 0.04);
    first('carry', `${r.name} первым подобрал предмет`);
    return;
  }
  if (r.inv.seed && farmSpot(r)) return plant(r);
  const p = PLACEABLE.find(p => r.inv[p[0]]), spot = p && placeSpot(r);
  if (!spot) { annoy(r, 0.03); return; }
  practice(r, 'build', 3);
  if (Math.random() < 0.2 + 0.8 * r.skill.build && world.place(spot[0], spot[1], p[1])) {
    bagTake(r, p[0]); r.st.built++; G.built++; r.d[9] = Math.max(0, r.d[9] - 0.06);
    first('build', `${r.name} первым поставил блок`);
    discover(r, 'build'); inspire(r, 'skill', 'build');
  } else annoy(r, 0.03);
}
// неумелый робот роняет что-нибудь по дороге
function dropCarry(r) {
  if (r.carry) { const c = r.carry; c.carried = false; r.carry = null; c.x = r.x; c.z = r.z; return; }
  const ks = Object.keys(r.inv); if (!ks.length) return;
  const k = pick(ks); bagTake(r, k);
  if (FOODS[k]) world.add({ t: 'fruit', kind: k, x: r.x, z: r.z, age: 0 });
  else if (k === 'meat') world.add({ t: 'meat', x: r.x, z: r.z, age: 0 });
}

// ---------- размножение ----------
const canMate = r => isAdult(r) && r.energy > 45 && r.mateCool <= 0 && stageOf(r) !== 'Старик';
const attract = r => clamp(1 - r.genes.asym * 1.3 + (iq(r) - 100) / 150 + Math.min(0.3, RECIPES.filter(rc => r.known[rc.id]).length * 0.04) + Math.min(0.2, (r.st.built || 0) * 0.01) + (r.tools.pick + r.tools.axe + r.tools.sword) * 0.03, 0.1, 1.6);
function tryMate(r) {
  r.mateWish = 3;
  const o = nearestRobot(r, 2.2 * r.genes.size);
  if (!o || !canMate(r) || !canMate(o) || !canMateTribes(r, o) || robots.length + births.length >= SET.maxPop) { annoy(r, 0.03); return; }
  const accept = o.mateWish > 0 || o.d[11] > 0.35 || Math.random() < (0.3 + o.genes.social * 0.7) * attract(r) * (0.5 + o.d[11]);
  if (!accept) { annoy(r, 0.1); return; }
  births.push(makeChild(r, o));
  r.energy -= 15; o.energy -= 15; r.d[11] = o.d[11] = 0; r.d[6] = o.d[6] = 0;
  r.mateCool = 15 + (1 - r.genes.fertility) * 25; o.mateCool = 15 + (1 - o.genes.fertility) * 25;
  r.st.kids++; o.st.kids++; r.mateWish = o.mateWish = 0;
  lifeEvent(r, 'Стал родителем вместе с ' + o.name); lifeEvent(o, 'Стал родителем вместе с ' + r.name);
}
function makeChild(a, b) {
  const genes = crossGenes(a.genes, b.genes);
  // тяга к странствиям наследуется целиком от одного из родителей, иногда появляется заново
  genes.wander = (Math.random() < 0.5 ? a : b).genes.wander || 0;
  if (genes.wander >= 0.6 ? Math.random() < 0.08 : Math.random() < 0.06) genes.wander = genes.wander >= 0.6 ? rnd(0, 0.3) : rnd(0.65, 1); // равновесие — около 20% странников
  if (SET.lamarck) {
    const hi = Math.max(a.brain.H, b.brain.H), lo = Math.min(a.brain.H, b.brain.H);
    genes.brain = clamp(Math.round(hi * 0.7 + lo * 0.3 + (genes.brain - (a.genes.brain + b.genes.brain) / 2)), 6, 64);
  }
  const brain = childBrain(SET.lamarck ? a.brain : a.innate, SET.lamarck ? b.brain : b.innate, genes.brain);
  const c = makeRobot(genes, brain, inX(a.x + rnd(-1, 1)), inZ(a.z + rnd(-1, 1)), Math.max(a.gen, b.gen) + 1, a === b ? [a.name] : [a.name, b.name]);
  c.energy = 70; c.mem = { ...a.mem }; c.fly = childFly(a.fly, b.fly); c.tribe = a.tribe; c.camp = a.camp; c.role = 'young'; c.biomes = { ...(a.biomes || {}) }; c.settled = a.settled || 0; c.home = a.home ? { ...a.home } : { x: a.x, z: a.z };
  if (SET.lamarck) for (const k in a.rp) c.rp[k] = ((a.rp[k] || 0) + (b.rp[k] || 0)) / 2;
  if (SET.lamarck) {
    for (let k = 0; k < 26; k++) c.letters[k] = Math.max(a.letters[k], b.letters[k]) * 0.97;
    const src = Math.random() < 0.5 ? a : b;
    for (const t in src.vocab) c.vocab[t] = { w: src.vocab[t].w, s: 0.5 };
  }
  G.births++;
  if (c.gen > G.maxGen) { G.maxGen = c.gen; if (c.gen % 5 === 0) pushEvent(`Родилось поколение ${c.gen} (${c.name}, мозг ${genes.brain} нейр.)`); }
  return c;
}

// ---------- интеллект ----------
function skillAvg(r) { let s = 0; for (const [k] of SKILLS) s += r.skill[k] || 0; return s / SKILLS.length; }
function iq(r) {
  const g = r.genes;
  let s = 50 + (r.brain.H - 6) / 58 * 22 + g.learn * 10;
  let L = 0; for (let k = 0; k < 26; k++) L += r.letters[k];
  s += L / 26 * 24;
  s += Math.min(12, Object.keys(r.vocab).length * 1.1);
  const tr = r.st.ok + r.st.fail; if (tr >= 3) s += r.st.ok / tr * 10;
  s += skillAvg(r) * 18;
  if (r.age > 20) s += Math.min(8, r.st.food / r.age * 80);
  s += Math.min(12, RECIPES.filter(rc => r.known[rc.id]).length * 1.5 + Object.keys(r.known).filter(k => k.startsWith('act_')).length); // что умеет делать
  return Math.round(s);
}
function sample() {
  const n = robots.length || 1;
  let iqS = 0, lt = 0, br = 0, gen = 0, hp = 0, sk = 0;
  for (const r of robots) {
    const q = iq(r); iqS += q; lt += knownCount(r); br += r.brain.H; gen += r.gen; hp += r.happy || 0; sk += skillAvg(r);
    if (q > G.bestIQ) { G.bestIQ = q; G.bestName = r.name; }
  }
  const h = history;
  h.pop.push(robots.length); h.iq.push(iqS / n); h.letters.push(lt / n); h.lang.push(langAgreement() * 100); h.brain.push(br / n); h.gen.push(gen / n); h.happy.push(hp / n * 100); h.skill.push(sk / n * 100);
  for (const k in h) if (h[k].length > 300) h[k].shift();
}

// ---------- сохранение ----------
const r3 = a => Array.from(a, x => Math.round(x * 1000) / 1000);
const packBrain = b => ({ H: b.H, W1: r3(b.W1), b1: r3(b.b1), W2: r3(b.W2), b2: r3(b.b2) });
const unpackBrain = b => ({ H: b.H, W1: Float32Array.from(b.W1), b1: Float32Array.from(b.b1), W2: Float32Array.from(b.W2), b2: Float32Array.from(b.b2) });
function bytesB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); }
const KEEP = ['id', 'name', 'genes', 'x', 'z', 'yaw', 'energy', 'water', 'health', 'mental', 'age', 'gen', 'parents', 'vocab', 'st', 'lifespan', 'skill', 'chem', 'mem', 'life', 'inv', 'tools', 'rp', 'known'];
function serialize() {
  return JSON.stringify({
    v: 3, simTime, nextId, SET, G, events, history, convLog,
    blocks: bytesB64(world.b), water: Array.from(world.wl), trees: world.trees,
    objects: world.objects.filter(o => !o.dead).map(o => ({ ...o, carried: false })),
    robots: robots.map(r => { const o = { brain: packBrain(r.brain), innate: packBrain(r.innate), letters: r3(r.letters), d: r3(r.d), fly: { seed: r.fly.seed, W: r3(r.fly.W) } }; for (const k of KEEP) o[k] = r[k]; return o; }),
  });
}
function deserialize(json) {
  const d = JSON.parse(json);
  if (d.v !== 3) throw new Error('это сохранение от другой версии мира');
  world = new World(false);
  world.b.set(b64bytes(d.blocks)); world.wl.set(d.water); world.trees = d.trees; world.recalcTop(); world.objects = d.objects; world.allDirty = true;
  treeGrid = null;
  simTime = d.simTime; Object.assign(SET, d.SET); G = d.G; events = d.events; history = d.history; convLog = d.convLog || [];
  births = []; robots = []; lastSample = simTime;
  for (const s of d.robots) {
    const r = makeRobot(s.genes, unpackBrain(s.brain), s.x, s.z, s.gen, s.parents);
    for (const k of KEEP) if (s[k] !== undefined) r[k] = s[k];
    r.innate = unpackBrain(s.innate); r.letters = Float32Array.from(s.letters); r.d = Float32Array.from(s.d); r.dPrev = Float32Array.from(s.d);
    r.fly = newFly(s.fly.seed); r.fly.W.set(s.fly.W);
    robots.push(r);
  }
  nextId = d.nextId;
}
