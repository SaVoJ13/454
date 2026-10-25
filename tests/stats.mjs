/* js/stats.js: збір статистики за рік (чисті функції). Очікувані суми податку рахуються окремою арифметикою. */
import assert from 'node:assert/strict';
import { compute } from '../js/calc.js';
import { inputsFromSaved, pitBaseOf } from '../js/pit.js';
import {
  collectYearStats, collectPeriodStats, readGuestRecords, yearsIn, monthId,
  recordsUpTo, availableYears, normalizePeriod, periodMonthIds
} from '../js/stats.js';

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

// 2. yearsIn
assert.deepEqual(yearsIn({ '2024-03': {}, '2026-01': {} }, 2025), [2024, 2025, 2026], 'поточний рік додається завжди');
assert.deepEqual(yearsIn({}, 2026), [2026]);

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

// ======== Періоди: останні 3/6/12 місяців і вибрані роки. «Сьогодні» — фіксоване: 15 жовтня 2026 ========
const NOW = new Date(2026, 9, 15), NOW_JAN = new Date(2027, 0, 5);
const P = (mode, years = []) => ({ mode, years });

// 10. Місяці періоду: рахуючи поточний, через межу року, без майбутніх
assert.deepEqual(periodMonthIds(P('3'), NOW), ['2026-08', '2026-09', '2026-10']);
assert.deepEqual(periodMonthIds(P('3'), NOW_JAN), ['2026-11', '2026-12', '2027-01'], 'вікно переходить через межу року');
assert.equal(periodMonthIds(P('12'), NOW)[0], '2025-11'); assert.equal(periodMonthIds(P('12'), NOW).length, 12);
assert.equal(periodMonthIds(P('6'), NOW).at(-1), '2026-10', 'вікно закінчується поточним місяцем');
const yIds = periodMonthIds(P('years', [2026, 2025, 2027]), NOW);
assert.equal(yIds.length, 12 + 10, '2025 повністю + 2026 до жовтня; 2027 (майбутній) ігнорується');
assert.equal(yIds[0], '2025-01'); assert.equal(yIds.at(-1), '2026-10');
assert.deepEqual(periodMonthIds(P('years', [2027]), NOW), [], 'майбутній рік не дає місяців');
assert.equal(periodMonthIds(P('years', [2026, 2026]), NOW).length, 10, 'дублікати років не множать місяці');

// 11. Майбутні записи відкидаються; зайві ключі теж
const all = { '2025-12': {}, '2026-10': {}, '2026-11': { baseSalary: '99999' }, '2027-01': {}, 'abc': {}, '2026-1': {} };
assert.deepEqual(Object.keys(recordsUpTo(all, NOW)).sort(), ['2025-12', '2026-10'], 'поточний місяць лишається, майбутні й сміття — ні');
assert.deepEqual(availableYears(all, NOW), [2025, 2026], 'майбутній 2027 не пропонується');
assert.deepEqual(availableYears({}, NOW), [2026], 'поточний рік є завжди');

// 12. normalizePeriod
assert.deepEqual(normalizePeriod(null, [2025, 2026], NOW), { mode: '12', years: [] }, 'нічого не збережено → 12 місяців');
assert.deepEqual(normalizePeriod({ mode: 'foo', years: [2025] }, [2025, 2026], NOW), { mode: '12', years: [2025] }, 'невідомий режим → 12');
assert.deepEqual(normalizePeriod({ mode: 'years', years: [] }, [2025, 2026], NOW), { mode: 'years', years: [2026] }, 'роки без вибору → поточний');
assert.deepEqual(normalizePeriod({ mode: 'years', years: [2031, 2025, 2025] }, [2025, 2026], NOW), { mode: 'years', years: [2025] }, 'недоступні роки й дублікати відкидаються');
assert.deepEqual(normalizePeriod({ mode: 'years', years: [2031] }, [2024, 2025], new Date(2025, 5, 1)), { mode: 'years', years: [2025] });
assert.equal(normalizePeriod({ mode: 6, years: [] }, [2026], NOW).mode, '6', 'режим може прийти числом');

// 13. Підсумки за 3 місяці: майбутній місяць НЕ входить, навіть коли в ньому величезна зарплата
const base = { baseSalary: '6000', morningShifts: '10', nightShifts: '4', scheduleDays: '20', bonusPctSelect: '10', presencePctSelect: '5' };
const recs = {
  '2025-12': { ...base, baseSalary: '5000' }, '2026-08': { ...base }, '2026-09': { ...base, baseSalary: '7000' },
  '2026-10': { ...base, baseSalary: '6500' }, '2026-11': { ...base, baseSalary: '90000' }, '2027-01': { ...base, baseSalary: '90000' }
};
const run = (ids, premium = false) => ids.map(id => compute(inputsFromSaved(recs[id], id, profile, { premium })));
let ps = collectPeriodStats(recs, P('3'), profile, { premium: false, now: NOW });
const r3 = run(['2026-08', '2026-09', '2026-10']);
assert.equal(ps.kind, 'month'); assert.deepEqual(ps.ids, ['2026-08', '2026-09', '2026-10']);
assert.deepEqual([ps.totals.count, ps.totals.expected], [3, 3]); assert.deepEqual(ps.missing, []);
assert.ok(Math.abs(ps.totals.gross - r3.reduce((a, r) => a + r.gross, 0)) < 1e-6, 'брутто лише за 3 місяці, без листопада');
assert.ok(Math.abs(ps.totals.net - r3.reduce((a, r) => a + r.net, 0)) < 1e-6);
assert.equal(ps.totals.best.id, '2026-09', 'найвище нетто — вересень (оклад 7000)');
assert.equal(ps.buckets.length, 3); assert.deepEqual(ps.buckets.map(b => b.key), ['2026-08', '2026-09', '2026-10']);
assert.deepEqual(ps.mix, { regular: 30, night: 12, overtime: 0, vacation: 0, l4: 0, excused: 0 }, 'структура лише за місяці періоду');
assert.deepEqual([ps.from, ps.to], ['2026-08', '2026-10']);

// 14. 12 місяців: відсутні місяці перелічені (без майбутніх), поточний місяць без даних теж «відсутній»
ps = collectPeriodStats(recs, P('12'), profile, { premium: false, now: NOW });
assert.deepEqual([ps.totals.count, ps.totals.expected], [4, 12]);
assert.deepEqual(ps.missing, ['2025-11', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'], 'бракує 8 місяців, листопад 2026 (майбутній) не в списку');
assert.ok(!ps.missing.includes('2026-11') && !ps.missing.includes('2026-12'), 'майбутні місяці ніколи не вважаються відсутніми');
const noCurrent = { ...recs }; delete noCurrent['2026-10'];
ps = collectPeriodStats(noCurrent, P('3'), profile, { premium: false, now: NOW });
assert.deepEqual(ps.missing, ['2026-10'], 'поточний місяць без даних — у списку відсутніх');
assert.equal(ps.totals.count, 2);

// 15. Порожній період (лише майбутні дані) — нулі, але список відсутніх є
ps = collectPeriodStats({ '2026-11': { ...base } }, P('3'), profile, { premium: false, now: NOW });
assert.deepEqual([ps.totals.count, ps.totals.net, ps.totals.best], [0, 0, null]);
assert.deepEqual(ps.missing, ['2026-08', '2026-09', '2026-10']);

// 16. Вибрані роки: один рік — стовпчики по місяцях (до поточного), кілька — стовпчик на рік із середнім за місяць
ps = collectPeriodStats(recs, P('years', [2026]), profile, { premium: false, now: NOW });
assert.equal(ps.kind, 'month'); assert.equal(ps.buckets.length, 10, '2026: січень–жовтень, без листопада й грудня');
assert.deepEqual([ps.totals.count, ps.totals.expected], [3, 10]); assert.equal(ps.missing.length, 7);
ps = collectPeriodStats(recs, P('years', [2025, 2026]), profile, { premium: false, now: NOW });
assert.equal(ps.kind, 'year'); assert.deepEqual(ps.buckets.map(b => b.key), [2025, 2026]);
assert.deepEqual([ps.totals.count, ps.totals.expected], [4, 22]);
const r25 = run(['2025-12']), r26 = run(['2026-08', '2026-09', '2026-10']);
assert.equal(ps.buckets[0].months, 1); assert.equal(ps.buckets[1].months, 3);
assert.ok(Math.abs(ps.buckets[0].net - r25[0].net) < 1e-6, '2025: середнє нетто = нетто єдиного місяця');
assert.ok(Math.abs(ps.buckets[1].net - r26.reduce((a, r) => a + r.net, 0) / 3) < 1e-6, '2026: середнє нетто за 3 місяці з даними');
assert.ok(Math.abs(ps.buckets[1].totalNet - r26.reduce((a, r) => a + r.net, 0)) < 1e-6);
assert.deepEqual([ps.buckets[0].expected, ps.buckets[1].expected], [12, 10]);
assert.equal(ps.missing.length, 22 - 4);

// 17. Поріг PIT: вікно «3 міс.» враховує накопичене з початку року ПОЗА вікном — нетто жовтня таке саме, як у річній статистиці
let crossing = null;
for (let b = 6000; b <= 14000 && !crossing; b += 100) {
  const d = mkRec(b), bs = Array.from({ length: 10 }, (_, i) => pitBaseOf(compute(inputsFromSaved(d, monthId(2026, i + 1), profile))));
  const ytd9 = bs.slice(0, 9).reduce((a, v) => a + v, 0);
  if (ytd9 < 119000 && ytd9 + bs[9] > 121000) crossing = d;
}
assert.ok(crossing, 'не вдалося підібрати оклад, при якому поріг перетинається в жовтні');
const yearRecs = yearOf(2026, 1, 10, crossing);
const fullYear = collectYearStats(yearRecs, 2026, profile, { premium: true });
const win = collectPeriodStats(yearRecs, P('3'), profile, { premium: true, now: NOW });
assert.ok(fullYear.months[9].extraPit > 100, 'передумова: у жовтні є додатковий PIT');
assert.equal(win.buckets[2].net, fullYear.months[9].net, 'жовтень у вікні = жовтень у річній статистиці (поріг враховано)');
assert.equal(win.buckets[2].extraPit, fullYear.months[9].extraPit);
assert.equal(win.buckets[0].extraPit, 0, 'серпень — нижче порога');
const guestWin = collectPeriodStats(yearRecs, P('3'), profile, { premium: false, now: NOW });
assert.ok(guestWin.buckets.every(b => b.extraPit === 0), 'гість: без порога');

// 18. Інший «сьогодні» зсуває вікно, а не дані: у січні 2027 майбутній 2027-01 стає поточним місяцем
ps = collectPeriodStats({ ...recs, '2027-01': { ...base } }, P('3'), profile, { premium: false, now: NOW_JAN });
assert.deepEqual(ps.ids, ['2026-11', '2026-12', '2027-01']); assert.equal(ps.totals.count, 2, 'листопад 2026 і січень 2027 мають дані, грудня немає');
assert.deepEqual(ps.missing, ['2026-12']);

console.log('OK: статистика (записи, періоди 3/6/12/роки без майбутніх місяців, відсутні місяці, netto з порогом PIT, структура змін, гість)');
