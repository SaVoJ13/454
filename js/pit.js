/* Поріг PIT 120 000 zł на рік (ставка 32% з надлишку).
   Чистий модуль без DOM і Firebase. js/calc.js НЕ змінено: він і далі рахує PIT за ставкою 12%
   (це еталонна математика, її охороняє tests/reference.mjs). Тут рахується лише ДОДАТКОВИЙ податок,
   коли накопичена з початку року база PIT перевищує 120 000.

   Як рахує роботодавець (метод наростаючим підсумком):
   - база PIT місяця = брутто − внески ZUS − витрати (у цьому застосунку 300 zł: праця в іншій місцевості);
   - у місяць перетину порога: 12% з частини бази, що вмістилась під 120 000, і 32% з надлишку;
   - щомісячна знижка 300 zł (PIT-2) віднімається в усі місяці, тож за рік виходить рівно
     10 800 zł + 32% з надлишку понад 120 000, як вимагає шкала;
   - аванс округлюється до повних злотих.
   Нижче порога результат збігається з calc.js до злотого (це перевіряє tests/pit.mjs). */

import { CONFIG, compute, getNormHours } from './calc.js';

export const PIT_LIMIT = 120000;
export const PIT_RATE_HIGH = 0.32;

/* База PIT місяця — рівно так, як її рахує compute(): (брутто − ZUS) − 300, округлено до zł, не менше 0. */
export function pitBaseOf(res) {
  const zus = (res.gross - res.l4Pay) * CONFIG.ZUS;
  const healthBase = res.gross - zus;
  return Math.round(Math.max(0, healthBase - CONFIG.KWOTA_WOLNA));
}

/* PIT-аванс місяця за наростаючим підсумком. ytdPrev — база PIT за попередні місяці цього року. */
export function pitForMonth(pitBase, ytdPrev) {
  const room = Math.max(0, PIT_LIMIT - ytdPrev);          // скільки ще вміщується під порогом
  const below = Math.min(pitBase, room);
  const above = pitBase - below;
  if (above <= 0) return Math.max(0, Math.round(pitBase * CONFIG.PIT - CONFIG.KWOTA_WOLNA));   // точно як у compute()
  return Math.max(0, Math.round(below * CONFIG.PIT + above * PIT_RATE_HIGH - CONFIG.KWOTA_WOLNA));
}

/* Скільки ДОДАТКОВО податку проти compute() (завжди ≥ 0). Віднімається від netto, яке дав compute(). */
export function pitExtra(res, ytdPrev) {
  const base = pitBaseOf(res);
  const original = Math.max(0, Math.round(base * CONFIG.PIT - CONFIG.KWOTA_WOLNA));   // те, що вже враховано в res.net
  return pitForMonth(base, ytdPrev) - original;
}

/* Вхідні дані compute() із запису місяця (як у Firestore / локальній копії). Дзеркало того, як
   calculateSalary() у app.js читає поля форми, включно зі значеннями за замовчуванням з fillFrom(). */
export function inputsFromSaved(data, monthId, profile, { premium = true } = {}) {
  const [yStr, mStr] = monthId.split('-');
  const year = parseInt(yStr);
  const stateDays = getNormHours(year, parseInt(mStr) - 1) / 8;
  const int = k => Math.max(0, parseInt(data[k]) || 0);
  const flt = k => Math.max(0, parseFloat(data[k]) || 0);
  const l4Days = int('l4Days');
  const qualityBonusPct = data.bonusPctSelect === undefined ? 10 : (parseFloat(data.bonusPctSelect) || 0);
  const presenceBonusPct = data.presencePctSelect === undefined
    ? (l4Days > 0 ? (l4Days <= 2 ? 2.5 : 0) : 5)
    : (parseFloat(data.presencePctSelect) || 0);
  const inputs = {
    baseSalary: Math.max(0, parseFloat(data.baseSalary) || Number(profile.baseSalary)),
    stateDays, year,
    schedDays: parseInt(data.scheduleDays) || stateDays,
    morningShifts: int('morningShifts'), afternoonShifts: int('afternoonShifts'), nightShifts: int('nightShifts'),
    overtimeDays: flt('overtimeDays'),
    overtimeMorningShifts: int('overtimeMorningShifts'), overtimeNightShifts: int('overtimeNightShifts'),
    weekendDays: int('weekendDays'),
    vacDays: premium ? int('vacationDays') : 0, dailyUrlopBonus: premium ? flt('urlopBonus') : 0,
    extraBonus: flt('extraBonus'),
    bloodDonationDays: premium ? int('bloodDonationDays') : 0, l4Days: premium ? l4Days : 0,
    qualityBonusPct, presenceBonusPct,
    isUnder26: profile.under26 === 'yes', ppkActive: profile.ppk === 'yes', insuranceActive: profile.insurance === 'yes',
    isPremium: premium,              // за замовчуванням — місяці залогіненого акаунта; для гостя premium: false
    l4DailyRateCached: null          // для минулих місяців середнє за 12 місяців не відновлюємо: беремо ставку від окладу
  };
  inputs.regWorkedDays = inputs.morningShifts + inputs.afternoonShifts + inputs.nightShifts;
  return inputs;
}

/* Накопичена база PIT за місяці цього року ПЕРЕД monthId. records: { 'YYYY-MM': дані місяця }.
   Місяці, яких немає в records, рахуються як 0 — found/expected дозволяють попередити користувача. */
export function yearToDate(records, monthId, profile) {
  const [yStr, mStr] = monthId.split('-');
  const k = parseInt(mStr);
  if (profile.under26 === 'yes') return { monthVal: monthId, prev: 0, found: 0, expected: 0 };   // PIT 0 — поріг не діє
  let prev = 0, found = 0;
  for (let j = 1; j < k; j++) {
    const id = `${yStr}-${String(j).padStart(2, '0')}`;
    const data = records[id];
    if (!data) continue;
    found++;
    prev += pitBaseOf(compute(inputsFromSaved(data, id, profile)));
  }
  return { monthVal: monthId, prev, found, expected: k - 1 };
}
