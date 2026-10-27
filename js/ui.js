'use strict';
// ================= Интерфейс: камера, скорость времени, панели статистики =================
const $ = id => document.getElementById(id);
const canvas = $('gl'), overlay = $('overlay');
const cam = { tx: 0, ty: 2, tz: 0, yaw: 0.7, pitch: 0.7, dist: 42, follow: false };
let speed = 1, selected = null, lastVP = null, tab = 'world';

const fmtTime = t => { const d = Math.floor(t / DAY) + 1, m = Math.floor((t % DAY) / DAY * 1440); return `День ${d} · ${String(m / 60 | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bar = (k, frac, val, col = 'var(--acc)') => `<div class="row"><span class="k">${k}</span><div class="bar"><i style="width:${clamp(frac, 0, 1) * 100}%;background:${col}"></i></div><span class="v">${val}</span></div>`;
const rgb = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;

// ---------- старт ----------

// ---------- кнопки ----------
function setSpeed(s) {
  speed = s;
  for (const b of $('speeds').children) b.classList.toggle('on', +b.dataset.s === s);
}
$('speeds').onclick = e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); };
setSpeed(1);
document.querySelector('.tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab;
  for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
  for (const id of ['world', 'robot', 'lang', 'craft', 'tribes']) $('tab-' + id).hidden = id !== tab;
  updatePanels();
};
const groundTarget = () => {
  // ближайшая суша к центру экрана
  for (let r = 0; r < 20; r += 2) for (let a = 0; a < 6.28; a += 0.8) {
    const x = cam.tx + Math.sin(a) * r, z = cam.tz + Math.cos(a) * r;
    if (Math.abs(x) < HX - 2 && Math.abs(z) < HZ - 2 && !world.isWater(x, z)) return [x, z];
  }
  return [cam.tx, cam.tz];
};
$('bAbc').onclick = () => {
  const [cx, cz] = groundTarget();
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * Math.PI * 2, rr = 3.5 + (k % 2) * 1.3;
    world.add({ t: 'letter', ch: k, x: inX(cx + Math.sin(a) * rr), z: inZ(cz + Math.cos(a) * rr), rot: a });
  }
  G.alphabet = true;
  for (const o of world.objects) if (o.t === 'letter') o.age = o.age || 0;
  pushEvent('В мир добавлен английский алфавит — 26 кубиков с буквами');
};
$('bNew').onclick = () => {
  const b = $('bNew');
  if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Точно начать заново? Нажмите ещё раз'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Заново'; }, 4000); return; }
  delete b.dataset.sure; b.textContent = 'Заново';
  initSim(); buildWorldMeshes(); miniBase = null; selected = null; cam.follow = false; autosave();
  let mx = 0, mz = 0; for (const r of robots) { mx += r.x; mz += r.z; }
  goal.tx = mx / robots.length; goal.tz = mz / robots.length; goal.dist = 55;
  lastSample = simTime; simMark = simTime; updatePanels();
};
$('bSave').onclick = async () => {
  const b = $('bSave'); b.disabled = true; b.textContent = 'Сохраняю…';
  try { const n = await saveToFile(); saveStatus = `мир сохранён в файл (${(n / 1048576).toFixed(1)} МБ)`; } catch (e) { saveStatus = 'не удалось сохранить файл: ' + e.message; }
  b.disabled = false; b.textContent = 'Сохранить в файл'; $('saveSt').textContent = 'Автосохранение: ' + saveStatus;
};
$('bLoad').onclick = () => $('fLoad').click();
$('fLoad').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = await loadFromFile(f);
    if (under) toggleUnder();
    buildWorldMeshes(); miniBase = null; selected = null; cam.follow = false; syncSliders();
    let mx = 0, mz = 0; for (const r of robots) { mx += r.x; mz += r.z; }
    if (robots.length) { goal.tx = mx / robots.length; goal.tz = mz / robots.length; goal.dist = 55; }
    lastSample = simTime; simMark = simTime;
    saveStatus = `загружен файл «${f.name}» (день ${Math.floor(d.simTime / DAY) + 1})`; pushEvent('Мир загружен из файла.');
    autosave(); updatePanels();
  } catch (err) { saveStatus = 'файл не прочитался: ' + err.message; }
  $('saveSt').textContent = 'Автосохранение: ' + saveStatus;
};
function syncSliders() { $('sMut').value = SET.mut * 100; $('sFood').value = SET.food * 100; $('sPop').value = SET.maxPop; $('cLam').checked = SET.lamarck; for (const id of ['sMut', 'sFood', 'sPop']) $(id).oninput(); }
$('sMut').oninput = () => { SET.mut = $('sMut').value / 100; $('vMut').textContent = $('sMut').value + '%'; };
$('sFood').oninput = () => { SET.food = $('sFood').value / 100; $('vFood').textContent = '×' + SET.food.toFixed(1); };
$('sPop').oninput = () => { SET.maxPop = +$('sPop').value; $('vPop').textContent = SET.maxPop; };
$('cLam').onchange = () => { SET.lamarck = $('cLam').checked; };
syncSliders();

// ---------- камера: плавная, с инерцией ----------
// ЛКМ — вращать, ПКМ/СКМ/Shift — двигать, колесо — зум к курсору, WASD/стрелки — ехать, Q/E — поворот, R/F — ближе/дальше,
// двойной клик — перелететь к точке (по роботу — следить), Home — общий вид
let drag = null;
const keys = {};
const goal = { tx: 0, tz: 0, yaw: 0.7, pitch: 0.7, dist: 42 };
function camSnap() { goal.tx = cam.tx; goal.tz = cam.tz; goal.yaw = cam.yaw; goal.pitch = cam.pitch; goal.dist = cam.dist; }
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey };
  canvas.setPointerCapture(e.pointerId); canvas.style.cursor = drag.pan ? 'move' : 'grabbing';
  if (e.button === 1) e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (drag.pan) panCam(-dx * goal.dist * 0.0016, dy * goal.dist * 0.0016 / Math.max(0.35, Math.sin(goal.pitch)));
  else { goal.yaw -= dx * 0.005; goal.pitch = clamp(goal.pitch + dy * 0.004, 0.05, 1.55); }
});
canvas.addEventListener('pointerup', e => {
  canvas.style.cursor = 'default';
  if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5 && e.button === 0) pickAt(e.offsetX, e.offsetY);
  drag = null;
});
// колесо: приближение к точке под курсором
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const f = Math.pow(1.0018, e.deltaY), nd = clamp(goal.dist * f, 2.5, 160);
  const hit = groundAt(e.offsetX, e.offsetY);
  if (hit && nd < goal.dist) { const k = 1 - nd / goal.dist; goal.tx += (hit[0] - goal.tx) * k; goal.tz += (hit[2] - goal.tz) * k; cam.follow = false; }
  goal.dist = nd;
}, { passive: false });
canvas.addEventListener('dblclick', e => {
  const r = robotAt(e.offsetX, e.offsetY);
  if (r) { selectRobot(r); goal.dist = Math.min(goal.dist, 10); return; }
  const hit = groundAt(e.offsetX, e.offsetY);
  if (hit) { goal.tx = hit[0]; goal.tz = hit[2]; goal.dist = Math.min(goal.dist, 20); cam.follow = false; }
});
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
  if (e.code === 'Home') { goal.tx = 0; goal.tz = 0; goal.dist = 150; goal.pitch = 1.1; cam.follow = false; }
  if (e.code === 'KeyU') toggleUnder();
  if (under && e.code === 'PageUp') { e.preventDefault(); moveCut(1); }
  if (under && e.code === 'PageDown') { e.preventDefault(); moveCut(-1); }
});
// ---------- режим наблюдателя под землёй: вертикальный срез сбоку, как на схеме муравейника ----------
let under = false, cutOff = 2, underY = 10;
function nearestNest(x, z) { let best = null, bd = 1e9; for (const c of G.camps || []) if (c.nest && c.nest.rooms) { const d = Math.hypot(c.nest.x - x, c.nest.z - z); if (d < bd) { bd = d; best = c; } } return best; }
function toggleUnder() {
  under = !under;
  $('bUnder').classList.toggle('on', under); $('bCutUp').hidden = $('bCutDn').hidden = $('underSt').hidden = !under;
  if (!under) { setCut(null); return; }
  const c = selected ? campById(selected.camp) : null, nc = c && c.nest && c.nest.rooms ? c : nearestNest(goal.tx, goal.tz);
  cutOff = 2;
  if (nc) {
    const n = nc.nest, dv = n.ax ? [n.sg, 0] : [0, -n.sg]; // камера — с передней стороны «пластины» муравейника
    const dug = n.cells.filter(cellDone); let mx = n.x, mz = n.z; for (const cl of dug) { mx += cl.i - HX + 0.5; mz += cl.k - HZ + 0.5; } mx /= dug.length + 1; mz /= dug.length + 1; // на уже вырытую часть
    goal.tx = n.ax ? n.x : mx; goal.tz = n.ax ? mz : n.z;
    goal.yaw = Math.atan2(-dv[0], -dv[1]); goal.pitch = 0.16; goal.dist = 26; underY = n.h - n.arch.depth / 2 - 1; cam.follow = false;
  } else underY = world.height(goal.tx, goal.tz) - 4;
  applyCut();
}
// плоскость среза — поперёк того направления, откуда смотрит камера (ближайшая ось)
function applyCut() {
  const ex = Math.sin(cam.yaw), ez = Math.cos(cam.yaw), ax = Math.abs(ex) > Math.abs(ez) ? 0 : 1, sg = (ax ? ez : ex) > 0 ? 1 : -1;
  const a0 = Math.floor((ax ? cam.tz + HZ : cam.tx + HX)), c = Math.floor(ax ? cam.tx + HX : cam.tz + HZ);
  setCut({ ax, sg, p: a0 + sg * cutOff, c });
}
function moveCut(d) { cutOff = clamp(cutOff - d, 0, 14); applyCut(); } // PageUp — срез глубже (дальше от камеры)
function underStatus() {
  if (!under) return;
  const c = nearestNest(cam.tx, cam.tz), n = c && c.nest;
  const inside = n ? robots.filter(r => world.under(r.x, r.z, r.y) && Math.hypot(r.x - n.x, r.z - n.z) < 25).length : 0;
  $('underSt').textContent = `срез: ${cutOff} от центра` + (n ? ` · муравейник ${(tribeOf(c.tribe) || {}).name || ''}: вырыто ${n.dug} блоков, камер ${n.rooms.filter(r => r.ready).length}/${n.rooms.length}, внутри ${inside}` : ' · муравейников рядом нет');
}
$('bUnder').onclick = toggleUnder; $('bCutUp').onclick = () => moveCut(1); $('bCutDn').onclick = () => moveCut(-1);
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function panCam(right, fwd) {
  const s = Math.sin(goal.yaw), c = Math.cos(goal.yaw);
  goal.tx = clamp(goal.tx + c * right - s * fwd, -HX, HX); goal.tz = clamp(goal.tz - s * right - c * fwd, -HZ, HZ);
  cam.follow = false;
}
function camUpdate(rdt) {
  const fast = keys.ShiftLeft || keys.ShiftRight ? 2.5 : 1, kp = goal.dist * 0.8 * rdt * fast;
  if (keys.KeyW || keys.ArrowUp) panCam(0, kp); if (keys.KeyS || keys.ArrowDown) panCam(0, -kp);
  if (keys.KeyA || keys.ArrowLeft) panCam(-kp, 0); if (keys.KeyD || keys.ArrowRight) panCam(kp, 0);
  if (keys.KeyQ) goal.yaw += 1.6 * rdt * fast; if (keys.KeyE) goal.yaw -= 1.6 * rdt * fast;
  if (keys.KeyR) goal.dist = Math.max(2.5, goal.dist * (1 - 1.2 * rdt)); if (keys.KeyF) goal.dist = Math.min(160, goal.dist * (1 + 1.2 * rdt));
  if (cam.follow && selected) { goal.tx = selected.x; goal.tz = selected.z; if (under) underY = selected.y + 0.5; } // следим под землёй — камера идёт за роботом по ходам
  // плавно догоняем цель
  const k = 1 - Math.exp(-rdt * 9);
  cam.tx += (goal.tx - cam.tx) * k; cam.tz += (goal.tz - cam.tz) * k;
  cam.yaw += (goal.yaw - cam.yaw) * k; cam.pitch += (goal.pitch - cam.pitch) * k; cam.dist += (goal.dist - cam.dist) * k;
  let gy = Math.max(world.height(cam.tx, cam.tz), world.waterLevel(cam.tx, cam.tz)) + 1;
  if (under) { gy = underY; applyCut(); }
  cam.ty += (gy - cam.ty) * Math.min(1, rdt * 5);
}
// луч из камеры через пиксель → точка на земле
function groundAt(px, py) {
  if (!lastVP) return null;
  const inv = M4.invert(lastVP); if (!inv) return null;
  const nx = px / canvas.clientWidth * 2 - 1, ny = 1 - py / canvas.clientHeight * 2;
  const un = (z) => { const v = M4.apply(inv, nx, ny, z), w = inv[3] * nx + inv[7] * ny + inv[11] * z + inv[15]; return v.map(c => c / w); };
  const a = un(-1), b = un(1), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
  for (let t = 0; t < Math.min(L, 600); t += 0.25) {
    const p = [a[0] + d[0] / L * t, a[1] + d[1] / L * t, a[2] + d[2] / L * t];
    if (Math.abs(p[0]) > HX || Math.abs(p[2]) > HZ) continue;
    if (p[1] <= Math.max(world.height(p[0], p[2]), world.waterLevel(p[0], p[2]))) return p;
  }
  return null;
}
function project(vp, x, y, z) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  if (w <= 0.1) return null;
  return [(cx / w * 0.5 + 0.5) * canvas.clientWidth, (1 - (cy / w * 0.5 + 0.5)) * canvas.clientHeight, w];
}
function robotAt(px, py) {
  if (!lastVP) return null;
  let best = null, bd = 40 * 40;
  for (const r of robots) {
    const p = project(lastVP, r.x, (r.anim.y ?? r.y) + 0.8 * r.genes.size, r.z); if (!p) continue;
    const d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
function pickAt(px, py) {
  const best = robotAt(px, py);
  if (!best) return;
  selected = best;
  if (best) { $('tab-robot').hidden = true; document.querySelector('.tabs [data-tab=robot]').click(); }
  updatePanels();
}
function selectRobot(r) { selected = r; cam.follow = true; document.querySelector('.tabs [data-tab=robot]').click(); }

// ---------- облачка речи ----------
const pool = [];
function drawOverlay(vp, now) {
  let n = 0;
  const eye = camEye(cam);
  for (const r of robots) {
    const showTag = r === selected, bub = r.say && r.say.until > now;
    if (!showTag && !bub) continue;
    if (!showTag && (r.x - eye[0]) ** 2 + (r.z - eye[2]) ** 2 > 65 * 65) continue;
    if (cutHides(r.x, r.z)) continue;
    const p = project(vp, r.x, (r.anim.y ?? r.y) + 0.75 * r.genes.size * (r.role === 'queen' ? 1.5 : 1), r.z);
    if (!p || p[0] < -50 || p[1] < -20 || p[0] > canvas.clientWidth + 50 || p[1] > canvas.clientHeight + 40) continue;
    let el = pool[n]; if (!el) { el = pool[n] = document.createElement('div'); overlay.appendChild(el); }
    n++;
    el.style.display = '';
    el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
    if (bub) {
      const c = CMAP[r.say.kind];
      el.className = 'bub ' + (r.say.kind === 'letter' ? 'letter' : '');
      el.innerHTML = esc(r.say.text) + (showTag ? `<br><small style="margin:0">${esc(r.name)}</small>` : '');
    } else { el.className = 'tag'; el.textContent = r.name + ' — ' + (r.intent ? 'идёт ' + r.intent.label : ACTIONS[r.action].toLowerCase()); }
  }
  // кучки еды: сколько штук лежит
  for (const o of world.objects) {
    if (o.dead || o.carried || (o.n || 1) < 2 || n > 80) continue;
    if ((o.x - eye[0]) ** 2 + (o.z - eye[2]) ** 2 > 30 * 30 || cutHides(o.x, o.z)) continue;
    const p = project(vp, o.x, (o.y ?? world.height(o.x, o.z)) + 0.95, o.z);
    if (!p || p[0] < -50 || p[1] < -20 || p[0] > canvas.clientWidth + 50 || p[1] > canvas.clientHeight + 40) continue;
    let el = pool[n]; if (!el) { el = pool[n] = document.createElement('div'); overlay.appendChild(el); }
    n++; el.style.display = ''; el.style.left = p[0] + 'px'; el.style.top = p[1] + 'px';
    el.className = 'tag'; el.textContent = `${o.t === 'meat' ? 'Мясо' : (FOODS[o.kind || 'apple'] || FOODS.apple).ru} ×${o.n}${o.camp ? ' · склад' : ''}`;
  }
  for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
}

// ---------- цвета величин (одни и те же везде) ----------
const C = { pop: '#4fc3f7', gen: '#b39ddb', iq: '#ce93d8', brain: '#4dd0e1', letters: '#ffd54f', lang: '#81c784', birth: '#a5d6a7', death: '#e57373',
  neutral: '#90a4ae', food: '#ffb74d', water: '#64b5f6', old: '#bcaaa4', sick: '#dce775', zombie: '#8bc34a', dig: '#a1887f', build: '#ffcc80',
  craft: '#f06292', happy: '#f48fb1', mind: '#7986cb', health: '#66bb6a', skill: '#4db6ac', pain: '#ef5350' };
// ---------- графики ----------
function drawCharts() {
  const cv = $('charts'), x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const items = [['Роботов', history.pop, C.pop, 0], ['Средний IQ', history.iq, C.iq, 0], ['Букв знает (в среднем)', history.letters, C.letters, 1],
    ['Единство языка, %', history.lang, C.lang, 0], ['Счастье, %', history.happy, C.happy, 0], ['Навыки (ср.), %', history.skill, C.skill, 0]];
  const cw = W / 2, ch = H / 3;
  items.forEach(([name, arr, col, dec], i) => {
    const ox = (i % 2) * cw, oy = (i / 2 | 0) * ch, pw = cw - 24, ph = ch - 46;
    x.fillStyle = col; x.font = '20px Segoe UI, system-ui'; x.fillText(name, ox + 12, oy + 24);
    if (!arr.length) return;
    const last = arr[arr.length - 1];
    x.fillStyle = col; x.font = 'bold 22px system-ui'; x.textAlign = 'right'; x.fillText(last.toFixed(dec), ox + cw - 12, oy + 24); x.textAlign = 'left';
    let mn = Math.min(...arr), mx = Math.max(...arr); if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
    const P = arr.map((v, k) => [ox + 12 + k / Math.max(1, arr.length - 1) * pw, oy + 36 + ph - (v - mn) / (mx - mn) * ph]);
    // заливка под линией — полупрозрачным цветом величины
    const gr = x.createLinearGradient(0, oy + 36, 0, oy + 36 + ph); gr.addColorStop(0, col + '66'); gr.addColorStop(1, col + '05');
    x.fillStyle = gr; x.beginPath(); x.moveTo(P[0][0], oy + 36 + ph); P.forEach(q => x.lineTo(q[0], q[1])); x.lineTo(P[P.length - 1][0], oy + 36 + ph); x.fill();
    x.strokeStyle = col; x.lineWidth = 2.5; x.beginPath(); P.forEach((q, k) => k ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.stroke();
  });
}

// ---------- визуализация мозга ----------
function drawBrain(r) {
  const cv = $('brain'), x = cv.getContext('2d'), W = cv.width, H = cv.height, b = r.brain;
  x.clearRect(0, 0, W, H);
  const Hn = Math.min(b.H, 48);
  const col = (n, X) => Array.from({ length: n }, (_, i) => [X, 14 + i * (H - 28) / Math.max(1, n - 1)]);
  const L0 = col(NI, 200), L1 = col(Hn, 400), L2 = col(NA, 540);
  const line = (p, q, w) => { const a = Math.min(0.85, Math.abs(w) * 0.35); if (a < 0.06) return; x.strokeStyle = w > 0 ? `rgba(79,195,247,${a})` : `rgba(229,115,115,${a})`; x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(q[0], q[1]); x.stroke(); };
  x.lineWidth = 1.2;
  for (let j = 0; j < Hn; j++) for (let i = 0; i < NI; i++) line(L0[i], L1[j], b.W1[i * b.H + j] * r.inp[i]);
  x.lineWidth = 2;
  for (let j = 0; j < Hn; j++) for (let a = 0; a < NA; a++) line(L1[j], L2[a], b.W2[j * NA + a] * r.hid[j]);
  const node = (p, v, rad) => { x.fillStyle = v >= 0 ? `rgba(79,195,247,${0.25 + Math.min(1, Math.abs(v)) * 0.75})` : `rgba(229,115,115,${0.25 + Math.min(1, Math.abs(v)) * 0.75})`; x.beginPath(); x.arc(p[0], p[1], rad, 0, 7); x.fill(); };
  x.font = '15px system-ui'; x.textAlign = 'right';
  L0.forEach((p, i) => { node(p, r.inp[i], 6); x.fillStyle = '#9a9a9a'; x.fillText(IN_NAMES[i], p[0] - 12, p[1] + 5); });
  L1.forEach((p, j) => node(p, r.hid[j], 5));
  x.textAlign = 'left';
  L2.forEach((p, a) => {
    node(p, r.probs[a] * 2 - 0.2, 8);
    x.fillStyle = a === r.action ? '#fff' : '#9a9a9a'; x.font = (a === r.action ? 'bold ' : '') + '15px system-ui';
    x.fillText(`${ACTIONS[a]} ${(r.probs[a] * 100).toFixed(0)}%`, p[0] + 14, p[1] + 5);
  });
  if (b.H > Hn) { x.fillStyle = '#9a9a9a'; x.textAlign = 'center'; x.fillText(`+${b.H - Hn} нейр.`, 400, H - 2); x.textAlign = 'left'; }
}

// ---------- панели ----------
function geneBar(r, k) {
  const [a, b] = GENE_RANGE[k], v = r.genes[k], f = (v - a) / (b - a);
  const val = k === 'brain' ? v : ['size', 'leg', 'head'].includes(k) ? '×' + v.toFixed(2) : Math.round(v * 100) + '%';
  const GC = { asym: C.death, brain: C.brain, learn: C.iq, instinct: C.gen, curiosity: C.letters, social: C.lang, strength: C.food, speed: C.pop, stamina: C.health,
    temper: C.pain, nerves: C.mind, immunity: C.sick, fertility: C.happy, lifespan: C.old };
  return bar(GENE_NAMES[k], f, val, GC[k] || C.neutral);
}
// ---------- проекция мозга муравья: контур мозга насекомого, нейроны-волокна мерцают по активности ----------
// контур: левая половина (x, y в долях), правая — зеркально
const FLY_OUTLINE_L = [[0.5, 0.12], [0.46, 0.11], [0.4, 0.08], [0.34, 0.12], [0.29, 0.17], [0.27, 0.24], [0.25, 0.26], [0.21, 0.23], [0.16, 0.28], [0.12, 0.38],
  [0.105, 0.52], [0.115, 0.66], [0.15, 0.77], [0.2, 0.84], [0.25, 0.84], [0.3, 0.77], [0.34, 0.68], [0.36, 0.64], [0.39, 0.67], [0.43, 0.74], [0.47, 0.77], [0.5, 0.77]];
const FLY_OUTLINE = [...FLY_OUTLINE_L, ...FLY_OUTLINE_L.slice().reverse().map(([x, y]) => [1 - x, y])];
// где лежит каждый отдел и куда тянутся его волокна
const FLY_GEO = {
  retina: { c: [0.16, 0.5], r: [0.014, 0.14], lat: true, n: 60, col: [111, 231, 255], to: (p, j) => [p[0] + 0.035, p[1] + j() * 0.01] },
  lamina: { c: [0.195, 0.5], r: [0.016, 0.13], lat: true, n: 70, col: [79, 216, 240], to: (p, j) => [p[0] + 0.04, p[1] + (0.5 - p[1]) * 0.1] },
  medulla: { c: [0.24, 0.5], r: [0.028, 0.12], lat: true, n: 120, col: [63, 196, 234], to: (p, j) => [p[0] + 0.05, p[1] + (0.48 - p[1]) * 0.3] },
  lobula: { c: [0.29, 0.48], r: [0.02, 0.08], lat: true, n: 80, col: [53, 176, 230], to: (p, j) => [0.36 + j() * 0.03, 0.31 + j() * 0.05] },
  lh: { c: [0.33, 0.3], r: [0.025, 0.045], lat: true, n: 60, col: [50, 224, 208], to: (p, j) => [0.37 + j() * 0.02, 0.22 + j() * 0.02] },
  mb: { c: [0.39, 0.22], r: [0.075, 0.085], lat: true, n: 320, col: [43, 217, 232], to: (p, j) => [0.44 + j() * 0.015, 0.47 + j() * 0.03] },
  al: { c: [0.45, 0.6], r: [0.045, 0.06], lat: true, n: 160, col: [74, 168, 240], to: (p, j) => [0.37 + j() * 0.02, 0.22 + j() * 0.02] },
  proto: { c: [0.5, 0.33], r: [0.13, 0.12], n: 220, col: [47, 138, 232], to: (p, j) => [1 - p[0] + j() * 0.03, p[1] + j() * 0.05] },
  cx: { c: [0.5, 0.42], r: [0.05, 0.025], n: 80, col: [92, 156, 255], to: (p, j) => [1 - p[0], p[1] + j() * 0.01] },
  motor: { c: [0.5, 0.5], r: [0.035, 0.05], n: 80, col: [47, 111, 224], to: (p, j) => [0.5 + j() * 0.012, 0.88] },
};
const FLY_W = 720, FLY_H = 400;
// светящийся шарик с радиальным размытием (заготовка на каждый цвет)
const GLOW = {};
function glowSprite(col) {
  const key = col.join(','); if (GLOW[key]) return GLOW[key];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, `rgba(${key},1)`); g.addColorStop(0.35, `rgba(${key},0.45)`); g.addColorStop(1, `rgba(${key},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (GLOW[key] = c);
}
function buildFlyView(seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const dots = [];
  FLY.forEach((rg, ri) => {
    const G = FLY_GEO[rg.k], n = G.n * 2;
    for (let i = 0; i < n; i++) {
      const side = G.lat && i % 2 ? -1 : 1, a = rnd() * 6.283, rr = Math.pow(rnd(), 0.6);
      let px = G.c[0] + Math.cos(a) * G.r[0] * rr, py = G.c[1] + Math.sin(a) * G.r[1] * rr;
      if (side < 0) px = 1 - px;
      dots.push({ ri, x: px * FLY_W, y: py * FLY_H, col: G.col, ph: rnd() * 6.283, sp: 2 + rnd() * 7 });
    }
  });
  // тусклая подложка: контур и все шарики еле видно
  const base = document.createElement('canvas'); base.width = FLY_W; base.height = FLY_H;
  const b = base.getContext('2d');
  b.fillStyle = '#000'; b.fillRect(0, 0, FLY_W, FLY_H);
  b.strokeStyle = '#f2f2f2'; b.lineWidth = 2; b.beginPath();
  FLY_OUTLINE.forEach(([x, y], i) => i ? b.lineTo(x * FLY_W, y * FLY_H) : b.moveTo(x * FLY_W, y * FLY_H)); b.closePath(); b.stroke();
  for (const d of dots) { b.fillStyle = `rgba(${d.col.join(',')},0.22)`; b.beginPath(); b.arc(d.x, d.y, 1.3, 0, 7); b.fill(); }
  const counts = FLY.map(rg => FLY_GEO[rg.k].n * 2);
  return { dots, base, level: new Float32Array(dots.length), offs: counts.map((_, i) => counts.slice(0, i).reduce((a, c) => a + c, 0)), counts };
}
function drawFly(r, now) {
  const cv = $('fly'); if (cv.hidden) return;
  const x = cv.getContext('2d');
  if (!r.flyView || r.flyView.seed !== r.fly.seed || !r.flyView.dots) { r.flyView = buildFlyView(r.fly.seed); r.flyView.seed = r.fly.seed; }
  const V = r.flyView, n = V.dots.length, target = new Float32Array(n), regionLoad = [];
  // активность группы реальных нейронов → сила свечения её шарика
  FLY.forEach((rg, ri) => {
    const off = V.offs[ri], c = V.counts[ri], act = r.fly.active[ri] || [];
    for (const i of act) target[off + (hash32(i, ri, 9) % c)] += 1;
    const m = act.length / c || 1;
    regionLoad[ri] = Math.min(1, act.length / (rg.n * rg.act)); // насколько задействован отдел
    for (let k = off; k < off + c; k++) { const v = (target[k] - m * 0.6) / (m * 2 + 1); target[k] = v > 0 ? Math.min(1, v * 2.2) * (0.5 + 0.5 * regionLoad[ri]) : 0; }
  });
  x.drawImage(V.base, 0, 0);
  x.globalCompositeOperation = 'lighter';
  const t = now / 1000;
  for (let i = 0; i < n; i++) {
    V.level[i] += (target[i] - V.level[i]) * 0.1;
    const L = V.level[i];
    if (L < 0.03) continue;
    const d = V.dots[i], blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * d.sp + d.ph)), a = Math.min(1, L * blink);
    const size = 8 + 26 * L * blink;
    x.globalAlpha = a; x.drawImage(glowSprite(d.col), d.x - size / 2, d.y - size / 2, size, size);
  }
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#000'; x.fillRect(0, FLY_H, cv.width, cv.height - FLY_H);
  const total = FLY.reduce((s, rg, ri) => s + (r.fly.active[ri] || []).length, 0);
  x.fillStyle = '#e6e6e6'; x.font = '16px Segoe UI, sans-serif'; x.textAlign = 'left';
  x.fillText(`Нейронов: ${(FLY_TOTAL + r.brain.H).toLocaleString('ru')}   активно: ${total}`, 12, 24);
  x.font = '14px Segoe UI, sans-serif';
  FLY.forEach((rg, ri) => {
    const py = FLY_H + 22 + ri * 21, col = `rgb(${FLY_GEO[rg.k].col.join(',')})`;
    x.fillStyle = col; x.fillRect(12, py - 9, 9, 9);
    x.fillText(`${rg.ru}: ${rg.n.toLocaleString('ru')}`, 28, py);
    // полоска загрузки отдела
    x.fillStyle = '#2a2a2a'; x.fillRect(470, py - 9, 200, 8);
    x.fillStyle = col; x.fillRect(470, py - 9, 200 * regionLoad[ri], 8);
  });
}

const driveColor = v => v < 0.33 ? '#66bb6a' : v < 0.66 ? '#ffca28' : '#ef5350';
function robotPanel() {
  const r = selected;
  if (!r) { $('robot').innerHTML = '<p class="muted">Кликните по роботу в мире, чтобы открыть его наборы: Рука, Здоровье, Наука, Генетика, Мозг.</p>'; for (const id of ['brain', 'brainH', 'fly', 'flyH']) $(id).hidden = true; return; }
  const g = r.genes, q = iq(r), st = r.st, tries = st.ok + st.fail, c = r.chem;
  const totalActs = st.acts.reduce((a, b) => a + b, 0) || 1;
  const vocab = CONCEPTS.filter(cc => r.vocab[cc.k]).map(cc => `<tr><td>${cc.ru}</td><td class="w">${esc(r.vocab[cc.k].w)}</td><td class="muted">${r.vocab[cc.k].s.toFixed(1)}</td></tr>`).join('');
  const sw = [PAL_SHELL[g.shell], PAL_ACC[g.acc], PAL_ACC[g.foot], PAL_EYE[g.eye]].map(cc => `<span class="sw" style="background:${rgb(cc)}"></span>`).join(' ');
  const inv = Object.entries(r.inv).map(([k, n]) => `<div class="stat"><span>${ITEMS[k] || k}</span><b>${n}</b></div>`).join('') || '<div class="muted">Сумка пуста</div>';
  const tools = Object.entries(TOOL_NAMES).map(([k, n]) => `<div class="stat"><span>${n}</span><b>${TIER[r.tools[k] || 0]}</b></div>`).join('');
  const recipes = RECIPES.filter(rc => r.known[rc.id]).map(rc => `<span class="pill" style="display:inline-block;margin:2px;padding:2px 7px">${rc.ru}</span>`).join('') || '<span class="muted">Пока ничего не изобрёл</span>';
  $('robot').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h1>${esc(r.name)} <span class="muted" style="font-size:12px">#${r.id}</span></h1>
      <div class="btns"><button data-r="follow">${cam.follow ? 'Не следить' : 'Следить'}</button><button data-r="close">Закрыть</button></div>
    </div>
    <div style="margin:2px 0 4px"><span class="sw" style="background:${tribeCss(r.tribe)}"></span> племя <b style="color:${tribeCss(r.tribe)}">${esc((tribeOf(r.tribe) || {}).name || '?')}</b>${r.goal ? ' · в походе' : ''}${r.role ? ` · <span style="color:${roleOf(r).col}">${roleOf(r).ru}</span>` : ''}</div>
    <div class="muted" style="margin:0 0 4px">место: ${BIOMES[r.bio || 0].ru}${campById(r.camp) ? ' · стоянка у ' + campById(r.camp).biome.toLowerCase() : ''} · знает биомов: ${Object.keys(r.biomes || {}).length} из ${BIOMES.length}${Object.keys(BUFFS).filter(k => buffOn(r, k)).map(k => ` · <span style="color:#81c784">${BUFFS[k]} ${Math.ceil(r.buffs[k] - simTime)} с</span>`).join('')}</div>
    <div class="muted">${stageOf(r)} · поколение ${r.gen} · ${r.parents ? 'родители: ' + esc(r.parents.join(' и ')) : 'первопредок'} · ${sw}</div>
    <h2>Рука</h2>
    <div class="btns"><button data-r="tickle">Погладить</button><button data-r="slap">Шлёпнуть</button><button data-r="apple">Дать плод</button><button data-r="rename">Имя</button></div>
    <div class="muted" style="font-size:11px;margin-top:4px">Погладить — награда за последнее действие («${ACTIONS[r.action]}»), шлёпнуть — наказание. Как в Creatures: робот запомнит.</div>
    <h2>Интеллект</h2>
    <div class="iq"><b>${q}</b><span class="muted">IQ · ${q > 120 ? 'гений племени' : q > 100 ? 'умный' : q > 85 ? 'обычный' : 'простоватый'}</span></div>
    ${bar('Шкала интеллекта', (q - 50) / 110, q, C.iq)}
    ${bar('Букв выучено', knownCount(r) / 26, knownCount(r) + '/26', C.letters)}
    ${bar('Слов в словаре', Object.keys(r.vocab).length / CONCEPTS.length, Object.keys(r.vocab).length, C.lang)}
    ${bar('Изобрёл вещей', RECIPES.filter(rc => r.known[rc.id]).length / RECIPES.length, RECIPES.filter(rc => r.known[rc.id]).length, C.craft)}
    <h2>Здоровье · сейчас: ${ACTIONS[r.action]}${r.sheltered ? ' · в укрытии' : ''}${c.antigen > 0 ? ' · болеет' : ''}</h2>
    ${bar('Физическое здоровье', r.health / 100, r.health.toFixed(0), C.health)}
    ${bar('Укрытие от холода', r.shelter || 0, Math.round((r.shelter || 0) * 100) + '%', C.water)}
    ${bar('Психическое здоровье', r.mental / 100, r.mental.toFixed(0), C.mind)}
    ${bar('Счастье', r.happy || 0, Math.round((r.happy || 0) * 100) + '%', C.happy)}
    ${bar('Возраст', r.age / r.lifespan, Math.round(r.age) + '/' + Math.round(r.lifespan), C.old)}
    <h2>Драйвы (зелёный — спокойно, жёлтый — заметно, красный — срочно)</h2>
    ${DRIVES.map(([k, n], i) => bar(n, r.d[i], Math.round(r.d[i] * 100), driveColor(r.d[i]))).join('')}
    <h2>Наука: химия</h2>
    ${bar('Гликоген (энергия)', r.energy / 100, r.energy.toFixed(0), C.food)}
    ${bar('Вода', r.water / 100, r.water.toFixed(0), C.water)}
    ${bar('Адреналин', c.adrenaline, (c.adrenaline * 100).toFixed(0), C.pain)}
    ${bar('Эндорфин', Math.min(1, c.endorphin), (c.endorphin * 100).toFixed(0), C.happy)}
    ${bar('Награда (дофамин)', Math.min(1, c.reward), (c.reward * 100).toFixed(0), C.lang)}
    ${bar('Наказание', Math.min(1, c.punish), (c.punish * 100).toFixed(0), C.death)}
    ${bar('Антиген (болезнь)', c.antigen, (c.antigen * 100).toFixed(0), C.sick)}
    ${bar('Антитела', c.antibody, (c.antibody * 100).toFixed(0), C.skill)}
    <h2>Сумка (${bagCount(r)}/${BAG_MAX})${r.carry ? ' · в руках: буква ' + LETTERS[r.carry.ch] : ''}</h2>
    <div class="grid">${inv}</div>
    <h2>Инструменты</h2><div class="grid2">${tools}</div>
    <h2>Крафты (знает ${RECIPES.filter(rc => r.known[rc.id]).length} из ${RECIPES.length})</h2>
    <table><tr><th>рецепт</th><th>нужно</th><th>статус</th></tr>${RECIPES.map(rc => {
      const known = r.known[rc.id], can = canCraftQuick(r, rc, r.inp[44], r.inp[45]);
      return `<tr><td class="${known ? 'rc-ok' : can ? 'rc-can' : 'rc-no'}">${rc.ru}</td><td>${ingredients(rc)}</td><td class="${known ? 'rc-ok' : can ? 'rc-can' : 'rc-no'}">${known ? 'умеет' : can ? 'может попробовать' : 'не знает'}</td></tr>`;
    }).join('')}</table>
    <h2>Навыки (учатся сами, практикой)</h2>
    ${SKILLS.map(([k, n]) => bar(n, r.skill[k] || 0, Math.round((r.skill[k] || 0) * 100) + '%', C.skill)).join('')}
    <h2>Генетика</h2>
    ${Object.keys(GENE_RANGE).map(k => geneBar(r, k)).join('')}
    <h2>Знает буквы</h2>
    <div class="abc">${[...LETTERS].map((L, k) => `<div style="background:rgba(200,200,200,${r.letters[k] * 0.85});color:${r.letters[k] >= 0.5 ? '#000' : '#9a9a9a'}" title="${Math.round(r.letters[k] * 100)}%">${L}</div>`).join('')}</div>
    <h2>Его слова</h2>
    ${vocab ? `<table><tr><th>понятие</th><th>слово</th><th>уверенность</th></tr>${vocab}</table>` : '<div class="muted">Пока не знает ни одного слова.</div>'}
    <h2>Жизнь в цифрах</h2>
    <div class="grid">
      <div class="stat"><span>Съел</span><b>${st.food}</b></div><div class="stat"><span>Попил</span><b>${st.drink}</b></div><div class="stat"><span>Тряс деревья</span><b>${st.shakes}</b></div>
      <div class="stat"><span>Копал</span><b>${st.digs}</b></div><div class="stat"><span>Брёвен</span><b>${st.chopped || 0}</b></div><div class="stat"><span>Поставил блоков</span><b>${st.built}</b></div>
      <div class="stat"><span>Скрафтил</span><b>${st.crafted || 0}</b></div><div class="stat"><span>Убил зомби</span><b>${st.kills || 0}</b></div><div class="stat"><span>Падал</span><b>${st.falls}</b></div>
      <div class="stat"><span>Болел</span><b>${st.ill}</b></div><div class="stat"><span>Детей</span><b>${st.kids}</b></div><div class="stat"><span>Прошёл, м</span><b>${st.dist.toFixed(0)}</b></div>
      <div class="stat"><span>Сказал слов</span><b>${st.words}</b></div><div class="stat"><span>Понимание</span><b>${tries ? Math.round(st.ok / tries * 100) + '%' : '—'}</b></div><div class="stat"><span>Погладили / шлёпнули</span><b>${st.tickled}/${st.slapped}</b></div>
    </div>
    <h2>Чем занимается (за жизнь)</h2>
    ${ACTIONS.map((a, i) => bar(a, st.acts[i] / totalActs, Math.round(st.acts[i] / totalActs * 100) + '%', i === r.action ? 'var(--pur)' : 'var(--acc)')).join('')}
    <h2>События жизни</h2>
    <div class="log">${r.life.slice().reverse().map(e => `<div><time>${fmtTime(e.t).replace('День ', 'д')}</time>${esc(e.text)}</div>`).join('')}</div>
  `;
  for (const id of ['brain', 'brainH', 'fly', 'flyH']) $(id).hidden = false;
  drawFly(r, performance.now());
  drawBrain(r);
}
$('robot').onclick = e => {
  const b = e.target.closest('[data-r]'); if (!b || !selected) return;
  const r = selected, k = b.dataset.r;
  if (k === 'follow') cam.follow = !cam.follow;
  else if (k === 'tickle') handTickle(r);
  else if (k === 'slap') handSlap(r);
  else if (k === 'apple') { const [x, z] = front(r, 0.8); world.add({ t: 'fruit', kind: BIOMES[biomeAt(x, z)].food || 'apple', x: inX(x), z: inZ(z), age: 0 }); }
  else if (k === 'rename') { const n = prompt('Новое имя робота:', r.name); if (n) { r.name = n.slice(0, 20); lifeEvent(r, 'Получил имя ' + r.name); } }
  else { selected = null; cam.follow = false; }
  updatePanels();
};

function worldPanel() {
  const n = robots.length || 1;
  let iqS = 0, iqMax = 0, br = 0, lt = 0, gen = 0;
  for (const r of robots) { const q = iq(r); iqS += q; iqMax = Math.max(iqMax, q); br += r.brain.H; lt += knownCount(r); gen += r.gen; }
  const c = G.causes;
  $('gstats').innerHTML = [
    ['Роботов', robots.length, C.pop], ['Племён', Object.values(G.tribes || {}).filter(t => t.alive).length, C.gen], ['Поколение (макс)', G.maxGen, C.gen], ['Поколение (ср.)', (gen / n).toFixed(1), C.gen],
    ['Средний IQ', (iqS / n).toFixed(0), C.iq], ['Макс. IQ сейчас', iqMax, C.iq], ['Рекорд IQ', `${G.bestIQ}`, C.iq],
    ['Нейронов (ср.)', Math.round(FLY_TOTAL + br / n).toLocaleString('ru'), C.brain], ['Букв знают (ср.)', (lt / n).toFixed(1), C.letters], ['Единство языка', Math.round(langAgreement() * 100) + '%', C.lang],
    ['Родилось', G.births, C.birth], ['Умерло', G.deaths, C.death], ['Объектов', world.objects.length, C.neutral],
    ['Смерть: голод', c.голод, C.food], ['Смерть: жажда', c.жажда, C.water], ['Смерть: старость', c.старость, C.old],
    ['Смерть: болезнь', (c.болезнь || 0) + ' / холод ' + (c.холод || 0), C.sick], ['Смерть: зомби', c.зомби || 0, C.death], ['Зомби сейчас', world.zombies.length, C.zombie],
    ['Первая землянка', G.firstDugout ? 'день ' + G.firstDugout.day : 'ещё нет', C.dig], ['Первый дом', G.firstHouse ? 'день ' + G.firstHouse.day : 'ещё нет', C.build], ['Укрытий построено', G.homeCount || 0, C.build],
    ['Выкопано блоков', G.mined || 0, C.dig], ['Построено блоков', G.built || 0, C.build], ['Изобретений', Object.keys(G.firsts).filter(k => k.startsWith('craft_')).length, C.craft],
    ['Счастье (ср.)', Math.round(robots.reduce((s, r) => s + (r.happy || 0), 0) / n * 100) + '%', C.happy], ['Психика (ср.)', Math.round(robots.reduce((s, r) => s + r.mental, 0) / n), C.mind], ['Больных', robots.filter(r => r.chem.antigen > 0).length, C.sick],
  ].map(([k, v, col]) => `<div class="stat" style="border-left:3px solid ${col}"><span style="color:${col}">${k}</span><b>${v}</b></div>`).join('');
  drawCharts();
  const top = robots.map(r => [r, iq(r)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  $('leaders').innerHTML = '<tr><th>Имя</th><th>IQ</th><th>пок.</th><th>мозг</th><th>букв</th><th>слов</th></tr>' +
    top.map(([r, q]) => `<tr class="lead" data-id="${r.id}"><td>${esc(r.name)}</td><td><b>${q}</b></td><td>${r.gen}</td><td>${r.brain.H}</td><td>${knownCount(r)}</td><td>${Object.keys(r.vocab).length}</td></tr>`).join('');
  $('events').innerHTML = events.slice(0, 40).map(e => `<div><time>${fmtTime(e.t).replace('День ', 'д')}</time>${esc(e.text)}</div>`).join('');
}
$('leaders').onclick = e => { const tr = e.target.closest('[data-id]'); if (tr) { const r = robots.find(r => r.id === +tr.dataset.id); if (r) selectRobot(r); } };
function langPanel() {
  const d = dictionary();
  $('dict').innerHTML = '<tr><th>понятие</th><th>главное слово</th><th>говорят</th><th>варианты</th></tr>' + d.map(x =>
    `<tr><td>${x.c.ru}</td><td class="w">${x.top ? esc(x.top) : '<span class="muted">—</span>'}</td><td>${x.users ? Math.round(x.topN / robots.length * 100) + '%' : '—'}</td><td class="muted">${x.list.slice(1).map(([w, c]) => esc(w) + '·' + c).join(' ') || ''}</td></tr>`).join('');
  const cnt = new Array(26).fill(0);
  for (const r of robots) for (let k = 0; k < 26; k++) if (r.letters[k] >= 0.5) cnt[k]++;
  $('abcPop').innerHTML = (G.alphabet ? '' : '<div class="muted" style="margin-bottom:6px">Алфавита в мире ещё нет — нажмите «Добавить алфавит» на вкладке «Мир». Пока роботы молчат.</div>') +
    `<div class="abc">${[...LETTERS].map((L, k) => { const f = cnt[k] / (robots.length || 1); return `<div style="background:rgba(200,200,200,${f * 0.9});color:${f > 0.5 ? '#000' : '#9a9a9a'}" title="${Math.round(f * 100)}% роботов">${L}</div>`; }).join('')}</div>`;
  $('talks').innerHTML = convLog.slice(-30).reverse().map(c => `<div><time>${fmtTime(c.t).replace('День ', 'д')}</time><b>${esc(c.who)}</b>: «<span class="w">${esc(c.word)}</span>» <span class="muted">(${CMAP[c.topic].ru})</span> <span class="muted">→ услышали ${c.heard}, поняли ${c.ok}</span> ${c.ok ? '· понят' : c.heard ? '· не понят' : ''}</div>`).join('') || '<div class="muted">Пока никто не говорил.</div>';
}
// ингредиенты рецепта текстом
function ingredients(rc) {
  const parts = Object.entries(rc.need).map(([k, n]) => `<span class="ing">${ITEMS[k] || k} ×${n}</span>`);
  if (rc.at) parts.push(`<span class="ing">у: ${BLOCK_NAMES[rc.at]}а</span>`.replace('верстака', 'верстака').replace('печьа', 'печи'));
  return parts.join('');
}
function craftPanel() {
  const n = robots.length || 1, cr = G.crafted || {};
  const knowCount = rc => robots.filter(r => r.known[rc.id]).length;
  const opened = RECIPES.filter(rc => cr[rc.id]).length;
  const tools = ['pick', 'axe', 'shovel', 'sword'].map(k => robots.filter(r => r.tools[k]).length);
  $('craftStats').innerHTML = [
    ['Открыто рецептов', `${opened} / ${RECIPES.length}`, C.craft], ['Всего скрафчено', Object.values(cr).reduce((s, x) => s + x.n, 0), C.craft], ['Верстаков в мире', countBlocks(B_TABLE), C.build],
    ['Печей в мире', countBlocks(B_FURNACE), C.build], ['С киркой', tools[0], C.dig], ['С мечом', tools[3], C.death],
    ['С топором', tools[1], C.food], ['С лопатой', tools[2], C.old], ['Брёвен в сумках', robots.reduce((s, r) => s + (r.inv.log || 0), 0), C.dig],
  ].map(([k, v, col]) => `<div class="stat" style="border-left:3px solid ${col}"><span style="color:${col}">${k}</span><b>${v}</b></div>`).join('');
  $('craftTable').innerHTML = '<tr><th>рецепт</th><th>нужно</th><th>умеют</th><th>изобрёл первым</th></tr>' + RECIPES.map(rc => {
    const c = cr[rc.id], k = knowCount(rc);
    return `<tr><td class="${c ? 'rc-ok' : 'rc-no'}">${rc.ru}</td><td>${ingredients(rc)}</td><td>${k ? Math.round(k / n * 100) + '% (' + k + ')' : '—'}</td><td>${c ? esc(c.by) + ' <span class="muted">пок. ' + c.gen + ', ' + fmtTime(c.t).replace('День ', 'д') + ', сделано ' + c.n + '</span>' : '<span class="muted">ещё никто</span>'}</td></tr>`;
  }).join('');
}
// сколько блоков этого типа стоит в мире (считаем изредка)
let blockCountCache = {}, blockCountT = -99;
function countBlocks(id) {
  if (simTime - blockCountT > 10) { blockCountCache = {}; for (let i = 0; i < world.b.length; i++) { const b = world.b[i]; if (b === B_TABLE || b === B_FURNACE) blockCountCache[b] = (blockCountCache[b] || 0) + 1; } blockCountT = simTime; }
  return blockCountCache[id] || 0;
}
// ---------- вкладка «Племена» ----------
function tribesPanel() {
  const byT = {}; for (const r of robots) (byT[r.tribe] = byT[r.tribe] || []).push(r);
  const alive = Object.values(G.tribes || {}).filter(t => t.alive);
  $('tribeTable').innerHTML = '<tr><th>племя</th><th>жителей</th><th>IQ</th><th>земли</th><th>слова</th></tr>' + alive.map(t => {
    const rs = byT[t.id] || [], v = vocabOf(rs), words = Object.entries(v).slice(0, 3).map(([k, w]) => `<span class="ing">${CMAP[k].ru}: ${esc(w)}</span>`).join('') || '<span class="muted">языка ещё нет</span>';
    const q = rs.length ? Math.round(rs.reduce((s, r) => s + iq(r), 0) / rs.length) : 0;
    return `<tr><td><span class="sw" style="background:${tribeCss(t.id)}"></span> <b style="color:${tribeCss(t.id)}">${esc(t.name)}</b><br><span class="muted">с ${fmtTime(t.born).replace('День ', 'д')}${t.parent && G.tribes[t.parent] ? ', от ' + esc(G.tribes[t.parent].name) : ''}</span></td><td>${rs.length}</td><td>${q}</td><td>${territorySize(t.id)}</td><td>${words}</td></tr>`;
  }).join('');
  if (alive.length < 2) $('relMatrix').innerHTML = '<div class="muted">Пока одно племя — дипломатии нет. Новое появится, когда группа уйдёт далеко и её язык разойдётся.</div>';
  else $('relMatrix').innerHTML = '<table><tr><th></th>' + alive.map(t => `<th style="color:${tribeCss(t.id)}">${esc(t.name)}</th>`).join('') + '</tr>' + alive.map(a => `<tr><td style="color:${tribeCss(a.id)}">${esc(a.name)}</td>` + alive.map(b => {
    if (a.id === b.id) return '<td class="muted">—</td>';
    const v = getRel(a.id, b.id), st = relStatus(v);
    return `<td style="color:${st[2]}">${st[1]}<br><span class="muted">${v >= 0 ? '+' : ''}${v.toFixed(2)}</span></td>`;
  }).join('') + '</tr>').join('') + '</table>';
  const camps = G.camps || [];
  const RK = ['queen', 'soldier', 'builder', 'forager', 'nurse', 'scout', 'young'];
  $('colonyTable').innerHTML = '<tr><th>колония</th>' + RK.map(k => `<th style="color:${ROLES[k].col}" title="${ROLES[k].desc}">${ROLES[k].ru}</th>`).join('') + '<th>склад</th><th>гнездо</th></tr>' + camps.filter(c => c.pop).map(c => {
    const cnt = {}; for (const r of robots) if (r.camp === c.id) cnt[r.role || 'young'] = (cnt[r.role || 'young'] || 0) + 1;
    const q = queenOf(c), n = c.nest, left = n ? n.cells.length - n.next : 0;
    return `<tr><td style="color:${c.tribe ? tribeCss(c.tribe) : ''}">${esc((tribeOf(c.tribe) || {}).name || 'ничья')}<br><span class="muted">${esc(c.biome)}${q ? ', матка ' + esc(q.name) : ', без матки'}</span></td>` + RK.map(k => `<td>${cnt[k] || ''}</td>`).join('') + `<td>${foodOf(c)}</td><td>${n && n.rooms ? `${n.rooms.filter(rm => rm.ready).map(rm => ROOM_RU[rm.purpose]).join(', ') || 'роют вход и ствол'} · ${n.dug} бл.<br><span class="muted">${ARCH_RU(n.arch)}</span>` : '<span class="muted">нет</span>'}</td></tr>`;
  }).join('');
  $('campTable').innerHTML = camps.length ? '<tr><th>стоянка</th><th>племя</th><th>жителей</th><th>основал</th><th>состояние</th></tr>' + camps.map(c => {
    const t = tribeOf(c.tribe), sg = Object.keys(c.siege || {}).filter(k => c.siege[k] > 0);
    const st = sg.length ? `<span style="color:#e57373">осада: ${sg.map(k => esc((tribeOf(+k) || {}).name || '?')).join(', ')}</span>` : c.pop ? (t && t.capital === c.id ? 'столица' : 'живая') : '<span class="muted">пустует</span>';
    return `<tr><td>${esc(c.biome)}<br><span class="muted">${Math.round(c.x)}, ${Math.round(c.z)}</span></td><td style="color:${c.tribe ? tribeCss(c.tribe) : ''}">${t ? esc(t.name) : 'ничья'}</td><td>${c.pop || 0}</td><td>${esc(c.founder || '')}<br><span class="muted">${fmtTime(c.founded).replace('День ', 'д')}</span></td><td>${st}</td></tr>`;
  }).join('') : '<tr><td class="muted">стоянок нет</td></tr>';
  const bioPop = BIOMES.map(() => 0); for (const r of robots) bioPop[r.bio || 0]++;
  $('biomeTable').innerHTML = '<tr><th>биом</th><th>сейчас</th><th>свойства</th></tr>' + BIOMES.map((b, i) => `<tr><td><span class="sw" style="background:rgb(${b.tint.map(v => Math.round(Math.min(1, v * 0.55) * 255)).join(',')})"></span> ${b.ru}${b.food ? '<br><span class="muted">' + FOODS[b.food].ru + '</span>' : ''}</td><td>${bioPop[i]}</td><td class="muted">${b.desc}</td></tr>`).join('');
  $('diploLog').innerHTML = (G.diplo || []).slice(0, 30).map(e => `<div><time>${fmtTime(e.t).replace('День ', 'д')}</time>${esc(e.text)}</div>`).join('') || '<div class="muted">Пока тихо.</div>';
  if (!$('mini').hidden) drawMinimap($('mini'));
}
$('bMini').onclick = () => { const m = $('mini'); m.hidden = !m.hidden; $('bMini').textContent = m.hidden ? 'Открыть миникарту' : 'Скрыть миникарту'; if (!m.hidden) drawMinimap(m); };
$('mini').addEventListener('click', e => {
  const m = $('mini'), b = m.getBoundingClientRect();
  goal.tx = (e.clientX - b.left) / b.width * MAPX - HX; goal.tz = (e.clientY - b.top) / b.height * MAPZ - HZ; cam.follow = false;
});
function updatePanels() {
  if (selected && selected.dead) { pushEvent(`${selected.name} умер (${selected.cause}), прожив ${Math.round(selected.age)} с`); selected = null; cam.follow = false; }
  $('clock').textContent = fmtTime(simTime) + (isNight() ? ' · ночь' : ' · день') + ' · ' + SEASONS[season()];
  if (tab === 'world') worldPanel(); else if (tab === 'robot') robotPanel(); else if (tab === 'craft') craftPanel(); else if (tab === 'tribes') tribesPanel(); else langPanel();
}

// ---------- главный цикл ----------
let lastAutosave = performance.now(), last = performance.now(), acc = 0, lastPanel = 0, fpsN = 0, fpsT = last, simMark = simTime, perfTxt = '';
function frame(now) {
  const rdt = Math.min(0.1, (now - last) / 1000); last = now;
  const t0 = performance.now();
  if (speed === Infinity) { while (performance.now() - t0 < 30) for (let i = 0; i < 5; i++) step(); }
  else if (speed > 0) {
    acc += rdt * speed;
    while (acc >= DT && performance.now() - t0 < 30) { step(); acc -= DT; }
    if (acc > DT * 4) acc = 0; // не успеваем — не копим долг
  }
  camUpdate(rdt);
  // размер холста
  const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const mul = speed === Infinity ? 3 : speed;
  lastVP = renderFrame(cam, speed ? rdt : 0, mul, selected, W, H);
  drawOverlay(lastVP, now);
  if (tab === 'robot' && selected) drawFly(selected, now); // нейроны мерцают каждый кадр
  fpsN++;
  if (now - fpsT > 1000) {
    const simRate = (simTime - simMark) / ((now - fpsT) / 1000);
    perfTxt = `${fpsN} FPS · время ×${simRate.toFixed(0)}`; fpsN = 0; fpsT = now; simMark = simTime;
    $('perf').textContent = perfTxt; underStatus();
  }
  if (now - lastPanel > 350) { lastPanel = now; updatePanels(); $('saveSt').textContent = 'Автосохранение: ' + saveStatus; }
  if (now - lastAutosave > 60000) { lastAutosave = now; autosave(); }
  requestAnimationFrame(frame);
}
// ---------- запуск: распаковать карту Minecraft, текстуры, мир ----------
(async function boot() {
  try {
    await loadMap();
    simMark = 0;
    const img = await loadBlockTexture();
    if (!(await tryResume())) initSim(); // продолжить сохранённый мир, если он есть
    simMark = simTime;
    initRender(canvas);
    R.setBlocks(img);
    // камера — на роботов
    let mx = 0, mz = 0; for (const r of robots) { mx += r.x; mz += r.z; }
    cam.tx = mx / robots.length; cam.tz = mz / robots.length; cam.dist = 55; camSnap();
  } catch (e) {
    $('err').style.display = 'flex'; $('err').textContent = 'Не удалось запустить 3D: ' + e.message;
    throw e;
  }
  updatePanels();
  requestAnimationFrame(frame);
})();

// ---------- боковая панель: ширину можно тянуть, панель сворачивается вправо ----------
(function () {
  const aside = document.querySelector('aside'), split = $('split'), btn = $('collapse');
  let w = 400, collapsed = false;
  try { w = +localStorage.getItem('panelW') || 400; collapsed = localStorage.getItem('panelC') === '1'; } catch (e) {}
  const apply = () => {
    aside.style.display = collapsed ? 'none' : ''; aside.style.width = w + 'px';
    btn.textContent = collapsed ? '‹' : '›'; btn.title = collapsed ? 'Показать панель' : 'Свернуть панель';
    try { localStorage.setItem('panelW', w); localStorage.setItem('panelC', collapsed ? '1' : '0'); } catch (e) {}
  };
  btn.onclick = e => { e.stopPropagation(); collapsed = !collapsed; apply(); };
  split.addEventListener('pointerdown', e => {
    if (e.target === btn || collapsed) return;
    split.setPointerCapture(e.pointerId); split.classList.add('on');
    const move = ev => { w = clamp(innerWidth - ev.clientX, 260, innerWidth * 0.75); aside.style.width = w + 'px'; };
    const up = () => { split.classList.remove('on'); split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up); apply(); };
    split.addEventListener('pointermove', move); split.addEventListener('pointerup', up);
  });
  apply();
})();

// сохранить при закрытии/сворачивании вкладки
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave(); });
addEventListener('pagehide', () => autosave());
