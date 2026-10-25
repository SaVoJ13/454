/* Диференціальний тест: js/calc.js проти ОРИГІНАЛЬНОЇ математики.
   Еталон нижче — це блок @@PURE (+ відпускні) з index.html до розбиття на модулі, скопійований
   з main на GitHub без змін. Він вбудований у цей файл навмисно: немає окремого файла, який можна
   забути завантажити. НЕ РЕДАГУВАТИ: якщо математику свідомо змінюють — оновлюють цей еталон і
   пояснюють у коміті, чому. На відміну від golden.json, еталон не генерується з поточного коду.
   Детермінований генератор випадкових чисел, тож збій завжди відтворюється. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as mine from '../js/calc.js';

const src = String.raw`
const CONFIG = {
ZUS: 0.1371, NFZ: 0.09, PIT: 0.12, KWOTA_WOLNA: 300.00,
LAUNDRY_MAX: 16.00, BENEFIT_ZUS_NFZ: 30.25, BENEFIT_TAX: 54.00,
EXTRA_INSURANCE_RATE: 36.70, NIGHT_SHIFT_BONUS: 30.00,
WEEKEND_DAY_RATE: 100.00, DAILY_HOURS: 8,
MIN_WAGES: { 2024: 4300, 2025: 4666, 2026: 4806 }
};
function getEaster(year) {
const a = year % 19, b = Math.floor(year / 100), c = year % 100;
const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
const month = Math.floor((h + l - 7 * m + 114) / 31);
const day = ((h + l - 7 * m + 114) % 31) + 1;
return new Date(year, month - 1, day);
}
function getNormHours(year, monthIdx) {
const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
let workDays = 0, satHolidays = 0, wdHolidays = 0;
const easter = getEaster(year);
const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);
const pentecost = new Date(easter); pentecost.setDate(easter.getDate() + 49);
const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
const holidays = [
new Date(year, 0, 1), new Date(year, 0, 6), new Date(year, 4, 1), new Date(year, 4, 3),
new Date(year, 7, 15), new Date(year, 10, 1), new Date(year, 10, 11), new Date(year, 11, 25), new Date(year, 11, 26),
easter, easterMonday, pentecost, corpusChristi
];
if (year >= 2025) holidays.push(new Date(year, 11, 24));
for (let d = 1; d <= daysInMonth; d++) {
const date = new Date(year, monthIdx, d);
const dow = date.getDay();
if (dow !== 0 && dow !== 6) workDays++;
const isHoliday = holidays.some(h => h.getDate() === d && h.getMonth() === monthIdx);
if (isHoliday) {
if (dow >= 1 && dow <= 5) wdHolidays++;
if (dow === 6) satHolidays++;
}
}
return 8 * (workDays - wdHolidays - satHolidays);
}
const stateDaysFor = (monthVal) => {
const [y, m] = monthVal.split('-');
return getNormHours(parseInt(y), parseInt(m) - 1) / 8;
};
const getMinWage = (year) => CONFIG.MIN_WAGES[year] || 4806;
function compute(inputs) {
const {
baseSalary, stateDays, schedDays, regWorkedDays,
morningShifts, nightShifts, overtimeMorningShifts, overtimeNightShifts,
weekendDays, overtimeDays, vacDays, dailyUrlopBonus, extraBonus,
bloodDonationDays, l4Days, isPremium,
isUnder26, ppkActive, insuranceActive, l4DailyRateCached,
year
} = inputs;
let adjustedBase = baseSalary; let l4Pay = 0;
if (isPremium && l4Days > 0) {
adjustedBase = baseSalary - ((baseSalary / 30) * l4Days);
let l4DailyRate = (baseSalary * (1 - CONFIG.ZUS)) / 30;
if (l4DailyRateCached && l4DailyRateCached > 0) l4DailyRate = l4DailyRateCached;
l4Pay = l4DailyRate * 0.80 * l4Days;
}
const presenceBonusPct = inputs.presenceBonusPct !== undefined ? inputs.presenceBonusPct : 5;
const qualityBonusPct = inputs.qualityBonusPct || 0;
const presenceBonusAmount = (schedDays > 0) ? ((baseSalary * (presenceBonusPct / 100)) / schedDays * regWorkedDays) : 0;
const qualityBonusAmount = (schedDays > 0) ? ((baseSalary * (qualityBonusPct / 100)) / schedDays * regWorkedDays) : 0;
const bonusAmount = presenceBonusAmount + qualityBonusAmount;
const nightTariff = Math.round(((getMinWage(year) / (stateDays * 8)) * 0.20) * 100) / 100;
const overtimeTariff = Math.round(((baseSalary / stateDays) * 2) * 100) / 100;
const totalMorningShifts = morningShifts + overtimeMorningShifts;
const totalNightShifts = nightShifts + overtimeNightShifts;
const totalNightTimePay = Math.round(((totalMorningShifts * (10/60) * nightTariff) + (totalNightShifts * 8 * nightTariff)) * 100) / 100;
const totalNightShiftPay = totalNightShifts * CONFIG.NIGHT_SHIFT_BONUS;
const totalNightPay = totalNightTimePay + totalNightShiftPay;
const totalWeekendPay = weekendDays * CONFIG.WEEKEND_DAY_RATE;
const totalOvertimePay = overtimeDays * overtimeTariff;
const zusOvertime = totalOvertimePay * CONFIG.ZUS;
const healthBaseOvertime = totalOvertimePay - zusOvertime;
const nfzOvertime = healthBaseOvertime * CONFIG.NFZ;
const pitOvertime = isUnder26 ? 0 : (healthBaseOvertime * CONFIG.PIT);
const totalOvertimeNet = Math.max(0, totalOvertimePay - zusOvertime - nfzOvertime - pitOvertime);
const currentVariables = bonusAmount + totalNightPay + totalWeekendPay + totalOvertimePay;
const currentTotalHours = (regWorkedDays * 8) + (overtimeDays * 8);
const autoDailyBlood = (isPremium && currentTotalHours > 0) ? Math.round((currentVariables / currentTotalHours) * 8 * 100) / 100 : 0;
const bloodDonationPay = autoDailyBlood * bloodDonationDays;
const totalUrlopBonus = dailyUrlopBonus * vacDays;
const gross = adjustedBase + l4Pay + bonusAmount + extraBonus + totalNightPay + totalWeekendPay + totalOvertimePay + totalUrlopBonus + bloodDonationPay;
const zusBase = gross - l4Pay;
const zus = zusBase * CONFIG.ZUS;
const healthBase = gross - zus;
const nfz = Math.round((healthBase * CONFIG.NFZ) * 100) / 100;
let pit = 0;
if (!isUnder26) {
const pitBase = Math.round(Math.max(0, healthBase - CONFIG.KWOTA_WOLNA));
pit = Math.max(0, Math.round((pitBase * CONFIG.PIT) - CONFIG.KWOTA_WOLNA));
}
const totalBenefitCost = CONFIG.BENEFIT_ZUS_NFZ + CONFIG.BENEFIT_TAX;
let laundryAllowance = (schedDays > 0) ? Math.min(CONFIG.LAUNDRY_MAX, (regWorkedDays / schedDays) * CONFIG.LAUNDRY_MAX) : 0;
const ppkCost = ppkActive ? gross * 0.02 : 0;
const extraInsurance = insuranceActive ? CONFIG.EXTRA_INSURANCE_RATE : 0;
const net = gross - zus - nfz - pit - ppkCost - extraInsurance - totalBenefitCost + laundryAllowance;
return {
gross, net, adjustedBase, l4Pay, presenceBonusPct, qualityBonusPct, extraBonus,
presenceBonusAmount, qualityBonusAmount, bonusAmount, nightTariff, laundryAllowance,
totalMorningShifts, totalNightShifts, totalNightTimePay, totalNightShiftPay,
totalNightPay, totalWeekendPay, totalOvertimePay, totalOvertimeNet,
bloodDonationPay, autoDailyBlood, totalUrlopBonus, regWorkedDays,
totalEngagedDays: regWorkedDays + vacDays + bloodDonationDays
};
}
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
function shiftMonthId(monthVal, delta) {
    const [y, m] = monthVal.split('-').map(Number);
    const idx = y * 12 + (m - 1) - delta;
    return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0');
}
function vacationWindowIds(monthVal, lag = 2, count = 3) {
    return Array.from({ length: count }, (_, i) => shiftMonthId(monthVal, lag + i));
}
function buildVacationEntry(monthId, data, fallbackBase) {
    const [y, m] = monthId.split('-').map(Number);
    const normHours = getNormHours(y, m - 1);
    const n = k => Math.max(0, parseFloat(data[k]) || 0);
    const sched = parseInt(data.scheduleDays) || normHours / 8;
    const base = n('baseSalary') || fallbackBase;
    const qPct = isNaN(parseFloat(data.bonusPctSelect)) ? 10 : parseFloat(data.bonusPctSelect);
    let presencePct = parseFloat(data.presencePctSelect);
    if (isNaN(presencePct)) {
        const l4 = n('l4Days');
        presencePct = l4 > 0 ? (l4 <= 2 ? 2.5 : 0) : 5;
    }
    const morning = n('morningShifts'), afternoon = n('afternoonShifts'), night = n('nightShifts');
    let worked = morning + afternoon + night;
    if (!data.morningShifts && !data.afternoonShifts && !data.nightShifts) {
        worked = Math.max(0, sched - n('vacationDays') - n('bloodDonationDays') - n('l4MissedShifts'));
    }
    const otDays = Math.min(n('overtimeDays'), worked);
    const nightAll = night + n('overtimeNightShifts');
    const morningAll = morning + n('overtimeMorningShifts');
    return {
normHours,
        workedHours: worked * 8,
        otHours: otDays * 8,
        nightHours: morningAll * (10 / 60) + nightAll * 8,
        bonus: sched > 0 ? (base * (presencePct + qPct) / 100) / sched * worked : 0,
        nightBonus: nightAll * CONFIG.NIGHT_SHIFT_BONUS,
        weekendPay: n('weekendDays') * CONFIG.WEEKEND_DAY_RATE
    };
}
function vacationHourlyRate(entries, cur) {
    let num = 0, den = 0;
    for (const e of entries) {
        const nightTariff = r2(cur.minWage * 0.20 / e.normHours);
        const otHourly = r2(cur.baseSalary / e.normHours);
        num += e.bonus + e.nightBonus + e.weekendPay
             + r2(e.nightHours * nightTariff)
             + 2 * e.otHours * otHourly;
        den += e.workedHours + e.otHours;
    }
    return den > 0 ? r2(num / den) : 0;
}
function computeDailyUrlopBonus(records, monthVal, cur, lag = 2) {
    const entries = vacationWindowIds(monthVal, lag)
        .filter(id => records[id])
        .map(id => buildVacationEntry(id, records[id], cur.baseSalary));
    return r2(vacationHourlyRate(entries, cur) * 8);
}
`;
const ctx = vm.createContext({});
vm.runInContext(src + '\n;this.api={CONFIG,getNormHours,stateDaysFor,getMinWage,compute,computeDailyUrlopBonus};', ctx);
const ref = ctx.api;

// mulberry32
let seed = 20261020;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = arr => arr[int(0, arr.length - 1)];
const same = (a, b, where) => {
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${where}: різні ключі`);
  for (const k of Object.keys(a)) assert.ok(Object.is(a[k], b[k]), `${where}: "${k}" ${a[k]} ≠ ${b[k]}`);
};

// 1. Константи
assert.equal(JSON.stringify(mine.CONFIG), JSON.stringify(ref.CONFIG), 'CONFIG відрізняється від оригіналу');

// 2. Норма годин: усі місяці 2000–2040
for (let y = 2000; y <= 2040; y++) for (let m = 0; m < 12; m++)
  assert.equal(mine.getNormHours(y, m), ref.getNormHours(y, m), `getNormHours ${y}-${m + 1}`);

// 3. compute(): 30 000 випадкових наборів
const N = 30000;
for (let i = 0; i < N; i++) {
  const year = int(2024, 2028), month = int(0, 11);
  const stateDays = ref.getNormHours(year, month) / 8;
  const m = int(0, 22), a = int(0, 22), n = int(0, 22);
  const inputs = {
    baseSalary: rnd() < 0.5 ? int(3000, 15000) : Math.round(rnd() * 1500000) / 100,
    stateDays, year, schedDays: pick([0, int(10, 26), stateDays]),
    regWorkedDays: m + a + n, morningShifts: m, nightShifts: n,
    overtimeMorningShifts: int(0, 6), overtimeNightShifts: int(0, 6),
    weekendDays: int(0, 8), overtimeDays: pick([0, int(0, 12), int(0, 24) / 2]),
    vacDays: int(0, 10), dailyUrlopBonus: pick([0, Math.round(rnd() * 30000) / 100]),
    extraBonus: pick([0, int(0, 2000)]), bloodDonationDays: int(0, 3), l4Days: pick([0, 0, int(1, 31)]),
    isPremium: rnd() < 0.5, isUnder26: rnd() < 0.3, ppkActive: rnd() < 0.4, insuranceActive: rnd() < 0.6,
    l4DailyRateCached: pick([null, 0, Math.round(rnd() * 25000) / 100]),
    presenceBonusPct: pick([undefined, 0, 2.5, 5]), qualityBonusPct: pick([undefined, 0, 5, 10])
  };
  same(mine.compute({ ...inputs }), ref.compute({ ...inputs }), `compute #${i}`);
}

// 4. Відпускні: 8 000 випадкових наборів записів (рядкові поля, як у Firestore)
const field = (lo, hi) => (rnd() < 0.25 ? undefined : String(int(lo, hi)));
for (let i = 0; i < 8000; i++) {
  const records = {};
  for (let mo = 1; mo <= 12; mo++) if (rnd() < 0.8) {
    records[`2026-${String(mo).padStart(2, '0')}`] = {
      baseSalary: field(4000, 9000), scheduleDays: field(16, 23),
      morningShifts: field(0, 12), afternoonShifts: field(0, 12), nightShifts: field(0, 12),
      overtimeDays: field(0, 6), overtimeMorningShifts: field(0, 3), overtimeNightShifts: field(0, 3),
      weekendDays: field(0, 5), vacationDays: field(0, 5), bloodDonationDays: field(0, 2),
      l4Days: field(0, 10), l4MissedShifts: field(0, 6),
      bonusPctSelect: pick([undefined, '0', '5', '10']), presencePctSelect: pick([undefined, '0', '2.5', '5'])
    };
  }
  const target = `2026-${String(int(1, 12)).padStart(2, '0')}`;
  const cur = { baseSalary: int(4000, 9000), minWage: pick([4666, 4806]) };
  assert.ok(Object.is(mine.computeDailyUrlopBonus(records, target, cur), ref.computeDailyUrlopBonus(records, target, cur)), `відпускні #${i}`);
}

console.log(`OK: calc.js збігається з оригіналом (${N} compute, 8000 відпускних, норми годин 2000–2040)`);
