/* js/charts.js: шкала, геометрія стовпчиків, кільце й легенда. Малюємо у фейковий документ — без браузера. */
import assert from 'node:assert/strict';
import { makeNode, findAll, hasClass } from './fake-dom.mjs';
import { niceScale, axisLabel, drawIncomeChart, drawMixChart, drawMixLegend, MIX_KEYS } from '../js/charts.js';

const doc = { createElement: tag => makeNode(tag), createElementNS: (_ns, tag) => makeNode(tag) };
const noBadNumbers = root => findAll(root, () => true).forEach(n =>
  Object.entries(n.attrs || {}).forEach(([k, v]) => assert.ok(!/NaN|Infinity|undefined/.test(String(v)), `${n.tag}.${k}="${v}"`)));

// 1. Шкала осі: «круглий» крок, максимум покриває дані, 4 інтервали
assert.deepEqual(niceScale(0), { step: 1000, max: 4000, ticks: 4 }, 'порожні дані — шкала за замовчуванням');
for (const [value, step] of [[7149.49, 2000], [950, 250], [4000, 1000], [120000, 30000], [1, 0.25], [13999, 4000]]) {
  const s = niceScale(value);
  assert.equal(s.step, step, `niceScale(${value}).step`);
  assert.equal(s.max, step * 4); assert.ok(s.max >= value, 'максимум шкали покриває значення');
}
assert.equal(axisLabel(0), '0'); assert.equal(axisLabel(500), '500'); assert.equal(axisLabel(1500), '1.5k'); assert.equal(axisLabel(12000), '12k');

// 2. Стовпчики
const W = 360, H = 210, L = 36, R = 6, T = 10, B = 24, plotH = H - T - B;
const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, has: false, gross: 0, net: 0 }));
months[0] = { month: 1, has: true, gross: 8000, net: 6000 };       // найвищий: визначає шкалу (8000 → крок 2000, максимум 8000)
months[2] = { month: 3, has: true, gross: 4000, net: 3000 };
months[5] = { month: 6, has: true, gross: 2000, net: -100 };       // від'ємне netto не дає від'ємної висоти
const labels = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const picks = [];
const host = makeNode('div');
const svg = drawIncomeChart(doc, host, months, { labels, selected: 3, ariaLabel: 'Брутто і нетто', pickLabel: m => `м${m.month}`, onPick: m => picks.push(m) });
assert.equal(host.children[0], svg); assert.equal(svg.attrs.viewBox, `0 0 ${W} ${H}`); assert.equal(svg.attrs.role, 'img'); assert.equal(svg.attrs['aria-label'], 'Брутто і нетто');
assert.equal(findAll(svg, n => hasClass(n, 'grid')).length, 5, '5 ліній сітки (0 + 4 інтервали)');
assert.deepEqual(findAll(svg, n => hasClass(n, 'axis') && n.attrs['text-anchor'] === 'end').map(n => n.textContent), ['0', '2k', '4k', '6k', '8k']);
assert.equal(findAll(svg, n => hasClass(n, 'bar-group')).length, 12);
assert.equal(findAll(svg, n => hasClass(n, 'bar-net')).length, 3, 'стовпчики лише в місяців з даними');
const net = findAll(svg, n => hasClass(n, 'bar-net')), gross = findAll(svg, n => hasClass(n, 'bar-gross'));
assert.equal(Number(gross[0].attrs.height), plotH, '8000 з максимуму шкали 8000 — на всю висоту');
assert.equal(Number(net[0].attrs.height), plotH * 6000 / 8000);
assert.equal(Number(gross[1].attrs.height), plotH * 4000 / 8000);
assert.equal(Number(net[2].attrs.height), 0, 'від\'ємне netto → висота 0');
assert.ok(Number(net[0].attrs.y) + Number(net[0].attrs.height) <= T + plotH + 0.1, 'стовпчик не виходить за низ графіка');
const groups = findAll(svg, n => hasClass(n, 'bar-group'));
assert.ok(hasClass(groups[0], 'empty') === false && hasClass(groups[1], 'empty'), 'порожні місяці позначені');
assert.ok(hasClass(groups[2], 'sel') && findAll(groups[2], n => hasClass(n, 'sel-bg')).length === 1, 'вибраний місяць підсвічений');
assert.equal(findAll(svg, n => hasClass(n, 'sel-bg')).length, 1, 'підсвічений рівно один');
assert.deepEqual(findAll(svg, n => hasClass(n, 'axis') && n.attrs['text-anchor'] === 'middle').map(n => n.textContent), labels, 'підписи місяців');
const hits = findAll(svg, n => hasClass(n, 'hit'));
assert.equal(hits.length, 12); assert.ok(hits.every(h => h.attrs.tabindex === '0' && h.attrs.role === 'button'), 'кожен стовпець доступний з клавіатури');
assert.deepEqual(hits.slice(0, 3).map(h => h.attrs['aria-label']), ['м1', 'м2', 'м3']);
noBadNumbers(svg);

// 3. Вибір місяця: дотик і клавіатура
hits[4].handlers.click[0]();
hits[6].handlers.keydown[0]({ key: 'Enter', preventDefault() {} });
hits[7].handlers.keydown[0]({ key: ' ', preventDefault() {} });
hits[8].handlers.keydown[0]({ key: 'a', preventDefault() {} });         // інші клавіші ігноруються
assert.deepEqual(picks, [5, 7, 8]);

// 4. Усі нулі й порожній рік не дають NaN
const empty = makeNode('div');
noBadNumbers(drawIncomeChart(doc, empty, months.map(m => ({ ...m, has: false })), {}));
noBadNumbers(drawIncomeChart(doc, makeNode('div'), months.map(m => ({ ...m, has: true, gross: 0, net: 0 })), {}));

// 5. Кільце: сума сегментів = довжина кола, нульові категорії пропущені, порядок і зсув
const mix = { regular: 20, night: 10, overtime: 5, vacation: 0, l4: 3, excused: 2 };
const mixHost = makeNode('div');
const ring = drawMixChart(doc, mixHost, mix, { ariaLabel: 'Структура', unitText: 'днів' });
const C = 2 * Math.PI * 42, segs = findAll(ring, n => /\bseg seg-\d\b/.test(n.attrs.class || ''));
assert.equal(segs.length, 5, 'нульова категорія не малюється');
assert.deepEqual(segs.map(s => s.attrs.class), ['seg seg-0', 'seg seg-1', 'seg seg-2', 'seg seg-4', 'seg seg-5'], 'колір сегмента прив\'язаний до категорії, а не до порядку');
const lens = segs.map(s => Number(s.attrs['stroke-dasharray'].split(' ')[0]));
assert.ok(Math.abs(lens.reduce((a, b) => a + b, 0) - C) < 0.3, `сума сегментів ${lens.reduce((a, b) => a + b, 0)} ≠ коло ${C}`);
assert.equal(Number(segs[0].attrs['stroke-dashoffset']), 0, 'перший сегмент без зсуву');
assert.ok(Math.abs(Number(segs[1].attrs['stroke-dashoffset']) + lens[0]) < 0.02, 'другий починається там, де закінчився перший');
assert.ok(lens[0] > lens[1] && lens[1] > lens[2], 'довжина пропорційна значенню (20 > 10 > 5)');
assert.ok(segs.every(s => s.attrs.transform === 'rotate(-90 60 60)'), 'старт зверху');
assert.equal(findAll(ring, n => hasClass(n, 'center-num'))[0].textContent, '40'); assert.equal(findAll(ring, n => hasClass(n, 'center-unit'))[0].textContent, 'днів');
assert.equal(findAll(ring, n => hasClass(n, 'seg-track')).length, 1);
noBadNumbers(ring);
// 100% однієї категорії і порожнє кільце
const one = drawMixChart(doc, makeNode('div'), { night: 7 }, {});
const oneSeg = findAll(one, n => /\bseg\b/.test(n.attrs.class || '') && !hasClass(n, 'seg-track'));
assert.equal(oneSeg.length, 1); assert.ok(Math.abs(Number(oneSeg[0].attrs['stroke-dasharray'].split(' ')[0]) - C) < 0.02); noBadNumbers(one);
const none = drawMixChart(doc, makeNode('div'), { regular: 0, night: 0 }, {});
assert.equal(findAll(none, n => /\bseg seg-\d\b/.test(n.attrs.class || '')).length, 0); assert.equal(findAll(none, n => hasClass(n, 'center-num'))[0].textContent, '0'); noBadNumbers(none);

// 6. Легенда: лише ненульові категорії, відсотки від суми, колір за категорією
const list = makeNode('ul');
const labelsMix = { regular: 'Звичайні', night: 'Нічні', overtime: 'Надгодини', vacation: 'Відпустка', l4: 'L4', excused: 'Поважна' };
const items = drawMixLegend(doc, list, mix, labelsMix, { unit: 'дн.' });
assert.equal(list.children.length, 5);
const text = li => li.children.map(c => c.textContent).filter(Boolean);
assert.deepEqual(text(items[0]), ['Звичайні', '20 дн. · 50%']);
assert.deepEqual(text(items[1]), ['Нічні', '10 дн. · 25%']);
assert.equal(items[3].children[0].className, 'chip chip-4', 'L4 — колір категорії 4 навіть без відпустки');
const pct = items.map(li => Number(/(\d+)%/.exec(li.children[2].textContent)[1]));
assert.ok(Math.abs(pct.reduce((a, b) => a + b, 0) - 100) <= 3, 'відсотки в сумі ≈ 100');
assert.equal(drawMixLegend(doc, makeNode('ul'), { regular: 0 }, labelsMix).length, 0);
assert.deepEqual(MIX_KEYS, ['regular', 'night', 'overtime', 'vacation', 'l4', 'excused']);

// 7. Довільна кількість стовпчиків (3 / 6 місяців, роки), вибір за ключем, другий рядок підпису
const few = [
  { key: '2026-08', has: true, gross: 4000, net: 3000 }, { key: '2026-09', has: false, gross: 0, net: 0 }, { key: '2026-10', has: true, gross: 8000, net: 6000 }
];
const picks3 = [];
const svg3 = drawIncomeChart(doc, makeNode('div'), few, { labels: ['Сер', 'Вер', 'Жов'], selected: '2026-10', pickLabel: b => String(b.key), onPick: k => picks3.push(k) });
const slot3 = (360 - 36 - 6) / 3;
assert.equal(findAll(svg3, n => hasClass(n, 'hit')).length, 3);
assert.equal(Number(findAll(svg3, n => hasClass(n, 'hit'))[0].attrs.width), Math.round(slot3 * 10) / 10, 'область дотику на всю ширину слота');
assert.equal(Number(findAll(svg3, n => hasClass(n, 'bar-net'))[0].attrs.width), 18, 'при трьох стовпцях смуги ширші (до 18)');
assert.equal(findAll(svg3, n => hasClass(n, 'bar-group') && hasClass(n, 'sel')).length, 1);
assert.ok(hasClass(findAll(svg3, n => hasClass(n, 'bar-group'))[2], 'sel'), 'вибраний — за ключем, а не за номером');
findAll(svg3, n => hasClass(n, 'hit'))[0].handlers.click[0]();
assert.deepEqual(picks3, ['2026-08'], 'onPick отримує ключ');
noBadNumbers(svg3);

const withSub = drawIncomeChart(doc, makeNode('div'), few, { labels: ['Гру', 'Січ', 'Лют'], subLabels: ['’25', '’26', ''] });
assert.deepEqual(findAll(withSub, n => hasClass(n, 'axis') && hasClass(n, 'sub')).map(n => n.textContent), ['’25', '’26'], 'другий рядок лише там, де він є');
const g8 = findAll(withSub, n => hasClass(n, 'bar-gross'));
assert.equal(Number(g8[1].attrs.height), 210 - 10 - 34, 'з другим рядком підпису область графіка нижча (34 замість 24)');
assert.ok(findAll(withSub, n => hasClass(n, 'axis') && n.attrs['text-anchor'] === 'middle' && !hasClass(n, 'sub')).every(n => Number(n.attrs.y) === 192), 'основні підписи піднято над роком');
const noSub = drawIncomeChart(doc, makeNode('div'), few, { labels: ['Сер', 'Вер', 'Жов'], subLabels: ['', '', ''] });
assert.equal(Number(findAll(noSub, n => hasClass(n, 'bar-gross'))[1].attrs.height), 210 - 10 - 24, 'порожні підписи не забирають місце');

// 8. Один стовпчик і порожній список не ламають розмітку
noBadNumbers(drawIncomeChart(doc, makeNode('div'), [few[0]], {}));
noBadNumbers(drawIncomeChart(doc, makeNode('div'), [], {}));

console.log('OK: графіки (шкала, висоти стовпчиків, вибір місяця, кільце, легенда, без NaN)');