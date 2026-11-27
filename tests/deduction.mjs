/* Додаткове відрахування з нетто (js/deduction.js, вхід extraDeductionAmount) і мінімалка для років без запису. */
import assert from 'node:assert/strict';
import { CONFIG, compute, getMinWage, minWageInfo } from '../js/calc.js';
import { deductionOf, parseDeduction, checkDeduction } from '../js/deduction.js';
import { inputsFromSaved, pitBaseOf } from '../js/pit.js';
import { formatAmount } from '../js/utils.js';

const base = {
  baseSalary: 5750, stateDays: 20, schedDays: 20, regWorkedDays: 18, morningShifts: 9, nightShifts: 9,
  overtimeMorningShifts: 1, overtimeNightShifts: 1, weekendDays: 2, overtimeDays: 2, vacDays: 2, dailyUrlopBonus: 111.11,
  extraBonus: 123.45, bloodDonationDays: 1, l4Days: 3, isPremium: true, isUnder26: false, ppkActive: true,
  insuranceActive: true, l4DailyRateCached: null, presenceBonusPct: 5, qualityBonusPct: 10, year: 2026
};
const same = (a, b, where) => {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${where}: різні ключі`);
  for (const k of Object.keys(a)) assert.ok(Object.is(a[k], b[k]), `${where}: "${k}" ${a[k]} ≠ ${b[k]}`);
};

// 1. Без суми — стара формула побітово: net = (net без страхування) з відніманням 36,70 на тому самому місці
for (const insuranceActive of [true, false]) {
  const r = compute({ ...base, insuranceActive });
  same(compute({ ...base, insuranceActive, extraDeductionAmount: undefined }), r, `undefined, ${insuranceActive}`);
  const zus = (r.gross - r.l4Pay) * CONFIG.ZUS, health = r.gross - zus, nfz = Math.round(health * CONFIG.NFZ * 100) / 100;
  const pit = Math.max(0, Math.round(Math.round(Math.max(0, health - CONFIG.KWOTA_WOLNA)) * CONFIG.PIT - CONFIG.KWOTA_WOLNA));
  const old = r.gross - zus - nfz - pit - r.gross * 0.02 - (insuranceActive ? CONFIG.EXTRA_INSURANCE_RATE : 0)
    - (CONFIG.BENEFIT_ZUS_NFZ + CONFIG.BENEFIT_TAX) + r.laundryAllowance;
  assert.ok(Object.is(r.net, old), `стара формула, ${insuranceActive}: ${r.net} ≠ ${old}`);
}

// 2. Сума замінює прапорець
for (const insuranceActive of [true, false]) {
  same(compute({ ...base, insuranceActive, extraDeductionAmount: 36.7 }), compute({ ...base, insuranceActive: true }), '36.7');
  same(compute({ ...base, insuranceActive, extraDeductionAmount: 0 }), compute({ ...base, insuranceActive: false }), '0');
}
same(compute({ ...base, extraDeductionAmount: -10 }), compute({ ...base, extraDeductionAmount: 0 }), 'від\'ємна = 0');

// 3. 50 замість 0: змінюється лише net, рівно на 50 (zus/nfz/pit compute не повертає — вони залежать від gross і бази PIT)
const zero = compute({ ...base, extraDeductionAmount: 0 }), fifty = compute({ ...base, extraDeductionAmount: 50 });
assert.ok(Math.abs((zero.net - fifty.net) - 50) < 1e-9, `net: ${zero.net} → ${fifty.net}`);
for (const k of Object.keys(zero)) if (k !== 'net') assert.ok(Object.is(zero[k], fifty[k]), `"${k}" не мав змінитися`);
assert.equal(pitBaseOf(fifty), pitBaseOf(zero));
assert.ok(!('extraDeductionAmount' in fifty), 'без нових полів результату');

// 4. js/deduction.js
for (const [profile, expected] of [[{ insurance: 'yes' }, 36.7], [{ insurance: 'no' }, 0], [{}, 36.7],
  [{ extraDeduction: 12.5 }, 12.5], [{ extraDeduction: 0, insurance: 'yes' }, 0], [{ extraDeduction: 50, insurance: 'no' }, 50]])
  assert.equal(deductionOf(profile), expected, JSON.stringify(profile));
for (const [text, expected] of [['36,70', 36.7], ['36.70', 36.7], ['-5', 0], ['абв', 0], ['', 0], ['  ', 0], ['12abc', 0], ['10,005', 10.01], ['1 200', 1200]])
  assert.equal(parseDeduction(text), expected, `«${text}»`);

// 5. inputsFromSaved (поріг PIT і статистика) бере суму з профілю
const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
assert.equal(inputsFromSaved({}, '2026-11', profile).extraDeductionAmount, 36.7);
assert.equal(inputsFromSaved({}, '2026-11', { ...profile, extraDeduction: 50 }).extraDeductionAmount, 50);

// 5b. Перевірка суми перед збереженням профілю
for (const [text, value] of [['36,70', 36.7], ['36.70', 36.7], ['2000', 2000], ['0', 0], ['', 0], ['  ', 0], [' 1 200 ', 1200], ['10,005', 10.01]])
  assert.deepEqual(checkDeduction(text), { ok: true, value, error: null }, `перевірка «${text}»`);
for (const [text, error] of [['абв', 'invalid'], ['12abc', 'invalid'], ['-5', 'invalid'], ['1e3', 'invalid'], ['1,2,3', 'invalid'], [',', 'invalid'],
  ['2000,01', 'tooBig'], ['5000', 'tooBig']])
  assert.deepEqual(checkDeduction(text), { ok: false, value: null, error }, `перевірка «${text}»`);

// 5c. Формат суми в полі: кома й два знаки
for (const [value, shown] of [[35.2, '35,20'], [36.7, '36,70'], [50, '50,00'], [0, '0,00'], [2000, '2000,00'], [5100.5, '5100,50']])
  assert.equal(formatAmount(value), shown, `формат ${value}`);

// 6. Мінімалка
assert.equal(getMinWage(2023), 4806);
assert.equal(getMinWage(2026), 4806);
assert.equal(getMinWage(2027), 4950);
assert.equal(getMinWage(2028), 4950);
assert.equal(getMinWage(2040), 4950);
assert.deepEqual(minWageInfo(2027), { value: 4950, knownYear: 2027, isKnown: true, source: 'official' });
assert.deepEqual(minWageInfo(2028), { value: 4950, knownYear: 2027, isKnown: false });
assert.equal(minWageInfo(2023).isKnown, false);

console.log(`  відрахування 0 → 50: net ${zero.net.toFixed(2)} → ${fifty.net.toFixed(2)}, gross без змін ${fifty.gross.toFixed(2)}`);
console.log(`  профілі: yes → ${deductionOf({ insurance: 'yes' })}, no → ${deductionOf({ insurance: 'no' })}, порожній → ${deductionOf({})}, 12.5 → ${deductionOf({ extraDeduction: 12.5 })}`);
console.log(`  введення: «36,70» → ${parseDeduction('36,70')}, «-5» → ${parseDeduction('-5')}, «абв» → ${parseDeduction('абв')}, «» → ${parseDeduction('')}`);
console.log(`  мінімалка: 2023 → ${getMinWage(2023)}, 2026 → ${getMinWage(2026)}, 2027 → ${getMinWage(2027)}, 2028 → ${getMinWage(2028)} (isKnown ${minWageInfo(2028).isKnown}, за ${minWageInfo(2028).knownYear})`);
console.log('OK: додаткове відрахування і мінімалка для років без запису');
