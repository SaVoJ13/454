/* Нічна зміна на межі місяців (nightCarryOut / nightCarryIn) і мінімальна зарплата 2027.
   Еталонні суми — з прикладу власника (2026-11-26), а не згенеровані з коду:
   нічні 29.11, 30.11, 1.12, 2.12, 3.12 → листопад 10 год і 2 доплати, грудень 30 год і 3 доплати. */
import assert from 'node:assert/strict';
import { compute, getNormHours, getMinWage, nightHoursAdjustOf, buildVacationEntry } from '../js/calc.js';
import { inputsFromSaved } from '../js/pit.js';

const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const resOf = (data, id) => compute(inputsFromSaved(data, id, profile));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

// 1. Функція перехідних годин
assert.equal(nightHoursAdjustOf({}), 0);
assert.equal(nightHoursAdjustOf({ nightCarryOut: true }), -6);
assert.equal(nightHoursAdjustOf({ nightCarryIn: true }), 6);
assert.equal(nightHoursAdjustOf({ nightCarryIn: true, nightCarryOut: true }), 0);
assert.equal(nightHoursAdjustOf({ nightCarryIn: false, nightCarryOut: false }), 0);

// 2. Приклад власника
const nov = { nightShifts: '2' }, dec = { nightShifts: '3' };
const novRes = resOf({ ...nov, nightCarryOut: true }, '2026-11'), decRes = resOf({ ...dec, nightCarryIn: true }, '2026-12');
close(novRes.totalNightTimePay, 60.10, 'листопад: нічний час');
assert.equal(novRes.totalNightShiftPay, 60, 'листопад: доплата 2 × 30');
close(decRes.totalNightTimePay, 180.30, 'грудень: нічний час');
assert.equal(decRes.totalNightShiftPay, 90, 'грудень: доплата 3 × 30');

// 3. Обидва прапорці = без прапорців; перехід при 0 нічних змін не дає від'ємних годин
const full = { morningShifts: '8', nightShifts: '5', overtimeDays: '1', overtimeNightShifts: '1' };
assert.deepStrictEqual(resOf({ ...full, nightCarryIn: true, nightCarryOut: true }, '2026-11'), resOf(full, '2026-11'));
const none = resOf({ nightCarryOut: true }, '2026-11');
assert.equal(none.totalNightTimePay, 0, 'без нічних змін години не від\'ємні');
assert.equal(none.totalNightShiftPay, 0);
const mornings = { morningShifts: '12' };
assert.equal(resOf({ ...mornings, nightCarryOut: true }, '2026-11').totalNightTimePay, resOf(mornings, '2026-11').totalNightTimePay, 'ранкові 10 хв перехід не зменшує');
assert.ok(!('nightHoursAdjust' in novRes) && !('nightShiftHours' in novRes), 'compute не має нових полів результату');

// 4. Відпускні (середнє за 3 місяці)
const vac = { morningShifts: '8', nightShifts: '5', overtimeNightShifts: '1' };
const plain = buildVacationEntry('2026-11', vac, 5750);
const out = buildVacationEntry('2026-11', { ...vac, nightCarryOut: true }, 5750);
const inn = buildVacationEntry('2026-11', { ...vac, nightCarryIn: true }, 5750);
close(out.nightHours, plain.nightHours - 6, 'відпускні: carry out');
close(inn.nightHours, plain.nightHours + 6, 'відпускні: carry in');
assert.equal(out.nightBonus, plain.nightBonus); assert.equal(inn.nightBonus, plain.nightBonus);
assert.deepEqual(Object.keys(out).sort(), Object.keys(plain).sort(), 'без нових полів');
assert.equal(buildVacationEntry('2026-11', { nightCarryOut: true }, 5750).nightHours, 0);

// 5. inputsFromSaved: прапорці читаються, старі дані дають 0
assert.equal(inputsFromSaved({ nightShifts: '2', nightCarryOut: true }, '2026-11', profile).nightHoursAdjust, -6);
assert.equal(inputsFromSaved({ nightShifts: '3', nightCarryIn: true }, '2026-12', profile).nightHoursAdjust, 6);
assert.equal(inputsFromSaved({ nightShifts: '3' }, '2026-12', profile).nightHoursAdjust, 0);
assert.equal(inputsFromSaved({ nightShifts: '3', nightCarryIn: false, nightCarryOut: false }, '2026-12', profile).nightHoursAdjust, 0);

// 6. Мінімальна зарплата
assert.equal(getMinWage(2027), 4950);
assert.equal(getMinWage(2026), 4806);
const jan27 = resOf({ nightShifts: '1' }, '2027-01');

console.log(`  листопад 2026 (2 нічні + перехід): час ${novRes.totalNightTimePay.toFixed(2)} zł, доплата ${novRes.totalNightShiftPay} zł, тариф ${novRes.nightTariff}`);
console.log(`  грудень 2026 (3 нічні + з листопада): час ${decRes.totalNightTimePay.toFixed(2)} zł, доплата ${decRes.totalNightShiftPay} zł, тариф ${decRes.nightTariff}`);
console.log(`  відпускні, нічні години: без прапорців ${plain.nightHours.toFixed(4)}, carry out ${out.nightHours.toFixed(4)}, carry in ${inn.nightHours.toFixed(4)}`);
console.log(`  січень 2027: мінімалка ${getMinWage(2027)}, норма ${getNormHours(2027, 0)} год, nightTariff ${jan27.nightTariff} zł/год`);
console.log('OK: нічні на межі місяців і мінімалка 2027');
