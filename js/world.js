'use strict';
// ================= Мир из карты Minecraft: трава, деревья с яблоками, вода, копание и стройка =================
const B_AIR = 0, B_STONE = 1, B_DIRT = 2, B_SAND = 3, B_GRAVEL = 4, B_CLAY = 5, B_COAL = 6, B_IRON = 7, B_AMETHYST = 8, B_BEDROCK = 9, B_GRASS = 10, B_LOG = 11, B_LEAVES = 12, B_COBBLE = 13, B_PLANKS = 14, B_TABLE = 15, B_FURNACE = 16;
const BLOCK_NAMES = ['воздух', 'камень', 'земля', 'песок', 'гравий', 'глина', 'уголь', 'железная руда', 'аметист', 'коренная порода', 'трава', 'бревно', 'листва', 'булыжник', 'доски', 'верстак', 'печь'];
// плитка атласа для [верх, бок, низ]
const TILES = [null, [0, 0, 0], [1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5], [6, 6, 6], [7, 7, 7], [8, 8, 8], [9, 10, 1], [12, 11, 12], [13, 13, 13], [14, 14, 14], [15, 15, 15], [16, 17, 15], [20, 19, 20]];
const MAPX = MCMAP.X, MAPZ = MCMAP.Z, MAPY = MCMAP.Y, HX = MAPX / 2, HZ = MAPZ / 2, HALF = Math.max(HX, HZ), WORLD = HALF * 2;
const CARRY = new Set(['block', 'fruit', 'letter']);
const DIGGABLE = id => id && id !== B_BEDROCK && id !== B_LOG && id !== B_LEAVES;
const ATL = 8; // столбцов в атласе
const LETTER_LIFE = 420; // сколько игровых секунд живёт кубик с буквой
const inX = x => Math.max(-HX + 0.5, Math.min(HX - 0.5, x)), inZ = z => Math.max(-HZ + 0.5, Math.min(HZ - 0.5, z));

let MAP_BLOCKS, MAP_WATER;
const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function gunzip(b64) {
  const s = new Blob([b64bytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function loadMap() { MAP_BLOCKS = await gunzip(MCMAP.blocks); MAP_WATER = await gunzip(MCMAP.water); }

class World {
  constructor(fresh = true) {
    this.b = MAP_BLOCKS.slice();                 // блоки [y][z][x]
    this.wl = Float32Array.from(MAP_WATER);      // уровень воды в колонке (0 — сухо)
    this.top = new Int16Array(MAPX * MAPZ);      // «земля»: верх последнего не-листового блока
    this.mod = new Uint8Array(MAPX * MAPZ);      // что сделали роботы: 1 — копали, 2 — ставили блоки
    this.hi = new Int16Array(MAPX * MAPZ);       // самый высокий блок колонны (для отрисовки)
    this.sea = 0; for (const v of this.wl) if (v > this.sea) this.sea = v;
    this.objects = []; this.removed = false; this.trees = []; this.zombies = [];
    if (fresh) this.plantTrees();
    this.recalcTop();
    this.dirtyChunks = new Set(); this.allDirty = true; this.waterDirty = true;
  }
  idx(i, y, k) { return (y * MAPZ + k) * MAPX + i; }
  recalcTop() { for (let k = 0; k < MAPZ; k++) for (let i = 0; i < MAPX; i++) this.recalcCol(i, k); }
  recalcCol(i, k) {
    let y = MAPY - 1;
    while (y >= 0 && !this.b[this.idx(i, y, k)]) y--;
    this.hi[k * MAPX + i] = y + 1;
    while (y >= 0 && (!this.b[this.idx(i, y, k)] || this.b[this.idx(i, y, k)] === B_LEAVES)) y--;
    this.top[k * MAPX + i] = y + 1;
  }
  // деревья по шаблону из Minecraft — там, где они росли на исходной карте
  plantTrees() {
    const T = MCMAP.tree;
    for (const [i, k] of MCMAP.trees) {
      let y = MAPY - 1;
      while (y > 0 && !this.b[this.idx(i, y, k)]) y--;
      const base = y + 1;
      if (base + 7 >= MAPY || this.wl[k * MAPX + i] > base) continue;
      for (const [dx, dy, dz] of T.leaves) { const a = i + dx, c = k + dz, h = base + dy; if (a >= 0 && c >= 0 && a < MAPX && c < MAPZ && !this.b[this.idx(a, h, c)]) this.b[this.idx(a, h, c)] = B_LEAVES; }
      for (const [dx, dy, dz] of T.log) this.b[this.idx(i + dx, base + dy, k + dz)] = B_LOG;
      this.b[this.idx(i, base - 1, k)] = B_DIRT;
      this.trees.push({ i, k, x: i - HX + 0.5, z: k - HZ + 0.5, y: base, apples: 1 + (Math.random() * 3 | 0), max: 5, wood: 4 });
    }
  }
  col(x, z) {
    const i = Math.floor(x + HX), k = Math.floor(z + HZ);
    return i < 0 || k < 0 || i >= MAPX || k >= MAPZ ? -1 : k * MAPX + i;
  }
  get(i, y, k) {
    if (y < 0) return B_BEDROCK;
    if (i < 0 || k < 0 || i >= MAPX || k >= MAPZ || y >= MAPY) return B_AIR;
    return this.b[this.idx(i, y, k)];
  }
  height(x, z) { const c = this.col(x, z); return c < 0 ? MAPY + 5 : this.top[c]; }
  isWater(x, z) { const c = this.col(x, z); return c >= 0 && this.wl[c] > this.top[c]; }
  depth(x, z) { const c = this.col(x, z); return c < 0 ? 0 : Math.max(0, this.wl[c] - this.top[c]); }
  waterLevel(x, z) { const c = this.col(x, z); return c < 0 ? 0 : this.wl[c]; }
  wetNear(x, z) { for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) if (this.isWater(x + dx, z + dz)) return true; return false; }
  topBlock(x, z) {
    const c = this.col(x, z); if (c < 0) return B_AIR;
    const t = this.top[c]; return t > 0 ? this.b[this.idx(c % MAPX, t - 1, c / MAPX | 0)] : B_AIR;
  }
  // над головой листва или навес — укрытие от ночного холода
  covered(x, z, y) {
    const c = this.col(x, z); if (c < 0) return false;
    return this.hi[c] > y + 1;
  }
  markDirty(i, k) {
    const cx = i >> 4, cz = k >> 4;
    this.dirtyChunks.add(cx + ',' + cz);
    if ((i & 15) === 0) this.dirtyChunks.add((cx - 1) + ',' + cz);
    if ((i & 15) === 15) this.dirtyChunks.add((cx + 1) + ',' + cz);
    if ((k & 15) === 0) this.dirtyChunks.add(cx + ',' + (cz - 1));
    if ((k & 15) === 15) this.dirtyChunks.add(cx + ',' + (cz + 1));
    this.waterDirty = true;
  }
  // выкопать верхний блок колонны; возвращает id блока (0 — не вышло)
  dig(x, z) {
    const c = this.col(x, z); if (c < 0) return 0;
    const t = this.top[c], i = c % MAPX, k = c / MAPX | 0;
    if (t <= 1) return 0;
    const id = this.b[this.idx(i, t - 1, k)];
    if (!DIGGABLE(id)) return 0;
    this.b[this.idx(i, t - 1, k)] = B_AIR; this.mod[k * MAPX + i] |= 1;
    this.recalcCol(i, k);
    this.markDirty(i, k);
    this.flood(i, k);
    return id;
  }
  // положить блок сверху колонны
  place(x, z, id) {
    const c = this.col(x, z); if (c < 0) return false;
    const t = this.top[c], i = c % MAPX, k = c / MAPX | 0;
    if (t >= MAPY - 1) return false;
    const cur = this.b[this.idx(i, t, k)];
    if (cur && cur !== B_LEAVES) return false;
    this.b[this.idx(i, t, k)] = id === B_GRASS ? B_DIRT : id; this.mod[k * MAPX + i] |= 2;
    this.recalcCol(i, k);
    this.markDirty(i, k);
    return true;
  }
  // вода затекает в выкопанные ямы рядом с водоёмом
  flood(i0, k0) {
    const q = [[i0, k0]]; let n = 0;
    while (q.length && n < 400) {
      const [i, k] = q.shift(), c = k * MAPX + i;
      let lvl = this.wl[c];
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= MAPX || b >= MAPZ) continue;
        const nc = b * MAPX + a;
        if (this.wl[nc] > this.top[nc] && this.wl[nc] > this.top[c]) lvl = Math.max(lvl, this.wl[nc]);
      }
      if (lvl > this.top[c] && lvl > this.wl[c]) {
        this.wl[c] = lvl; this.waterDirty = true; n++;
        for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= MAPX || b >= MAPZ) continue;
          const nc = b * MAPX + a;
          if (this.top[nc] < lvl && this.wl[nc] < lvl) q.push([a, b]);
        }
      }
    }
  }
  land() {
    for (let t = 0; t < 200; t++) {
      const x = (Math.random() - 0.5) * (MAPX - 6), z = (Math.random() - 0.5) * (MAPZ - 6);
      if (!this.isWater(x, z) && this.topBlock(x, z) !== B_LOG) return [x, z];
    }
    return [0, 0];
  }
  add(o) { this.objects.push(o); }
  // яблоки растут только на деревьях; спелые иногда падают сами, лежащие — гниют
  tick(dt, rate) {
    for (const t of this.trees) {
      if (t.apples < t.max && Math.random() < 0.018 * rate * dt) t.apples++;
      if (t.wood < 4 && Math.random() < 0.01 * dt) t.wood++; // дерево восстанавливается после рубки
      if (t.apples > 2 && Math.random() < 0.004 * dt) { t.apples--; this.dropApple(t); }
    }
    // кубики алфавита со временем рассыпаются
    let letters = 0;
    for (const o of this.objects) if (o.t === 'letter' && !o.dead) {
      o.age = (o.age || 0) + dt; letters++;
      if (o.age > LETTER_LIFE) { o.dead = true; this.removed = true; letters--; if (o.carried) o.carried = false; }
    }
    if (G.alphabet && letters === 0) { G.alphabet = false; pushEvent('Алфавит рассыпался. Роботы помнят только то, что успели выучить.'); }
    for (const o of this.objects) if ((o.t === 'fruit' || o.t === 'meat') && !o.carried && (o.age = (o.age || 0) + dt) > 200) { o.dead = true; this.removed = true; }
    // трава понемногу зарастает голую землю рядом с травой
    for (let n = 0; n < 6; n++) {
      if (Math.random() > dt * 8) continue;
      const i = Math.random() * MAPX | 0, k = Math.random() * MAPZ | 0, c = k * MAPX + i, t = this.top[c];
      if (t < 1 || this.b[this.idx(i, t - 1, k)] !== B_DIRT || this.wl[c] > t || this.hi[c] > t) continue;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = k + dk; if (a < 0 || b < 0 || a >= MAPX || b >= MAPZ) continue;
        const nt = this.top[b * MAPX + a];
        if (Math.abs(nt - t) <= 1 && this.b[this.idx(a, nt - 1, b)] === B_GRASS) { this.b[this.idx(i, t - 1, k)] = B_GRASS; this.markDirty(i, k); break; }
      }
    }
  }
  dropApple(t) {
    const a = Math.random() * 6.28, d = 0.9 + Math.random() * 1.6;
    const x = inX(t.x + Math.sin(a) * d), z = inZ(t.z + Math.cos(a) * d);
    if (!this.isWater(x, z)) this.add({ t: 'fruit', x, z, age: 0 });
  }
}
