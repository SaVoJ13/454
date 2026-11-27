/* Мінімалка, введена вручну для років без офіційної суми: перевірка введення й зберігання на пристрої
   (не в хмарі). Чистий модуль без DOM; сховище передається параметром. Сам вибір суми — у calc.js. */
import { CONFIG, r2 } from './calc.js';

export const USER_MIN_WAGES_KEY = 'user_min_wages';
export const MIN_WAGE_MIN = 3000;
export const MIN_WAGE_MAX = 20000;

const inRange = v => Number.isFinite(v) && v >= MIN_WAGE_MIN && v <= MIN_WAGE_MAX;

/* Введення → { ok, value }: кома або крапка; порожнє → value null (видалити); поза 3000–20000 або не число → ok false. */
export function parseMinWage(text) {
  const s = String(text ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '') return { ok: true, value: null };
  const n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  return inRange(n) ? { ok: true, value: r2(n) } : { ok: false, value: null };
}

/* Збережені суми { '2028': 5100 }. Пошкоджений запис і недопустимі значення пропускаються. */
export function readUserMinWages(storage) {
  try {
    const data = JSON.parse(storage.getItem(USER_MIN_WAGES_KEY));
    return Object.fromEntries(Object.entries(data || {}).filter(([year, v]) => /^\d{4}$/.test(year) && inRange(v)));
  } catch (e) {
    return {};
  }
}

/* value null — видалити рік. Повертає новий набір (і тоді, коли сховище не прийняло запис). */
export function saveUserMinWage(storage, year, value) {
  const map = readUserMinWages(storage);
  if (value === null) delete map[year]; else map[year] = value;
  try { storage.setItem(USER_MIN_WAGES_KEY, JSON.stringify(map)); } catch (e) { /* переповнене сховище: діє до перезапуску */ }
  return map;
}

/* Роки календаря місяців: years — усі, missing — без офіційної суми. fields — для яких показувати поле:
   missing і всі роки зі збереженою сумою (зокрема поза календарем), щоб її можна було виправити чи видалити. */
export function minWageYears(monthIds, saved = {}) {
  const sorted = list => [...new Set(list)].sort((a, b) => a - b);
  const years = sorted(monthIds.map(id => parseInt(id)));
  const missing = years.filter(y => !CONFIG.MIN_WAGES[y]);
  return { years, missing, fields: sorted([...missing, ...Object.keys(saved).map(Number)]) };
}
