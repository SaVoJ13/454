/* UI: «Деталі» без дублікатів, пояснення «i» до відпускних, поля, що очищаються від дотику й форматуються при виході,
   примітка про округлення під рядком перевірки, поле мінімалки для збереженого року поза календарем. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compute, stateDaysFor } from '../js/calc.js';
import { inputsFromSaved } from '../js/pit.js';
import { deductionsBreakdown } from '../js/breakdown.js';
import { installFakeDom, findAll } from './fake-dom.mjs';

// ---------- 1. Розмітка ----------
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const totals = html.slice(html.indexOf('<section class="card total">'), html.indexOf('data-i18n="secStats"'));
assert.ok(totals.includes('id="infoTotalNetto"'), 'знайдено підсумок «Деталей»');
for (const gone of ['infoLaundry', 'infoDeduction', 'rowDeduction', 'dedLaundry']) assert.ok(!totals.includes(gone), `у підсумку немає ${gone}`);
const list = html.slice(html.indexOf('id="deductions"'), html.indexOf('</details></section>'));
for (const id of ['dedExtra', 'dedExtraVal', 'dedLaundry', 'dedLaundryVal']) assert.ok(list.includes(`id="${id}"`), `у списку «Відрахування» є ${id}`);
assert.ok(list.indexOf('id="dedCheckVal"') < list.indexOf('id="dedRoundNote"'), 'примітка — під рядком перевірки');
const hintTag = html.match(/<details class="info" id="urlopHint">.*?<\/details>/)?.[0] || '';
assert.ok(/<summary data-i18n-aria="ariaExplain" aria-label="Пояснення"><svg aria-hidden="true" class="icon info-icon"><use href="#i-info"\/><\/svg><\/summary><small data-i18n="hintUrlop">/.test(hintTag), 'пояснення — нативний details із підписаним summary та іконкою');
assert.ok(/<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"\/><path /.test(html), 'іконка «i» у спрайті');
assert.ok(!html.includes('ℹ'), 'символу-емодзі в розмітці немає');
assert.ok(/id="profExtraDeduction" data-clear-on-focus="0"/.test(html), 'поле відрахування позначене');
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.ok(!/infoLaundrySum|infoDeductionVal|rowDeduction/.test(appSrc), 'app.js не звертається до прибраних рядків');

// ---------- 2. app.js на фейковому DOM ----------
const { getEl, fire, store } = installFakeDom();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
assert.equal(dict.uk.hintUrlop, 'Для коректного розрахунку потрібні збережені дані за попередні 4 місяці.');
assert.equal(dict.pl.hintUrlop, 'Do poprawnego wyliczenia potrzebne są zapisane dane z 4 poprzednich miesięcy.');
assert.deepEqual([dict.uk.ariaExplain, dict.pl.ariaExplain], ['Пояснення', 'Wyjaśnienie']);
assert.deepEqual([dict.uk.hintExtraDeduction, dict.pl.hintExtraDeduction], ['Наприклад, додаткове страхування', 'Np. dodatkowe ubezpieczenie']);

store.set('guest_month_2026-09', '{"vacationDays":"4","morningShifts":"10"}');
store.set('user_min_wages', '{"2031":7000}');                 // рік поза календарем місяців
globalThis.__salaryTest = { cloudLoader: async () => { throw new Error('offline'); }, now: new Date(2026, 10, 27, 12).getTime() };
console.warn = () => {};
await import('../js/app.js');
await sleep(60);
const body = getEl('app-body');
const type = async (el, value) => { el.value = value; await fire(body, 'input', el); await sleep(0); };
const goMonth = async id => { getEl('monthSelect').value = id; await fire(body, 'change', getEl('monthSelect')); };
await goMonth('2026-11');

// Пояснення до відпускних
const hint = getEl('urlopHint'), vac = getEl('vacationDays');
assert.ok(!hint.open && !store.has('hint_urlop_seen'));
await goMonth('2026-09');                                     // збережений місяць із відпусткою — це не введення
assert.equal(vac.value, '4'); assert.ok(!hint.open && !store.has('hint_urlop_seen'), 'відкриття місяця не розгортає й не позначає');
await goMonth('2026-11');
await type(vac, '1');
assert.equal(hint.open, true, 'перше введення — розгорнута'); assert.equal(store.get('hint_urlop_seen'), '1');
await type(vac, '12');
assert.equal(hint.open, true, 'друга цифра не згортає');
await type(vac, '');
assert.equal(hint.open, false, 'поле зникло — згорнута');
await type(vac, '3');
assert.equal(hint.open, false, 'наступного разу згорнута');
hint.open = true; await type(vac, '5');
assert.equal(hint.open, true, 'розгорнуту дотиком не згортаємо під час введення');
await goMonth('2026-09');
assert.equal(hint.open, false, 'інший місяць — згорнута');

// Числові поля калькулятора — як раніше
const number = (id, value) => Object.assign(getEl(id), { tagName: 'INPUT', type: 'number', readOnly: false, value });
const touch = el => fire(body, 'focusin', el);
const leave = async el => { await fire(el, 'blur'); await fire(body, 'focusout', el); };
const eraseAndLeave = async el => { await touch(el); await type(el, '1'); await type(el, ''); await leave(el); };
await goMonth('2026-11');
const morning = number('morningShifts', '5');
await touch(morning); assert.equal(morning.value, ''); await leave(morning); assert.equal(morning.value, '5');
await eraseAndLeave(morning); assert.equal(morning.value, '', 'стерте числове поле лишається порожнім, без «0»');
const sched = number('scheduleDays', '15');
await eraseAndLeave(sched); assert.equal(sched.value, stateDaysFor('2026-11'), 'графік повертається до норми');
const base = number('baseSalary', '7000');
await eraseAndLeave(base); assert.equal(String(base.value), '5750', 'порожня ставка = ставка з профілю');
const blood = Object.assign(getEl('bloodBonus'), { tagName: 'INPUT', type: 'number', readOnly: true, value: '10' });
await touch(blood); assert.equal(blood.value, '10', 'поле лише для читання не очищається');
const mail = Object.assign(getEl('email'), { tagName: 'INPUT', type: 'email', value: 'a@b.c' });
await touch(mail); assert.equal(mail.value, 'a@b.c', 'непозначене текстове поле не очищається');

// Поле «Додаткове відрахування»
const ded = Object.assign(getEl('profExtraDeduction'), { tagName: 'INPUT', type: 'text', readOnly: false });
ded.setAttribute('data-clear-on-focus', '0'); ded.value = '36,70';
await touch(ded); assert.equal(ded.value, '', 'дотик — порожнє');
await leave(ded); assert.equal(ded.value, '36,70', 'вихід без введення — попереднє');
await eraseAndLeave(ded); assert.equal(ded.value, '0,00', 'стерли — 0,00');
await touch(ded); await type(ded, '50'); await leave(ded); assert.equal(ded.value, '50,00');

// Форматування й перевірка одразу при виході з поля, без «Зберегти профіль»
const dedError = getEl('profExtraDeductionError');
const errorShown = () => (dedError.classList.contains('hidden') ? '' : dedError.innerText);
const enter = async text => { await touch(ded); await type(ded, text); await fire(ded, 'input'); await fire(ded, 'change'); await leave(ded); };
for (const [typed, shown] of [['35.2', '35,20'], ['36,7', '36,70'], ['50', '50,00'], ['0', '0,00']]) {
  await enter(typed); assert.equal(ded.value, shown, typed); assert.equal(errorShown(), '');
}
assert.ok(!store.has('user_profile_guest'), 'профіль без натискання «Зберегти» не зберігається');
await enter('абв');
assert.equal(ded.value, 'абв', 'неправильний текст лишається'); assert.equal(errorShown(), dict.uk.errDeduction);
await touch(ded); await leave(ded);
assert.equal(ded.value, 'абв'); assert.equal(errorShown(), dict.uk.errDeduction, 'дотик без введення — як було');
await enter('10'); assert.equal(ded.value, '10,00'); assert.equal(errorShown(), '');
await enter('5000'); assert.equal(ded.value, '5000'); assert.equal(errorShown(), dict.uk.errDeductionMax);
await touch(ded); ded.value = '20'; await fire(ded, 'input');
assert.equal(errorShown(), '', 'повідомлення зникає, щойно сума правильна');
assert.equal(ded.value, '20', 'під час введення не форматуємо'); await leave(ded); assert.equal(ded.value, '20,00');
ded.value = '-1'; await fire(ded, 'change'); assert.equal(errorShown(), dict.uk.errDeduction, 'change без focusout теж перевіряє');
ded.value = '1.5'; await fire(ded, 'change'); assert.equal(ded.value, '1,50'); assert.equal(errorShown(), '');

// Поля мінімалки: рік поза календарем має поле; те саме правило очищення
const fields = () => findAll({ children: getEl('minWageFields').children }, n => n.tag === 'input');
assert.deepEqual(fields().map(f => [f.id, f.value]), [['minWage2031', '7000,00']], 'поле для збереженого року поза календарем');
const wage = Object.assign(fields()[0], { tagName: 'INPUT' });
assert.equal(wage.getAttribute('data-clear-on-focus'), '');
const own = async name => { for (const fn of wage.handlers[name] || []) await fn({ target: wage }); };
const leaveWage = async () => { await own('blur'); await fire(body, 'focusout', wage); };
await touch(wage); assert.equal(wage.value, ''); await leaveWage();
assert.equal(wage.value, '7000,00'); assert.equal(store.get('user_min_wages'), '{"2031":7000}', 'без введення нічого не змінюється');
await touch(wage); await type(wage, '7100.5'); await own('change'); await leaveWage();
assert.equal(wage.value, '7100,50', 'правильна сума — одразу з комою і двома знаками');
assert.equal(store.get('user_min_wages'), '{"2031":7100.5}', 'виправлення зберігається');
const wageError = findAll({ children: getEl('minWageFields').children }, n => n.tag === 'p')[0];
await touch(wage); await type(wage, '100'); await own('change'); await leaveWage();
assert.equal(wage.value, '100'); assert.deepEqual([wageError.className, wageError.textContent], ['field-error', dict.uk.errMinWage]);
assert.equal(store.get('user_min_wages'), '{"2031":7100.5}', 'неправильне не зберігається');
await touch(wage); wage.value = '7100'; await own('input');
assert.equal(wageError.className, 'field-error hidden', 'повідомлення зникає, щойно сума правильна');
await own('change'); await leaveWage(); assert.equal(wage.value, '7100,00');
await touch(wage); await type(wage, '7'); await type(wage, ''); await leaveWage();      // події change браузер тут не дає
assert.equal(wage.value, ''); assert.equal(store.get('user_min_wages'), '{}', 'стерли — суму видалено');
window.setLang('uk');
assert.equal(fields().length, 0, 'без збереженої суми поле поза календарем зникає');

// Примітка про округлення: за розбіжності в сумі рядків або в рядку перевірки
const month = '2026-11', profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
await goMonth(month);
await type(getEl('morningShifts'), '9'); await type(getEl('nightShifts'), '6'); await type(vac, '');
const found = {};
// повний і неповний графік (з неповним брутто має дробові гроші)
for (const sched of ['15', '17']) for (let salary = 4000; salary < 6000 && Object.keys(found).length < 3; salary++) {
  const record = { ...JSON.parse(store.get(`guest_month_${month}`)), baseSalary: String(salary), scheduleDays: sched };
  const inputs = inputsFromSaved(record, month, profile, { premium: false }), b = deductionsBreakdown(compute(inputs), inputs, 0);
  const kind = b.checkDiffers ? (b.roundingDiffers ? null : 'check') : (b.roundingDiffers ? 'rows' : 'none');
  if (kind) found[kind] ??= { salary, sched };
}
assert.deepEqual(Object.keys(found).sort(), ['check', 'none', 'rows'], 'знайдено всі три випадки');
const amount = s => Number(s.replace(/[^0-9-]/g, ''));
for (const [kind, { salary, sched }] of Object.entries(found)) {
  await type(getEl('scheduleDays'), sched); await type(getEl('baseSalary'), String(salary));
  const [gross, total, laundry, net] = getEl('dedCheckVal').innerText.split(/ [−+=] /).map(amount);
  assert.equal(gross - total + laundry !== net, kind === 'check', `${salary}: рядок перевірки (${kind})`);
  assert.equal(getEl('dedRoundNote').classList.contains('hidden'), kind === 'none', `${salary}: примітка (${kind})`);
}
const at = k => `ставка ${found[k].salary} / графік ${found[k].sched}`;
console.log(`  примітка: без розбіжності — ${at('none')}; лише в перевірці — ${at('check')}; лише в сумі рядків — ${at('rows')}`);

console.log('OK: UI (без дублікатів у підсумку, «i» відпускних, очищення й формат полів, примітка округлення, мінімалка поза календарем)');
process.exit(0);
