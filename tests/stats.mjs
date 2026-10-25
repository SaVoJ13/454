/* js/stats.js: збір статистики за рік (чисті функції). Очікувані суми податку рахуються окремою арифметикою. */
import assert from 'node:assert/strict';
import { compute } from '../js/calc.js';
import { inputsFromSaved, pitBaseOf } from '../js/pit.js';
import { collectYearStats, readGuestRecords, yearsIn, defaultYear, monthId } from '../js/stats.js';

const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const mkRec = base => ({ baseSalary: String(base), morningShifts: '16', afternoonShifts: '0', nightShifts: '4', scheduleDays: '20',
  bonusPctSelect: '10', presencePctSelect: '5', overtimeDays: '2', vacationDays: '3', bloodDonationDays: '1', l4MissedShifts: '2' });
// Оклад, при якому накопичена база PIT за 11 місяців ще під 120 000, а з груднем перетинає поріг (запас ≥ 1 000 з обох боків)
let rec = null;
for (let base = 6000; base <= 14000 && !rec; base += 100) {
  const bs = Array.from({ length: 12 }, (_, i) => pitBaseOf(compute(inputsFromSaved(mkRec(base), monthId(2026, i + 1), profile))));
  const ytd11 = bs.slice(0, 11).reduce((a, v) => a + v, 0);
  if (ytd11 < 119000 && ytd11 + bs[11] > 121000) rec = mkRec(base);
}
assert.ok(rec, 'не вдалося підібрати оклад, при якому поріг перетинається в грудні');
const yearOf = (year, from = 1, to = 12, data = rec) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [monthId(year, from + i), { ...data }]));

// 1. readGuestRecords: лише guest_month_YYYY-MM з валідним JSON-об'єктом
const entries = {
  'guest_month_2026-01': JSON.stringify({ baseSalary: '6000' }),
  'guest_month_2026-02': '{зламаний json',
  'guest_month_2026-03': 'null',
  'guest_month_2026-04': '[1,2]',
  'guest_month_abc': JSON.stringify({ x: 1 }),
  'user_profile_guest': JSON.stringify({ baseSalary: 1 }),
  'cloud_month_u1_2026-05': JSON.stringify({ data: {} })
};
const keys = Object.keys(entries);
const storage = { get length() { return keys.length; }, key: i => keys[i] ?? null, getItem: k => entries[k] ?? null };
assert.deepEqual(Object.keys(readGuestRecords(storage)), ['2026-01'], 'зламані, чужі й не-об\'єкти пропускаються');

// 2. yearsIn / defaultYear
assert.deepEqual(yearsIn({ '2024-03': {}, '2026-01': {} }, 2025), [2024, 2025, 2026], 'поточний рік додається завжди');
assert.deepEqual(yearsIn({}, 2026), [2026]);
assert.equal(defaultYear({ '2026-01': {}, '2025-05': {} }, 2026), 2026, 'у поточному році є дані → він');
assert.equal(defaultYear({ '2025-05': {}, '2024-01': {} }, 2026), 2025, 'у поточному немає → останній рік з даними');
assert.equal(defaultYear({}, 2026), 2026, 'даних немає → поточний');

// 3. Порожній рік
let st = collectYearStats({}, 2026, profile);
assert.equal(st.months.length, 12);
assert.deepEqual([st.totals.count, st.totals.gross, st.totals.net, st.totals.avgNet, st.totals.best], [0, 0, 0, 0, null]);
assert.ok(st.months.every(m => !m.has));

// 4. Акаунт (premium): 12 місяців; netto грудня = compute() мінус додатковий PIT понад 120 000 (окрема арифметика)
st = collectYearStats(yearOf(2026), 2026, profile, { premium: true });
const res = Array.from({ length: 12 }, (_, i) => compute(inputsFromSaved(rec, monthId(2026, i + 1), profile)));
const bases = res.map(pitBaseOf);
const ytdDec = bases.slice(0, 11).reduce((s, v) => s + v, 0);
assert.ok(ytdDec < 120000 && ytdDec + bases[11] > 120000, `передумова: поріг перетинається в грудні (${ytdDec} + ${bases[11]})`);
const below = 120000 - ytdDec, above = bases[11] - below;
const extraDec = Math.round(below * 0.12 + above * 0.32 - 300) - Math.round(bases[11] * 0.12 - 300);
assert.ok(extraDec > 100 && Math.abs(extraDec - 0.2 * above) <= 1, `додатковий PIT = 20% надлишку (32% − 12%): ${extraDec} при надлишку ${above}`);
for (let i = 0; i < 11; i++) assert.equal(st.months[i].net, res[i].net, `місяць ${i + 1}: нижче порога netto як у compute()`);
assert.equal(st.months[11].net, res[11].net - extraDec, 'грудень: netto зменшене на додатковий PIT');
assert.equal(st.months[11].extraPit, extraDec);
assert.equal(st.totals.count, 12);
assert.ok(Math.abs(st.totals.gross - res.reduce((s, r) => s + r.gross, 0)) < 1e-6);
assert.ok(Math.abs(st.totals.net - (res.reduce((s, r) => s + r.net, 0) - extraDec)) < 1e-6);
assert.ok(Math.abs(st.totals.avgNet - st.totals.net / 12) < 1e-9);

// 5. Структура змін (premium): множимо дані одного місяця на кількість місяців
assert.deepEqual(st.mix, { regular: 16 * 12, night: 4 * 12, overtime: 2 * 12, vacation: 3 * 12, l4: 2 * 12, excused: 1 * 12 });

// 6. Гість (premium:false): без відпустки/L4/відсутностей і без порога PIT — як у калькуляторі для гостя
const g = collectYearStats(yearOf(2026), 2026, profile, { premium: false });
const resG = Array.from({ length: 12 }, (_, i) => compute(inputsFromSaved(rec, monthId(2026, i + 1), profile, { premium: false })));
assert.equal(g.mix.vacation + g.mix.l4 + g.mix.excused, 0, 'у гостя PRO-поля не враховуються');
assert.equal(g.mix.overtime, 2 * 12);
assert.ok(g.months.every((m, i) => m.extraPit === 0 && m.net === resG[i].net), 'гість: netto = compute(), без порога');

// 7. Найвище нетто — місяць з найбільшою зарплатою; пропущені місяці не рахуються
const mixed = { ...yearOf(2026, 1, 2), '2026-03': { ...rec, baseSalary: '30000' }, '2026-05': { ...rec } };
st = collectYearStats(mixed, 2026, profile);
assert.equal(st.totals.count, 4); assert.equal(st.totals.best.month, 3);
assert.deepEqual(st.months.map(m => m.has), [true, true, true, false, true, false, false, false, false, false, false, false]);
assert.equal(st.months[3].gross + st.months[3].net, 0, 'порожній місяць — нулі');

// 8. До 26 років PIT = 0: додаткового податку немає, накопичення не потрібне
st = collectYearStats(yearOf(2026), 2026, { ...profile, under26: 'yes' }, { premium: true });
assert.ok(st.months.every(m => m.extraPit === 0), 'до 26 років поріг не діє');

// 9. Інший рік не підмішується
st = collectYearStats({ ...yearOf(2025, 1, 3), ...yearOf(2026, 1, 2) }, 2026, profile);
assert.equal(st.totals.count, 2);

console.log('OK: статистика (збір записів, роки, netto з порогом PIT, структура змін, гість, найкращий місяць)');
