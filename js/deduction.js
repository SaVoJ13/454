/* Додаткове щомісячне відрахування з нетто (напр. групове страхування). Чистий модуль без DOM і Firebase.
   Профіль зберігає суму в extraDeduction; старе поле insurance ('yes'/'no') лишається для веб-версії. */
import { CONFIG, r2 } from './calc.js';

/* Сума відрахування з профілю. Старий профіль без extraDeduction: insurance 'no' → 0, інакше (зокрема
   коли поля немає, бо за замовчуванням було 'yes') → колишня фіксована сума страхування. */
export function deductionOf(profile) {
  if (Number.isFinite(profile.extraDeduction)) return Math.max(0, profile.extraDeduction);
  return profile.insurance === 'no' ? 0 : CONFIG.EXTRA_INSURANCE_RATE;
}

export const MAX_DEDUCTION = 2000;

/* Перевірка суми перед збереженням профілю → { ok, value, error }. Порожнє = 0; error: 'invalid' (не невід'ємне
   число; кома або крапка, пробіли дозволені) чи 'tooBig' (більше 2000). */
export function checkDeduction(text) {
  const s = String(text ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '') return { ok: true, value: 0, error: null };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return { ok: false, value: null, error: 'invalid' };
  if (Number(s) > MAX_DEDUCTION) return { ok: false, value: null, error: 'tooBig' };
  return { ok: true, value: r2(Number(s)), error: null };
}

/* Введення користувача → сума: «36,70» і «36.70» → 36.7; порожнє, від'ємне або не число → 0; до 0,01. */
export function parseDeduction(text) {
  const n = Number(String(text ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? r2(n) : 0;
}
