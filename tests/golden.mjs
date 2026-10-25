/* Characterization ("golden") test.
   `npm run test:update` записує поточні результати в golden.json,
   `npm test` порівнює з ними (без golden.json тест падає). Будь-яка зміна математики одразу видна. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compute, getNormHours, computeDailyUrlopBonus } from '../js/calc.js';

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, 'golden.json');

const base = {
  baseSalary: 5750, stateDays: 21, schedDays: 21, regWorkedDays: 0,
  morningShifts: 0, nightShifts: 0, overtimeMorningShifts: 0, overtimeNightShifts: 0,
  weekendDays: 0, overtimeDays: 0, vacDays: 0, dailyUrlopBonus: 0, extraBonus: 0,
  bloodDonationDays: 0, l4Days: 0, isPremium: false,
  isUnder26: false, ppkActive: false, insuranceActive: true, l4DailyRateCached: null,
  presenceBonusPct: 5, qualityBonusPct: 10, year: 2026
};

const computeCases = {
  empty: {},
  fullMonth: { regWorkedDays: 21, morningShifts: 7, nightShifts: 7 },
  overtimeAndWeekends: { regWorkedDays: 20, morningShifts: 10, nightShifts: 10, overtimeDays: 3, overtimeMorningShifts: 1, overtimeNightShifts: 2, weekendDays: 4 },
  under26Ppk: { regWorkedDays: 21, morningShifts: 21, isUnder26: true, ppkActive: true },
  noInsurance: { regWorkedDays: 18, morningShifts: 6, nightShifts: 6, insuranceActive: false, extraBonus: 250 },
  premiumVacationBlood: { regWorkedDays: 15, morningShifts: 5, nightShifts: 5, isPremium: true, vacDays: 3, dailyUrlopBonus: 112.34, bloodDonationDays: 1 },
  premiumL4: { regWorkedDays: 10, morningShifts: 5, isPremium: true, l4Days: 10, presenceBonusPct: 0 },
  premiumL4Cached: { regWorkedDays: 10, morningShifts: 5, isPremium: true, l4Days: 7, l4DailyRateCached: 150.5 },
  minWage2024: { regWorkedDays: 21, nightShifts: 21, year: 2024, stateDays: 22, schedDays: 22 },
  highSalary: { baseSalary: 12000, regWorkedDays: 21, overtimeDays: 5 }
};

const out = { compute: {}, normHours: {}, urlop: null };

for (const [name, patch] of Object.entries(computeCases)) {
  out.compute[name] = compute({ ...base, ...patch });
}

for (const year of [2024, 2025, 2026, 2027]) {
  for (let m = 0; m < 12; m++) out.normHours[`${year}-${String(m + 1).padStart(2, '0')}`] = getNormHours(year, m);
}

const records = {
  '2026-07': { baseSalary: '5750', morningShifts: '10', afternoonShifts: '4', nightShifts: '6', overtimeDays: '2', overtimeNightShifts: '1', weekendDays: '2', scheduleDays: '21' },
  '2026-06': { baseSalary: '5750', morningShifts: '8', nightShifts: '8', bonusPctSelect: '5', presencePctSelect: '2.5', scheduleDays: '20' },
  '2026-05': { baseSalary: '5750', vacationDays: '3', scheduleDays: '19' }
};
out.urlop = computeDailyUrlopBonus(records, '2026-09', { baseSalary: 5750, minWage: 4806 });

const json = JSON.stringify(out, null, 2);

if (process.argv.includes('--update')) {
  writeFileSync(goldenPath, json + '\n');
  console.log('golden.json записано:', goldenPath);
} else {
  // Без тихої регенерації: відсутній golden.json у CI має валити тест, а не створюватись заново.
  assert.ok(existsSync(goldenPath), 'tests/golden.json не знайдено. Завантаж його в репозиторій (або створи: npm run test:update).');
  assert.deepStrictEqual(JSON.parse(json), JSON.parse(readFileSync(goldenPath, 'utf8')));
  console.log('OK: результати збігаються з golden.json');
}
