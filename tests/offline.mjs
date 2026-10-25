/* Офлайн-тест: app.js запускається на мінімальному фейковому DOM, а імпорт Firebase з CDN
   падає (Node не вміє https-модулі — так само, як браузер без мережі).
   Перевіряємо, що гостьовий калькулятор усе одно працює і хмарні кнопки дають тост. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installFakeDom, findAll, hasClass } from './fake-dom.mjs';
import { compute } from '../js/calc.js';
import { inputsFromSaved } from '../js/pit.js';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, '../js/app.js'), 'utf8');

// 1. Статична перевірка: жодного top-level await і статичного імпорту firebase.js
assert.ok(!/^(?:const|let|var)\s[^\n]*=\s*await\s/m.test(appSrc) && !/^await\s/m.test(appSrc), 'app.js не має top-level await');
assert.ok(!/^import[^\n]*firebase\.js/m.test(appSrc), 'app.js не має статично імпортувати firebase.js');

// 2. Фейковий DOM (спільний хелпер)
const { getEl, fire, store } = installFakeDom({ groups: { '#periodPills .pill': ['pill3', 'pill6', 'pill12', 'pillYears'] } });
['3', '6', '12', 'years'].forEach((m, i) => { getEl(['pill3', 'pill6', 'pill12', 'pillYears'][i]).dataset.mode = m; });
globalThis.__salaryTest = { now: new Date(2026, 9, 25, 12).getTime() };   // «сьогодні» для вкладки «Статистика»: 25.10.2026
const originalWarn = console.warn; console.warn = () => {};

globalThis.APP_VERSION = '9.9.9';   // у браузері його задає js/version.js
// 3. Запуск застосунку: модуль має завершитись без Firebase
await import('../js/app.js');
await new Promise(r => setTimeout(r, 100));

// 4. Гостьовий розрахунок відпрацював (база за замовчуванням 5750 → NETTO > 0)
const net = getEl('netResult').innerText, gross = getEl('grossResult').innerText;
assert.ok(net && !net.startsWith('0,00'), `NETTO має бути розраховано, а не "${net}"`);
assert.ok(gross && !gross.startsWith('0,00'), `BRUTTO має бути розраховано, а не "${gross}"`);

// 5. Кнопки хмари без мережі показують тост і не падають
const { dict } = await import('../js/i18n.js');
for (const id of ['btn-login', 'btn-register']) {
  getEl('toast').innerText = '';
  await fire(getEl(id), 'click');
  assert.equal(getEl('toast').innerText, dict.uk.toastOffline, `${id}: очікувався тост про офлайн`);
}

// 5b. Скидання пароля без мережі: спершу вимога email, потім повідомлення про недоступну хмару
getEl('email').value = ''; getEl('toast').innerText = '';
await fire(getEl('btn-reset-password'), 'click');
assert.equal(getEl('toast').innerText, dict.uk.toastResetNeedEmail, 'без email — підказка');
getEl('email').value = 'user@example.com';
await fire(getEl('btn-reset-password'), 'click');
assert.equal(getEl('toast').innerText, dict.uk.toastOffline, 'без хмари — повідомлення про офлайн');
getEl('email').value = '';

// 6. Очищення поля: торкнулись і вийшли — значення повертається; стерли свідомо — лишається порожнім
const body = getEl('app-body');
const field = getEl('morningShifts');
Object.assign(field, { tagName: 'INPUT', type: 'number', readOnly: false });

field.value = '5';
await fire(body, 'focusin', field);
assert.equal(field.value, '', 'при фокусі поле очищується');
await fire(body, 'focusout', field);
assert.equal(field.value, '5', 'без введення старе значення повертається');

field.value = '5';
await fire(body, 'focusin', field);
field.value = '3'; await fire(body, 'input', field);
field.value = '';  await fire(body, 'input', field);
await fire(body, 'focusout', field);
assert.equal(field.value, '', 'свідомо стерте значення не повертається');
assert.equal(JSON.parse(store.get(`guest_month_${getEl('monthSelect').value}`)).morningShifts, '', 'збережене значення збігається з екраном');

// 7. Порожня ставка після свідомого стирання = ставка з профілю
const base = getEl('baseSalary');
Object.assign(base, { tagName: 'INPUT', type: 'number', readOnly: false, value: '7000' });
await fire(body, 'focusin', base);
base.value = '1'; await fire(body, 'input', base);
base.value = '';  await fire(body, 'input', base);
await fire(body, 'focusout', base);
assert.equal(String(base.value), '5750', 'порожня ставка замінюється ставкою з профілю');

// 8. Вибір мови працює без inline onchange
const langSel = getEl('langSelect');
langSel.value = 'pl'; await fire(langSel, 'change');
assert.equal(document.documentElement.lang, 'pl', 'зміна мови через listener');
langSel.value = 'uk'; await fire(langSel, 'change');
assert.equal(document.documentElement.lang, 'uk');

// 9. Версія показується в шапці
assert.equal(getEl('appVersion').textContent, 'v9.9.9', 'версія в шапці');

// 10. Вкладка «Рік» (гість): статистика зі збережених місяців у localStorage
for (const k of [...store.keys()]) if (k.startsWith('guest_month_')) store.delete(k);
const money = v => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v);
const tick = ms => new Promise(r => setTimeout(r, ms));
const gProfile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const jan = { baseSalary: '6000', morningShifts: '10', nightShifts: '4', scheduleDays: '20', bonusPctSelect: '10', presencePctSelect: '5' };
const feb = { ...jan, baseSalary: '7000', overtimeDays: '2', vacationDays: '5' };     // відпустка гостю не враховується (PRO)
store.set('guest_month_2026-01', JSON.stringify(jan)); store.set('guest_month_2026-02', JSON.stringify(feb));
const active = () => ['page1', 'page2', 'viewStats', 'viewProfile', 'viewSettings'].filter(id => getEl(id).classList.contains('active'));
window.switchPage(3); await tick(60);
assert.deepEqual(active(), ['viewStats'], 'сторінка 3 — «Статистика»');
window.switchPage(4); assert.deepEqual(active(), ['viewProfile'], 'сторінка 4 — «Профіль»');
window.switchPage(5); assert.deepEqual(active(), ['viewSettings'], 'сторінка 5 — «Параметри»');
window.switchPage(2); assert.deepEqual(active(), ['page2']);
window.switchPage(3); await tick(60);
const rJan = compute(inputsFromSaved(jan, '2026-01', gProfile, { premium: false })), rFeb = compute(inputsFromSaved(feb, '2026-02', gProfile, { premium: false }));
const names = dict.uk.monthNames;
const pressed = () => ['pill3', 'pill6', 'pill12', 'pillYears'].filter(id => getEl(id).attrs['aria-pressed'] === 'true');
const bars = () => findAll(getEl('incomeChart'), n => hasClass(n, 'bar-net')).length;
const missingList = () => getEl('statsMissingList').children.map(li => li.textContent);
const hits = () => findAll(getEl('incomeChart'), n => hasClass(n, 'hit'));
const pickBtn = id => fire(getEl(id), 'click');
assert.deepEqual(pressed(), ['pill12'], 'за замовчуванням — останні 12 місяців');
assert.equal(getEl('yearPills').classList.contains('hidden'), true, 'роки показуються лише в режимі «Роки»');
assert.equal(getEl('periodRange').textContent, `${names[10]} 2025 – ${names[9]} 2026`, '12 місяців закінчуються поточним (жовтень 2026)');
assert.equal(getEl('statsEmpty').classList.contains('hidden'), true); assert.equal(getEl('statsBody').classList.contains('hidden'), false);
assert.equal(bars(), 2, 'стовпчики лише для двох збережених місяців');
assert.equal(hits().length, 12, 'у вікні 12 стовпчиків: листопад 2025 … жовтень 2026');
assert.equal(getEl('statsGrossVal').textContent, money(rJan.gross + rFeb.gross));
assert.equal(getEl('statsNetVal').textContent, money(rJan.net + rFeb.net), 'гість: netto без порогу PIT і без PRO-полів');
assert.equal(getEl('statsAvgVal').textContent, money((rJan.net + rFeb.net) / 2));
assert.equal(getEl('statsBestVal').textContent, `${names[1]} 2026 · ${money(rFeb.net)}`, 'найвище нетто — лютий (з роком: вікно охоплює два роки)');
assert.equal(getEl('statsCountVal').textContent, '2 / 12');
assert.equal(getEl('statsPick').textContent, dict.uk.statsPickHint);
// відсутні місяці: випадаючий список, лише минулі й поточний (грудня 2026 у ньому немає)
assert.equal(getEl('statsMissing').classList.contains('hidden'), false, 'є місяці без даних — список показано');
assert.deepEqual(missingList(), [names[10], names[11], ...[2, 3, 4, 5, 6, 7, 8, 9].map(m => names[m])].map((n, i) => `${n} ${i < 2 ? 2025 : 2026}`), 'листопад–грудень 2025 і березень–жовтень 2026');
assert.equal(getEl('statsMissingTitle').textContent, `${dict.uk.statsMissingN} 10`);
assert.ok(!missingList().some(x => x.includes(names[10] + ' 2026') || x.includes(names[11] + ' 2026')), 'майбутні місяці (листопад–грудень 2026) не пропонуються');
// структура змін: 10+10 звичайних, 4+4 нічних, 2 надгодини; відпустку гостя не враховано
assert.equal(findAll(getEl('mixChart'), n => hasClass(n, 'center-num'))[0].textContent, '30');
assert.equal(getEl('mixLegend').children.length, 3);
// дотик до лютого показує суми цього місяця (з роком, бо вікно охоплює два роки)
hits()[3].handlers.click[0]();
assert.equal(getEl('statsPick').textContent, `${names[1]} 2026: ${dict.uk.statsGross} ${money(rFeb.gross)} · ${dict.uk.statsNet} ${money(rFeb.net)}`);
assert.equal(findAll(getEl('incomeChart'), n => hasClass(n, 'bar-group') && hasClass(n, 'sel')).length, 1, 'вибраний місяць підсвічено');
// зміна мови перемальовує підписи
getEl('langSelect').value = 'pl'; await fire(getEl('langSelect'), 'change');
assert.equal(getEl('statsPick').textContent, `${dict.pl.monthNames[1]} 2026: ${dict.pl.statsGross} ${money(rFeb.gross)} · ${dict.pl.statsNet} ${money(rFeb.net)}`);
assert.equal(getEl('statsMissingTitle').textContent, `${dict.pl.statsMissingN} 10`, 'підпис списку відсутніх місяців перекладено');
getEl('langSelect').value = 'uk'; await fire(getEl('langSelect'), 'change');

// 3 місяці: серпень–жовтень 2026, даних немає → порожній стан, але список відсутніх показано
await pickBtn('pill3'); await tick(60);
assert.deepEqual(pressed(), ['pill3']);
assert.equal(getEl('periodRange').textContent, `${names[7]} 2026 – ${names[9]} 2026`);
assert.equal(getEl('statsEmpty').classList.contains('hidden'), false, 'у вікні немає даних — підказка');
assert.equal(getEl('statsBody').classList.contains('hidden'), true);
assert.deepEqual(missingList(), [7, 8, 9].map(m => `${names[m]} 2026`), 'бракує серпня, вересня й жовтня (поточний місяць входить)');
// 6 місяців: травень–жовтень, теж без даних; 12 місяців повертає розрахунок
await pickBtn('pill6'); await tick(60);
assert.equal(getEl('periodRange').textContent, `${names[4]} 2026 – ${names[9]} 2026`);
assert.equal(missingList().length, 6);
await pickBtn('pill12'); await tick(60);
assert.equal(getEl('statsCountVal').textContent, '2 / 12');

// Роки: за замовчуванням поточний рік (січень–жовтень, без листопада й грудня)
store.set('guest_month_2026-12', JSON.stringify(feb));                      // грудень 2026 — майбутній місяць: у статистику не потрапляє
store.set('guest_month_2025-12', JSON.stringify(jan));
await pickBtn('pillYears'); await tick(60);
assert.deepEqual(pressed(), ['pillYears']);
assert.equal(getEl('yearPills').classList.contains('hidden'), false);
assert.deepEqual(getEl('yearPills').children.map(b => b.textContent), ['2025', '2026'], 'роки з даними; майбутніх років немає');
assert.deepEqual(getEl('yearPills').children.map(b => b.attrs['aria-pressed']), ['false', 'true']);
assert.equal(getEl('periodRange').textContent, `${names[0]} 2026 – ${names[9]} 2026`);
assert.equal(getEl('statsCountVal').textContent, '2 / 10', 'грудень 2026 не рахується: максимум — поточний місяць');
assert.equal(getEl('statsNetVal').textContent, money(rJan.net + rFeb.net));
assert.equal(missingList().length, 8, 'березень–жовтень 2026');
hits()[1].handlers.click[0]();
assert.equal(getEl('statsPick').textContent, `${names[1]}: ${dict.uk.statsGross} ${money(rFeb.gross)} · ${dict.uk.statsNet} ${money(rFeb.net)}`, 'один рік — без року в підписі');
// додаємо 2025: два роки → по стовпчику на рік (середнє на місяць)
await fire(getEl('yearPills').children[0], 'click'); await tick(60);
assert.deepEqual(getEl('yearPills').children.map(b => b.attrs['aria-pressed']), ['true', 'true']);
assert.equal(getEl('periodRange').textContent, `${names[0]} 2025 – ${names[9]} 2026`);
assert.equal(getEl('statsCountVal').textContent, '3 / 22', '12 місяців 2025 + 10 місяців 2026');
assert.equal(hits().length, 2, 'два роки — два стовпчики');
assert.equal(getEl('statsIncomeTitle').textContent, dict.uk.statsIncomeYears);
const rJan25 = compute(inputsFromSaved(jan, '2025-12', gProfile, { premium: false }));
hits()[0].handlers.click[0]();
assert.equal(getEl('statsPick').textContent, `2025: ${dict.uk.statsPerMonth}: ${dict.uk.statsGross} ${money(rJan25.gross)} · ${dict.uk.statsNet} ${money(rJan25.net)} (1 / 12 ${dict.uk.statsMonthsShort})`);
// останній вибраний рік зняти не можна
await fire(getEl('yearPills').children[0], 'click'); await tick(60);
await fire(getEl('yearPills').children[1], 'click'); await tick(60);
assert.deepEqual(getEl('yearPills').children.map(b => b.attrs['aria-pressed']), ['false', 'true'], 'зняли 2025; спроба зняти і 2026 ігнорується: лишається хоча б один рік');
getEl('langSelect').value = 'uk'; await fire(getEl('langSelect'), 'change');

// порожній стан: даних немає — повідомлення замість графіків
for (const k of [...store.keys()]) if (k.startsWith('guest_month_')) store.delete(k);
window.switchPage(2); window.switchPage(3); await tick(60);
assert.equal(getEl('statsEmpty').classList.contains('hidden'), false, 'без даних показується підказка');
assert.equal(getEl('statsBody').classList.contains('hidden'), true);
window.switchPage(1);

console.warn = originalWarn;
console.log('OK: офлайн-старт — гостьовий калькулятор працює, хмара вимкнена');
process.exit(0);
