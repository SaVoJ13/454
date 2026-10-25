/* Чиста логіка розрахунків. Без DOM, без Firebase, без глобального стану.
   Формули перенесені з index.html без змін. */

export const CONFIG = {
  ZUS: 0.1371, NFZ: 0.09, PIT: 0.12, KWOTA_WOLNA: 300.00,
  LAUNDRY_MAX: 16.00, BENEFIT_ZUS_NFZ: 30.25, BENEFIT_TAX: 54.00,
  EXTRA_INSURANCE_RATE: 36.70, NIGHT_SHIFT_BONUS: 30.00,
  WEEKEND_DAY_RATE: 100.00, DAILY_HOURS: 8,
  MIN_WAGES: { 2024: 4300, 2025: 4666, 2026: 4806 }
};

export function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function getNormHours(year, monthIdx) {
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

export const stateDaysFor = (monthVal) => {
  const [y, m] = monthVal.split('-');
  return getNormHours(parseInt(y), parseInt(m) - 1) / 8;
};

export const getMinWage = (year) => CONFIG.MIN_WAGES[year] || 4806;

export function compute(inputs) {
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

/* ---------- Відпускні (середній заробіток за 3 місяці) ---------- */

export const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

export function shiftMonthId(monthVal, delta) {
  const [y, m] = monthVal.split('-').map(Number);
  const idx = y * 12 + (m - 1) - delta;
  return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0');
}

export function vacationWindowIds(monthVal, lag = 2, count = 3) {
  return Array.from({ length: count }, (_, i) => shiftMonthId(monthVal, lag + i));
}

export function buildVacationEntry(monthId, data, fallbackBase) {
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

export function vacationHourlyRate(entries, cur) {
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

export function computeDailyUrlopBonus(records, monthVal, cur, lag = 2) {
  const entries = vacationWindowIds(monthVal, lag)
    .filter(id => records[id])
    .map(id => buildVacationEntry(id, records[id], cur.baseSalary));
  return r2(vacationHourlyRate(entries, cur) * 8);
}
