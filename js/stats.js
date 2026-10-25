/* Статистика за період (вкладка «Статистика»). Чистий модуль: без DOM і Firebase, сховище передається параметром.
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

/* ---- Періоди ----------------------------------------------------------------------------------------------
   Період — останні 3/6/12 місяців (рахуючи поточний) або вибрані роки. МАЙБУТНІХ МІСЯЦІВ у статистиці немає: максимум — поточний.
   «Сьогодні» передається параметром now, щоб усе можна було тестувати з фіксованою датою. */

export const PERIOD_MODES = ['3', '6', '12', 'years'];
export const parseId = id => { const m = ID_RE.exec(id); return m ? { year: Number(m[1]), month: Number(m[2]) } : null; };
export const nowParts = (now = new Date()) => ({ year: now.getFullYear(), month: now.getMonth() + 1 });

/* Лише записи до поточного місяця включно ('YYYY-MM' порівнюється як рядок — це і є хронологічний порядок). */
export function recordsUpTo(records, now = new Date()) {
  const { year, month } = nowParts(now), current = monthId(year, month), out = {};
  for (const id of Object.keys(records)) if (ID_RE.test(id) && id <= current) out[id] = records[id];
  return out;
}

/* Роки, які можна вибрати: з даними (не майбутні) + поточний. */
export const availableYears = (records, now = new Date()) => yearsIn(recordsUpTo(records, now), nowParts(now).year);

/* Приводить збережений вибір до допустимого: невідомий режим → 12 місяців, зайві/майбутні роки відкидаються,
   а в режимі «роки» без жодного року вибирається поточний. years — доступні роки (availableYears). */
export function normalizePeriod(period, years, now = new Date()) {
  const current = nowParts(now).year;
  const mode = period && PERIOD_MODES.includes(String(period.mode)) ? String(period.mode) : '12';
  const picked = period && Array.isArray(period.years) ? period.years : [];
  let list = [...new Set(picked.map(Number))].filter(y => years.includes(y)).sort((a, b) => a - b);
  if (mode === 'years' && list.length === 0) list = [years.includes(current) ? current : years[years.length - 1]];
  return { mode, years: list };
}

/* Місяці періоду за зростанням ('YYYY-MM'), без майбутніх. */
export function periodMonthIds(period, now = new Date()) {
  const { year: cy, month: cm } = nowParts(now), ids = [];
  if (period.mode !== 'years') {
    const n = Number(period.mode) || 12;
    for (let k = n - 1; k >= 0; k--) { const idx = cy * 12 + (cm - 1) - k; ids.push(monthId(Math.floor(idx / 12), (idx % 12) + 1)); }
    return ids;
  }
  for (const y of [...new Set(period.years.map(Number))].sort((a, b) => a - b)) {
    if (y > cy) continue;
    for (let m = 1; m <= (y === cy ? cm : 12); m++) ids.push(monthId(y, m));
  }
  return ids;
}

/* Підсумки року. premium=true — місяці залогіненого акаунта (відпустка, L4, відсутності, поріг PIT 120 000);
   premium=false — гість (як у калькуляторі: без цих полів і без накопичення PIT). */
export function collectYearStats(records, year, profile, { premium = true } = {}) {
  const months = [];
  const mix = { regular: 0, night: 0, overtime: 0, vacation: 0, l4: 0, excused: 0 };
  let ytdPrev = 0, gross = 0, net = 0, count = 0, best = null;

  for (let m = 1; m <= 12; m++) {
    const id = monthId(year, m), data = records[id];
    if (!data) { months.push({ month: m, year, id, has: false, gross: 0, net: 0 }); continue; }

    const inputs = inputsFromSaved(data, id, profile, { premium });
    const res = compute(inputs);
    // той самий порядок, що в калькуляторі: накопичена база PIT береться з попередніх ЗБЕРЕЖЕНИХ місяців
    const taxed = !inputs.isUnder26;
    const extra = premium && taxed ? pitExtra(res, ytdPrev) : 0;
    if (taxed) ytdPrev += pitBaseOf(res);
    const monthNet = res.net - extra;

    const mm = {
      regular: inputs.morningShifts + inputs.afternoonShifts, night: inputs.nightShifts, overtime: inputs.overtimeDays,
      vacation: inputs.vacDays, l4: premium ? int(data.l4MissedShifts) : 0,        // пропущені через L4 зміни (одиниця — зміна, як і решта)
      excused: inputs.bloodDonationDays
    };
    months.push({ month: m, year, id, has: true, gross: res.gross, net: monthNet, extraPit: extra, mix: mm });
    gross += res.gross; net += monthNet; count++;
    if (!best || monthNet > best.net) best = { month: m, year, id, net: monthNet };
    for (const k of Object.keys(mix)) mix[k] += mm[k];
  }
  return { year, months, mix, totals: { gross, net, count, avgNet: count ? net / count : 0, best } };
}

/* Статистика за період. Нетто кожного місяця рахується з накопиченням PIT за ВЕСЬ рік (також за місяці поза вікном),
   тож збігається з калькулятором: вікно «3 міс.» у жовтні враховує накопичене з січня.
   Повертає: kind ('month' — стовпчик на місяць, 'year' — стовпчик на рік: середнє за місяць), buckets, mix, totals,
   missing (місяці періоду без даних, без майбутніх), from/to. */
export function collectPeriodStats(records, period, profile, { premium = true, now = new Date() } = {}) {
  const recs = recordsUpTo(records, now);
  const ids = periodMonthIds(period, now);
  const perYear = {};
  const entries = ids.map(id => {
    const { year, month } = parseId(id);
    perYear[year] ||= collectYearStats(recs, year, profile, { premium });
    return perYear[year].months[month - 1];
  });
  const have = entries.filter(e => e.has);

  const mix = { regular: 0, night: 0, overtime: 0, vacation: 0, l4: 0, excused: 0 };
  let gross = 0, net = 0, best = null;
  for (const e of have) {
    gross += e.gross; net += e.net;
    for (const k of Object.keys(mix)) mix[k] += e.mix[k];
    if (!best || e.net > best.net) best = { month: e.month, year: e.year, id: e.id, net: e.net };
  }

  const selectedYears = period.mode === 'years' ? new Set(ids.map(id => parseId(id).year)) : new Set();
  const kind = selectedYears.size > 1 ? 'year' : 'month';
  let buckets;
  if (kind === 'month') {
    buckets = entries.map(e => ({ key: e.id, id: e.id, year: e.year, month: e.month, has: e.has, gross: e.gross, net: e.net, extraPit: e.extraPit || 0 }));
  } else {
    buckets = [...selectedYears].sort((a, b) => a - b).map(year => {
      const ofYear = entries.filter(e => e.year === year), withData = ofYear.filter(e => e.has);
      const g = withData.reduce((s, e) => s + e.gross, 0), n = withData.reduce((s, e) => s + e.net, 0), c = withData.length;
      return { key: year, id: String(year), year, has: c > 0, gross: c ? g / c : 0, net: c ? n / c : 0, totalGross: g, totalNet: n, months: c, expected: ofYear.length };
    });
  }
  return {
    period, kind, ids, buckets, mix,
    totals: { gross, net, count: have.length, expected: ids.length, avgNet: have.length ? net / have.length : 0, best },
    missing: entries.filter(e => !e.has).map(e => e.id),
    from: ids[0] || null, to: ids[ids.length - 1] || null
  };
}
