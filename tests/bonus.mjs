/* Одне поле премії (bonusTotalPct), список місяців «3 наперед» і підказка «+6 год» лише раз.
   Еталонні значення старих записів зняті з коду до зміни (коміт 3c127c8). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compute, effectiveBonusPct, bonusSplit, getNormHours, buildVacationEntry } from '../js/calc.js';
import { inputsFromSaved } from '../js/pit.js';
import { monthList, formatPLN } from '../js/utils.js';
import { installFakeDom } from './fake-dom.mjs';

const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };

// 1. effectiveBonusPct
for (const [selected, l4, expected] of [[15, 0, 15], [15, 1, 12.5], [15, 2, 12.5], [15, 3, 10], [2.5, 3, 0], [0, 0, 0]])
  assert.equal(effectiveBonusPct(selected, l4), expected, `effectiveBonusPct(${selected}, ${l4})`);

// 1b. bonusSplit: сума складових = ефективна премія для всіх варіантів; для 15 % — старі значення
for (const selected of [0, 2.5, 5, 7.5, 10, 12.5, 15]) for (let l4 = 0; l4 <= 31; l4++) {
  const s = bonusSplit(selected, l4);
  assert.ok(s.presence >= 0 && s.quality >= 0, `bonusSplit(${selected}, ${l4}) від'ємна складова`);
  assert.equal(s.presence + s.quality, effectiveBonusPct(selected, l4), `bonusSplit(${selected}, ${l4})`);
}
for (const [l4, presence] of [[0, 5], [1, 2.5], [2, 2.5], [3, 0], [31, 0]]) assert.deepEqual(bonusSplit(15, l4), { presence, quality: 10 });
assert.deepEqual(bonusSplit(2.5, 1), { presence: 0, quality: 0 }); assert.deepEqual(bonusSplit(10, 3), { presence: 0, quality: 5 });

// 2. Рівноцінність: старий шлях (присутність за правилом L4 + якість 10) і новий (bonusSplit(15, L4))
const cases = [
  { baseSalary: 4806, stateDays: 20, schedDays: 20, morningShifts: 10, nightShifts: 10, overtimeDays: 0, year: 2026 },
  { baseSalary: 5750, stateDays: 22, schedDays: 21, morningShifts: 7, nightShifts: 8, overtimeDays: 2.5, year: 2026 },
  { baseSalary: 7333.33, stateDays: 19, schedDays: 23, morningShifts: 13, nightShifts: 4, overtimeDays: 1, year: 2027 },
  { baseSalary: 10500, stateDays: 21, schedDays: 18, morningShifts: 0, nightShifts: 15, overtimeDays: 4, year: 2027 }
];
console.log('  рівноцінність (gross / net, zł): старе → нове');
for (const l4Days of [0, 1, 2, 3, 5]) for (const c of cases) {
  const inputs = { ...c, regWorkedDays: c.morningShifts + c.nightShifts, overtimeMorningShifts: 1, overtimeNightShifts: 1, weekendDays: 2,
    vacDays: 1, dailyUrlopBonus: 150, extraBonus: 100, bloodDonationDays: 1, l4Days, isPremium: true, isUnder26: false, ppkActive: true,
    insuranceActive: true, l4DailyRateCached: null };
  const oldPresence = l4Days > 0 ? (l4Days <= 2 ? 2.5 : 0) : 5;
  const a = compute({ ...inputs, presenceBonusPct: oldPresence, qualityBonusPct: 10 });
  const split = bonusSplit(15, l4Days);
  const b = compute({ ...inputs, presenceBonusPct: split.presence, qualityBonusPct: split.quality });
  console.log(`    L4 ${l4Days}, ставка ${c.baseSalary}: gross ${a.gross.toFixed(4)} → ${b.gross.toFixed(4)}, net ${a.net.toFixed(4)} → ${b.net.toFixed(4)}`);
  assert.ok(Object.is(a.gross, b.gross) && Object.is(a.net, b.net), `L4 ${l4Days}, ставка ${c.baseSalary}`);
}

// 2b. 1 000 000 випадкових наборів, вибір 15 %, L4 0…6: усі поля compute() побітово як у старому шляху
{
  let seed = 20261126;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const norms = [];
  for (let year = 2024; year <= 2028; year++) for (let m = 0; m < 12; m++) norms.push({ year, stateDays: getNormHours(year, m) / 8 });
  const N = 1_000_000;
  let differ = 0;
  for (let i = 0; i < N; i++) {
    const { year, stateDays } = norms[int(0, norms.length - 1)];
    const m = int(0, 22), n = int(0, 22), l4Days = int(0, 6);
    const x = { baseSalary: rnd() < 0.5 ? int(3000, 15000) : int(300000, 1500000) / 100, stateDays, year, schedDays: int(10, 26), regWorkedDays: m + n,
      morningShifts: m, nightShifts: n, overtimeMorningShifts: int(0, 6), overtimeNightShifts: int(0, 6), weekendDays: int(0, 8), overtimeDays: int(0, 24) / 2,
      vacDays: int(0, 10), dailyUrlopBonus: int(0, 30000) / 100, extraBonus: int(0, 2000), bloodDonationDays: int(0, 3), l4Days, isPremium: rnd() < 0.8,
      isUnder26: rnd() < 0.3, ppkActive: rnd() < 0.4, insuranceActive: rnd() < 0.6, l4DailyRateCached: rnd() < 0.5 ? null : int(0, 25000) / 100 };
    const a = compute({ ...x, presenceBonusPct: l4Days > 0 ? (l4Days <= 2 ? 2.5 : 0) : 5, qualityBonusPct: 10 });
    const split = bonusSplit(15, l4Days);
    const b = compute({ ...x, presenceBonusPct: split.presence, qualityBonusPct: split.quality });
    if (Object.keys(a).some(k => !Object.is(a[k], b[k]))) differ++;
  }
  console.log(`  15 %, L4 0…6: ${N} випадкових наборів, побітових розбіжностей: ${differ}`);
  assert.equal(differ, 0);
}

// 3. Старі записи без bonusTotalPct — побітово як до зміни
const commonInputs = { stateDays: 22, year: 2026, afternoonShifts: 0, overtimeDays: 0, overtimeMorningShifts: 0, overtimeNightShifts: 0,
  nightHoursAdjust: 0, weekendDays: 0, vacDays: 0, dailyUrlopBonus: 0, extraBonus: 0, bloodDonationDays: 0, isUnder26: false,
  ppkActive: false, insuranceActive: true, extraDeductionAmount: 36.7, isPremium: true, l4DailyRateCached: null };
const legacy = [
  { r: { baseSalary: '6100', scheduleDays: '21', morningShifts: '9', nightShifts: '7', l4Days: '2' },
    inputs: { baseSalary: 6100, schedDays: 21, morningShifts: 9, nightShifts: 7, l4Days: 2, qualityBonusPct: 10, presenceBonusPct: 2.5, regWorkedDays: 16 },
    vac: { normHours: 176, workedHours: 128, otHours: 0, nightHours: 57.5, bonus: 580.952380952381, nightBonus: 210, weekendPay: 0 } },
  { r: { baseSalary: '5900', scheduleDays: '20', morningShifts: '12', afternoonShifts: '3', bonusPctSelect: '5', presencePctSelect: '2.5', weekendDays: '2' },
    inputs: { baseSalary: 5900, schedDays: 20, morningShifts: 12, afternoonShifts: 3, nightShifts: 0, weekendDays: 2, l4Days: 0, qualityBonusPct: 5, presenceBonusPct: 2.5, regWorkedDays: 15 },
    vac: { normHours: 176, workedHours: 120, otHours: 0, nightHours: 2, bonus: 331.875, nightBonus: 0, weekendPay: 200 } },
  { r: { morningShifts: '8', nightShifts: '4', bonusPctSelect: '10', presencePctSelect: '5', l4Days: '3', l4MissedShifts: '2' },
    inputs: { baseSalary: 5750, schedDays: 22, morningShifts: 8, nightShifts: 4, l4Days: 3, qualityBonusPct: 10, presenceBonusPct: 5, regWorkedDays: 12 },
    vac: { normHours: 176, workedHours: 96, otHours: 0, nightHours: 33.333333333333336, bonus: 470.45454545454544, nightBonus: 120, weekendPay: 0 } }
];
for (const { r, inputs, vac } of legacy) {
  assert.deepStrictEqual(inputsFromSaved(r, '2026-09', profile), { ...commonInputs, ...inputs }, 'старий запис: inputsFromSaved');
  assert.deepStrictEqual(buildVacationEntry('2026-09', r, 5750), vac, 'старий запис: buildVacationEntry');
}

// 4. Записи з bonusTotalPct беруть ефективну премію; старі поля поруч не впливають
for (const [bonusTotalPct, l4, eff] of [[15, undefined, 15], [15, '1', 12.5], [12.5, '3', 7.5], [2.5, '5', 0], [0, undefined, 0]]) {
  const r = { baseSalary: '6000', scheduleDays: '20', morningShifts: '10', l4Days: l4, bonusTotalPct, bonusPctSelect: '5', presencePctSelect: '0' };
  const inp = inputsFromSaved(r, '2026-09', profile);
  assert.deepEqual({ presence: inp.presenceBonusPct, quality: inp.qualityBonusPct }, bonusSplit(bonusTotalPct, Number(l4) || 0), `inputsFromSaved ${bonusTotalPct}, L4 ${l4}`);
  assert.equal(inp.presenceBonusPct + inp.qualityBonusPct, eff);
  assert.equal(buildVacationEntry('2026-09', r, 5750).bonus, (6000 * eff / 100) / 20 * 10, `buildVacationEntry ${bonusTotalPct}, L4 ${l4}`);
}

// 5. Список місяців: 3 наперед, поточний, 11 назад (з переходом через рік)
const list = monthList(new Date(2026, 10, 26));
assert.deepEqual(list.map(m => m.id), ['2027-02', '2027-01', '2026-12', '2026-11', '2026-10', '2026-09', '2026-08', '2026-07',
  '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12']);
assert.deepEqual(list.map(m => m.offset), [3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11]);
assert.equal(monthList(new Date(2026, 0, 31))[0].id, '2026-04', '31-ше число не перескакує через місяць');

// ---------- 6. app.js на фейковому DOM і фейковому Firebase ----------
// clearInputs() у браузері чистить числові поля за селектором — фейковому DOM даємо їх список із розмітки
const numberIds = [...readFileSync(new URL('../index.html', import.meta.url), 'utf8').matchAll(/<input type="number"[^>]*? id="(\w+)"/g)].map(m => m[1]);
const { getEl, fire, store } = installFakeDom({ groups: { 'input[type=number]': numberIds } });
numberIds.forEach(getEl);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
const cloud = new Map(), writes = [];
let authCb = null;
const auth = { currentUser: null };
const stub = {
  auth, db: {}, onAuthStateChanged: (_a, cb) => { authCb = cb; },
  doc: (_db, ...p) => ({ path: p.join('/') }), collection: (_db, ...p) => ({ path: p.join('/') }),
  getDoc: async ref => { const d = cloud.get(ref.path); return { exists: () => !!d, data: () => d }; },
  setDoc: async (ref, data) => { writes.push({ path: ref.path, data }); cloud.set(ref.path, { ...cloud.get(ref.path), ...data }); },   // merge
  getDocs: async ref => ({ forEach(cb) { for (const [p, d] of cloud) if (p.startsWith(ref.path + '/')) cb({ id: p.slice(ref.path.length + 1), data: () => d }); } })
};
globalThis.__salaryTest = { cloudLoader: async () => stub };
console.warn = () => {};
await import('../js/app.js');
await sleep(100);

const body = getEl('app-body');
const ids = monthList().map(m => m.id);
const current = monthList().find(m => m.offset === 0).id;
assert.deepEqual(getEl('monthSelect').options.map(o => o.value), ids, 'initMonths: 3 наперед, поточний, 11 назад');
assert.equal(getEl('monthSelect').value, current, 'за замовчуванням вибрано поточний місяць');

const guest = id => JSON.parse(store.get(`guest_month_${id}`));
const select = async id => { getEl('monthSelect').value = id; await fire(body, 'change', getEl('monthSelect')); await sleep(60); };
const type = async (id, value) => { getEl(id).value = value; await fire(body, 'input', getEl(id)); };
const choose = async value => { await type('bonusTotalPctSelect', value); await fire(body, 'change', getEl('bonusTotalPctSelect')); };
const hintShown = () => !getEl('bonusConvertedHint').classList.contains('hidden');
const row = () => [getEl('infoBonusPct').innerText, getEl('infoBonusL4').innerText];
const guestRes = (data, id) => compute(inputsFromSaved(data, id, profile, { premium: false }));
const shown = (data, id, msg) => {
  assert.equal(getEl('netResult').innerText, formatPLN(guestRes(data, id).net), `${msg}: netto`);
  assert.equal(getEl('infoBonusSum').innerText, formatPLN(guestRes(data, id).bonusAmount), `${msg}: сума премії`);
};

// 6a. Новий місяць: 15 %, запис з'являється лише після зміни й без старих полів
assert.equal(getEl('bonusTotalPctSelect').value, '15');
assert.ok(!store.has(`guest_month_${current}`));
await type('morningShifts', '10');
assert.strictEqual(guest(current).bonusTotalPct, 15, 'зберігається числом');
assert.ok(!('presencePctSelect' in guest(current)) && !('bonusPctSelect' in guest(current)) && !('bonusTotalPctSelect' in guest(current)));
assert.deepEqual(row(), ['15 %', '']);
// L4 не змінює вибір, зменшення застосовується саме
for (const [l4, pct] of [['1', '12,5 %'], ['3', '10 %'], ['', '15 %']]) {
  await type('l4Days', l4);
  assert.equal(getEl('bonusTotalPctSelect').value, '15', `L4 «${l4}»: вибір не змінюється`);
  assert.equal(row()[0], pct, `L4 «${l4}»`);
  shown(guest(current), current, `L4 «${l4}»`);
}
await type('l4Days', '1');
assert.deepEqual(row(), ['12,5 %', '(15 % − 2,5 % за L4)']);
window.setLang('pl');
assert.deepEqual(row(), ['12,5%', '(15% − 2,5% za L4)']);
window.setLang('uk');

// 6b. Старий місяць, що перераховується точно: без підказки; відкриття не змінює збережене
const [exactId, clampId, plainId] = [ids[5], ids[6], ids[7]];
const exact = { baseSalary: '6000', morningShifts: '10', scheduleDays: '20', l4Days: '1', bonusPctSelect: '10', presencePctSelect: '2.5' };
const clamp = { baseSalary: '6000', morningShifts: '10', scheduleDays: '20', l4Days: '3', bonusPctSelect: '10', presencePctSelect: '5' };
const plain = { baseSalary: '6000', morningShifts: '10', scheduleDays: '20', bonusPctSelect: '5', presencePctSelect: '0' };
for (const [id, d] of [[exactId, exact], [clampId, clamp], [plainId, plain]]) store.set(`guest_month_${id}`, JSON.stringify(d));
await select(exactId);
assert.equal(getEl('bonusTotalPctSelect').value, '15'); assert.equal(hintShown(), false);
assert.deepEqual(row(), ['12,5 %', '(15 % − 2,5 % за L4)']);
shown(exact, exactId, 'старий точний місяць');
await select(plainId);
assert.equal(getEl('bonusTotalPctSelect').value, '5'); assert.equal(hintShown(), false); assert.deepEqual(row(), ['5 %', '']);
shown(plain, plainId, 'старий місяць без L4');

// 6c. Старий місяць, що не перераховується точно: підказка, рахунок як раніше (15 % попри L4)
await select(clampId);
assert.equal(getEl('bonusTotalPctSelect').value, '15'); assert.equal(hintShown(), true);
assert.deepEqual(row(), ['15 %', '']);
shown(clamp, clampId, 'старий неточний місяць до змін');
assert.deepEqual(guest(clampId), clamp, 'відкриття не змінює збережені дані');
// перша зміна → новий шлях; старі поля в записі лишаються
await type('weekendDays', '1');
assert.strictEqual(guest(clampId).bonusTotalPct, 15);
assert.equal(guest(clampId).bonusPctSelect, '10'); assert.equal(guest(clampId).presencePctSelect, '5');
assert.deepEqual(row(), ['10 %', '(15 % − 5 % за L4)']);
shown(guest(clampId), clampId, 'після зміни');
assert.equal(hintShown(), true, 'підказка лишається, доки відсоток не вибрали');
await choose('12.5');
assert.equal(hintShown(), false); assert.strictEqual(guest(clampId).bonusTotalPct, 12.5);
assert.equal(guest(clampId).presencePctSelect, '5', 'повторне збереження старих полів не видаляє');
await select(exactId); await select(clampId);
assert.equal(getEl('bonusTotalPctSelect').value, '12.5'); assert.equal(hintShown(), false);

// 6d. «+6 год» у гостя: один раз для пари місяців
const toast = () => getEl('toast').innerText;
const carry = async on => { getEl('nightCarryOut').checked = on; await fire(body, 'change', getEl('nightCarryOut')); };
const carryToasts = async () => { getEl('toast').innerText = ''; await carry(true); const t = toast(); await carry(false); return t; };
await select(plainId); await type('nightShifts', '2');                    // наступний місяць (ids[6]) збережений
assert.equal(await carryToasts(), dict.uk.toastNextCarryIn, 'перший раз — показуємо');
assert.equal(await carryToasts(), '', 'вдруге для тієї самої пари — ні');
await select(clampId); await type('nightShifts', '2');                    // інша пара: ids[6] → ids[5]
assert.equal(await carryToasts(), dict.uk.toastNextCarryIn);
await select(plainId); await type('nightShifts', '2');
assert.equal(await carryToasts(), '', 'після повернення до місяця — теж ні');

// 6e. Акаунт: збереження старого місяця, копія зі старими полями, L4 з новим полем, підказка «+6 год» раз
const [oldId, nextId, nowId] = [ids[9], ids[8], current];
const path = id => `users/u1/months/${id}`;
cloud.set(path(oldId), { ...clamp });
cloud.set(path(nextId), { baseSalary: '6000', morningShifts: '10', scheduleDays: '20', bonusTotalPct: 15 });
cloud.set(path(nowId), { baseSalary: '6000', morningShifts: '5', scheduleDays: '20', l4Days: '4', bonusTotalPct: 15 });
auth.currentUser = { uid: 'u1', email: 'user@example.com' };
getEl('monthSelect').value = oldId;
await authCb(auth.currentUser); await sleep(60);
assert.equal(hintShown(), true);
const accRes = (d, id) => compute(inputsFromSaved(d, id, profile));
assert.equal(getEl('infoBonusSum').innerText, formatPLN(accRes(clamp, oldId).bonusAmount), 'акаунт: до збереження — як раніше');
assert.equal(writes.length, 0, 'відкриття нічого не записує');
await type('nightShifts', '1'); getEl('nightCarryOut').checked = true;
getEl('toast').innerText = '';
await fire(getEl('btn-sync-up-calc'), 'click'); await sleep(60);
const saved = writes.at(-1).data;
assert.strictEqual(saved.bonusTotalPct, 15);
assert.ok(!('presencePctSelect' in saved) && !('bonusPctSelect' in saved), 'у запис не додаємо старих полів');
assert.equal(cloud.get(path(oldId)).presencePctSelect, '5', 'merge лишає старі поля');
const cached = JSON.parse(store.get(`cloud_month_u1_${oldId}`)).data;
assert.equal(cached.presencePctSelect, '5'); assert.equal(cached.bonusPctSelect, '10'); assert.equal(cached.bonusTotalPct, 15);
assert.equal(toast(), dict.uk.toastSaveCloud + '\n' + dict.uk.toastNextCarryIn);
await fire(getEl('btn-sync-up-calc'), 'click'); await sleep(60);
assert.equal(toast(), dict.uk.toastSaveCloud, 'вдруге — лише повідомлення про збереження');

// збереження без жодної зміни теж переводить місяць на вибраний відсоток
cloud.set(path(ids[11]), { ...clamp });
await authCb(auth.currentUser); await select(ids[11]);
await fire(getEl('btn-sync-up-calc'), 'click'); await sleep(60);
assert.equal(hintShown(), false);
assert.deepEqual(row(), ['10 %', '(15 % − 5 % за L4)']);

// середнє для L4 (updateL4Cache): попередні місяці з bonusTotalPct рахуються з ефективною премією
for (const k of [...cloud.keys()]) cloud.delete(k);
const prevMonth = { baseSalary: '6000', morningShifts: '10', scheduleDays: '20', l4Days: '1', bonusTotalPct: 10 };
const prevId = ids[4];
cloud.set(path(prevId), prevMonth);
cloud.set(path(nowId), { baseSalary: '6000', morningShifts: '5', scheduleDays: '20', l4Days: '4', bonusTotalPct: 15 });
await authCb(auth.currentUser); await select(nowId);
const prevRes = compute({ ...inputsFromSaved(prevMonth, prevId, profile), l4Days: 0, isPremium: false });
assert.deepEqual([prevRes.presenceBonusPct, prevRes.qualityBonusPct], [2.5, 5]);
const rate = prevRes.gross * (1 - 0.1371) / 30;
assert.equal(getEl('infoL4Sum').innerText, formatPLN(rate * 0.8 * 4));

console.log('OK: одне поле премії (старі й нові записи), 3 місяці наперед, підказка «+6 год» раз');
process.exit(0);
