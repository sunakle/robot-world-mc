'use strict';
// ================= Биомы: у каждого леса своя еда, свой цвет и свои плюсы/минусы =================
const BIOMES = [
  { k: 'meadow', ru: 'Луга', tint: [1.1, 1.0, 0.72], leaf: [1, 1, 1], desc: 'Открытые травы. Особых свойств нет, зато здесь растёт трава с семенами арбуза.' },
  { k: 'apple', ru: 'Яблоневая роща', tint: [1, 1, 1], leaf: [1, 1, 1], food: 'apple', desc: 'Яблоки дают спокойствие: страх уходит быстрее, психика восстанавливается. Климат мягкий.' },
  { k: 'pine', ru: 'Северная тайга', tint: [0.6, 0.8, 0.78], leaf: [0.55, 0.75, 0.68], food: 'cone', desc: 'Кедровые орехи дают силу: легче копать, трясти деревья и драться. Минус: ночи заметно холоднее.' },
  { k: 'birch', ru: 'Берёзовая роща', tint: [1.15, 1.13, 0.78], leaf: [1.2, 1.15, 0.72], food: 'berry', desc: 'Черника даёт ум: учатся в 1,5 раза быстрее. Плюс: здесь спокойно на душе. Минус: комары — чаще болеют.' },
  { k: 'jungle', ru: 'Джунгли', tint: [0.74, 1.04, 0.58], leaf: [0.55, 0.95, 0.42], food: 'cocoa', desc: 'Какао-бобы дают скорость. Плюс: плоды растут в 1,5 раза быстрее. Минус: жарко — пить хочется чаще.' },
];
const BI = Object.fromEntries(BIOMES.map((b, i) => [b.k, i]));
const FOODS = {
  apple: { ru: 'Яблоко', e: 30, buff: 'calm', col: [0.85, 0.12, 0.1] },
  cone: { ru: 'Кедровые орехи', e: 26, buff: 'str', col: [0.45, 0.28, 0.12] },
  berry: { ru: 'Черника', e: 22, buff: 'int', col: [0.22, 0.25, 0.7] },
  cocoa: { ru: 'Какао-бобы', e: 28, buff: 'speed', col: [0.72, 0.4, 0.14] },
};
const BUFFS = { calm: 'Спокойствие', str: 'Сила', int: 'Ум', speed: 'Скорость' };
const BUFF_TIME = 90;
const buffOn = (r, k) => r.buffs && r.buffs[k] > simTime;
const strOf = r => r.genes.strength + (buffOn(r, 'str') ? 0.35 : 0);
function giveBuff(r, k) {
  r.buffs = r.buffs || {};
  const fresh = !buffOn(r, k);
  r.buffs[k] = simTime + BUFF_TIME;
  if (fresh && !(r.known['buff_' + k])) { r.known['buff_' + k] = true; lifeEvent(r, 'Впервые почувствовал: ' + BUFFS[k].toLowerCase()); }
}
const biomeAt = (x, z) => { const c = world.col(x, z); return c < 0 ? 0 : world.biome[c]; };

// леса карты: три крупнейших кластера деревьев + джунгли в левом нижнем углу
function findForests(T) {
  const n = T.length, par = T.map((_, i) => i);
  const f = i => par[i] === i ? i : (par[i] = f(par[i]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if ((T[i].x - T[j].x) ** 2 + (T[i].z - T[j].z) ** 2 < 196) par[f(i)] = f(j);
  const g = {}; T.forEach((t, i) => (g[f(i)] = g[f(i)] || []).push(t));
  const cl = Object.values(g).filter(c => c.length >= 6);
  const jungle = cl.filter(c => c.some(t => t.biome === 'jungle'));
  const rest = cl.filter(c => !c.some(t => t.biome === 'jungle')).sort((a, b) => b.length - a.length).slice(0, 3);
  const kinds = ['apple', 'pine', 'birch'];
  const out = [];
  const mk = (c, k) => {
    let x = 0, z = 0; for (const t of c) { x += t.x; z += t.z; } x /= c.length; z /= c.length;
    const r = Math.min(46, Math.max(...c.map(t => Math.hypot(t.x - x, t.z - z))) + 8);
    for (const t of c) t.biome = k;
    out.push({ k, ru: BIOMES[BI[k]].ru, x, z, r, trees: c.length });
  };
  rest.forEach((c, i) => mk(c, kinds[i]));
  if (jungle[0]) mk(jungle.reduce((a, b) => a.concat(b), []), 'jungle');
  return out;
}
