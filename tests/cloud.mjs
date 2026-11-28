/* Інтеграційний тест залогіненого сценарію: app.js + фейковий Firebase (через тестовий шов __salaryTest).
   Перевіряє: кеш місяця офлайн, збереження без мережі й із зависанням, очищення при виході, банер оновлення. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installFakeDom, findAll, hasClass } from './fake-dom.mjs';
import { fakeCloud } from './fake-cloud.mjs';
import { compute } from '../js/calc.js';
import { pitBaseOf, inputsFromSaved } from '../js/pit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Статичні перевірки скидання пароля: експорт із firebase.js і кнопка всередині форми входу (type=button — не відправляє форму)
assert.ok(/sendPasswordResetEmail/.test(readFileSync(join(root, 'js/firebase.js'), 'utf8')), 'firebase.js не експортує sendPasswordResetEmail');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const formHtml = html.slice(html.indexOf('<form id="loginForm"'), html.indexOf('</form>'));
assert.ok(/<button type="button" id="btn-reset-password"/.test(formHtml), '«Забули пароль?» має бути type="button" усередині форми входу');

const { getEl, fire, fireWindow, store } = installFakeDom({ groups: { '#periodPills .pill': ['pill3', 'pill6', 'pill12', 'pillYears'] } });
['3', '6', '12', 'years'].forEach((m, i) => { getEl(['pill3', 'pill6', 'pill12', 'pillYears'][i]).dataset.mode = m; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
const toast = () => getEl('toast').innerText;

// ---- фейковий Firebase (tests/fake-cloud.mjs: окремий вхід на кожен appName, доступ за uid) ----
const fc = fakeCloud({ accounts: { 'user@example.com': 'u1' } });
const cloud = fc.docs, calls = fc.calls, resets = fc.calls.reset;
const APP = 'p_default';                                   // екземпляр Firebase профілю 'default'
globalThis.__salaryTest = { cloudLoader: async () => fc.stub, saveTimeoutMs: 60, resetCooldownMs: 120,
  now: new Date(2026, 11, 15, 12).getTime() };   // «сьогодні» для статистики: грудень 2026 (поточний місяць, у якому перетинається поріг PIT)
console.warn = () => {};

await import('../js/app.js');
await sleep(100);
assert.equal(fc.auth('[DEFAULT]').listeners.length, 1, 'застосунок має підписатися на onAuthStateChanged після завантаження хмари');

// 0. Скидання пароля (до входу в акаунт)
const resetBtn = getEl('btn-reset-password');
const emailEl = getEl('email');
const wait = ms => sleep(ms);
// 0a. Порожній email: підказка, жодного запиту
emailEl.value = ''; getEl('toast').innerText = '';
await fire(resetBtn, 'click');
assert.equal(toast(), dict.uk.toastResetNeedEmail); assert.equal(resets.length, 0);
// 0b. Успіх: email обрізано від пробілів, мова листа = мова інтерфейсу, кнопка розблокована
emailEl.value = '  user@example.com  ';
await fire(resetBtn, 'click');
assert.equal(resets.length, 1); assert.equal(resets[0].email, 'user@example.com'); assert.equal(resets[0].lang, 'uk');
assert.equal(toast(), dict.uk.toastResetSent); assert.equal(resetBtn.disabled, false);
// 0c. Повторне натискання одразу: пауза, другого запиту немає
await fire(resetBtn, 'click');
assert.equal(resets.length, 1, 'у період паузи другого листа не надсилаємо');
assert.ok(toast().startsWith(dict.uk.toastResetWait.split('{n}')[0]), `очікувалось повідомлення про паузу, а не "${toast()}"`);
// 0d. Акаунта не існує: відповідь та сама (не розкриваємо, які email зареєстровані)
await wait(150); fc.mode.reset = 'auth/user-not-found'; getEl('toast').innerText = '';
await fire(resetBtn, 'click');
assert.equal(resets.length, 2); assert.equal(toast(), dict.uk.toastResetSent, 'user-not-found не має відрізнятися від успіху');
// 0e. Помилки Firebase → зрозумілі повідомлення; після помилки паузи немає
await wait(150);
for (const [code, key] of [['auth/invalid-email', 'errInvalidEmail'], ['auth/too-many-requests', 'errTooMany'], ['auth/network-request-failed', 'errNetwork']]) {
  fc.mode.reset = code; getEl('toast').innerText = '';
  await fire(resetBtn, 'click');
  assert.equal(toast(), dict.uk.toastResetErr + dict.uk[key], `${code}: очікувалось локалізоване повідомлення`);
  assert.equal(resetBtn.disabled, false);
}
assert.equal(resets.length, 5, 'після помилок повторна спроба одразу дозволена');
// 0f. Мова листа слідує за мовою інтерфейсу
fc.mode.reset = 'ok'; await wait(150);
await fire(getEl('langPl'), 'click');
await fire(resetBtn, 'click');
assert.equal(resets.at(-1).lang, 'pl'); assert.equal(toast(), dict.pl.toastResetSent);
await fire(getEl('langUk'), 'click');
emailEl.value = '';

const month = getEl('monthSelect').value;
const monthPath = `users/u1/months/${month}`;
const cacheKey = `cloud_month_u1_${month}`;

// 0g. Без входу: іконка хмари — звичайна; на порожньому сховищі — перший запуск
const cloudIcon = () => getEl('btn-cloud').attrs['data-state'];
const body = getEl('app-body');
assert.equal(cloudIcon(), 'out', 'немає входу — звичайна хмара');
assert.equal(body.classList.contains('first-run'), true, 'порожнє сховище — екран «Вітаємо!»');
assert.equal(getEl('viewProfile').classList.contains('active'), true);
assert.equal(getEl('auth-container').classList.contains('hidden'), false, 'у панелі хмари — форма входу');
assert.equal(getEl('cloudSheet').attrs['aria-labelledby'], 'cloudOutTitle');

// 1. Вхід (з першого запуску, через панель хмари): місяць з хмари заповнює поля і потрапляє в локальну копію
await fire(getEl('btn-cloud'), 'click');
assert.equal(getEl('cloudSheet').classList.contains('hidden'), false, 'кнопка хмари відкриває панель');
cloud.set(monthPath, { baseSalary: '6100', morningShifts: '10', nightShifts: '4' });
getEl('email').value = 'user@example.com'; getEl('password').value = 'secret-123';
await getEl('loginForm').handlers.submit[0]({ preventDefault() {} }); await sleep(60);
assert.deepEqual(fc.calls.signIn.map(c => c.appName), [APP], 'вхід — в екземпляр профілю');
assert.equal(body.classList.contains('first-run'), false, 'вхід закриває перший запуск');
assert.equal(getEl('page1').classList.contains('active'), true, 'після входу — «Розрахунок»');
assert.deepEqual(JSON.parse(store.get('profiles_v1')).list.map(p => [p.id, p.name, p.cloud]), [['default', 'user', { uid: 'u1', email: 'user@example.com', appName: APP }]], 'перший запуск: профіль акаунта з назвою з email');
assert.equal(fc.calls.setDoc.length, 0, 'вхід на наявний акаунт нічого не пише в хмару');
assert.equal(cloudIcon(), 'ok', 'вхід і синхронізація — хмара з галочкою');
assert.equal(getEl('auth-container').classList.contains('hidden'), true); assert.equal(getEl('sync-container').classList.contains('hidden'), false);
assert.equal(getEl('cloudSheet').attrs['aria-labelledby'], 'cloudInTitle');
assert.equal(getEl('user-email-display').innerText, 'user@example.com', 'у панелі — email акаунта');
assert.ok(getEl('cloudSyncState').textContent.startsWith(dict.uk.cloudSynced.split('{time}')[0]), `стан «Синхронізовано …», а не "${getEl('cloudSyncState').textContent}"`);
assert.match(getEl('cloudSyncState').textContent, /\d{2}:\d{2}$/, 'з часом');
assert.equal(window.salaryBack(), true, '«Назад» закриває панель'); assert.equal(getEl('cloudSheet').classList.contains('hidden'), true);
assert.equal(getEl('morningShifts').value, '10', 'поля заповнені з хмари');
// акаунт без профілю в хмарі й без локальної копії: відрахування 0
assert.equal(getEl('profExtraDeduction').value, '0,00', 'акаунт без збереженого профілю — відрахування 0');
assert.equal(getEl('netResult').innerText, new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
  .format(compute(inputsFromSaved(cloud.get(monthPath), month, { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'no', extraDeduction: 0 })).net), 'netto без відрахування');
assert.ok(store.has(cacheKey), 'після успішного завантаження є локальна копія місяця');
assert.equal(JSON.parse(store.get(cacheKey)).data.morningShifts, '10');

// 2. Хмара недоступна: показується копія з повідомленням (а не порожні поля)
fc.mode.getDoc = 'fail';
getEl('morningShifts').value = '0';
getEl('toast').innerText = '';
await fire(getEl('btn-sync-down'), 'click');
assert.equal(getEl('morningShifts').value, '10', 'при збої хмари поля беруться з локальної копії');
assert.ok(toast().startsWith(dict.uk.toastLoadCached), `очікувався тост про копію, а не "${toast()}"`);
assert.equal(cloudIcon(), 'off', 'помилка синхронізації — хмара з косою рискою');
assert.equal(getEl('cloudSyncState').textContent, dict.uk.cloudNoConn);

// 2b. Без мережі (navigator.onLine=false) — те саме, без очікування таймауту Firestore
navigator.onLine = false; fc.mode.getDoc = 'ok';
getEl('morningShifts').value = '0'; getEl('toast').innerText = '';
await fire(getEl('btn-sync-down'), 'click');
assert.equal(getEl('morningShifts').value, '10', 'офлайн: поля з локальної копії');
assert.ok(toast().startsWith(dict.uk.toastLoadCached));

// 3. Збереження без мережі: setDoc не викликається, кнопка не лишається заблокованою
calls.setDoc.length = 0; getEl('toast').innerText = '';
await fire(getEl('btn-sync-up-calc'), 'click');
assert.equal(calls.setDoc.length, 0, 'без мережі setDoc не має викликатись');
assert.equal(toast(), dict.uk.toastSaveOffline);
assert.equal(getEl('btn-sync-up-calc').disabled, false);

// 3b. Мережа «є», але запис висне: таймаут → повідомлення, кнопка розблокована
navigator.onLine = true; fc.mode.setDoc = 'hang'; getEl('toast').innerText = '';
await fire(getEl('btn-sync-up-calc'), 'click');
assert.equal(toast(), dict.uk.toastSaveOffline, 'зависання запису не має мовчки блокувати кнопку');
assert.equal(getEl('btn-sync-up-calc').disabled, false);
assert.equal(calls.setDoc.length, 1);

// 4. Звичайне збереження: запис у правильний шлях + оновлена локальна копія
fc.mode.setDoc = 'ok'; calls.setDoc.length = 0; getEl('morningShifts').value = '12'; getEl('toast').innerText = '';
await fire(getEl('btn-sync-up-info'), 'click');
assert.equal(calls.setDoc.length, 1);
assert.equal(calls.setDoc[0].path, monthPath);
assert.equal(calls.setDoc[0].data.morningShifts, '12');
assert.equal(toast(), dict.uk.toastSaveCloud);
assert.equal(JSON.parse(store.get(cacheKey)).data.morningShifts, '12', 'копія оновлена після збереження');
assert.equal(cloudIcon(), 'ok', 'успішне збереження — знову хмара з галочкою');
navigator.onLine = false; assert.equal((await fireWindow('offline'), cloudIcon()), 'off', 'мережа зникла — коса риска');
navigator.onLine = true; await fireWindow('online'); assert.equal(cloudIcon(), 'ok', 'мережа повернулась');

// 4b. Поріг PIT 120 000: накопичена база береться з місяців року, збережених у хмарі
const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const money = v => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v);
const seed = { baseSalary: '10500', morningShifts: '16', nightShifts: '4', scheduleDays: '20', bonusPctSelect: '10', presencePctSelect: '5' };
for (let j = 1; j <= 12; j++) cloud.set(`users/u1/months/2026-${String(j).padStart(2, '0')}`, { ...seed });
cloud.set('users/u1/profile/userProfile', { ...profile });   // далі — акаунт зі збереженим старим профілем (без extraDeduction)
await fc.emit(APP);                          // повторний вхід скидає кеш списку місяців
assert.equal(getEl('profExtraDeduction').value, '36,70', 'збережений старий профіль — як раніше');
const selectMonth = async id => { getEl('monthSelect').value = id; await fire(getEl('app-body'), 'change', getEl('monthSelect')); await sleep(80); };
await selectMonth('2026-12');
const dataOf = id => cloud.get(`users/u1/months/${id}`);
const ytdPrev = Array.from({ length: 11 }, (_, j) => `2026-${String(j + 1).padStart(2, '0')}`)
  .reduce((s, id) => s + pitBaseOf(compute(inputsFromSaved(dataOf(id), id, profile))), 0);
const resDec = compute(inputsFromSaved(dataOf('2026-12'), '2026-12', profile));
const baseDec = pitBaseOf(resDec);
assert.ok(ytdPrev < 120000 && ytdPrev + baseDec > 120000, `передумова: у грудні перетинається поріг (${ytdPrev} + ${baseDec})`);
// очікуване — окрема арифметика: 12% з частини під порогом, 32% з надлишку, мінус 300 (проти звичайних 12%)
const below = 120000 - ytdPrev, above = baseDec - below;
const expectedExtra = Math.round(below * 0.12 + above * 0.32 - 300) - Math.round(baseDec * 0.12 - 300);
assert.ok(expectedExtra > 500, 'додатковий податок має бути відчутним');
assert.equal(getEl('netResult').innerText, money(resDec.net - expectedExtra), 'netto зменшене на додатковий PIT');
assert.equal(getEl('infoTotalNetto').innerText, money(resDec.net - expectedExtra));
assert.equal(getEl('infoPitExtraVal').innerText, money(expectedExtra));
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), false, 'рядок «PIT 32%» показано');
assert.equal(getEl('infoPitYtdVal').innerText, money(ytdPrev + baseDec), 'накопичена база PIT показана');
assert.equal(getEl('pitYtdNote').classList.contains('hidden'), true, 'усі 11 місяців збережені — попередження немає');

// 4b2. Застарілий накопичений дохід іншого місяця не застосовується: місяць змінено, а завантаження ще не завершилось
getEl('monthSelect').value = '2026-11';
await fire(getEl('app-body'), 'input', getEl('morningShifts'));      // перерахунок без перезавантаження накопичення
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), true, 'накопичення грудня не має впливати на листопад');
assert.equal(getEl('rowPitYtd').classList.contains('hidden'), true);

// 4c. Нижче порога (листопад: накопичено лише 10 місяців) — netto без змін проти compute(), рядка «PIT 32%» немає
await selectMonth('2026-11');
const resNov = compute(inputsFromSaved(dataOf('2026-11'), '2026-11', profile));
assert.equal(getEl('netResult').innerText, money(resNov.net), 'нижче порога результат такий самий, як у compute()');
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), true);

// 4d. Місяці року не збережені: поріг не вигадується, користувача попереджено
await selectMonth('2027-03');
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), true);
assert.equal(getEl('pitYtdNote').classList.contains('hidden'), false, 'є попередження про незбережені місяці');
assert.ok(getEl('pitYtdNote').innerText.includes('0') && getEl('pitYtdNote').innerText.includes('2'), `у попередженні мають бути числа 0 і 2: "${getEl('pitYtdNote').innerText}"`);

// 4e. Без мережі накопичена база береться з локальних копій місяців (хмара недоступна)
for (let j = 1; j <= 12; j++) {
  const id = `2026-${String(j).padStart(2, '0')}`;
  store.set(`cloud_month_u1_${id}`, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), data: { ...seed } }));
}
navigator.onLine = false; fc.mode.getDocs = 'fail';
await fc.emit(APP);                          // скидає кеш списку місяців в пам'яті
await selectMonth('2026-12');
assert.equal(getEl('netResult').innerText, money(resDec.net - expectedExtra), 'офлайн: поріг PIT враховано за локальними копіями');
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), false);
// статистика без мережі: хмара недоступна — місяці беруться з локальних копій
window.switchPage(3); await sleep(80);
assert.equal(getEl('statsCountVal').textContent, '12 / 12', 'офлайн: вкладка «Статистика» бере місяці з локальних копій (останні 12 місяців = 2026 рік)');
window.switchPage(1);
navigator.onLine = true; fc.mode.getDocs = 'ok';

// 4f. Вкладка «Статистика» (акаунт): netto місяця в статистиці = netto в калькуляторі, зокрема з порогом PIT у грудні
window.switchPage(3); await sleep(80);
assert.equal(getEl('periodRange').textContent, `${dict.uk.monthNames[0]} 2026 – ${dict.uk.monthNames[11]} 2026`, '12 місяців до грудня 2026 включно');
assert.equal(getEl('statsMissing').classList.contains('hidden'), true, 'усі 12 місяців збережено — списку відсутніх немає');
const monthsNames = dict.uk.monthNames;
const resOf = id => compute(inputsFromSaved(dataOf(id), id, profile));
const allIds = Array.from({ length: 12 }, (_, j) => `2026-${String(j + 1).padStart(2, '0')}`);
const sumNet = allIds.reduce((s, id) => s + resOf(id).net, 0) - expectedExtra;
assert.equal(getEl('statsCountVal').textContent, '12 / 12');
assert.equal(getEl('statsNetVal').textContent, money(sumNet), 'підсумок за рік враховує додатковий PIT понад 120 000');
assert.equal(getEl('statsGrossVal').textContent, money(allIds.reduce((s, id) => s + resOf(id).gross, 0)));
findAll(getEl('incomeChart'), n => hasClass(n, 'hit'))[11].handlers.click[0]();
assert.equal(getEl('statsPick').textContent, `${monthsNames[11]}: ${dict.uk.statsGross} ${money(resDec.gross)} · ${dict.uk.statsNet} ${money(resDec.net - expectedExtra)}`,
  'грудень: те саме netto, що показує калькулятор (з додатковим PIT)');
findAll(getEl('incomeChart'), n => hasClass(n, 'hit'))[0].handlers.click[0]();
assert.equal(getEl('statsPick').textContent, `${monthsNames[0]}: ${dict.uk.statsGross} ${money(resOf('2026-01').gross)} · ${dict.uk.statsNet} ${money(resOf('2026-01').net)}`, 'нижче порога — без додаткового податку');

// 4g. Майбутні місяці: якщо «сьогодні» 25.10.2026, листопад і грудень 2026 у статистику не входять
globalThis.__salaryTest.now = new Date(2026, 9, 25, 12).getTime();
await fire(getEl('pillYears'), 'click'); await sleep(80);
{ const octIds = Array.from({ length: 10 }, (_, j) => `2026-${String(j + 1).padStart(2, '0')}`);
  assert.equal(getEl('statsCountVal').textContent, '10 / 10', 'рік 2026 до жовтня включно: грудень (який є в хмарі) не рахується');
  assert.equal(getEl('statsNetVal').textContent, money(octIds.reduce((s, id) => s + resOf(id).net, 0)), 'без грудня немає й додаткового PIT');
  assert.equal(getEl('statsMissing').classList.contains('hidden'), true); }
await fire(getEl('pill12'), 'click'); await sleep(80);
assert.equal(getEl('statsCountVal').textContent, '10 / 12', 'вікно 12 місяців: листопад–грудень 2025 не збережені');
assert.deepEqual(getEl('statsMissingList').children.map(li => li.textContent), [`${monthsNames[10]} 2025`, `${monthsNames[11]} 2025`], 'у списку відсутніх лише минулі місяці');
globalThis.__salaryTest.now = new Date(2026, 11, 15, 12).getTime();

// 5. Вихід: місяці акаунта копіюються в сховище профілю (хмарна версія замінює локальну), копії акаунта прибираються
store.set('user_profile_u1', JSON.stringify(profile));
store.set('guest_month_2026-01', '{"baseSalary":"5000"}');
store.set('guest_month_2025-05', '{"baseSalary":"5100"}');
await fire(getEl('btn-cloud'), 'click');
await fire(getEl('btn-logout'), 'click'); await sleep(80);    // «Вийти з акаунта» — у панелі хмари
assert.deepEqual(fc.calls.signOut, [APP], 'вихід лише з екземпляра профілю');
assert.equal(cloudIcon(), 'out', 'після виходу — звичайна хмара');
assert.equal(getEl('auth-container').classList.contains('hidden'), false, 'панель знову показує вхід');
assert.equal(body.classList.contains('first-run'), false, 'профіль є — першого запуску немає');
await fire(getEl('cloudBackdrop'), 'click'); assert.equal(getEl('cloudSheet').classList.contains('hidden'), true, 'дотик до затемнення закриває панель');
assert.ok(![...store.keys()].some(k => k.startsWith('cloud_month_u1_')), 'копії місяців акаунта видалені');
assert.ok(!store.has('user_profile_u1'), 'локальна копія профілю акаунта видалена');
for (const id of allIds) assert.deepEqual(JSON.parse(store.get(`guest_month_${id}`)), dataOf(id), `${id}: місяць акаунта скопійовано в профіль`);
assert.equal(store.get('guest_month_2025-05'), '{"baseSalary":"5100"}', 'місяць, якого немає в хмарі, лишається');
assert.equal(JSON.parse(store.get('user_profile_guest')).extraDeduction, 36.7, 'налаштування акаунта — у профілі');
assert.equal(JSON.parse(store.get('profiles_v1')).list[0].cloud, undefined, 'профіль став локальним');
assert.equal(getEl('netResult').innerText, money(resDec.net - expectedExtra), 'після виходу ті самі числа, зокрема поріг PIT');
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), false);
window.switchPage(3); await sleep(80);
assert.equal(getEl('statsCountVal').textContent, '12 / 12', 'після виходу статистика — з локальних місяців профілю');
assert.equal(getEl('statsNetVal').textContent, money(sumNet));
window.switchPage(1);

// 6. Банер нової версії: подія від sw-register показує, «Пізніше» ховає, «Оновити» перезавантажує
const banner = getEl('update-banner'); banner.classList.add('hidden');
await fireWindow('salary:update-ready');
assert.equal(banner.classList.contains('hidden'), false, 'банер має з\'явитись');
await fire(getEl('btn-update-later'), 'click');
assert.equal(banner.classList.contains('hidden'), true, '«Пізніше» ховає банер');
await fireWindow('salary:update-ready');
assert.equal(banner.classList.contains('hidden'), false);
await fire(getEl('btn-update'), 'click');
assert.equal(location.reloads, 1, '«Оновити» перезавантажує сторінку');

console.log('OK: хмара (перший запуск закривається входом, іконка: без входу / синхронізовано / немає з’єднання, панель хмари, скидання пароля, кеш офлайн, збереження без мережі й зі зависанням, вихід, банер оновлення)');
process.exit(0);
