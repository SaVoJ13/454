/* Новий вигляд 1.20.0 (і 1.20.1: повзунки нічної зміни, поля 16 px, відрахування 0 у новому профілі): шапка (праворуч лише кнопка хмари), «Вигляд» у «Параметрах» (мова, темна тема), панель хмари
   (відкриття / закриття, фокус, «Назад»), перший запуск (лише на порожньому сховищі), компактний масштаб у CSS.
   Математика не змінюється: числа перевіряють інші тести, а math-lock — заморожені файли. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { installFakeDom } from './fake-dom.mjs';
import { isFirstRun, hasLocalProfileData, PROFILES_KEY, DEFAULT_ID } from '../js/profiles.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html'), css = read('css/styles.css'), app = read('js/app.js');

// ---------- 1. Розмітка ----------
const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
const nav = header.slice(header.indexOf('<nav'), header.indexOf('</nav>'));
const outsideNav = header.replace(nav, '');
assert.equal((outsideNav.match(/<button\b/g) || []).length, 1, 'у шапці (поза меню вкладок) — одна кнопка');
assert.ok(/<button type="button" class="icon-btn cloud-btn" id="btn-cloud"[^>]*data-i18n-aria="ariaCloud" aria-label="Зберігання в хмарі"/.test(outsideNav), 'це кнопка хмари з aria-label');
for (const gone of ['data-lang=', 'btn-theme', 'i-moon', 'data-page="4"']) assert.ok(!outsideNav.includes(gone), `у шапці немає ${gone}`);
for (const s of ['i-cloud', 'i-cloud-ok', 'i-cloud-off']) assert.ok(outsideNav.includes(`href="#${s}"`) && html.includes(`<symbol id="${s}"`), `іконка ${s}`);
assert.ok(!/id="langSelect"|id="themeSelect"/.test(html), 'старих випадних списків мови й теми немає');

const settings = html.slice(html.indexOf('id="viewSettings"'), html.indexOf('id="viewStats"'));
const look = settings.slice(0, settings.indexOf('data-i18n="secMinWage"'));
assert.ok(look.indexOf('data-i18n="secAppearance"') > 0, '«Параметри»: розділ «Вигляд» угорі');
assert.ok(/id="langUk" data-lang="uk"/.test(look) && /id="langPl" data-lang="pl"/.test(look), '«Мова»: UA | PL');
assert.ok(/<button type="button" role="switch" class="switch" id="themeSwitch" aria-checked="false" aria-labelledby="themeLabel">/.test(look), '«Темна тема»: повзунок');

const profile = html.slice(html.indexOf('id="viewProfile"'), html.indexOf('id="viewSettings"'));
for (const id of ['profUnder26', 'profPpk']) assert.ok(new RegExp(`<button type="button" role="switch" class="switch" id="${id}" aria-checked="false"`).test(profile), `${id}: повзунок`);
assert.ok(!/<select/.test(profile), 'у профілі немає випадних списків «Так / Ні»');
assert.ok(!/<select[^>]*>\s*<option value="no"/.test(html), 'вибір так/ні ніде не лишився');
assert.equal((profile.match(/class="tile(?: tile-sw)?"/g) || []).length, 4, 'сітка налаштувань 2×2');
const order = ['id="profilesLocal"', 'data-i18n="secProfile"', 'id="profileNameRow"', 'data-i18n="secSettings"', 'class="tiles"', 'id="profileFoot"'].map(k => profile.indexOf(k));
assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), `порядок у профілі: ${order}`);
assert.ok(profile.indexOf('id="btn-profile-delete"') < profile.indexOf('id="btn-save-profile"'), '«Видалити профіль» ліворуч від «Зберегти»');

const sheet = html.slice(html.indexOf('id="cloudSheet"'), html.indexOf('</section>', html.indexOf('id="cloudSheet"')));
assert.ok(/<section class="sheet hidden" id="cloudSheet" role="dialog" aria-modal="true"/.test(html), 'панель: role="dialog", aria-modal');
assert.ok(/id="btn-cloud-close" data-i18n-aria="ariaClose" aria-label="Закрити"/.test(sheet), 'хрестик «Закрити»');
assert.ok(html.includes('id="cloudBackdrop"'), 'затемнення під панеллю');

// Перехід нічної зміни — повзунки в рядках-<label> (увесь рядок — зона дотику); прапорців у застосунку немає
const calcPage = html.slice(html.indexOf('id="page1"'), html.indexOf('id="page2"'));
for (const id of ['nightCarryOut', 'nightCarryIn']) {
  const row = new RegExp(`<label class="field sub sw-row" for="${id}"><span class="lab">.*?</span><button type="button" role="switch" class="switch" id="${id}" aria-checked="false" aria-labelledby="${id}Label"[^>]*></button></label>`);
  assert.match(calcPage, row, `${id}: підпис ліворуч, повзунок праворуч`);
}
assert.match(calcPage, /id="nightCarryOut"[^>]* disabled>/, 'без нічних змін повзунок переходу неактивний');
assert.ok(!/type="checkbox"/.test(html) && !/checkbox/.test(app), 'прапорців немає');

// Android «Назад»: MainActivity питає сторінку (salaryBack), і лише якщо панель не була відкрита — звичайна дія.
// У копії сайту (454) папки android/ немає — там перевіряється лише сторінка (браузерний «Назад» — popstate, нижче).
const activityPath = new URL('../android/app/src/main/java/com/savoj/salary/MainActivity.java', import.meta.url);
if (existsSync(activityPath)) {
  const activity = readFileSync(activityPath, 'utf8');
  assert.ok(/salaryBack/.test(activity) && /OnBackPressedCallback/.test(activity), 'MainActivity передає «Назад» сторінці');
}
assert.ok(/window\.salaryBack = \(\) => closeCloudSheet\(\)/.test(app), 'salaryBack закриває панель хмари');

// ---------- 2. Компактний масштаб (CSS) ----------
const rule = sel => (css.match(new RegExp(`(?:^|})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm')) || [])[1] || '';
assert.match(rule('body'), /font:14px\//, 'основний текст 14 px');
assert.match(rule('.vt'), /font-size:21px/, 'заголовок екрана 21 px'); assert.match(rule('.sheet-title'), /font-size:17px/, 'заголовок панелі 17 px');
assert.match(rule('.ctl'), /height:40px/); assert.match(rule('.ctl'), /border-radius:10px/, 'поля 40 px, радіус 10');
assert.match(rule('.btn'), /min-height:46px/); assert.match(rule('.btn'), /border-radius:12px/, 'основна кнопка 46 px, радіус 12');
assert.match(rule('.prof-foot .btn'), /min-height:44px/, 'кнопка в рядку з іншою дією — 44 px');
assert.match(rule('.card'), /border-radius:14px/, 'картки — радіус 14');
assert.match(rule('.mark'), /width:28px;height:28px;border-radius:8px/, '«zł» 28×28, радіус 8');
assert.match(rule('h1'), /font-size:15px;font-weight:700/, 'назва застосунку 15 px жирна');
assert.match(rule('.who'), /font-size:11px/); assert.match(rule('.who'), /color:var\(--text-muted\)/, 'назва профілю 11 px, другорядний колір');
assert.match(rule('.icon-btn'), /width:40px;height:40px;flex:none;border-radius:11px;border:1px solid var\(--border\)/, 'кнопка хмари 40×40, радіус 11, рамка border');
assert.match(rule('.icon'), /width:20px;height:20px/, 'іконки 20 px');
assert.match(rule('.tab'), /font-size:10.5px/); assert.match(rule('.tab'), /min-height:48px/, 'нижнє меню: 48 px, підписи 10,5 px');
assert.match(rule('.switch::before'), /width:44px;height:26px;border-radius:13px/, 'доріжка 44×26');
assert.match(rule('.switch::after'), /width:22px;height:22px;border-radius:50%;background:#fff/, 'кружечок 22 білий');
assert.match(rule('.switch'), /width:44px;height:40px/, 'зона дотику повзунка 44×40');
assert.match(rule('.prof-pill'), /height:36px/); assert.match(rule('.prof-ini'), /width:28px;height:28px/, 'пігулки 36, коло 28');
assert.match(rule('.prof-pill::before,.prof-add::before'), /inset:-3px/, 'зона дотику пігулки й «+» — 42 px');
assert.match(rule('.tile'), /min-height:92px;padding:12px;border-radius:14px/, 'плитка: 92 / 12 / 14');
assert.match(rule('.tiles'), /gap:10px/);
assert.match(rule('.sheet-backdrop'), /background:var\(--scrim\)/); assert.ok(/--scrim:rgba\(14,23,38,\.45\)/.test(css), 'затемнення rgba(14,23,38,.45)');
assert.match(rule('.sheet'), /border-radius:20px 20px 0 0/); assert.match(rule('.sheet-handle'), /width:32px;height:4px/, 'панель: радіус 20, ручка 32×4');
assert.ok(/\[data-theme=dark\]\{[^}]*--switch-off:var\(--border\)/.test(css) && /:root\{[^}]*--switch-off:#cfd6e1/.test(css), 'вимкнений повзунок: #cfd6e1 / border у темній');
assert.ok(/\.prof-strip\{[^}]*overflow-x:auto[^}]*scrollbar-width:none/.test(css) && /\.prof-strip::-webkit-scrollbar\{display:none\}/.test(css), 'пігулки гортаються без смуги');
for (const sel of ['.cloud-btn[data-state=ok]', '.cloud-btn[data-state=off]']) assert.ok(css.includes(sel), sel);
assert.ok(/\.first-run [^{]*\.tabs\{display:none\}/.test(css) || /\.first-run \.tabs/.test(css), 'перший запуск без нижнього меню');

assert.match(rule('.field.sub'), /min-height:48px/, 'рядок із повзунком — не нижчий за 48 px');
assert.match(rule('.switch:disabled'), /opacity:\.4/, 'неактивний повзунок напівпрозорий');

// Поля введення: жодне правило не ставить input / select / textarea шрифт менший за 16 px (Safari на iPhone не збільшує сторінку)
const fieldTags = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map(m => m[0]);
const fieldClasses = fieldTags.flatMap(tag => (tag.match(/ class="([^"]+)"/)?.[1] || '').split(/\s+/)).filter(Boolean);
const fieldIds = fieldTags.map(tag => tag.match(/ id="(\w+)"/)?.[1]).filter(Boolean);
const targetsField = selector => {
  const last = selector.trim().split(/[\s>+~]+/).pop();
  return /^(input|select|textarea)(?![\w-])/.test(last)
    || fieldClasses.some(c => new RegExp(`\\.${c}(?![\\w-])`).test(last)) || fieldIds.some(i => new RegExp(`#${i}(?![\\w-])`).test(last));
};
let fontRules = 0;
for (const [, selectors, decls] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  if (!selectors.split(',').some(targetsField)) continue;
  const font = decls.split(';').map(d => d.trim()).filter(d => /^font(-size)?\s*:/.test(d)).pop();      // діє останнє оголошення
  if (!font) continue;
  fontRules++;
  const px = font.startsWith('font-size') ? font.match(/:\s*([\d.]+)px\s*(?:!important)?$/) : font.match(/([\d.]+)px/);
  assert.ok(px && Number(px[1]) >= 16, `«${selectors.trim()}»: «${font}» — менше 16 px`);
}
assert.ok(fontRules >= 5, `знайдено правил шрифту полів: ${fontRules}`);
assert.match(css, /^input,select,textarea\{font-size:16px\}/m, 'базовий розмір для всіх полів');
assert.match(rule('.tile-input'), /font-size:20px/, 'числа в плитках — 20 px');
assert.match(rule('.ctl input,.ctl select'), /font-size:16px/, 'поля калькулятора — 16 px');

// ---------- 3. Перший запуск: чиста функція ----------
const mem = init => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), get length() { return m.size; }, key: i => [...m.keys()][i] ?? null }; };
assert.equal(isFirstRun(mem({})), true, 'порожнє сховище');
assert.equal(isFirstRun(mem({ lang: 'pl', theme: 'dark', known_emails: '["a@b.c"]', hint_urlop_seen: '1', user_min_wages: '{}' })), true, 'спільні налаштування не рахуються даними');
for (const [k, v] of [[PROFILES_KEY, '{}'], ['guest_month_2026-11', '{}'], ['user_profile_guest', '{}'], ['cloud_month_u1_2026-11', '{}'], ['user_profile_u1', '{}']]) {
  assert.equal(isFirstRun(mem({ [k]: v })), false, `${k} → не перший запуск`);
}
assert.equal(hasLocalProfileData(mem({ 'cloud_month_u1_2026-11': '{}' })), false, 'сліди акаунта — не локальні дані');

// ---------- 4. app.js на порожньому сховищі ----------
const numberIds = [...html.matchAll(/<input type="number"[^>]*? id="(\w+)"/g)].map(m => m[1]);
const { getEl, fire, store, fireWindow } = installFakeDom({ groups: { 'input[type=number]': numberIds } });
numberIds.forEach(getEl);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
const history = []; let backs = 0;
globalThis.history = { get state() { return history.at(-1) ?? null; }, pushState(st) { history.push(st); }, back() { backs++; history.pop(); } };
globalThis.__salaryTest = { cloudLoader: async () => { throw new Error('offline'); } };
console.warn = () => {};
store.set('lang', 'uk');
await import('../js/app.js');
await sleep(60);
const body = getEl('app-body');
const hidden = id => getEl(id).classList.contains('hidden');
const click = async id => { await fire(getEl(id), 'click'); await sleep(30); };

// 4a. Перший запуск: вкладка «Профіль» без меню, привітання, порожня назва, налаштування за замовчуванням; сховище не змінено
assert.equal(body.classList.contains('first-run'), true, 'екран «Вітаємо!»');
assert.equal(getEl('viewProfile').classList.contains('active'), true);
assert.equal(store.has(PROFILES_KEY), false, 'до створення profiles_v1 не записується');
assert.equal(getEl('btn-save-profile').textContent, dict.uk.firstCreate, 'кнопка «Створити профіль»');
assert.equal(getEl('profileName').value, ''); assert.equal(String(getEl('profBaseSalary').value), '5750');
assert.equal(getEl('profExtraDeduction').value, '0,00', 'новий профіль — відрахування 0');
assert.deepEqual([getEl('profUnder26').attrs['aria-checked'], getEl('profPpk').attrs['aria-checked']], ['false', 'false']);
assert.equal(getEl('whoBadge').textContent, '', 'у шапці ще немає назви профілю');
assert.equal(getEl('btn-cloud').attrs['data-state'], 'out', 'кнопка хмари є і на першому запуску');
// назва обов'язкова (1–30)
for (const text of ['', '   ', 'щ'.repeat(31)]) {
  getEl('profileName').value = text; await click('btn-save-profile');
  assert.equal(getEl('profileNameError').innerText, dict.uk.errProfileName, `«${text}» — помилка`);
  assert.equal(store.has(PROFILES_KEY), false); assert.equal(body.classList.contains('first-run'), true);
}
window.setLang('pl'); assert.equal(getEl('btn-save-profile').textContent, 'Utwórz profil'); window.setLang('uk');
// створення: назва + налаштування з плиток → звичайний застосунок на «Розрахунку»
getEl('profileName').value = '  Володимир '; getEl('profBaseSalary').value = '6400';
await click('profUnder26');
assert.equal(getEl('profUnder26State').textContent, dict.uk.yes);
await click('btn-save-profile'); await sleep(40);
const created = JSON.parse(store.get(PROFILES_KEY));
assert.deepEqual(created.list.map(p => [p.id, p.name]), [[DEFAULT_ID, 'Володимир']], 'перший профіль — default з введеною назвою');
assert.equal(created.active, DEFAULT_ID);
const saved = JSON.parse(store.get('user_profile_guest'));
assert.deepEqual([saved.baseSalary, saved.under26, saved.ppk, saved.extraDeduction, saved.insurance], [6400, 'yes', 'no', 0, 'no'], 'налаштування першого профілю');
assert.equal(body.classList.contains('first-run'), false, 'перший запуск закрито');
assert.equal(getEl('page1').classList.contains('active'), true, 'далі — «Розрахунок»');
assert.equal(getEl('whoBadge').textContent, 'Володимир', 'у шапці — назва профілю');
assert.equal(String(getEl('baseSalary').value), '6400', 'ставка профілю — у калькуляторі');
assert.equal(getEl('profileName').value, 'Володимир');

// Нетто першого профілю — без відрахування
{
  const { compute } = await import('../js/calc.js');
  const { inputsFromSaved } = await import('../js/pit.js');
  const month = getEl('monthSelect').value;
  const type = async (id, v) => { getEl(id).value = v; await fire(body, 'input', getEl(id)); await sleep(20); };
  await type('morningShifts', '10');
  const record = () => JSON.parse(store.get(`guest_month_${month}`));
  const res = compute(inputsFromSaved(record(), month, saved));
  assert.equal(getEl('netResult').innerText, new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(res.net), 'нетто без відрахування');
  assert.equal(getEl('dedExtra').classList.contains('hidden'), true, 'у «Деталях» рядка відрахування немає');

  // Повзунки нічної зміни: стан — aria-checked, у даних місяця true / false
  const state = id => getEl(id).attrs['aria-checked'];
  const adj = () => getEl('infoNightCarryVal').innerText;
  assert.equal(getEl('nightCarryOut').disabled, true);
  await click('nightCarryOut');
  assert.equal(state('nightCarryOut'), 'false', 'неактивний повзунок не перемикається'); assert.strictEqual(record().nightCarryOut, false);
  await type('nightShifts', '3');
  assert.equal(getEl('nightCarryOut').disabled, false);
  await click('nightCarryOut');
  assert.equal(state('nightCarryOut'), 'true'); assert.strictEqual(record().nightCarryOut, true); assert.equal(adj(), '−6');
  await type('nightShifts', '');
  assert.equal(getEl('nightCarryOut').disabled, true); assert.strictEqual(record().nightCarryOut, false, 'неактивний не враховується й не зберігається'); assert.equal(adj(), '0');
  await type('nightShifts', '3');
  assert.equal(state('nightCarryOut'), 'true', 'позначка не знялась'); assert.strictEqual(record().nightCarryOut, true);
  await click('nightCarryIn'); assert.strictEqual(record().nightCarryIn, true); assert.equal(adj(), '0');
  await click('nightCarryIn'); assert.strictEqual(record().nightCarryIn, false); assert.equal(adj(), '−6');
  // «з попереднього місяця» вмикається саме в ще не збереженому наступному місяці; дотик ховає підказку
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const select = async id => { getEl('monthSelect').value = id; await fire(body, 'change', getEl('monthSelect')); await sleep(40); };
  await select(next);
  assert.equal(state('nightCarryIn'), 'true', 'увімкнено за попереднім місяцем'); assert.equal(state('nightCarryOut'), 'false');
  assert.equal(hidden('nightCarryInHint'), false); assert.equal(adj(), '+6');
  await click('nightCarryIn');
  assert.equal(state('nightCarryIn'), 'false'); assert.equal(hidden('nightCarryInHint'), true);
  assert.strictEqual(JSON.parse(store.get(`guest_month_${next}`)).nightCarryIn, false);
  await select(month);
  assert.deepEqual([state('nightCarryOut'), state('nightCarryIn')], ['true', 'false'], 'збережений місяць відкривається зі своїм станом');
}

// 4b. «Вигляд»: мова й тема працюють і зберігаються
await click('langPl');
assert.equal(store.get('lang'), 'pl'); assert.equal(document.documentElement.lang, 'pl');
assert.deepEqual([getEl('langPl').attrs['aria-pressed'], getEl('langUk').attrs['aria-pressed']], ['true', 'false']);
assert.equal(getEl('profUnder26State').textContent, 'Tak', 'стан повзунка перекладається');
await click('langUk'); assert.equal(store.get('lang'), 'uk');
const themeBefore = getEl('themeSwitch').attrs['aria-checked'];
await click('themeSwitch');
const dark = themeBefore !== 'true';
assert.equal(store.get('theme'), dark ? 'dark' : 'light', 'тема зберігається');
assert.equal(getEl('themeSwitch').attrs['aria-checked'], String(dark));
await click('themeSwitch');
assert.equal(store.get('theme'), dark ? 'light' : 'dark'); assert.equal(getEl('themeSwitch').attrs['aria-checked'], String(!dark));

// 4c. Панель хмари: відкривається кнопкою, закривається хрестиком, затемненням, «Назад» (Android і браузер); фокус повертається
let focused = null;
for (const id of ['btn-cloud', 'btn-cloud-close']) getEl(id).focus = () => { focused = id; };
await click('btn-cloud');
assert.equal(hidden('cloudSheet'), false); assert.equal(hidden('cloudBackdrop'), false);
assert.equal(getEl('btn-cloud').attrs['aria-expanded'], 'true');
assert.equal(focused, 'btn-cloud-close', 'фокус переходить у панель');
assert.equal(getEl('appMain').inert, true, 'вміст під панеллю недоступний');
assert.equal(body.classList.contains('sheet-open'), true);
assert.equal(hidden('auth-container'), false, 'без входу — форма входу'); assert.equal(hidden('sync-container'), true);
await click('btn-cloud-close');
assert.equal(hidden('cloudSheet'), true); assert.equal(hidden('cloudBackdrop'), true);
assert.equal(focused, 'btn-cloud', 'фокус повертається на кнопку хмари');
assert.equal(getEl('appMain').inert, false); assert.equal(backs, 1, 'хрестик прибирає запис історії');
await click('btn-cloud'); await click('cloudBackdrop'); assert.equal(hidden('cloudSheet'), true, 'затемнення закриває');
await click('btn-cloud');
assert.equal(window.salaryBack(), true, 'Android «Назад»: панель закрито'); assert.equal(hidden('cloudSheet'), true);
assert.equal(window.salaryBack(), false, 'панель закрита — «Назад» робить звичайну дію');
await click('btn-cloud'); history.pop(); await fireWindow('popstate');
assert.equal(hidden('cloudSheet'), true, 'браузер «Назад» (popstate) закриває панель');

console.log('OK: новий вигляд (шапка лише з хмарою, «Вигляд»: мова й тема, повзунки (і нічної зміни), поля 16 px, відрахування 0 у новому профілі, масштаб CSS, панель хмари й «Назад», перший запуск лише на порожньому сховищі)');
process.exit(0);
