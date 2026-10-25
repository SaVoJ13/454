/* Графіки без бібліотек: SVG, який будується через DOM API (CSP-сумісно: без innerHTML та inline-стилів).
   Кольори, шрифти й відступи — у css/styles.css через класи та змінні теми (тож світла/темна тема працює сама).
   Чому не Chart.js: ~200 КБ у прекеші, який з cache:'reload' заново качається при кожному оновленні, і потрібен файл,
   який складно завантажити з телефона. Тут ~150 рядків і нуль залежностей.
   `doc` передається параметром, щоб функції можна було тестувати без браузера. */

const NS = 'http://www.w3.org/2000/svg';
export const MIX_KEYS = ['regular', 'night', 'overtime', 'vacation', 'l4', 'excused'];

function svgEl(doc, tag, attrs = {}, text) {
  const n = doc.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) n.setAttribute(k, String(attrs[k]));
  if (text !== undefined) n.textContent = text;
  return n;
}
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;

/* Шкала осі Y: 4 інтервали з «круглим» кроком (1; 1,5; 2; 2,5; 3; 4; 5; 6; 8; 10 × 10^n), що покриває максимум. */
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export function niceScale(maxValue, ticks = 4) {
  if (!(maxValue > 0)) return { step: 1000, max: 1000 * ticks, ticks };
  const raw = maxValue / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = STEPS.map(s => s * mag).find(s => s >= raw - 1e-9);
  return { step, max: step * ticks, ticks };
}

export function axisLabel(v) {
  if (v === 0) return '0';
  return v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

/* Стовпчики «брутто / нетто». buckets — довільна кількість (3, 6, 12 місяців або роки): [{ key, has, gross, net }].
   o: { labels[], subLabels[] (другий рядок підпису, напр. рік під січнем; може бути пустим), selected (key),
        ariaLabel, pickLabel(bucket), onPick(key) } */
export function drawIncomeChart(doc, host, buckets, o = {}) {
  const hasSub = Array.isArray(o.subLabels) && o.subLabels.some(Boolean);
  const W = 360, H = 210, L = 36, R = 6, T = 10, B = hasSub ? 34 : 24;
  const n = Math.max(1, buckets.length);
  const plotW = W - L - R, plotH = H - T - B, slot = plotW / n;
  const maxVal = Math.max(0, ...buckets.map(m => Math.max(m.gross, m.net)));
  const { step, max, ticks } = niceScale(maxVal);
  const svg = svgEl(doc, 'svg', { class: 'chart income-chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.ariaLabel || '' });

  for (let i = 0; i <= ticks; i++) {                                    // сітка й підписи осі Y
    const y = r1(T + plotH - (plotH * i) / ticks);
    svg.appendChild(svgEl(doc, 'line', { class: 'grid', x1: L, x2: W - R, y1: y, y2: y }));
    svg.appendChild(svgEl(doc, 'text', { class: 'axis', x: L - 4, y: r1(y + 3.5), 'text-anchor': 'end' }, axisLabel(step * i)));
  }

  const barW = Math.min(18, slot * 0.36);
  buckets.forEach((mo, i) => {
    const key = mo.key !== undefined ? mo.key : mo.month;
    const x0 = L + i * slot, selected = o.selected !== undefined && o.selected !== null && o.selected === key;
    const g = svgEl(doc, 'g', { class: 'bar-group' + (mo.has ? '' : ' empty') + (selected ? ' sel' : '') });
    if (selected) g.appendChild(svgEl(doc, 'rect', { class: 'sel-bg', x: r1(x0 + 1), y: T, width: r1(slot - 2), height: plotH, rx: 3 }));
    if (mo.has) {
      const gx = x0 + (slot - (2 * barW + 2)) / 2;
      const hg = (mo.gross / max) * plotH, hn = (Math.max(0, mo.net) / max) * plotH;
      g.appendChild(svgEl(doc, 'rect', { class: 'bar-gross', x: r1(gx), y: r1(T + plotH - hg), width: r1(barW), height: r1(hg), rx: 1.5 }));
      g.appendChild(svgEl(doc, 'rect', { class: 'bar-net', x: r1(gx + barW + 2), y: r1(T + plotH - hn), width: r1(barW), height: r1(hn), rx: 1.5 }));
    }
    g.appendChild(svgEl(doc, 'text', { class: 'axis' + (mo.has ? '' : ' dim'), x: r1(x0 + slot / 2), y: hasSub ? H - 18 : H - 8, 'text-anchor': 'middle' },
      o.labels ? o.labels[i] : String(key)));
    if (hasSub && o.subLabels[i]) g.appendChild(svgEl(doc, 'text', { class: 'axis sub', x: r1(x0 + slot / 2), y: H - 6, 'text-anchor': 'middle' }, o.subLabels[i]));
    // область дотику на всю висоту стовпця (зручно пальцем) + клавіатура
    const hit = svgEl(doc, 'rect', { class: 'hit', x: r1(x0), y: T, width: r1(slot), height: plotH + B, tabindex: 0, role: 'button',
      'aria-label': o.pickLabel ? o.pickLabel(mo) : String(key) });
    if (o.onPick) {
      hit.addEventListener('click', () => o.onPick(key));
      hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); o.onPick(key); } });
    }
    g.appendChild(hit);
    svg.appendChild(g);
  });

  host.replaceChildren(svg);
  return svg;
}

/* Кільцева діаграма структури змін. mix: { regular, night, overtime, vacation, l4, excused } (у змінах/днях).
   o: { ariaLabel, centerText, unitText } */
export function drawMixChart(doc, host, mix, o = {}) {
  const r = 42, C = 2 * Math.PI * r;
  const total = MIX_KEYS.reduce((s, k) => s + (mix[k] || 0), 0);
  const svg = svgEl(doc, 'svg', { class: 'chart mix-chart', viewBox: '0 0 120 120', role: 'img', 'aria-label': o.ariaLabel || '' });
  svg.appendChild(svgEl(doc, 'circle', { class: 'seg-track', cx: 60, cy: 60, r }));
  let offset = 0;
  MIX_KEYS.forEach((k, i) => {
    const v = mix[k] || 0;
    if (v <= 0 || total <= 0) return;
    const len = (v / total) * C;
    svg.appendChild(svgEl(doc, 'circle', { class: `seg seg-${i}`, cx: 60, cy: 60, r,
      'stroke-dasharray': `${r2(len)} ${r2(C - len)}`, 'stroke-dashoffset': r2(-offset), transform: 'rotate(-90 60 60)' }));
    offset += len;
  });
  svg.appendChild(svgEl(doc, 'text', { class: 'center-num', x: 60, y: 63, 'text-anchor': 'middle' }, o.centerText !== undefined ? o.centerText : String(r1(total))));
  if (o.unitText) svg.appendChild(svgEl(doc, 'text', { class: 'center-unit', x: 60, y: 77, 'text-anchor': 'middle' }, o.unitText));
  host.replaceChildren(svg);
  return svg;
}

/* Легенда під кільцем: кольорова мітка, назва, значення й частка. labels: { regular: 'Звичайні…', … } */
export function drawMixLegend(doc, list, mix, labels, o = {}) {
  const total = MIX_KEYS.reduce((s, k) => s + (mix[k] || 0), 0);
  const fmt = o.format || (v => String(r1(v)));
  const items = [];
  MIX_KEYS.forEach((k, i) => {
    const v = mix[k] || 0;
    if (v <= 0 || total <= 0) return;
    const li = doc.createElement('li');
    const chip = doc.createElement('span'); chip.className = `chip chip-${i}`;
    const name = doc.createElement('span'); name.className = 'name'; name.textContent = labels[k];
    const val = doc.createElement('b'); val.textContent = `${fmt(v)}${o.unit ? ' ' + o.unit : ''} · ${Math.round((v / total) * 100)}%`;
    li.appendChild(chip); li.appendChild(name); li.appendChild(val);
    items.push(li);
  });
  list.replaceChildren(...items);
  return items;
}
