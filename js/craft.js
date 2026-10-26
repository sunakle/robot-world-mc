'use strict';
// ================= Крафт как в Minecraft (начальные предметы), инвентарь, готовка, зомби =================
const ITEMS = {
  log: 'Бревно', planks: 'Доски', stick: 'Палка', cobble: 'Булыжник', dirt: 'Земля', sand: 'Песок', gravel: 'Гравий', clay: 'Глина',
  coal: 'Уголь', iron_ore: 'Железная руда', iron: 'Железный слиток', amethyst: 'Аметист', apple: 'Яблоко', meat: 'Сырое мясо', cooked: 'Жареное мясо', seed: 'Семена арбуза',
};
// какой предмет даёт выкопанный блок
const DROP = { [B_STONE]: 'cobble', [B_COBBLE]: 'cobble', [B_DIRT]: 'dirt', [B_GRASS]: 'dirt', [B_SAND]: 'sand', [B_GRAVEL]: 'gravel', [B_CLAY]: 'clay', [B_COAL]: 'coal', [B_IRON]: 'iron_ore', [B_AMETHYST]: 'amethyst', [B_PLANKS]: 'planks', [B_TABLE]: 'planks', [B_FURNACE]: 'cobble' };
// что можно поставить из сумки (в порядке предпочтения)
const PLACEABLE = [['cobble', B_COBBLE], ['planks', B_PLANKS], ['dirt', B_DIRT], ['sand', B_SAND], ['gravel', B_GRAVEL], ['clay', B_CLAY]];
const TIER = ['руки', 'дерево', 'камень', 'железо'];
const TOOL_NAMES = { pick: 'Кирка', axe: 'Топор', shovel: 'Лопата', sword: 'Меч' };
// рецепты: need — ингредиенты, at — нужен рядом верстак/печь, give — результат
const RECIPES = [
  { id: 'planks', ru: 'Доски', need: { log: 1 }, give: { planks: 4 } },
  { id: 'stick', ru: 'Палки', need: { planks: 2 }, give: { stick: 4 } },
  { id: 'table', ru: 'Верстак', need: { planks: 4 }, place: B_TABLE },
  { id: 'furnace', ru: 'Печь', need: { cobble: 8 }, at: B_TABLE, place: B_FURNACE },
  ...[['wood', 1, 'planks'], ['stone', 2, 'cobble'], ['iron', 3, 'iron']].flatMap(([m, t, mat]) => [
    { id: m + '_pick', ru: TOOL_NAMES.pick + ' (' + TIER[t] + ')', need: { [mat]: 3, stick: 2 }, at: B_TABLE, tool: ['pick', t] },
    { id: m + '_axe', ru: TOOL_NAMES.axe + ' (' + TIER[t] + ')', need: { [mat]: 3, stick: 2 }, at: B_TABLE, tool: ['axe', t] },
    { id: m + '_shovel', ru: TOOL_NAMES.shovel + ' (' + TIER[t] + ')', need: { [mat]: 1, stick: 2 }, at: B_TABLE, tool: ['shovel', t] },
    { id: m + '_sword', ru: TOOL_NAMES.sword + ' (' + TIER[t] + ')', need: { [mat]: 2, stick: 1 }, at: B_TABLE, tool: ['sword', t] },
  ]),
  { id: 'smelt', ru: 'Переплавить железо', need: { iron_ore: 1, coal: 1 }, at: B_FURNACE, give: { iron: 1 } },
  { id: 'cook', ru: 'Пожарить мясо', need: { meat: 1, coal: 1 }, at: B_FURNACE, give: { cooked: 1 } },
  { id: 'cook_wood', ru: 'Пожарить мясо (на досках)', need: { meat: 1, planks: 1 }, at: B_FURNACE, give: { cooked: 1 } },
];
const BAG_MAX = 64;
const bagCount = r => Object.values(r.inv).reduce((a, b) => a + b, 0);
function bagAdd(r, k, n = 1) { if (bagCount(r) + n > BAG_MAX) return false; r.inv[k] = (r.inv[k] || 0) + n; return true; }
function bagTake(r, k, n = 1) { if ((r.inv[k] || 0) < n) return false; r.inv[k] -= n; if (!r.inv[k]) delete r.inv[k]; return true; }
// верстак / печь в радиусе 3 блоков
function stationNear(r, id) {
  const i0 = Math.floor(r.x + HX), k0 = Math.floor(r.z + HZ), y0 = Math.floor(r.y);
  for (let dk = -3; dk <= 3; dk++) for (let di = -3; di <= 3; di++) for (let dy = -2; dy <= 2; dy++) if (world.get(i0 + di, y0 + dy, k0 + dk) === id) return true;
  return false;
}
function canCraft(r, rc) {
  for (const k in rc.need) if ((r.inv[k] || 0) < rc.need[k]) return false;
  if (rc.at && !stationNear(r, rc.at)) return false;
  if (rc.tool && (r.tools[rc.tool[0]] || 0) >= rc.tool[1]) return false; // уже есть не хуже
  if (rc.place && !placeSpot(r)) return false;
  return true;
}
// то же без поиска верстака/печи (флаги уже посчитаны в органах чувств)
function canCraftQuick(r, rc, table, furnace) {
  for (const k in rc.need) if ((r.inv[k] || 0) < rc.need[k]) return false;
  if (rc.at === B_TABLE && !table) return false;
  if (rc.at === B_FURNACE && !furnace) return false;
  if (rc.tool && (r.tools[rc.tool[0]] || 0) >= rc.tool[1]) return false;
  return true;
}
function placeSpot(r) { const [x, z] = front(r, 0.9); return !world.isWater(x, z) && world.height(x, z) <= r.y + 0.01 && !nearestIn(r, 3, o => o.t === 'letter') ? [x, z] : null; }
// крафт: из доступных рецептов робот выбирает по своим выученным предпочтениям
function craft(r) {
  const opts = RECIPES.filter(rc => canCraft(r, rc));
  if (!opts.length) { annoy(r, 0.03); r.d[9] = Math.min(1, r.d[9] + 0.01); return; }
  let sum = 0; const w = opts.map(rc => { const v = Math.exp(clamp(r.rp[rc.id] || 0, -4, 4)); sum += v; return v; });
  let u = Math.random() * sum, rc = opts[0];
  for (let i = 0; i < opts.length; i++) { u -= w[i]; if (u <= 0) { rc = opts[i]; break; } }
  for (const k in rc.need) bagTake(r, k, rc.need[k]);
  if (rc.place) { const [x, z] = placeSpot(r); world.place(x, z, rc.place); }
  if (rc.give) for (const k in rc.give) bagAdd(r, k, rc.give[k]);
  if (rc.tool) r.tools[rc.tool[0]] = rc.tool[1];
  r.lastCraft = rc.id; r.st.crafted = (r.st.crafted || 0) + 1;
  G.crafted = G.crafted || {}; const gc = G.crafted[rc.id] || (G.crafted[rc.id] = { n: 0, by: r.name, gen: r.gen, t: simTime }); gc.n++;
  practice(r, 'craft', 4);
  // радость открытия: впервые сделанная вещь сильно снимает скуку
  if (!r.known[rc.id]) { r.known[rc.id] = true; r.d[9] = Math.max(0, r.d[9] - 0.35); lifeEvent(r, 'Впервые сделал: ' + rc.ru); }
  else r.d[9] = Math.max(0, r.d[9] - 0.05);
  first('craft_' + rc.id, `${r.name} первым сделал: ${rc.ru}`);
  inspire(r, 'craft', rc.id); inspire(r, 'skill', 'craft');
}
// еда из сумки: жареное мясо > яблоко > сырое (от сырого можно заболеть)
function eatFromBag(r) {
  const opts = [['cooked', 50, 0], ['apple', 30, 0], ['meat', 25, 0.3]];
  for (const [k, e, sick] of opts) if (bagTake(r, k)) {
    r.energy = Math.min(100, r.energy + e); r.st.food++;
    if (Math.random() < sick && r.chem.antigen <= 0) { r.chem.antigen = 0.6; r.st.ill++; lifeEvent(r, 'Отравился сырым мясом'); }
    return true;
  }
  return false;
}

// ---------- зомби: приходят ночью, кусаются, днём сгорают. Убитый даёт много мяса ----------
let ZID = 1;
function zombieTick(dt) {
  const Z = world.zombies;
  const night = isNight();
  const wz = season() === 3 ? 2 : 1;
  if (night && Z.length < Math.min(10 * wz, (2 + robots.length / 8) * wz) && Math.random() < dt * 0.04 * wz && robots.length) {
    const t = pick(robots), a = Math.random() * 6.28, d = 18 + Math.random() * 14;
    const x = inX(t.x + Math.sin(a) * d), z = inZ(t.z + Math.cos(a) * d);
    if (!world.isWater(x, z) && world.topBlock(x, z) !== B_LOG) { Z.push({ id: ZID++, x, z, y: world.height(x, z), yaw: 0, hp: 20, cd: 0, ph: 0, moving: false }); first('zombie', 'Ночью пришли первые зомби!'); }
  }
  for (const zb of Z) {
    zb.cd -= dt; zb.moving = false;
    if (!night) { zb.hp -= 3 * dt; zb.burn = true; } // днём горят
    let tgt = null, td = 16 * 16;
    near(robGrid, zb.x, zb.z, 16, o => { const q = (o.x - zb.x) ** 2 + (o.z - zb.z) ** 2; if (q < td) { td = q; tgt = o; } });
    if (tgt) {
      zb.yaw = Math.atan2(tgt.x - zb.x, tgt.z - zb.z);
      if (td > 1.1 * 1.1) {
        const dx = Math.sin(zb.yaw) * 1.1 * dt, dz = Math.cos(zb.yaw) * 1.1 * dt;
        // зомби тоже не лезут в блоки: скользят вдоль стен
        const ok = (x, z) => { x = inX(x); z = inZ(z); if (world.height(x, z) - zb.y > 1.05 || world.depth(x, z) >= 0.8) return false;
          for (const [ox, oz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (world.height(x + ox, z + oz) - Math.max(zb.y, world.height(x, z)) > 0.6) return false;
          zb.x = x; zb.z = z; return true; };
        if (ok(zb.x + dx, zb.z + dz) || ok(zb.x + dx, zb.z) || ok(zb.x, zb.z + dz)) { zb.moving = true; zb.ph += dt * 6; }
      } else if (zb.cd <= 0) {
        zb.cd = 1.3;
        tgt.health -= 7; tgt.cause = 'зомби';
        tgt.d[2] = Math.min(1, tgt.d[2] + 0.25); tgt.d[8] = Math.min(1, tgt.d[8] + 0.35); if (tgt.health <= 0) { tgt.dead = true; lifeEvent(tgt, 'Погиб от зомби'); }
      }
    } else if (Math.random() < dt * 0.5) zb.yaw += (Math.random() - 0.5) * 2;
    zb.y = world.height(zb.x, zb.z);
  }
  world.zombies = Z.filter(z => z.hp > 0);
}
function nearestZombie(r, R) {
  let best = null, bd = R * R;
  for (const zb of world.zombies) { const q = (zb.x - r.x) ** 2 + (zb.z - r.z) ** 2; if (q < bd) { bd = q; best = zb; } }
  return best;
}
// удар: по зомби (меч сильнее), а если зомби нет — по соседу (злость)
function attack(r) {
  const R = reach(r) + 0.6, zb = nearestZombie(r, R);
  r.d[3] = Math.min(1, r.d[3] + 0.03);
  if (zb) {
    const dmg = [2, 4, 5, 6][r.tools.sword || 0] * (0.6 + 0.8 * r.genes.strength);
    zb.hp -= dmg; r.d[10] = Math.max(0, r.d[10] - 0.1); practice(r, 'fight', 3);
    if (zb.hp <= 0) {
      for (let i = 0; i < 3; i++) world.add({ t: 'meat', x: inX(zb.x + rnd(-0.8, 0.8)), z: inZ(zb.z + rnd(-0.8, 0.8)), age: 0 });
      r.d[8] = Math.max(0, r.d[8] - 0.5); r.st.kills = (r.st.kills || 0) + 1; lifeEvent(r, 'Победил зомби');
      first('kill', `${r.name} первым победил зомби — и получил мясо`);
      discover(r, 'kill'); inspire(r, 'skill', 'fight');
    }
    return;
  }
  const m = nearestRobot(r, reach(r));
  if (m) {
    if (m.tribe !== r.tribe) changeRel(r.tribe, m.tribe, -0.05, 'нападение'); else m.d[10] = Math.min(1, m.d[10] + 0.1);
    m.health -= 2; m.d[2] = Math.min(1, m.d[2] + 0.1); m.d[10] = Math.min(1, m.d[10] + 0.15); m.d[8] = Math.min(1, m.d[8] + 0.1);
    r.d[10] = Math.max(0, r.d[10] - 0.2); r.st.hits = (r.st.hits || 0) + 1;
    return;
  }
  annoy(r, 0.03);
}
