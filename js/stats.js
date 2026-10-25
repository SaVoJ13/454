/* Статистика за рік (вкладка «Рік»). Чистий модуль: без DOM і Firebase, сховище передається параметром.
   Цифри беруться тими самими функціями, що й основний розрахунок (calc.js + поріг PIT з pit.js),
   тому netto за місяць тут збігається з тим, що показує калькулятор для цього місяця. */

import { compute } from './calc.js';
import { inputsFromSaved, pitBaseOf, pitExtra } from './pit.js';

const GUEST_PREFIX = 'guest_month_';
const ID_RE = /^(\d{4})-(\d{2})$/;
const int = v => Math.max(0, parseInt(v) || 0);

export const monthId = (year, month) => `${year}-${String(month).padStart(2, '0')}`;

/* Збережені місяці гостя: усі записи guest_month_YYYY-MM з localStorage. Пошкоджені пропускаються. */
export function readGuestRecords(storage) {
  const records = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(GUEST_PREFIX)) continue;
    const id = key.slice(GUEST_PREFIX.length);
    if (!ID_RE.test(id)) continue;
    try {
      const data = JSON.parse(storage.getItem(key));
      if (data && typeof data === 'object' && !Array.isArray(data)) records[id] = data;
    } catch (e) { /* пошкоджений запис — пропускаємо */ }
  }
  return records;
}

/* Роки, для яких є дані, за зростанням; поточний рік додається завжди (щоб було куди повернутись). */
export function yearsIn(records, currentYear) {
  const years = new Set([currentYear]);
  for (const id of Object.keys(records)) { const m = ID_RE.exec(id); if (m) years.add(Number(m[1])); }
  return [...years].sort((a, b) => a - b);
}

/* Який рік показати спочатку: поточний, якщо в ньому є збережені місяці, інакше останній рік з даними. */
export function defaultYear(records, currentYear) {
  const withData = [...new Set(Object.keys(records).map(id => (ID_RE.exec(id) || [])[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
  if (withData.includes(currentYear) || withData.length === 0) return currentYear;
  return withData[withData.length - 1];
}

/* Підсумки року. premium=true — місяці залогіненого акаунта (відпустка, L4, відсутності, поріг PIT 120 000);
   premium=false — гість (як у калькуляторі: без цих полів і без накопичення PIT). */
export function collectYearStats(records, year, profile, { premium = true } = {}) {
  const months = [];
  const mix = { regular: 0, night: 0, overtime: 0, vacation: 0, l4: 0, excused: 0 };
  let ytdPrev = 0, gross = 0, net = 0, count = 0, best = null;

  for (let m = 1; m <= 12; m++) {
    const id = monthId(year, m), data = records[id];
    if (!data) { months.push({ month: m, id, has: false, gross: 0, net: 0 }); continue; }

    const inputs = inputsFromSaved(data, id, profile, { premium });
    const res = compute(inputs);
    // той самий порядок, що в калькуляторі: накопичена база PIT береться з попередніх ЗБЕРЕЖЕНИХ місяців
    const taxed = !inputs.isUnder26;
    const extra = premium && taxed ? pitExtra(res, ytdPrev) : 0;
    if (taxed) ytdPrev += pitBaseOf(res);
    const monthNet = res.net - extra;

    months.push({ month: m, id, has: true, gross: res.gross, net: monthNet, extraPit: extra });
    gross += res.gross; net += monthNet; count++;
    if (!best || monthNet > best.net) best = { month: m, net: monthNet };

    mix.regular += inputs.morningShifts + inputs.afternoonShifts;
    mix.night += inputs.nightShifts;
    mix.overtime += inputs.overtimeDays;
    mix.vacation += inputs.vacDays;
    mix.excused += inputs.bloodDonationDays;
    mix.l4 += premium ? int(data.l4MissedShifts) : 0;      // пропущені через L4 зміни (одиниця — зміна, як і решта)
  }
  return { year, months, mix, totals: { gross, net, count, avgNet: count ? net / count : 0, best } };
}
