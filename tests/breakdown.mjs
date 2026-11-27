/* Список відрахувань (js/breakdown.js) проти compute(): ловить розбіжність дзеркальних формул.
   Далі — показ списку на «Деталях» і перевірка суми відрахування під час збереження профілю. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG, compute, getNormHours } from '../js/calc.js';
import { deductionsBreakdown } from '../js/breakdown.js';
import { inputsFromSaved } from '../js/pit.js';
import { formatPLN } from '../js/utils.js';
import { installFakeDom } from './fake-dom.mjs';

let seed = 20261126;
const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = a => a[int(0, a.length - 1)];
const norms = [];
for (let year = 2024; year <= 2030; year++) for (let m = 0; m < 12; m++) norms.push({ year, stateDays: getNormHours(year, m) / 8 });
const gr = v => Math.round(v * 100);

// Гроші, як їх показує formatPLN (той самий форматер, створений один раз). Math.round(v * 100) на межі пів гроша
// може дати інше число, ніж бачить користувач.
const pln = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const seen = v => Number(pln.format(v).replace(/[^0-9-]/g, ''));
assert.equal(pln.format(10680.994999999999), formatPLN(10680.994999999999));

// 1. 200 000 випадкових наборів
const N = 200_000;
let maxDiff = 0, noted = 0, maxCheck = 0, checkOff = 0;
for (let i = 0; i < N; i++) {
  const { year, stateDays } = pick(norms);
  const m = int(0, 22), n = int(0, 22);
  const inputs = { baseSalary: rnd() < 0.5 ? int(3000, 15000) : int(300000, 4000000) / 100, stateDays, year, schedDays: pick([0, int(10, 26)]),
    regWorkedDays: m + n, morningShifts: m, nightShifts: n, overtimeMorningShifts: int(0, 6), overtimeNightShifts: int(0, 6), weekendDays: int(0, 8),
    overtimeDays: int(0, 24) / 2, vacDays: int(0, 10), dailyUrlopBonus: pick([0, int(0, 30000) / 100]), extraBonus: pick([0, int(0, 200000) / 100]),
    bloodDonationDays: int(0, 3), l4Days: pick([0, 0, int(1, 31)]), isPremium: rnd() < 0.7, isUnder26: rnd() < 0.3, ppkActive: rnd() < 0.5,
    insuranceActive: rnd() < 0.5, extraDeductionAmount: pick([undefined, 0, int(1, 200000) / 100]),
    l4DailyRateCached: pick([null, int(0, 25000) / 100]), presenceBonusPct: pick([0, 2.5, 5]), qualityBonusPct: pick([0, 5, 10]) };
  const res = compute(inputs), extraPit = pick([0, 0, int(1, 4000)]);
  const b = deductionsBreakdown(res, inputs, extraPit), x = b.raw;
  const net = res.gross - x.zus - x.nfz - x.pit - x.ppk - x.deduction - x.benefit + x.laundry;
  assert.ok(Object.is(net, res.net), `набір ${i}: ${net} ≠ ${res.net}`);
  assert.equal(gr(b.rows.zusEmerytalne) + gr(b.rows.zusRentowe) + gr(b.rows.zusChorobowe), gr(b.zusTotal), `набір ${i}: ZUS частинами`);
  const rows = Object.values(b.rows).reduce((s, v) => s + gr(v), 0);
  const diff = Math.abs(rows - gr(b.total));
  assert.equal(b.roundingDiffers, diff !== 0);
  if (diff) noted++;
  maxDiff = Math.max(maxDiff, diff);
  // перевірка під списком — з показаних (округлених) чисел
  const check = Math.abs(seen(res.gross) - seen(b.total) + seen(b.laundry) - seen(res.net - extraPit));
  if (check) checkOff++;
  assert.equal(b.checkDiffers, check !== 0, `набір ${i}: ознака розбіжності перевірки`);
  maxCheck = Math.max(maxCheck, check);
}
console.log(`  ${N} наборів: net з неокруглених складових побітово дорівнює res.net — ${N} з ${N}; ZUS частинами = ZUS разом — ${N} з ${N}`);
console.log(`  сума округлених рядків і «Разом»: найбільша різниця ${(maxDiff / 100).toFixed(2)} zł, відрізняється в ${noted} наборах`);
console.log(`  «Брутто − Разом + прання» і показане нетто: найбільша різниця ${(maxCheck / 100).toFixed(2)} zł, відрізняється в ${checkOff} наборах`);
assert.ok(maxDiff <= 2, `різниця округлення ${maxDiff} gr`);

// 2. Приклад: оклад 5750, 10 ранкових, 6 нічних, без L4 (листопад 2026, стандартний профіль, премія 15 %)
const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const record = { baseSalary: '5750', morningShifts: '10', nightShifts: '6', scheduleDays: '16', bonusTotalPct: 15 };
const exInputs = inputsFromSaved(record, '2026-11', profile), ex = compute(exInputs), eb = deductionsBreakdown(ex, exInputs, 0);
console.log('  приклад 5750 / 10 ранкових / 6 нічних, 11.2026:', JSON.stringify({ ...eb.rows, laundry: eb.laundry, zusTotal: eb.zusTotal, total: eb.total }));
console.log(`  брутто ${formatPLN(ex.gross)}, нетто ${formatPLN(ex.net)}, примітка про округлення: ${eb.roundingDiffers}`);
assert.equal(eb.rows.benefitZus, CONFIG.BENEFIT_ZUS_NFZ); assert.equal(eb.rows.deduction, 36.7);

// ---------- 3. app.js на фейковому DOM ----------
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('<details class="card missing breakdown"'), html.indexOf('</details></section>'));
assert.ok(block && !/<details[^>]*\sopen/.test(block), 'список відрахувань за замовчуванням згорнутий');
assert.ok(html.indexOf('id="deductions"') > html.indexOf('id="btn-sync-up-info"') && html.indexOf('id="deductions"') < html.indexOf('id="viewProfile"'), 'список — у самому низу «Деталей»');

const { getEl, fire, store } = installFakeDom();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
globalThis.__salaryTest = { cloudLoader: async () => { throw new Error('offline'); } };
console.warn = () => {};
await import('../js/app.js');
await sleep(60);
const body = getEl('app-body'), month = getEl('monthSelect').value;
const type = async (id, value) => { getEl(id).value = value; await fire(body, 'input', getEl(id)); };
const hidden = id => getEl(id).classList.contains('hidden');
const text = id => getEl(id).innerText;
await type('morningShifts', '10'); await type('nightShifts', '6');
const check = (prof, msg) => {
  const data = JSON.parse(store.get(`guest_month_${month}`));
  const inputs = inputsFromSaved(data, month, prof, { premium: false }), res = compute(inputs), b = deductionsBreakdown(res, inputs, 0);
  assert.equal(text('deductionsTitle'), dict.uk.dedTitle.replace('{sum}', formatPLN(b.total)), `${msg}: заголовок`);
  assert.equal(text('dedZusEmerytalneVal'), formatPLN(b.rows.zusEmerytalne)); assert.equal(text('dedNfzVal'), formatPLN(b.rows.nfz));
  assert.equal(text('dedTotalVal'), formatPLN(b.total));
  assert.equal(text('dedCheckVal'), `${formatPLN(res.gross)} − ${formatPLN(b.total)} + ${formatPLN(b.laundry)} = ${text('netResult')}`, `${msg}: перевірка`);
  assert.equal(hidden('dedRoundNote'), !(b.roundingDiffers || b.checkDiffers));
  return b;
};
check(profile, 'стандартний профіль');
for (const id of ['dedZusEmerytalne', 'dedZusRentowe', 'dedZusChorobowe', 'dedNfz', 'dedPit', 'dedBenefitZus', 'dedBenefitTax', 'dedExtra', 'dedLaundry']) assert.equal(hidden(id), false, `${id} показано`);
assert.equal(hidden('dedPpk'), true); assert.equal(hidden('dedPitExtra'), true);
assert.equal(text('dedPitLabel'), dict.uk.dedPit);
assert.ok(text('dedLaundryVal').startsWith('+'));

// профіль: неправильна сума не зберігається, під полем помилка
const field = getEl('profExtraDeduction'), save = () => fire(getEl('btn-save-profile'), 'click');
getEl('profBaseSalary').value = '5750'; getEl('profUnder26').value = 'no'; getEl('profPpk').value = 'no';
for (const [value, key] of [['абв', 'errDeduction'], ['2000,01', 'errDeductionMax']]) {
  field.value = value; getEl('toast').innerText = '';
  await save();
  assert.equal(hidden('profExtraDeductionError'), false, value); assert.equal(text('profExtraDeductionError'), dict.uk[key]);
  assert.ok(!store.has('user_profile_guest'), `«${value}» не зберігається`); assert.equal(text('toast'), '');
  assert.equal(field.value, value, 'введене лишається в полі');
}
window.setLang('pl'); assert.equal(text('profExtraDeductionError'), dict.pl.errDeductionMax); window.setLang('uk');
await fire(field, 'input'); assert.equal(hidden('profExtraDeductionError'), false, 'доки сума неправильна, повідомлення лишається');
field.value = '2000'; await fire(field, 'input'); assert.equal(hidden('profExtraDeductionError'), true, 'сума стала правильною — повідомлення зникає');
// порожнє = 0; до 26 років і PPK
field.value = ''; getEl('profUnder26').value = 'yes'; getEl('profPpk').value = 'yes';
await save();
assert.equal(JSON.parse(store.get('user_profile_guest')).extraDeduction, 0);
check({ ...profile, under26: 'yes', ppk: 'yes', extraDeduction: 0 }, 'до 26 років, PPK, без відрахування');
assert.equal(text('dedPitLabel'), dict.uk.dedPitExempt); assert.equal(text('dedPitVal'), ''); assert.equal(hidden('dedPit'), false);
assert.equal(hidden('dedExtra'), true); assert.equal(hidden('dedPpk'), false);

console.log('OK: список відрахувань (дзеркало compute, ZUS частинами, округлення, «Деталі», перевірка суми в профілі)');
process.exit(0);
