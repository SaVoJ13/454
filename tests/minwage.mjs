/* Мінімалка вручну для років без офіційної суми: calc.js, js/minwage.js, «Параметри» й підказка на «Деталях». */
import assert from 'node:assert/strict';
import { compute, getMinWage, minWageInfo, setUserMinWages } from '../js/calc.js';
import { parseMinWage, readUserMinWages, saveUserMinWage, minWageYears } from '../js/minwage.js';
import { inputsFromSaved } from '../js/pit.js';
import { monthList, formatPLN } from '../js/utils.js';
import { installFakeDom, findAll } from './fake-dom.mjs';

const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const record = { morningShifts: '10', nightShifts: '6', scheduleDays: '16' };
const resOf = id => compute(inputsFromSaved(record, id, profile));

// 1. Без введених сум — як раніше
const before = [2023, 2026, 2027, 2028, 2030].map(minWageInfo);
const res28 = resOf('2028-02'), res27 = resOf('2027-02');
assert.deepEqual(minWageInfo(2028), { value: 4950, knownYear: 2027, isKnown: false });
assert.deepEqual(minWageInfo(2023), { value: 4806, knownYear: 2026, isKnown: false });

// 2. Офіційний рік ігнорує введену суму; невідомий бере введену
setUserMinWages({ '2027': 9999, '2028': 5100 });
assert.deepEqual(minWageInfo(2027), { value: 4950, knownYear: 2027, isKnown: true, source: 'official' });
assert.deepEqual(minWageInfo(2028), { value: 5100, knownYear: 2028, isKnown: true, source: 'user' });
assert.equal(getMinWage(2028), 5100);
assert.deepEqual(minWageInfo(2029), { value: 4950, knownYear: 2027, isKnown: false }, 'інший невідомий рік — остання офіційна');
assert.deepStrictEqual(resOf('2027-02'), res27);
const user28 = resOf('2028-02');
assert.equal(user28.nightTariff, Math.round((5100 / (inputsFromSaved(record, '2028-02', profile).stateDays * 8)) * 0.20 * 100) / 100);
assert.ok(user28.gross > res28.gross, 'compute() бере введену суму');

// 3. Після setUserMinWages({}) усе повертається
setUserMinWages({});
assert.deepEqual([2023, 2026, 2027, 2028, 2030].map(minWageInfo), before);
assert.deepStrictEqual(resOf('2028-02'), res28);

// 4. js/minwage.js
for (const [text, value] of [['5100', 5100], ['5100,50', 5100.5], ['5 100.5', 5100.5], ['3000', 3000], ['20000', 20000], ['', null], ['  ', null]])
  assert.deepEqual(parseMinWage(text), { ok: true, value }, `«${text}»`);
for (const text of ['2999,99', '20000,01', 'абв', '-5000', '5e3', '5100zł', '0']) assert.deepEqual(parseMinWage(text), { ok: false, value: null }, `«${text}»`);
const mem = new Map(), storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.deepEqual(readUserMinWages(storage), {});
assert.deepEqual(saveUserMinWage(storage, 2028, 5100), { '2028': 5100 });
assert.deepEqual(saveUserMinWage(storage, 2028, null), {});
for (const bad of ['не json', 'null', '{"2028":"5100","2029":10,"abc":5000}']) { mem.set('user_min_wages', bad); assert.deepEqual(readUserMinWages(storage), {}, bad); }
const yearsAt = (now, saved) => minWageYears(monthList(now).map(m => m.id), saved);
assert.deepEqual(yearsAt(new Date(2026, 10, 26)), { years: [2025, 2026, 2027], missing: [], fields: [] });
assert.deepEqual(yearsAt(new Date(2027, 8, 30)), { years: [2026, 2027], missing: [], fields: [] });
assert.deepEqual(yearsAt(new Date(2027, 9, 1)), { years: [2026, 2027, 2028], missing: [2028], fields: [2028] }, 'поле на 2028 з’являється з жовтня 2027');
assert.deepEqual(yearsAt(new Date(2023, 5, 1)), { years: [2022, 2023], missing: [2022, 2023], fields: [2022, 2023] }, 'минулі роки календаря без офіційної суми');
assert.deepEqual(yearsAt(new Date(2030, 5, 1), { '2028': 5100, '2030': 6000 }), { years: [2029, 2030], missing: [2029, 2030], fields: [2028, 2029, 2030] });

// ---------- 5. app.js на фейковому DOM ----------
const { getEl, fire, store } = installFakeDom();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
store.set('user_min_wages', '{"2028":5200}');                 // збережене раніше — має діяти від старту
globalThis.__salaryTest = { cloudLoader: async () => { throw new Error('offline'); }, now: new Date(2026, 10, 26, 12).getTime() };
console.warn = () => {};
await import('../js/app.js');
await sleep(60);
assert.equal(getMinWage(2028), 5200, 'під час старту суми зі сховища передано в calc.js');
const fields = () => findAll({ children: getEl('minWageFields').children }, n => n.tag === 'input');
assert.deepEqual(fields().map(f => [f.id, f.value]), [['minWage2028', '5200,00']], 'збережений рік поза календарем має поле');
assert.equal(getEl('minWageAllKnown').innerText, dict.uk.minWageAllKnown.replace('{years}', '2025, 2026, 2027'));
assert.equal(getEl('minWageAllKnown').classList.contains('hidden'), false);

// «сьогодні» листопад 2027: у календарі є 2028
globalThis.__salaryTest.now = new Date(2027, 10, 15, 12).getTime();
window.setLang('uk');
assert.deepEqual(fields().map(f => [f.id, f.value]), [['minWage2028', '5200,00']]);
assert.equal(getEl('minWageAllKnown').classList.contains('hidden'), true);
const labels = () => findAll({ children: getEl('minWageFields').children }, n => n.tag === 'label').map(l => l.textContent);
assert.deepEqual(labels(), ['Мінімалка на 2028, zł']);
window.setLang('pl'); assert.deepEqual(labels(), ['Płaca minimalna na 2028, zł']); window.setLang('uk');

const body = getEl('app-body');
getEl('monthSelect').value = '2028-02';
getEl('morningShifts').value = '10'; await fire(body, 'input', getEl('morningShifts'));
const note = () => (getEl('minWageNote').classList.contains('hidden') ? '' : getEl('minWageNote').innerText);
const userNote = v => dict.uk.minWageUser.replace('{year}', 2028).replace('{sum}', formatPLN(v));
assert.equal(note(), userNote(5200));
const errorEl = () => findAll({ children: getEl('minWageFields').children }, n => n.tag === 'p')[0];
const change = async value => { const f = fields()[0]; f.value = value; await f.handlers.change[0](); };
await change('5100,50');
assert.equal(store.get('user_min_wages'), '{"2028":5100.5}'); assert.equal(fields()[0].value, '5100,50');
assert.equal(note(), userNote(5100.5)); assert.equal(errorEl().className, 'field-error hidden');
await change('100');
assert.equal(errorEl().className, 'field-error'); assert.equal(errorEl().textContent, dict.uk.errMinWage);
assert.equal(store.get('user_min_wages'), '{"2028":5100.5}', 'неправильне не зберігається'); assert.equal(note(), userNote(5100.5));
await change('');
assert.equal(store.get('user_min_wages'), '{}'); assert.equal(errorEl().className, 'field-error hidden');
assert.equal(note(), dict.uk.minWageUnknown.replace('{year}', 2028).replace('{sum}', formatPLN(4950)).replace('{knownYear}', 2027));
// поле мінімалки — не поле місяця: у запис місяця не потрапляє
const minInput = getEl('minWage2028'); minInput.value = '5000';
await fire(body, 'input', getEl('morningShifts'));
assert.ok(!('minWage2028' in JSON.parse(store.get('guest_month_2028-02'))), 'поле мінімалки не зберігається в місяці');
// офіційний рік — без підказки
getEl('monthSelect').value = '2027-02'; await fire(body, 'input', getEl('morningShifts'));
assert.equal(note(), '');

console.log('OK: мінімалка вручну (перевага офіційної, зберігання, «Параметри», підказка на «Деталях»)');
process.exit(0);
