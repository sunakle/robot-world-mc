'use strict';
// ================= Язык: буквы → слоги → слова → общий словарь («игра в имена») =================
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', VOWELS = new Set('AEIOUY');
const CONCEPTS = [
  { k: 'food', ru: 'еда' }, { k: 'water', ru: 'вода' }, { k: 'hello', ru: 'привет' },
  { k: 'tree', ru: 'дерево' }, { k: 'stone', ru: 'камень' }, { k: 'dig', ru: 'копать' },
  { k: 'letter', ru: 'буква' }, { k: 'danger', ru: 'опасно' }, { k: 'love', ru: 'пара' },
  { k: 'me', ru: 'я' }, { k: 'tired', ru: 'сон' }, { k: 'hungry', ru: 'голоден' },
  { k: 'zombie', ru: 'зомби' }, { k: 'cold', ru: 'холодно' },
];
const CMAP = Object.fromEntries(CONCEPTS.map(c => [c.k, c]));

function knownLetters(r) {
  const v = [], c = [];
  for (let k = 0; k < 26; k++) if (r.letters[k] >= 0.5) (VOWELS.has(LETTERS[k]) ? v : c).push(k);
  return { v, c };
}
// о чём хочет сказать робот — зависит от того, что он видит и чувствует
function pickTopic(r) {
  const n = r.near || {};
  if (r.inp && r.inp[43] > 0.2) return Math.random() < 0.5 ? 'zombie' : 'danger';
  if (r.d && r.d[5] > 0.5) return 'cold';
  if (n.food && r.prox && r.prox.food > 0.4) return 'food';
  if (r.mateWish > 0) return 'love';
  if (r.water < 45 || (n.water && r.prox && r.prox.water > 0.7)) return 'water';
  if (r.energy < 35) return 'hungry';
  if (n.letter && r.prox && r.prox.letter > 0.5) return 'letter';
  if (r.d && r.d[4] > 0.5) return 'tired';
  if (r.carry && r.carry.t === 'block') return 'stone';
  if (n.robot && Math.random() < 0.6) return Math.random() < 0.5 ? 'hello' : 'me';
  if (r.action === 4 || (r.st.digs > 0 && Math.random() < 0.2)) return 'dig';
  if (n.tree && Math.random() < 0.4) return 'tree';
  if (n.obst && n.obst.t === 'wall') return 'stone';
  return pick(CONCEPTS).k;
}
// новое слово из 1–3 слогов, только из выученных букв
function invent(r) {
  const { v, c } = knownLetters(r);
  if (!v.length && !c.length) return null;
  const n = 1 + (Math.random() * 2.6 | 0);
  let w = '';
  for (let i = 0; i < n; i++) {
    if (c.length && (Math.random() < 0.85 || !v.length)) w += LETTERS[pick(c)];
    if (v.length) w += LETTERS[pick(v)];
    if (c.length && Math.random() < 0.12) w += LETTERS[pick(c)];
  }
  return w.toLowerCase();
}
// произношение: плохо выученные буквы заменяются — так рождаются диалекты
function pronounce(r, w) {
  const { v, c } = knownLetters(r);
  let out = '';
  for (const chL of w) {
    const ch = chL.toUpperCase(), k = LETTERS.indexOf(ch), kn = k >= 0 ? r.letters[k] : 1;
    if (kn < 0.5 || Math.random() < (1 - kn) * 0.25) {
      const pool = VOWELS.has(ch) ? v : c;
      out += pool.length ? LETTERS[pick(pool)].toLowerCase() : chL;
    } else out += chL;
  }
  return out;
}
function speak(r) {
  const topic = pickTopic(r);
  r.st.words++; r.energy -= 0.3;
  if (knownCount(r) === 0) return; // без букв робот молчит
  let e = r.vocab[topic];
  if (!e) {
    const w = invent(r); if (!w) return;
    e = r.vocab[topic] = { w, s: 1 };
    r.st.invented++;
    if (!G.firstWord) { G.firstWord = true; pushEvent(`${r.name} придумал первое слово в истории: «${w}» (${CMAP[topic].ru})`); }
  }
  const word = pronounce(r, e.w);
  say(r, word, topic);
  let heard = 0, ok = 0;
  near(robGrid, r.x, r.z, 7, L => {
    if (L === r || L.dead) return;
    if ((L.x - r.x) ** 2 + (L.z - r.z) ** 2 > 49) return;
    heard++; L.st.heardN++;
    // слушая, робот понемногу узнаёт буквы
    for (const chL of word) { const k = LETTERS.indexOf(chL.toUpperCase()); if (k >= 0 && L.letters[k] < 0.65) addLetter(L, k, 0.012 * learnFactor(L)); }
    const le = L.vocab[topic];
    if (le && le.w === word) { // поняли друг друга
      ok++; le.s = Math.min(20, le.s + 1); L.d[6] = Math.max(0, L.d[6] - 0.08); L.st.ok++;
      if (topic === 'food') L.heard = { t: 5, x: r.x, z: r.z };
    } else if (!le || Math.random() < 0.35 + (e.s - le.s) * 0.05) {
      if (!le && Math.random() < 0.3) growBrain(L); // новое понятие в словаре — новый нейрон
      L.vocab[topic] = { w: word, s: 0.5 };
    }
    else le.s -= 0.15;
  });
  if (heard) {
    if (ok) { e.s = Math.min(20, e.s + ok); r.d[6] = Math.max(0, r.d[6] - 0.1 * Math.min(ok, 3)); r.d[9] = Math.max(0, r.d[9] - 0.03); r.st.ok++; if (r.st.ok % 12 === 0) growBrain(r); }
    else { e.s -= 0.2; r.st.fail++; if (e.s < -1) delete r.vocab[topic]; }
  }
  convLog.push({ t: simTime, who: r.name, word, topic, heard, ok });
  if (convLog.length > 60) convLog.shift();
}
function dictionary() {
  return CONCEPTS.map(c => {
    const cnt = new Map(); let tot = 0;
    for (const r of robots) { const e = r.vocab[c.k]; if (e) { cnt.set(e.w, (cnt.get(e.w) || 0) + 1); tot++; } }
    const list = [...cnt].sort((a, b) => b[1] - a[1]);
    return { c, top: list[0] ? list[0][0] : '', topN: list[0] ? list[0][1] : 0, users: tot, variants: cnt.size, list: list.slice(0, 4) };
  });
}
// доля роботов, говорящих «главным» словом для каждого понятия
function langAgreement() {
  if (!robots.length) return 0;
  let s = 0;
  for (const d of dictionary()) s += d.topN / robots.length;
  return s / CONCEPTS.length;
}
