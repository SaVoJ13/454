/* Інтеграційний тест залогіненого сценарію: app.js + фейковий Firebase (через тестовий шов __salaryTest).
   Перевіряє: кеш місяця офлайн, збереження без мережі й із зависанням, очищення при виході, банер оновлення. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { installFakeDom, findAll, hasClass } from './fake-dom.mjs';
import { compute } from '../js/calc.js';
import { pitBaseOf, inputsFromSaved } from '../js/pit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Статичні перевірки скидання пароля: експорт із firebase.js і кнопка всередині форми входу (type=button — не відправляє форму)
assert.ok(/sendPasswordResetEmail/.test(readFileSync(join(root, 'js/firebase.js'), 'utf8')), 'firebase.js не експортує sendPasswordResetEmail');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const formHtml = html.slice(html.indexOf('<form id="auth-form"'), html.indexOf('</form>'));
assert.ok(/<button type="button" id="btn-reset-password"/.test(formHtml), '«Забули пароль?» має бути type="button" усередині форми входу');

const { getEl, fire, fireWindow, store } = installFakeDom();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
const toast = () => getEl('toast').innerText;

// ---- фейковий Firebase ----
const cloud = new Map();                 // path -> дані
const calls = { setDoc: [] };
let getDocMode = 'ok', setDocMode = 'ok', getDocsMode = 'ok';
const auth = { currentUser: null };
const resets = []; let resetMode = 'ok';
let authCb = null;
const stub = {
  auth, db: {},
  signInWithEmailAndPassword: async () => {}, createUserWithEmailAndPassword: async () => {},
  sendPasswordResetEmail: async (a, email) => {
    resets.push({ email, lang: a.languageCode });
    if (resetMode !== 'ok') throw Object.assign(new Error(resetMode), { code: resetMode });
  },
  signOut: async a => { a.currentUser = null; await authCb(null); },
  onAuthStateChanged: (_a, cb) => { authCb = cb; },
  doc: (_db, ...p) => ({ path: p.join('/') }),
  collection: (_db, ...p) => ({ path: p.join('/') }),
  getDoc: async ref => {
    if (getDocMode === 'fail') throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    const d = cloud.get(ref.path); return { exists: () => !!d, data: () => d };
  },
  setDoc: async (ref, data) => {
    calls.setDoc.push({ path: ref.path, data });
    if (setDocMode === 'hang') return new Promise(() => {});
    cloud.set(ref.path, data);
  },
  getDocs: async ref => {
    if (getDocsMode === 'fail') throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    return {
      forEach(cb) { for (const [p, d] of cloud) if (p.startsWith(ref.path + '/')) cb({ id: p.slice(ref.path.length + 1), data: () => d }); }
    };
  }
};
globalThis.__salaryTest = { cloudLoader: async () => stub, saveTimeoutMs: 60, resetCooldownMs: 120 };
console.warn = () => {};

await import('../js/app.js');
await sleep(100);
assert.ok(authCb, 'застосунок має підписатися на onAuthStateChanged після завантаження хмари');

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
await wait(150); resetMode = 'auth/user-not-found'; getEl('toast').innerText = '';
await fire(resetBtn, 'click');
assert.equal(resets.length, 2); assert.equal(toast(), dict.uk.toastResetSent, 'user-not-found не має відрізнятися від успіху');
// 0e. Помилки Firebase → зрозумілі повідомлення; після помилки паузи немає
await wait(150);
for (const [code, key] of [['auth/invalid-email', 'errInvalidEmail'], ['auth/too-many-requests', 'errTooMany'], ['auth/network-request-failed', 'errNetwork']]) {
  resetMode = code; getEl('toast').innerText = '';
  await fire(resetBtn, 'click');
  assert.equal(toast(), dict.uk.toastResetErr + dict.uk[key], `${code}: очікувалось локалізоване повідомлення`);
  assert.equal(resetBtn.disabled, false);
}
assert.equal(resets.length, 5, 'після помилок повторна спроба одразу дозволена');
// 0f. Мова листа слідує за мовою інтерфейсу
resetMode = 'ok'; await wait(150);
getEl('langSelect').value = 'pl'; await fire(getEl('langSelect'), 'change');
await fire(resetBtn, 'click');
assert.equal(resets.at(-1).lang, 'pl'); assert.equal(toast(), dict.pl.toastResetSent);
getEl('langSelect').value = 'uk'; await fire(getEl('langSelect'), 'change');
emailEl.value = '';

const month = getEl('monthSelect').value;
const monthPath = `users/u1/months/${month}`;
const cacheKey = `cloud_month_u1_${month}`;

// 1. Вхід: місяць з хмари заповнює поля і потрапляє в локальну копію
cloud.set(monthPath, { baseSalary: '6100', morningShifts: '10', nightShifts: '4' });
auth.currentUser = { uid: 'u1', email: 'user@example.com' };
await authCb(auth.currentUser);
assert.equal(getEl('morningShifts').value, '10', 'поля заповнені з хмари');
assert.ok(store.has(cacheKey), 'після успішного завантаження є локальна копія місяця');
assert.equal(JSON.parse(store.get(cacheKey)).data.morningShifts, '10');

// 2. Хмара недоступна: показується копія з повідомленням (а не порожні поля)
getDocMode = 'fail';
getEl('morningShifts').value = '0';
getEl('toast').innerText = '';
await fire(getEl('btn-sync-down'), 'click');
assert.equal(getEl('morningShifts').value, '10', 'при збої хмари поля беруться з локальної копії');
assert.ok(toast().startsWith(dict.uk.toastLoadCached), `очікувався тост про копію, а не "${toast()}"`);

// 2b. Без мережі (navigator.onLine=false) — те саме, без очікування таймауту Firestore
navigator.onLine = false; getDocMode = 'ok';
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
navigator.onLine = true; setDocMode = 'hang'; getEl('toast').innerText = '';
await fire(getEl('btn-sync-up-calc'), 'click');
assert.equal(toast(), dict.uk.toastSaveOffline, 'зависання запису не має мовчки блокувати кнопку');
assert.equal(getEl('btn-sync-up-calc').disabled, false);
assert.equal(calls.setDoc.length, 1);

// 4. Звичайне збереження: запис у правильний шлях + оновлена локальна копія
setDocMode = 'ok'; calls.setDoc.length = 0; getEl('morningShifts').value = '12'; getEl('toast').innerText = '';
await fire(getEl('btn-sync-up-info'), 'click');
assert.equal(calls.setDoc.length, 1);
assert.equal(calls.setDoc[0].path, monthPath);
assert.equal(calls.setDoc[0].data.morningShifts, '12');
assert.equal(toast(), dict.uk.toastSaveCloud);
assert.equal(JSON.parse(store.get(cacheKey)).data.morningShifts, '12', 'копія оновлена після збереження');

// 4b. Поріг PIT 120 000: накопичена база береться з місяців року, збережених у хмарі
const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
const money = v => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v);
const seed = { baseSalary: '10500', morningShifts: '16', nightShifts: '4', scheduleDays: '20', bonusPctSelect: '10', presencePctSelect: '5' };
for (let j = 1; j <= 12; j++) cloud.set(`users/u1/months/2026-${String(j).padStart(2, '0')}`, { ...seed });
await authCb(auth.currentUser);                          // повторний вхід скидає кеш списку місяців
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
navigator.onLine = false; getDocsMode = 'fail';
await authCb(auth.currentUser);                          // скидає кеш списку місяців в пам'яті
await selectMonth('2026-12');
assert.equal(getEl('netResult').innerText, money(resDec.net - expectedExtra), 'офлайн: поріг PIT враховано за локальними копіями');
assert.equal(getEl('rowPitExtra').classList.contains('hidden'), false);
// статистика без мережі: хмара недоступна — місяці беруться з локальних копій
window.switchPage(3); await sleep(80);
{ const yr = () => Number(getEl('statsYear').textContent);
  for (let i = 0; i < 6 && yr() !== 2026; i++) { await fire(getEl(yr() > 2026 ? 'btn-year-prev' : 'btn-year-next'), 'click'); await sleep(50); } }
assert.equal(getEl('statsCountVal').textContent, '12 / 12', 'офлайн: вкладка «Рік» бере місяці з локальних копій');
window.switchPage(1);
navigator.onLine = true; getDocsMode = 'ok';

// 4f. Вкладка «Рік» (акаунт): netto місяця в статистиці = netto в калькуляторі, зокрема з порогом PIT у грудні
window.switchPage(3); await sleep(80);
const statsYearNum = () => Number(getEl('statsYear').textContent);
for (let i = 0; i < 6 && statsYearNum() !== 2026; i++) { await fire(getEl(statsYearNum() > 2026 ? 'btn-year-prev' : 'btn-year-next'), 'click'); await sleep(50); }
assert.equal(statsYearNum(), 2026, 'до 2026 року можна дійти кнопками року');
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

// 5. Вихід: копія місяців і профіль акаунта прибрані, гостьові дані лишаються
store.set('user_profile_u1', '{"baseSalary":6100}');
store.set('guest_month_2026-01', '{"baseSalary":"5000"}');
await fire(getEl('btn-logout'), 'click');
assert.ok(![...store.keys()].some(k => k.startsWith('cloud_month_u1_')), 'копії місяців акаунта видалені');
assert.ok(!store.has('user_profile_u1'), 'локальна копія профілю акаунта видалена');
assert.ok(store.has('guest_month_2026-01'), 'гостьові дані не чіпаємо');
assert.equal(getEl('rowPitYtd').classList.contains('hidden'), true, 'після виходу рядки порога PIT сховані (у гостя їх немає)');
await sleep(80);
assert.equal(getEl('statsCountVal').textContent, '1 / 12', 'після виходу вкладка «Рік» показує дані гостя, а не акаунта');
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

console.log('OK: хмара (скидання пароля, кеш офлайн, збереження без мережі й зі зависанням, вихід, банер оновлення)');
process.exit(0);
