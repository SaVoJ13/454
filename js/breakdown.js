/* Розклад відрахувань для «Деталей». Чистий модуль без DOM і Firebase; математики не змінює.
   Дзеркало compute() з calc.js — тест breakdown.mjs ловить розбіжність: ті самі вирази в тому самому порядку. */
import { CONFIG, r2 } from './calc.js';

/* Складові ZUS працівника для показу (разом CONFIG.ZUS = 13,71 %). Хворобова — залишок, щоб три рядки давали ZUS разом. */
export const ZUS_EMERYTALNE = 0.0976;
export const ZUS_RENTOWE = 0.015;

/* Гроші так, як їх бачить користувач: те саме округлення, що у formatPLN, у цілих грошах. */
const shownFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const shown = v => Number(shownFormat.format(v).replace('.', ''));

/* res — результат compute(inputs); extraPit — додатковий PIT понад 120 000 (pitExtra), у res.net його немає.
   raw — неокруглені суми (res.net = gross − zus − nfz − pit − ppk − deduction − benefit + laundry),
   rows — суми рядків списку, total — «Разом відрахувань»: gross − (net − extraPit) + laundry.
   roundingDiffers — сума рядків не дорівнює total; checkDiffers — «Брутто − total + прання» з показаних чисел
   не дорівнює показаному нетто. */
export function deductionsBreakdown(res, inputs, extraPit = 0) {
  const zusBase = res.gross - res.l4Pay;
  const zus = zusBase * CONFIG.ZUS;
  const healthBase = res.gross - zus;
  const nfz = Math.round((healthBase * CONFIG.NFZ) * 100) / 100;

  let pit = 0;
  if (!inputs.isUnder26) {
    const pitBase = Math.round(Math.max(0, healthBase - CONFIG.KWOTA_WOLNA));
    pit = Math.max(0, Math.round((pitBase * CONFIG.PIT) - CONFIG.KWOTA_WOLNA));
  }

  const totalBenefitCost = CONFIG.BENEFIT_ZUS_NFZ + CONFIG.BENEFIT_TAX;
  const ppkCost = inputs.ppkActive ? res.gross * 0.02 : 0;
  const extraInsurance = Number.isFinite(inputs.extraDeductionAmount) ? Math.max(0, inputs.extraDeductionAmount)
    : (inputs.insuranceActive ? CONFIG.EXTRA_INSURANCE_RATE : 0);

  const zusTotal = r2(zus);
  const zusEmerytalne = r2(zusBase * ZUS_EMERYTALNE);
  const zusRentowe = r2(zusBase * ZUS_RENTOWE);
  const rows = {
    zusEmerytalne, zusRentowe, zusChorobowe: r2(zusTotal - zusEmerytalne - zusRentowe),
    nfz, pit, pitExtra: extraPit, ppk: r2(ppkCost),
    benefitZus: CONFIG.BENEFIT_ZUS_NFZ, benefitTax: CONFIG.BENEFIT_TAX, deduction: r2(extraInsurance)
  };
  const total = r2(res.gross - (res.net - extraPit) + res.laundryAllowance);
  const rowsGrosze = Object.values(rows).reduce((s, v) => s + Math.round(v * 100), 0);
  return {
    raw: { zus, nfz, pit, ppk: ppkCost, deduction: extraInsurance, benefit: totalBenefitCost, laundry: res.laundryAllowance },
    zusTotal, rows, laundry: r2(res.laundryAllowance), total,
    roundingDiffers: rowsGrosze !== Math.round(total * 100),
    checkDiffers: shown(res.gross) - shown(total) + shown(res.laundryAllowance) !== shown(res.net - extraPit)
  };
}
