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
const { getEl, fire, store } = installFakeDom();
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
assert.deepEqual(active(), ['viewStats'], 'сторінка 3 — «Рік»');
window.switchPage(4); assert.deepEqual(active(), ['viewProfile'], 'сторінка 4 — «Профіль»');
window.switchPage(5); assert.deepEqual(active(), ['viewSettings'], 'сторінка 5 — «Параметри»');
window.switchPage(2); assert.deepEqual(active(), ['page2']);
window.switchPage(3); await tick(60);
const rJan = compute(inputsFromSaved(jan, '2026-01', gProfile, { premium: false })), rFeb = compute(inputsFromSaved(feb, '2026-02', gProfile, { premium: false }));
const names = dict.uk.monthNames;
assert.equal(getEl('statsYear').textContent, '2026', 'за замовчуванням — рік, у якому є дані');
assert.equal(getEl('statsEmpty').classList.contains('hidden'), true); assert.equal(getEl('statsBody').classList.contains('hidden'), false);
assert.equal(getEl('btn-year-prev').disabled, true, 'раніше 2026 даних немає');
assert.equal(findAll(getEl('incomeChart'), n => hasClass(n, 'bar-net')).length, 2, 'стовпчики лише для двох збережених місяців');
assert.equal(getEl('statsGrossVal').textContent, money(rJan.gross + rFeb.gross));
assert.equal(getEl('statsNetVal').textContent, money(rJan.net + rFeb.net), 'гість: netto без порогу PIT і без PRO-полів');
assert.equal(getEl('statsAvgVal').textContent, money((rJan.net + rFeb.net) / 2));
assert.equal(getEl('statsBestVal').textContent, `${names[1]} · ${money(rFeb.net)}`, 'найвище нетто — лютий');
assert.equal(getEl('statsCountVal').textContent, '2 / 12');
assert.equal(getEl('statsPick').textContent, dict.uk.statsPickHint);
// структура змін: 10+10 звичайних, 4+4 нічних, 2 надгодини; відпустку гостя не враховано
assert.equal(findAll(getEl('mixChart'), n => hasClass(n, 'center-num'))[0].textContent, '30');
assert.equal(getEl('mixLegend').children.length, 3);
// дотик до лютого показує суми цього місяця
findAll(getEl('incomeChart'), n => hasClass(n, 'hit'))[1].handlers.click[0]();
assert.equal(getEl('statsPick').textContent, `${names[1]}: ${dict.uk.statsGross} ${money(rFeb.gross)} · ${dict.uk.statsNet} ${money(rFeb.net)}`);
assert.equal(findAll(getEl('incomeChart'), n => hasClass(n, 'bar-group') && hasClass(n, 'sel')).length, 1, 'вибраний місяць підсвічено');
// зміна мови перемальовує підписи
getEl('langSelect').value = 'pl'; await fire(getEl('langSelect'), 'change');
assert.equal(getEl('statsPick').textContent, `${dict.pl.monthNames[1]}: ${dict.pl.statsGross} ${money(rFeb.gross)} · ${dict.pl.statsNet} ${money(rFeb.net)}`);
assert.deepEqual(findAll(getEl('incomeChart'), n => hasClass(n, 'axis') && n.attrs['text-anchor'] === 'middle').map(n => n.textContent), dict.pl.monthNames.map(n => n.slice(0, 3)));
getEl('langSelect').value = 'uk'; await fire(getEl('langSelect'), 'change');
// порожній стан: даних немає — повідомлення замість графіків
store.delete('guest_month_2026-01'); store.delete('guest_month_2026-02');
window.switchPage(3); await tick(60);
assert.equal(getEl('statsEmpty').classList.contains('hidden'), false, 'без даних показується підказка');
assert.equal(getEl('statsBody').classList.contains('hidden'), true);
window.switchPage(1);

console.warn = originalWarn;
console.log('OK: офлайн-старт — гостьовий калькулятор працює, хмара вимкнена');
process.exit(0);
