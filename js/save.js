'use strict';
// ================= Автосохранение: весь мир в IndexedDB браузера (раз в минуту и при закрытии) =================
// Сохраняем «как есть» (типизированные массивы без перевода в текст) — быстро и без лимита localStorage.
const SAVE_DB = 'robot-world-mc', SAVE_STORE = 'saves', SAVE_KEY = 'auto', SAVE_VERSION = 7;
let saveBusy = false, lastSaveAt = 0, saveStatus = 'автосохранения ещё не было';

function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(SAVE_DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(SAVE_STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
async function idbPut(v) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(SAVE_STORE, 'readwrite'); tx.objectStore(SAVE_STORE).put(v, SAVE_KEY); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); }); }
async function idbGet() { const db = await idb(); return new Promise((res, rej) => { const q = db.transaction(SAVE_STORE).objectStore(SAVE_STORE).get(SAVE_KEY); q.onsuccess = () => { db.close(); res(q.result); }; q.onerror = () => rej(q.error); }); }
async function idbClear() { const db = await idb(); return new Promise(res => { const tx = db.transaction(SAVE_STORE, 'readwrite'); tx.objectStore(SAVE_STORE).delete(SAVE_KEY); tx.oncomplete = () => { db.close(); res(); }; }); }

const brainCopy = b => ({ H: b.H, W1: b.W1.slice(), b1: b.b1.slice(), W2: b.W2.slice(), b2: b.b2.slice() });
const ROBOT_KEEP = ['id', 'name', 'genes', 'x', 'z', 'yaw', 'energy', 'water', 'health', 'mental', 'age', 'gen', 'parents', 'vocab', 'st', 'lifespan', 'skill', 'chem', 'mem', 'life', 'inv', 'tools', 'rp', 'known', 'mateCool', 'tribe', 'goal', 'settled', 'home', 'camp', 'buffs', 'biomes', 'role', 'eggT'];
// снимок всего мира (глубокая копия, чтобы симуляция могла идти дальше)
function snapshot() {
  return {
    v: SAVE_VERSION, savedAt: Date.now(), simTime, nextId,
    SET: { ...SET }, G: structuredClone(G), events: events.slice(), history: structuredClone(history), convLog: convLog.slice(),
    blocks: world.b.slice(), water: world.wl.slice(), mod: world.mod.slice(), trees: structuredClone(world.trees),
    objects: world.objects.filter(o => !o.dead).map(o => ({ ...o, carried: false })),
    zombies: world.zombies.map(z => ({ ...z })),
    robots: robots.map(r => {
      const o = { brain: brainCopy(r.brain), innate: brainCopy(r.innate), letters: r.letters.slice(), d: r.d.slice(), fly: { seed: r.fly.seed, W: r.fly.W.slice() } };
      for (const k of ROBOT_KEEP) o[k] = structuredClone(r[k]);
      return o;
    }),
  };
}
function restore(d) {
  world = new World(false);
  world.b.set(d.blocks); world.wl.set(d.water); if (d.mod) world.mod.set(d.mod);
  world.trees = d.trees; world.recalcTop(); world.setupBiomes(); world.objects = d.objects; world.zombies = d.zombies || []; world.allDirty = true;
  treeGrid = null;
  simTime = d.simTime; nextId = d.nextId; Object.assign(SET, d.SET); G = d.G; events = d.events; history = d.history; convLog = d.convLog || [];
  births = []; robots = []; lastSample = simTime;
  for (const s of d.robots) {
    const r = makeRobot(s.genes, s.brain, s.x, s.z, s.gen, s.parents);
    for (const k of ROBOT_KEEP) if (s[k] !== undefined) r[k] = s[k];
    r.life = s.life || []; r.innate = s.innate; r.tr = newBrain(s.brain.H); r.hid = new Float32Array(s.brain.H);
    r.letters = s.letters; r.d = s.d; r.dPrev = s.d.slice();
    r.fly = newFly(s.fly.seed); r.fly.W.set(s.fly.W);
    robots.push(r);
  }
  nextId = Math.max(nextId, ...robots.map(r => r.id + 1));
}
async function autosave(reason = 'auto') {
  if (saveBusy || !world) return;
  saveBusy = true;
  try {
    const t0 = performance.now();
    await idbPut(snapshot());
    lastSaveAt = Date.now();
    saveStatus = `сохранено ${new Date(lastSaveAt).toLocaleTimeString('ru')} (${Math.round(performance.now() - t0)} мс)`;
  } catch (e) { saveStatus = 'не удалось сохранить: ' + e.message; }
  saveBusy = false;
}
// попробовать продолжить сохранённый мир; true — если получилось
async function tryResume() {
  try {
    const d = await idbGet();
    if (!d || d.v !== SAVE_VERSION) return false;
    restore(d);
    saveStatus = `продолжен мир от ${new Date(d.savedAt).toLocaleString('ru')}`;
    pushEvent('Мир продолжен из автосохранения.');
    return true;
  } catch (e) { saveStatus = 'сохранение не прочиталось: ' + e.message; return false; }
}
