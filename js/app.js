import { dict } from './i18n.js';
import { CONFIG, getNormHours, stateDaysFor, getMinWage, minWageInfo, compute, computeDailyUrlopBonus, nightHoursAdjustOf, shiftMonthId, effectiveBonusPct, l4BonusCut, hasBonusTotal, bonusSplit, setUserMinWages } from './calc.js';
import { formatPLN, formatAmount, showToast, monthList } from './utils.js';
import { deductionOf, checkDeduction } from './deduction.js';
import { deductionsBreakdown } from './breakdown.js';
import { parseMinWage, readUserMinWages, saveUserMinWage, minWageYears } from './minwage.js';
import { readKnownEmails, rememberEmail, forgetEmail, normalizeEmail } from './emails.js';
import { saveMonthCache, loadMonthCache, clearMonthCache, listMonthCache } from './monthcache.js';
import { pitBaseOf, pitExtra, yearToDate } from './pit.js';
import { collectPeriodStats, readGuestRecords, availableYears, normalizePeriod } from './stats.js';
import { drawIncomeChart, drawMixChart, drawMixLegend } from './charts.js';
import { ensureProfiles, activeProfile, displayName, profileStorage, createProfile, renameProfile, deleteProfile, setActiveProfile, checkName, isFirstRun, hasLocalProfileData, DEFAULT_ID, PROFILES_KEY } from './profiles.js';

/* Лише для тестів: tests/cloud.mjs підставляє фейковий Firebase і короткий таймаут. У браузері не задано. */
const TEST = globalThis.__salaryTest || {};
const SAVE_TIMEOUT_MS = () => TEST.saveTimeoutMs ?? 15000;

/* ХМАРА (Firebase) — опційна й не блокує старт.
   Спершу застосунок стартує як гостьовий (працює офлайн), Firebase підвантажується у фоні
   (initCloud). Якщо CDN недоступний, auth лишається заглушкою { currentUser: null }, а спроба
   повторюється при події online або при натисканні «Увійти» / «Реєстрація». */
let auth = { currentUser: null }, db = null;
let signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail;
let doc, setDoc, getDoc, collection, getDocs;
let cloudAvailable = false;
let cloudPromise = null;
let guestReady = false;

function withTimeout(p, ms) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function initCloud() {
  if (cloudAvailable) return Promise.resolve(true);
  if (cloudPromise) return cloudPromise;
  cloudPromise = withTimeout(TEST.cloudLoader ? TEST.cloudLoader() : import('./firebase.js'), 15000)
    .then(m => {
      ({ auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
         doc, setDoc, getDoc, collection, getDocs } = m);
      cloudAvailable = true;
      m.onAuthStateChanged(m.auth, user => {
        // Перший виклик з null після гостьового старту нічого не змінює — пропускаємо
        if (!user && guestReady && !signedIn) return;
        return handleAuthState(user);
      });
      return true;
    })
    .catch(err => { console.warn('Firebase недоступний:', err); cloudPromise = null; return false; });
  return cloudPromise;
}

window.addEventListener('online', () => { initCloud(); });

const NON_MONTH_IDS = new Set(['langUk', 'langPl', 'themeSwitch', 'email', 'password', 'profBaseSalary', 'profUnder26', 'profPpk', 'profExtraDeduction', 'profileName']);
const MIN_WAGE_ID = 'minWage';       // поля «Параметрів» minWage2028… створюються за потреби
const isMonthField = el => !NON_MONTH_IDS.has(el.id) && !el.id.startsWith(MIN_WAGE_ID);

const AUTH_ERR = {
  'auth/invalid-credential': 'errInvalidCred', 'auth/wrong-password': 'errInvalidCred', 'auth/user-not-found': 'errInvalidCred',
  'auth/invalid-email': 'errInvalidEmail', 'auth/missing-password': 'errWeakPwd', 'auth/weak-password': 'errWeakPwd',
  'auth/email-already-in-use': 'errEmailInUse', 'auth/network-request-failed': 'errNetwork', 'auth/too-many-requests': 'errTooMany'
};
const CLOUD_ERR = { 'permission-denied': 'errPermission', 'unauthenticated': 'errPermission', 'unavailable': 'errNetwork', 'resource-exhausted': 'errTooMany' };
function authMsg(e) {
  const code = e && e.code;
  const k = AUTH_ERR[code] || CLOUD_ERR[code];
  if (!k) console.warn('Помилка хмари:', e);   // сирий текст помилки — лише в консоль, не користувачу
  return dict[currentLang][k || 'errUnknown'];
}

let currentLang = localStorage.getItem('lang') || (navigator.language && navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'uk');
/* signedIn — є вхід в акаунт: хмарні кнопки, auth-container, sync-container, [data-cloud-only].
   fullFeatures — усі функції (відпустка, L4, донорство, поважна відсутність, поріг PIT, статистика з порогом):
   тепер і для локального профілю, і для акаунта. Саме його отримує compute() як isPremium. */
let signedIn = false;
let fullFeatures = true;
let currentActivePage = 1;
let requestCounter = 0;
let monthsCollectionCache = null;
const DEFAULT_PROFILE = () => ({ baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' });   // коли збережених налаштувань немає
/* Форма нового профілю («+» і перший запуск): відрахування явно 0. Старі записи без extraDeduction рахує deductionOf(). */
const NEW_PROFILE = () => ({ ...DEFAULT_PROFILE(), insurance: 'no', extraDeduction: 0 });
let userProfile = DEFAULT_PROFILE();
window.cachedL4DailyRate = null;

/* ЛОКАЛЬНІ ПРОФІЛІ (js/profiles.js). Дані гостя — у сховищі активного профілю; поки є вхід в акаунт, профілі не діють.
   Перший запуск (на пристрої немає ні локальних даних, ні слідів акаунта): екран «Вітаємо!» без нижнього меню. Доки профіль
   не створено, profiles_v1 не записується (список лише в пам'яті), тож закритий до створення застосунок покаже екран знову. */
let firstRun = isFirstRun(localStorage);
const MEMORY_PROFILES = () => ({ active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: '', createdAt: '', autoName: true }] });
let profiles = firstRun ? MEMORY_PROFILES() : ensureProfiles(localStorage);
/* Показувана назва: автоматична («Мій профіль» / «Mój profil») — мовою інтерфейсу, тож змінюється разом із мовою. */
const profileLabel = p => displayName(p, dict[currentLang].profileDefaultName);
const guestStore = () => profileStorage(localStorage, profiles.active);
const GUEST_PROFILE_KEY = 'user_profile_guest';
const guestMonthKey = monthVal => `guest_month_${monthVal}`;

/* ПРОФІЛЬ ТА МЕНЮ ПРИВ'ЯЗКА ДО АКАУНТУ */

async function loadProfile() {
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  const localKey = `user_profile_${uid}`;
  userProfile = DEFAULT_PROFILE();
  if (auth.currentUser) {
    try {
      const profSnap = await getDoc(doc(db, "users", uid, "profile", "userProfile"));
      if (profSnap.exists()) {
        userProfile = { ...userProfile, ...profSnap.data() };
        localStorage.setItem(localKey, JSON.stringify(userProfile));
      } else {
        const savedLocal = localStorage.getItem(localKey);
        if (savedLocal) try { userProfile = { ...userProfile, ...JSON.parse(savedLocal) }; } catch(e) {}
      }
    } catch(e) {
      const savedLocal = localStorage.getItem(localKey);
      if (savedLocal) try { userProfile = { ...userProfile, ...JSON.parse(savedLocal) }; } catch(e) {}
    }
  } else {
    const savedLocal = guestStore().getItem(GUEST_PROFILE_KEY);           // налаштування активного локального профілю
    if (savedLocal) try { userProfile = { ...userProfile, ...JSON.parse(savedLocal) }; } catch(e) {}
  }
  fillProfileForm(firstRun ? NEW_PROFILE() : userProfile);
}

/* Плитки налаштувань («Профіль» і перший запуск): ставка, відрахування, вік до 26, PPK. */
function fillProfileForm(p) {
  document.getElementById('profBaseSalary').value = p.baseSalary;
  setSwitch('profUnder26', p.under26 === 'yes');
  setSwitch('profPpk', p.ppk === 'yes');
  showProfileDeduction(p);
}

/* Повзунок (<button role="switch">): стан — aria-checked; у профілі зберігається 'yes' / 'no', як раніше вибір «Так / Ні». */
const switchOn = id => document.getElementById(id).getAttribute('aria-checked') === 'true';
const switchValue = id => (switchOn(id) ? 'yes' : 'no');
const SWITCH_STATE_IDS = { profUnder26: 'profUnder26State', profPpk: 'profPpkState' };
function setSwitch(id, on) {
  document.getElementById(id).setAttribute('aria-checked', String(!!on));
  if (SWITCH_STATE_IDS[id]) document.getElementById(SWITCH_STATE_IDS[id]).textContent = on ? dict[currentLang].yes : dict[currentLang].no;
}
for (const id of Object.keys(SWITCH_STATE_IDS)) document.getElementById(id).addEventListener('click', () => setSwitch(id, !switchOn(id)));

/* Поле профілю з комою, як пишуть суми в UA/PL; старий профіль показує суму, яку для нього рахує deductionOf(). */
function showProfileDeduction(p = userProfile) {
  document.getElementById('profExtraDeduction').value = formatAmount(deductionOf(p));
  showDeductionError(null);
}

/* Помилка під полем відрахування: null, 'invalid' або 'tooBig' (checkDeduction). */
let deductionError = null;
function showDeductionError(error) {
  deductionError = error;
  const el = document.getElementById('profExtraDeductionError');
  el.classList.toggle('hidden', !error);
  el.innerText = error === 'tooBig' ? dict[currentLang].errDeductionMax : error ? dict[currentLang].errDeduction : '';
}
/* Вихід із поля: правильна сума — одразу «35,20»; неправильна — повідомлення, а введений текст лишається. */
function settleDeduction() {
  const input = document.getElementById('profExtraDeduction');
  const checked = checkDeduction(input.value);
  showDeductionError(checked.error);
  if (checked.ok) input.value = formatAmount(checked.value);
}
document.getElementById('profExtraDeduction').addEventListener('change', settleDeduction);
// Під час введення лише прибираємо чи уточнюємо вже показане повідомлення; нове з'являється після виходу з поля.
document.getElementById('profExtraDeduction').addEventListener('input', () => {
  if (deductionError) showDeductionError(checkDeduction(document.getElementById('profExtraDeduction').value).error);
});

/* «Зберегти» на вкладці «Профіль»: назва (локальний профіль) і налаштування разом.
   Звичайний режим — перейменування (якщо назву змінили) і налаштування активного профілю; «+» — новий профіль, що одразу стає
   активним; перший запуск — перший профіль. Поки є вхід в акаунт, назви немає: зберігаються лише налаштування (як у 1.19.1).
   Помилка назви чи суми відрахування — нічого не зберігається. */
async function saveProfileForm() {
  const deduction = checkDeduction(document.getElementById('profExtraDeduction').value);
  showDeductionError(deduction.error);
  const kind = signedIn ? 'account' : profileEdit ? profileEdit.kind : 'edit';
  const nameText = document.getElementById('profileName').value;
  const name = kind === 'account' ? { ok: true } : checkName(profiles, nameText, kind === 'add' ? null : profiles.active);
  showProfileNameError(name.ok ? null : name.error === 'duplicate' ? 'duplicate' : 'length');
  if (!deduction.ok || !name.ok) return;                          // з помилкою нічого не зберігається
  const settings = { ...userProfile, ...settingsFromForm(deduction.value) };
  if (kind === 'first') return createFirstProfile(nameText, settings);
  if (kind === 'add') return createAnotherProfile(nameText, settings);
  if (kind === 'edit') {
    const renamed = renameProfile(localStorage, profiles.active, nameText);
    if (renamed.ok) {
      profiles = renamed.state; renderProfiles();
      document.getElementById('profileName').value = profileLabel(activeProfile(profiles));   // збережена назва (без пробілів по краях)
    }
  }
  userProfile = settings;
  showProfileDeduction();
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  if (auth.currentUser) localStorage.setItem(`user_profile_${uid}`, JSON.stringify(userProfile));
  else guestStore().setItem(GUEST_PROFILE_KEY, JSON.stringify(userProfile));
  let profileCloudFailed = false;
  if (auth.currentUser) {
    try { await setDoc(doc(db, "users", uid, "profile", "userProfile"), userProfile, { merge: true }); } catch(e) { profileCloudFailed = true; }
  }
  const monthVal = document.getElementById('monthSelect').value;
  if (!(auth.currentUser ? localStorage : guestStore()).getItem(guestMonthKey(monthVal)) && (!auth.currentUser || !monthsCollectionCache?.some(d => d.id === monthVal))) {
    applyProfileToMain();
  }
  await updateYtdCache(monthVal);        // вік до 26 років змінює, чи діє поріг
  calculateSalary();
  showToast(profileCloudFailed ? dict[currentLang].toastProfLocalOnly : dict[currentLang].toastProfOk);
}

/* Значення плиток у полях профілю (той самий формат, що й раніше). */
function settingsFromForm(extraDeduction) {
  const profBase = parseFloat(document.getElementById('profBaseSalary').value);
  return {
    baseSalary: isNaN(profBase) ? 5750 : profBase,
    under26: switchValue('profUnder26'),
    ppk: switchValue('profPpk'),
    extraDeduction,
    insurance: extraDeduction > 0 ? 'yes' : 'no'           // це поле читає веб-версія
  };
}

document.getElementById('btn-save-profile').addEventListener('click', saveProfileForm);

function applyProfileToMain() {
  document.getElementById('baseSalary').value = userProfile.baseSalary;
}

window.setLang = function(lang) {
  currentLang = lang; localStorage.setItem('lang', lang); document.documentElement.lang = lang;
  const t = dict[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => { const v = t[el.dataset.i18n]; if (v) el.textContent = el.hasAttribute('data-nocolon') ? v.replace(/:\s*$/, '') : v; });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { const v = t[el.dataset.i18nPh]; if (v) el.placeholder = v; });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { const v = t[el.dataset.i18nAria]; if (v) el.setAttribute('aria-label', v); });
  // «Параметри» → «Вигляд»: сегментний перемикач UA | PL
  document.getElementById('langUk').setAttribute('aria-pressed', String(lang === 'uk'));
  document.getElementById('langPl').setAttribute('aria-pressed', String(lang === 'pl'));
  document.title = t.appTitle;
  showDeductionError(deductionError);
  showProfileNameError(profileNameError);
  for (const id of Object.keys(SWITCH_STATE_IDS)) setSwitch(id, switchOn(id));      // «Так» / «Ні» під повзунками
  showPassword(document.getElementById('password').type === 'text');
  renderAppVersion(); renderKnownEmails(); renderProfiles(); renderAuthMode(); renderCloud(); initMonths(); renderMinWageSettings(); calculateSalary(); refreshPeriod(); paintStats();
};

/* «ПАРАМЕТРИ», унизу: «Версія 1.19.1» (у шапці версії немає — там місце для назви застосунку й профілю). */
function renderAppVersion() {
  const el = document.getElementById('appVersion');
  el.textContent = globalThis.APP_VERSION ? dict[currentLang].appVersionLabel.replace('{v}', globalThis.APP_VERSION) : '';
}

/* «ПАРАМЕТРИ»: мінімалка вручну для років календаря без офіційної суми й для всіх років зі збереженою сумою. */
function renderMinWageSettings() {
  const saved = readUserMinWages(localStorage);
  const { years, missing, fields } = minWageYears(monthList(statsNow()).map(m => m.id), saved);
  document.getElementById('minWageFields').replaceChildren(...fields.map(year => minWageField(year, saved[year])));
  const allKnown = document.getElementById('minWageAllKnown');
  allKnown.classList.toggle('hidden', missing.length > 0);
  allKnown.innerText = missing.length ? '' : dict[currentLang].minWageAllKnown.replace('{years}', years.join(', '));
}

const showWage = v => (v === undefined || v === null ? '' : formatAmount(v));

function minWageField(year, value) {
  const make = (tag, className) => { const el = document.createElement(tag); el.className = className; return el; };
  const box = make('div', ''), field = make('div', 'field'), lab = make('div', 'lab'), ctl = make('div', 'ctl');
  const label = make('label', ''), input = make('input', ''), error = make('p', 'field-error hidden');
  input.id = MIN_WAGE_ID + year; input.type = 'text';
  input.setAttribute('inputmode', 'decimal'); input.setAttribute('autocomplete', 'off');
  input.setAttribute('data-clear-on-focus', '');
  input.value = showWage(value);
  label.setAttribute('for', input.id);
  label.textContent = dict[currentLang].minWageField.replace('{year}', year);
  input.addEventListener('change', () => changeMinWage(year, input, error));
  input.addEventListener('input', () => { if (parseMinWage(input.value).ok) showMinWageError(error, true); });
  // Дотик очистив поле, тож після «ввів і стер» браузер не бачить зміни (події change не буде) — видаляємо тут.
  input.addEventListener('blur', () => { if (input.dataset.edited && input.value === '') return changeMinWage(year, input, error); });
  lab.appendChild(label); ctl.appendChild(input);
  field.appendChild(lab); field.appendChild(ctl);
  box.appendChild(field); box.appendChild(error);
  return box;
}

function showMinWageError(error, ok) {
  error.className = ok ? 'field-error hidden' : 'field-error';
  error.textContent = ok ? '' : dict[currentLang].errMinWage;
}

async function changeMinWage(year, input, error) {
  const parsed = parseMinWage(input.value);
  showMinWageError(error, parsed.ok);
  if (!parsed.ok) return;                              // неправильне не зберігається — діє попередня сума
  setUserMinWages(saveUserMinWage(localStorage, year, parsed.value));
  input.value = showWage(parsed.value);
  // мінімалка входить у brutto, тож і в накопичену базу PIT та середнє для L4
  const monthVal = document.getElementById('monthSelect').value;
  await updateL4Cache(monthVal); await updateYtdCache(monthVal);
  calculateSalary();
}

window.setTheme = function(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  localStorage.setItem('theme', theme);
  document.getElementById('themeSwitch').setAttribute('aria-checked', String(theme === 'dark'));      // «Параметри» → «Темна тема»
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = theme === 'dark' ? '#0a0e16' : '#f2f4f8';
};

const VIEW_IDS = ['page1', 'page2', 'viewStats', 'viewProfile', 'viewSettings'];
window.switchPage = function(page) {
  currentActivePage = page;
  VIEW_IDS.forEach((id, i) => document.getElementById(id).classList.toggle('active', i + 1 === page));
  document.querySelectorAll('.tab').forEach(b => { if (Number(b.dataset.page) === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  window.scrollTo(0, 0);
  if (page === 3) renderStats().catch(e => console.warn('Статистика:', e));     // дані читаємо щоразу при відкритті вкладки «Статистика»
};

function refreshPeriod() {
  const s = document.getElementById('monthSelect'), o = s.options[s.selectedIndex];
  document.getElementById('detailsPeriod').textContent = o ? o.text : '';
}

function updateVisibility() {
  const overtimeVal = Math.max(0, parseFloat(document.getElementById('overtimeDays').value) || 0);
  document.getElementById('overtimeSubGroup').classList.toggle('hidden', overtimeVal <= 0);
  const vacDays = Math.max(0, parseInt(document.getElementById('vacationDays').value) || 0);
  document.getElementById('urlopBonusGroup').classList.toggle('hidden', vacDays <= 0);
  const bloodDays = Math.max(0, parseInt(document.getElementById('bloodDonationDays').value) || 0);
  document.getElementById('bloodBonusGroup').classList.toggle('hidden', bloodDays <= 0);
  const l4Days = Math.max(0, parseInt(document.getElementById('l4Days').value) || 0);
  document.getElementById('l4MissedGroup').classList.toggle('hidden', l4Days <= 0);
  const clear = (hide, ids) => hide && ids.forEach(id => { document.getElementById(id).value = ''; });
  clear(overtimeVal <= 0, ['overtimeMorningShifts', 'overtimeNightShifts']);
  clear(vacDays <= 0, ['urlopBonus']);
  if (vacDays <= 0) closeUrlopHint();
  clear(bloodDays <= 0, ['bloodBonus']);
  clear(l4Days <= 0, ['l4MissedShifts']);
  // Перехід у наступний місяць можливий лише за наявності нічної зміни. Позначку не знімаємо (поле могли
  // тимчасово стерти під час редагування) — неактивна просто не враховується й не зберігається.
  const nights = ['nightShifts', 'overtimeNightShifts'].reduce((s, id) => s + Math.max(0, parseInt(document.getElementById(id).value) || 0), 0);
  document.getElementById('nightCarryOut').disabled = nights < 1;
}

/* Пояснення до відпускних («ℹ»): саме розгортається лише тоді, коли дні відпустки вводять уперше на цьому пристрої. */
const URLOP_HINT_SEEN_KEY = 'hint_urlop_seen';
function closeUrlopHint() { document.getElementById('urlopHint').open = false; }
function revealUrlopHintOnce() {
  if (!(parseInt(document.getElementById('vacationDays').value) > 0) || localStorage.getItem(URLOP_HINT_SEEN_KEY)) return;
  document.getElementById('urlopHint').open = true;
  localStorage.setItem(URLOP_HINT_SEEN_KEY, '1');
}

/* Повзунки переходу нічної зміни: у даних місяця це true/false (в інших полів — рядок value). Кнопки не входять у
   querySelectorAll('input, select') і не дають подій input/change, тож їх обробляємо явно. */
const CARRY_IDS = new Set(['nightCarryOut', 'nightCarryIn']);
const isCarryOn = id => switchOn(id) && !document.getElementById(id).disabled;

function collectMonthData(data = {}) {
  document.querySelectorAll('input, select').forEach(el => {
    if (isMonthField(el) && el.id !== BONUS_SELECT_ID && !CARRY_IDS.has(el.id)) data[el.id] = el.value;
  });
  for (const id of CARRY_IDS) data[id] = isCarryOn(id);
  data.bonusTotalPct = selectedBonusPct();
  return data;
}

/* ПРЕМІЯ. Форма має один вибір (обраний відсоток; у записі місяця — число bonusTotalPct).
   legacyBonus ≠ null — відкрито старий місяць (без bonusTotalPct), який ще не змінювали: він рахується двома
   старими відсотками, як раніше. Перша зміна місяця або збереження переводить його на вибраний відсоток. */
const BONUS_SELECT_ID = 'bonusTotalPctSelect';
const LEGACY_BONUS_FIELDS = ['presencePctSelect', 'bonusPctSelect'];
let legacyBonus = null;      // { quality, presence }

const selectedBonusPct = () => parseFloat(document.getElementById(BONUS_SELECT_ID).value) || 0;
const showBonusHint = on => document.getElementById('bonusConvertedHint').classList.toggle('hidden', !on);

function setBonusForm(selected) {
  legacyBonus = null;
  document.getElementById(BONUS_SELECT_ID).value = String(selected);
  showBonusHint(false);
}

/* Старий запис: відсотки читаються з тими самими значеннями за замовчуванням, що й раніше; у вибір
   ставиться їхня сума плюс зменшення за L4 цього місяця (не більше 15). */
function openLegacyBonus(d) {
  const l4 = parseInt(d.l4Days) || 0;
  const quality = d.bonusPctSelect === undefined ? 10 : (parseFloat(d.bonusPctSelect) || 0);
  const presence = d.presencePctSelect === undefined ? (l4 > 0 ? (l4 <= 2 ? 2.5 : 0) : 5) : (parseFloat(d.presencePctSelect) || 0);
  const selected = Math.min(15, quality + presence + l4BonusCut(l4));
  setBonusForm(selected);
  legacyBonus = { quality, presence };
  showBonusHint(effectiveBonusPct(selected, l4) !== quality + presence);
}

/* Користувач змінює місяць: далі рахуємо за вибраним відсотком. Підказка зникає, коли відсоток вибрали самі. */
function leaveLegacyBonus(changedId) {
  legacyBonus = null;
  if (changedId === BONUS_SELECT_ID) showBonusHint(false);
}

/* Старі поля вже збереженого запису переносимо в нову копію (їх читає веб-версія); у нові записи не додаємо. */
function keptLegacyBonusFields(prev) {
  return Object.fromEntries(LEGACY_BONUS_FIELDS.filter(k => prev && prev[k] !== undefined).map(k => [k, prev[k]]));
}

function setCarryIn(on, auto = false) {
  setSwitch('nightCarryIn', on);
  document.getElementById('nightCarryInHint').classList.toggle('hidden', !auto);
}

/* Дані збереженого місяця акаунта: з хмари, а якщо там немає (чи немає мережі) — з локальної копії. */
async function savedCloudMonth(uid, id) {
  return (await getCachedMonths()).find(d => d.id === id)?.data || loadMonthCache(localStorage, uid, id)?.data;
}

/* Позначку переходу поставили, коли наступний місяць уже збережений без «+6 год»: підказуємо, сам місяць не змінюємо. */
const needsNextCarryIn = (data, next) => data.nightCarryOut === true && !!next && next.nightCarryIn !== true;

/* Цю підказку показуємо не частіше разу для пари місяців за сеанс роботи застосунку: true — показати зараз. */
const carryInWarned = new Set();
function takeNextCarryInWarning(monthVal, data, next) {
  const pair = `${monthVal}>${shiftMonthId(monthVal, -1)}`;
  if (!needsNextCarryIn(data, next) || carryInWarned.has(pair)) return false;
  carryInWarned.add(pair);
  return true;
}

/* Лише для ще не збереженого місяця: попередній місяць закінчився нічною зміною → вмикаємо «+6 год». */
function autoNightCarryIn(prevData) {
  if (prevData && prevData.nightCarryOut === true) setCarryIn(true, true);
}

const SCHED_IDS = ['morningShifts', 'afternoonShifts', 'nightShifts', 'vacationDays', 'bloodDonationDays', 'l4MissedShifts'];
function syncSchedule() {
  const m = Math.max(0, parseInt(document.getElementById('morningShifts').value) || 0);
  const a = Math.max(0, parseInt(document.getElementById('afternoonShifts').value) || 0);
  const n = Math.max(0, parseInt(document.getElementById('nightShifts').value) || 0);
  const vac = Math.max(0, parseInt(document.getElementById('vacationDays').value) || 0);
  const blood = Math.max(0, parseInt(document.getElementById('bloodDonationDays').value) || 0);
  const l4Missed = Math.max(0, parseInt(document.getElementById('l4MissedShifts').value) || 0);
  const mStr = document.getElementById('morningShifts').value;
  const aStr = document.getElementById('afternoonShifts').value;
  const nStr = document.getElementById('nightShifts').value;
  const vacStr = document.getElementById('vacationDays').value;
  const bloodStr = document.getElementById('bloodDonationDays').value;
  const l4mStr = document.getElementById('l4MissedShifts').value;
  const schedInput = document.getElementById('scheduleDays');
  const stateDays = stateDaysFor(document.getElementById('monthSelect').value);
  if (mStr !== '' || aStr !== '' || nStr !== '' || vacStr !== '' || bloodStr !== '' || l4mStr !== '') {
    let autoSched = m + a + n + vac + blood + l4Missed;
    schedInput.value = autoSched > 0 ? autoSched : stateDays;
  } else {
    schedInput.value = stateDays;
  }
}

/* ДЖЕРЕЛО ЗАПИСІВ МІСЯЦІВ ({ 'YYYY-MM': дані }) для порога PIT, ставки L4, «Сер. за 1 дн.», статистики, переходу нічної зміни.
   Локальний профіль — його збережені місяці (readGuestRecords на сховищі активного профілю).
   Акаунт — хмара; cached: місяці, яких бракує в хмарі (масив id або 'all' — усі локальні копії), доповнюються копіями. */
const localRecords = () => readGuestRecords(guestStore());
async function sourceRecords({ cached = [] } = {}) {
  if (!auth.currentUser) return localRecords();
  const uid = auth.currentUser.uid, records = {};
  (await getCachedMonths()).forEach(d => { records[d.id] = d.data; });
  for (const id of cached === 'all' ? listMonthCache(localStorage, uid) : cached) {     // хмара недоступна/неповна — доповнюємо локальними копіями
    if (!records[id]) { const c = loadMonthCache(localStorage, uid, id); if (c) records[id] = c.data; }
  }
  return records;
}

async function getCachedMonths() {
  if (monthsCollectionCache) return monthsCollectionCache;
  if (!auth.currentUser) return [];
  try {
    const snaps = await getDocs(collection(db, "users", auth.currentUser.uid, "months"));
    const docs = []; snaps.forEach(docSnap => docs.push({ id: docSnap.id, data: docSnap.data() }));
    monthsCollectionCache = docs; return docs;
  } catch (e) { return []; }
}

async function handleAuthState(user) {
  requestCounter++; monthsCollectionCache = null;
  signedIn = !!user; signedInEmail = user ? user.email : '';
  fullFeatures = true;                 // і локальний профіль, і акаунт
  syncState = user ? 'pending' : null;
  // Перший запуск: вхід його закриває (дані беруться з хмари); після виходу він знову потрібен, лише якщо локального профілю досі немає.
  if (user) setFirstRun(false);
  else if (guestReady) setFirstRun(!hasLocalProfileData(localStorage));
  if (!firstRun && !localStorage.getItem(PROFILES_KEY) && !user) profiles = ensureProfiles(localStorage);
  document.getElementById('app-body').classList.toggle('is-logged-in', signedIn);
  document.getElementById('app-body').classList.toggle('full-features', fullFeatures);
  document.getElementById('auth-container').classList.toggle('hidden', signedIn);
  document.getElementById('sync-container').classList.toggle('hidden', !signedIn);
  document.getElementById('cloudSheet').setAttribute('aria-labelledby', signedIn ? 'cloudInTitle' : 'cloudOutTitle');
  document.querySelectorAll('[data-cloud-only]').forEach(el => el.classList.toggle('hidden', !signedIn));
  if (!user) showLoginScreen();
  if (profileEdit && profileEdit.kind === 'add') profileEdit = null;    // «+» не переживає входу чи виходу
  renderProfiles(); renderCloud();
  await loadProfile();
  if (user) {
    document.getElementById('user-email-display').innerText = user.email;
    await loadCloudData();
  } else {
    await loadLocalData();
  }
  calculateSalary();
  resetStatsView();
}

/* Інше джерело даних (вхід, вихід, інший профіль) — вибір періоду статистики починаємо заново. */
function resetStatsView() {
  statsLast = null; statsPeriod = DEFAULT_PERIOD(); statsPick = null;
  if (currentActivePage === 3) renderStats({ reset: true }).catch(e => console.warn('Статистика:', e));
}

function fillFrom(d) {
  clearInputs();
  document.querySelectorAll('input, select').forEach(el => {
    if (isMonthField(el) && !CARRY_IDS.has(el.id) && d[el.id] !== undefined) {
      el.value = d[el.id];
    }
  });
  setSwitch('nightCarryOut', d.nightCarryOut === true);
  setCarryIn(d.nightCarryIn === true);
  if (hasBonusTotal(d)) setBonusForm(d.bonusTotalPct); else openLegacyBonus(d);
}

async function handleSyncUp() {
  if (!auth.currentUser) return;
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return showToast(dict[currentLang].toastSelectMonth);
  if (navigator.onLine === false) { markSync(false); return showToast(dict[currentLang].toastSaveOffline); }   // setDoc без мережі висить без відповіді
  const saveBtns = document.querySelectorAll('[data-sync-up]');
  saveBtns.forEach(b => { b.disabled = true; });
  const data = collectMonthData({ updatedAt: new Date().toISOString() });
  try {
    await withTimeout(setDoc(doc(db, "users", auth.currentUser.uid, "months", monthVal), data, { merge: true }), SAVE_TIMEOUT_MS());
    const kept = keptLegacyBonusFields(loadMonthCache(localStorage, auth.currentUser.uid, monthVal)?.data);   // у хмарі їх лишає merge
    saveMonthCache(localStorage, auth.currentUser.uid, monthVal, { ...kept, ...data });
    if (legacyBonus && document.getElementById('monthSelect').value === monthVal) { setBonusForm(data.bonusTotalPct); calculateSalary(); }
    showToast(dict[currentLang].toastSaveCloud); monthsCollectionCache = null; markSync(true);
    const uid = auth.currentUser.uid;
    const next = await withTimeout(savedCloudMonth(uid, shiftMonthId(monthVal, -1)), SAVE_TIMEOUT_MS()).catch(() => null);
    if (takeNextCarryInWarning(monthVal, data, next)) showToast(dict[currentLang].toastSaveCloud + '\n' + dict[currentLang].toastNextCarryIn, 8000);
    await updateL4Cache(monthVal);
  } catch (error) {
    // таймаут = немає зв'язку з хмарою (запис міг бути в черзі Firestore, повторне збереження безпечне: merge)
    markSync(false);
    showToast(error && error.message === 'timeout' ? dict[currentLang].toastSaveOffline : dict[currentLang].toastSaveErr + authMsg(error));
  }
  finally { saveBtns.forEach(b => { b.disabled = false; }); }
}

document.querySelectorAll('[data-sync-up]').forEach(b => b.addEventListener('click', handleSyncUp));

/* ВХІД. Поля стоять у формі з autocomplete — так їх бачать менеджери паролів. Форма нікуди не відправляється
   (preventDefault; CSP: form-action 'none'). Пароль застосунок не зберігає; запам'ятовуються лише адреси (js/emails.js). */
async function login() {
  if (!(await initCloud())) return showToast(dict[currentLang].toastOffline);
  const email = document.getElementById('email').value;
  try {
    await signInWithEmailAndPassword(auth, email, document.getElementById('password').value);
    rememberEmail(localStorage, email); renderKnownEmails();
  } catch (e) { showToast(dict[currentLang].toastLoginErr + authMsg(e)); }
}

/* Панель хмари: перемикач «Вхід | Реєстрація». Відправлення форми (кнопка «Увійти», Enter) — дія вибраного режиму. */
let authMode = 'login';
document.getElementById('loginForm').addEventListener('submit', e => { e.preventDefault(); return authMode === 'register' ? register() : login(); });

function renderAuthMode() {
  const reg = authMode === 'register';
  document.getElementById('authModeLogin').setAttribute('aria-pressed', String(!reg));
  document.getElementById('authModeRegister').setAttribute('aria-pressed', String(reg));
  document.getElementById('btn-login').classList.toggle('hidden', reg);
  document.getElementById('btn-register').classList.toggle('hidden', !reg);
  document.getElementById('btn-reset-password').classList.toggle('hidden', reg);
}
const setAuthMode = mode => { authMode = mode; renderAuthMode(); };
document.getElementById('authModeLogin').addEventListener('click', () => setAuthMode('login'));
document.getElementById('authModeRegister').addEventListener('click', () => setAuthMode('register'));

/* «Око» в полі пароля: показати / сховати введене (сам пароль нікуди не записується). */
function showPassword(on) {
  document.getElementById('password').type = on ? 'text' : 'password';
  const eye = document.getElementById('btn-pwd-eye');
  eye.setAttribute('aria-pressed', String(on));
  eye.setAttribute('aria-label', on ? dict[currentLang].ariaHidePwd : dict[currentLang].ariaShowPwd);
  eye.classList.toggle('on', on);
}
document.getElementById('btn-pwd-eye').addEventListener('click', () => showPassword(document.getElementById('password').type !== 'text'));

document.getElementById('btn-register').addEventListener('click', () => register());

async function register() {
  if (!(await initCloud())) return showToast(dict[currentLang].toastOffline);
  const email = document.getElementById('email').value, password = document.getElementById('password');
  password.setAttribute('autocomplete', 'new-password');            // менеджер паролів сприймає його як новий пароль
  try {
    await createUserWithEmailAndPassword(auth, email, password.value);
    rememberEmail(localStorage, email); renderKnownEmails();
    showToast(dict[currentLang].toastRegOk);
  } catch (e) { showToast(dict[currentLang].toastRegErr + authMsg(e)); }
  finally { password.setAttribute('autocomplete', 'current-password'); }
}

/* Екран входу (старт гостя й вихід з акаунта): порожній пароль і остання адреса в полі. */
function showLoginScreen() {
  const [last] = readKnownEmails(localStorage);
  if (last) document.getElementById('email').value = last;
  document.getElementById('password').value = '';
  showPassword(false); setAuthMode('login');
  renderKnownEmails();
}

/* Чипи — усі запам'ятовані адреси, крім тієї, що зараз у полі (стерли поле — видно й останню, її теж можна забути). */
function renderKnownEmails() {
  const current = normalizeEmail(document.getElementById('email').value);
  const others = readKnownEmails(localStorage).filter(email => email !== current);
  document.getElementById('knownEmails').classList.toggle('hidden', others.length === 0);
  document.getElementById('knownEmailsList').replaceChildren(...others.map(emailChip));
}

function emailChip(email) {
  const make = (tag, className, text) => { const el = document.createElement(tag); el.className = className; el.textContent = text; return el; };
  const chip = make('div', 'mail-chip', ''), pick = make('button', 'mail-pick', email), forget = make('button', 'mail-forget', '×');
  pick.type = 'button'; forget.type = 'button';
  forget.setAttribute('aria-label', dict[currentLang].ariaForgetEmail);
  pick.addEventListener('click', () => {
    document.getElementById('email').value = email;
    renderKnownEmails();
    const password = document.getElementById('password');
    if (password.focus) password.focus();
  });
  forget.addEventListener('click', () => { forgetEmail(localStorage, email); renderKnownEmails(); });
  chip.appendChild(pick); chip.appendChild(forget);
  return chip;
}

document.getElementById('email').addEventListener('input', renderKnownEmails);

/* СКИДАННЯ ПАРОЛЯ: лист надсилає Firebase. Відповідь користувачу однакова, чи існує акаунт
   (не розкриваємо, які email зареєстровані); між запитами — пауза, щоб не засипати скриньку. */
let lastResetAt = 0;
document.getElementById('btn-reset-password').addEventListener('click', async () => {
  const emailEl = document.getElementById('email');
  const email = (emailEl.value || '').trim();
  if (!email) { showToast(dict[currentLang].toastResetNeedEmail); if (emailEl.focus) emailEl.focus(); return; }
  const wait = lastResetAt + (TEST.resetCooldownMs ?? 60000) - Date.now();
  if (wait > 0) return showToast(dict[currentLang].toastResetWait.replace('{n}', Math.ceil(wait / 1000)));
  if (!(await initCloud())) return showToast(dict[currentLang].toastOffline);
  const btn = document.getElementById('btn-reset-password');
  btn.disabled = true;
  try {
    auth.languageCode = currentLang;                 // лист приходить мовою інтерфейсу (шаблони UA/PL — у консолі Firebase)
    await sendPasswordResetEmail(auth, email);
    lastResetAt = Date.now(); showToast(dict[currentLang].toastResetSent, 6000);
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') { lastResetAt = Date.now(); showToast(dict[currentLang].toastResetSent, 6000); }
    else showToast(dict[currentLang].toastResetErr + authMsg(e));
  } finally { btn.disabled = false; }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (!cloudAvailable || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try { await signOut(auth); } catch (e) { return; }
  // Локальна копія профілю акаунта (ставка, PPK, вік) не має лишатись на спільному пристрої.
  // Дані локальних профілів (guest_month_*, user_profile_guest, prof_<id>__…) — окремий режим, їх не чіпаємо;
  // після виходу знову діє активний локальний профіль (handleAuthState(null)).
  localStorage.removeItem(`user_profile_${uid}`);
  clearMonthCache(localStorage, uid);
  window.cachedL4DailyRate = null; monthsCollectionCache = null;
});

async function loadCloudData() {
  if (!auth.currentUser) return;
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return;
  const uid = auth.currentUser.uid;
  const currentReq = ++requestCounter;
  const defaultSched = stateDaysFor(monthVal);
  let snap = null;
  try {
    if (navigator.onLine === false) throw new Error('offline');   // без мережі не чекаємо таймауту Firestore
    snap = await getDoc(doc(db, "users", uid, "months", monthVal));
  } catch (e) {
    if (currentReq !== requestCounter) return false;
    markSync(false);
    return showCachedMonth(uid, monthVal, defaultSched);
  }
  if (currentReq !== requestCounter) return;
  markSync(true);
  try {
    if (snap.exists()) {
      saveMonthCache(localStorage, uid, monthVal, snap.data());
      fillFrom(snap.data());
      if (!snap.data().scheduleDays) document.getElementById('scheduleDays').value = defaultSched;
    } else {
      clearInputs(); applyProfileToMain();
      const prev = await savedCloudMonth(uid, shiftMonthId(monthVal, 1));
      if (currentReq !== requestCounter) return;
      autoNightCarryIn(prev);
    }
    updateVisibility(); await autoFillUrlopBonus(monthVal);
    if (currentReq !== requestCounter) return;
    await updateL4Cache(monthVal);
    if (currentReq !== requestCounter) return;
    await updateYtdCache(monthVal);
    if (currentReq !== requestCounter) return;
    calculateSalary();
    return true;
  } catch(e) { showToast(dict[currentLang].toastLoadErr); return false; }
}

/* Мережі немає (або Firestore не відповів): показуємо останню локальну копію місяця.
   Повертає 'cache', якщо копія є, інакше false (з тостом про помилку). */
async function showCachedMonth(uid, monthVal, defaultSched) {
  const cached = loadMonthCache(localStorage, uid, monthVal);
  if (!cached) { showToast(dict[currentLang].toastLoadErr); return false; }
  fillFrom(cached.data);
  if (!cached.data.scheduleDays) document.getElementById('scheduleDays').value = defaultSched;
  updateVisibility(); await updateYtdCache(monthVal); calculateSalary();
  const when = new Date(cached.savedAt).toLocaleDateString(currentLang === 'pl' ? 'pl-PL' : 'uk-UA');
  showToast(dict[currentLang].toastLoadCached + when);
  return 'cache';
}

document.getElementById('btn-sync-down').addEventListener('click', async () => { if (await loadCloudData() === true) showToast(dict[currentLang].toastLoadCloud); });

function saveLocalGuestData() {
  if (auth.currentUser) return;
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return;
  const store = guestStore(), key = guestMonthKey(monthVal);
  let prev = null;
  try { prev = JSON.parse(store.getItem(key)); } catch (e) { /* пошкоджений запис — замінюється */ }
  store.setItem(key, JSON.stringify({ ...keptLegacyBonusFields(prev), ...collectMonthData() }));
}

function loadLocalGuestData() {
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return;
  const saved = guestStore().getItem(guestMonthKey(monthVal));
  if (saved) {
    try { fillFrom(JSON.parse(saved)); } catch(e) { clearInputs(); applyProfileToMain(); }
  } else {
    clearInputs(); applyProfileToMain();
    autoNightCarryIn(localRecords()[shiftMonthId(monthVal, 1)]);
  }
  updateVisibility();
}

/* Місяць локального профілю разом із тим, що для акаунта робить loadCloudData: «Сер. за 1 дн.», ставка L4, поріг PIT. */
async function loadLocalData() {
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal || auth.currentUser) return;
  const currentReq = ++requestCounter;
  loadLocalGuestData();
  await autoFillUrlopBonus(monthVal);
  if (currentReq !== requestCounter) return;
  await updateL4Cache(monthVal);
  if (currentReq !== requestCounter) return;
  await updateYtdCache(monthVal);
  if (currentReq !== requestCounter) return;
  calculateSalary();
}

function clearInputs() {
  closeUrlopHint();
  document.querySelectorAll('input[type=number]').forEach(el => {
    if(el.id !== 'scheduleDays' && el.id !== 'profBaseSalary' && el.id !== 'baseSalary') el.value = '';
  });
  document.getElementById('extraBonus').value = '';
  setBonusForm(15);
  setSwitch('nightCarryOut', false);
  setCarryIn(false);
  const monthVal = document.getElementById('monthSelect').value;
  if(monthVal) document.getElementById('scheduleDays').value = stateDaysFor(monthVal);
}

function initMonths() {
  const select = document.getElementById('monthSelect');
  const currentVal = select.value; select.innerHTML = '';
  const dNames = dict[currentLang].monthNames;
  const months = monthList();
  for (const { id, year, monthIdx } of months) {
    let opt = document.createElement('option'); opt.value = id; opt.text = dNames[monthIdx] + " " + year;
    select.appendChild(opt);
  }
  select.value = currentVal || months.find(m => m.offset === 0).id;
}

/* ВІДПУСКНІ: підготовка даних з хмари (сам алгоритм — у calc.js) */

async function getAutoDailyUrlopBonus(currentMonthVal) {
  const year = parseInt(currentMonthVal.split('-')[0]);
  const cur = {
    baseSalary: Math.max(0, parseFloat(document.getElementById('baseSalary').value) || Number(userProfile.baseSalary)),
    minWage: getMinWage(year)
  };
  try {
    return computeDailyUrlopBonus(await sourceRecords(), currentMonthVal, cur);
  } catch (e) { return 0; }
}

async function autoFillUrlopBonus(monthVal) {
  const vacDays = Math.max(0, parseInt(document.getElementById('vacationDays').value) || 0);
  const urlopInput = document.getElementById('urlopBonus');
  if (fullFeatures && vacDays > 0 && (!urlopInput.value || parseFloat(urlopInput.value) === 0)) {
    const autoDaily = await getAutoDailyUrlopBonus(monthVal);
    if (autoDaily > 0) urlopInput.value = autoDaily.toFixed(2);
  }
}

/* Накопичена з початку року база PIT (для порога 120 000): місяці року ПЕРЕД поточним.
   Акаунт — з хмари, а без мережі з локальної копії; локальний профіль — його збережені місяці. */
let ytdState = { monthVal: '', prev: 0, found: 0, expected: 0 };
async function updateYtdCache(monthVal) {
  const [y, m] = monthVal.split('-');
  const yearIds = Array.from({ length: parseInt(m) - 1 }, (_, j) => `${y}-${String(j + 1).padStart(2, '0')}`);
  ytdState = yearToDate(await sourceRecords({ cached: yearIds }), monthVal, userProfile);
}

async function updateL4Cache(currentMonthVal) {
  const [yStr, mStr] = currentMonthVal.split('-'); let cYear = parseInt(yStr); let cMonth = parseInt(mStr);
  let targetMonths = [];
  for (let i = 1; i <= 12; i++) {
    let pMonth = cMonth - i; let pYear = cYear;
    if (pMonth <= 0) { pMonth += 12; pYear -= 1; }
    targetMonths.push(pYear + "-" + String(pMonth).padStart(2, '0'));
  }
  try {
    const records = await sourceRecords();
    let totalNetBase = 0; let monthsFound = 0;
    Object.keys(records).forEach(id => {
      if (targetMonths.includes(id)) {
        const docObj = { id, data: records[id] };
        const data = docObj.data;
        const pBase = Math.max(0, parseFloat(data.baseSalary) || userProfile.baseSalary);
        let pPct, pPPct;
        if (hasBonusTotal(data)) {
          ({ quality: pPct, presence: pPPct } = bonusSplit(data.bonusTotalPct, parseInt(data.l4Days) || 0));
        } else {
          pPct = parseFloat(data.bonusPctSelect); if (isNaN(pPct)) pPct = 10;
          pPPct = parseFloat(data.presencePctSelect); if (isNaN(pPPct)) pPPct = parseInt(data.l4Days) > 0 ? 0 : 5;
        }
        const mS = Math.max(0, parseInt(data.morningShifts) || 0);
        const aS = Math.max(0, parseInt(data.afternoonShifts) || 0);
        const nS = Math.max(0, parseInt(data.nightShifts) || 0);
        const overM = Math.max(0, parseInt(data.overtimeMorningShifts) || 0);
        const overN = Math.max(0, parseInt(data.overtimeNightShifts) || 0);
        const over = Math.max(0, parseFloat(data.overtimeDays) || 0);
        const wknd = Math.max(0, parseInt(data.weekendDays) || 0);
        const pYear = parseInt(docObj.id.split('-')[0]); const pMonthIdx = parseInt(docObj.id.split('-')[1]) - 1;
        const stDays = getNormHours(pYear, pMonthIdx) / 8;
        const pSched = parseInt(data.scheduleDays) || stDays;
        const res = compute({
          baseSalary: pBase, stateDays: stDays, schedDays: pSched, regWorkedDays: mS + aS + nS,
          morningShifts: mS, nightShifts: nS, overtimeMorningShifts: overM, overtimeNightShifts: overN,
          weekendDays: wknd, overtimeDays: over, vacDays: 0, dailyUrlopBonus: 0, extraBonus: 0,
          bloodDonationDays: 0, l4Days: 0, isPremium: false,
          isUnder26: userProfile.under26 === 'yes', ppkActive: userProfile.ppk === 'yes', insuranceActive: userProfile.insurance === 'yes', extraDeductionAmount: deductionOf(userProfile),
          qualityBonusPct: pPct, presenceBonusPct: pPPct, year: pYear, nightHoursAdjust: nightHoursAdjustOf(data)
        });
        totalNetBase += (res.gross * (1 - CONFIG.ZUS)); monthsFound++;
      }
    });
    window.cachedL4DailyRate = monthsFound > 0 ? (totalNetBase / monthsFound) / 30 : null;
  } catch(e) { console.warn('updateL4Cache:', e); }
}

function calculateSalary() {
  updateVisibility();
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return updateUI(0, 0);
  const [yStr, mStr] = monthVal.split('-');
  const cYear = parseInt(yStr); const cMonthIdx = parseInt(mStr) - 1;
  const stateDays = getNormHours(cYear, cMonthIdx) / 8;
  let baseSalary = Math.max(0, parseFloat(document.getElementById('baseSalary').value) || userProfile.baseSalary);
  const schedInput = document.getElementById('scheduleDays');
  const bonusL4Days = Math.max(0, parseInt(document.getElementById('l4Days').value) || 0);   // як у записі місяця, без огляду на fullFeatures
  const split = bonusSplit(selectedBonusPct(), bonusL4Days);
  const inputs = {
    baseSalary, stateDays, year: cYear,
    schedDays: parseInt(schedInput.value) || stateDays,
    morningShifts: Math.max(0, parseInt(document.getElementById('morningShifts').value) || 0),
    afternoonShifts: Math.max(0, parseInt(document.getElementById('afternoonShifts').value) || 0),
    nightShifts: Math.max(0, parseInt(document.getElementById('nightShifts').value) || 0),
    overtimeDays: Math.max(0, parseFloat(document.getElementById('overtimeDays').value) || 0),
    overtimeMorningShifts: Math.max(0, parseInt(document.getElementById('overtimeMorningShifts').value) || 0),
    overtimeNightShifts: Math.max(0, parseInt(document.getElementById('overtimeNightShifts').value) || 0),
    weekendDays: Math.max(0, parseInt(document.getElementById('weekendDays').value) || 0),
    vacDays: fullFeatures ? Math.max(0, parseInt(document.getElementById('vacationDays').value) || 0) : 0,
    dailyUrlopBonus: fullFeatures ? Math.max(0, parseFloat(document.getElementById('urlopBonus').value) || 0) : 0,
    extraBonus: Math.max(0, parseFloat(document.getElementById('extraBonus').value) || 0),
    bloodDonationDays: fullFeatures ? Math.max(0, parseInt(document.getElementById('bloodDonationDays').value) || 0) : 0,
    l4Days: fullFeatures ? Math.max(0, parseInt(document.getElementById('l4Days').value) || 0) : 0,
    qualityBonusPct: legacyBonus ? legacyBonus.quality : split.quality,
    presenceBonusPct: legacyBonus ? legacyBonus.presence : split.presence,
    isUnder26: userProfile.under26 === 'yes',
    ppkActive: userProfile.ppk === 'yes',
    insuranceActive: userProfile.insurance === 'yes',
    extraDeductionAmount: deductionOf(userProfile),
    isPremium: fullFeatures, l4DailyRateCached: window.cachedL4DailyRate,
    nightHoursAdjust: nightHoursAdjustOf({ nightCarryOut: isCarryOn('nightCarryOut'), nightCarryIn: isCarryOn('nightCarryIn') })
  };
  inputs.regWorkedDays = inputs.morningShifts + inputs.afternoonShifts + inputs.nightShifts;
  const res = compute(inputs);
  // Поріг PIT 120 000: зі збережених місяців року (акаунт або локальний профіль). Нижче порога extraPit = 0,
  // тож результат такий самий, як у compute(); понад поріг — 32% замість 12% з надлишку.
  const ytd = fullFeatures && ytdState.monthVal === monthVal && !inputs.isUnder26 ? ytdState : null;
  const extraPit = ytd ? pitExtra(res, ytd.prev) : 0;
  const net = res.net - extraPit;
  if (inputs.bloodDonationDays > 0) document.getElementById('bloodBonus').value = res.autoDailyBlood.toFixed(2);
  updateUI(res.gross, net);
  const adj = inputs.nightHoursAdjust;
  document.getElementById('infoNightCarryVal').innerText = adj > 0 ? `+${adj}` : adj < 0 ? `−${-adj}` : '0';
  const totalNightMinutes = Math.round(((res.totalMorningShifts * (10/60)) + Math.max(0, res.totalNightShifts * 8 + adj)) * 60);
  const nHours = Math.floor(totalNightMinutes / 60); const nMins = totalNightMinutes % 60;
  document.getElementById('infoNightHours').innerText = nHours > 0 ? `${nHours} ${dict[currentLang].hoursShort} ${nMins} ${dict[currentLang].minsShort}` : `${nMins} ${dict[currentLang].minsShort}`;
  showBonusRow(res.presenceBonusPct + res.qualityBonusPct, selectedBonusPct(), bonusL4Days);
  document.getElementById('infoNightShiftsCount').innerText = res.totalNightShifts;
  setFormatSum('infoBasePayVal', res.adjustedBase);
  setFormatSum('infoBonusSum', res.bonusAmount, true);
  setFormatSum('infoExtraBonusSum', res.extraBonus, true);
  setFormatSum('infoNightTimeSum', res.totalNightTimePay);
  setFormatSum('infoNightShiftSum', res.totalNightShiftPay);
  setFormatSum('infoWeekendSum', res.totalWeekendPay);
  setFormatSum('infoOvertimeSum', res.totalOvertimePay);
  setFormatSum('infoOvertimeNetSum', res.totalOvertimeNet, true);
  setFormatSum('infoVacationSum', res.totalUrlopBonus);
  setFormatSum('infoBloodSum', res.bloodDonationPay);
  setFormatSum('infoL4Sum', res.l4Pay);
  document.getElementById('infoTotalBrutto').innerText = formatPLN(res.gross);
  document.getElementById('infoTotalNetto').innerText = formatPLN(net);
  document.getElementById('rowPitExtra').classList.toggle('hidden', !(extraPit > 0));
  document.getElementById('infoPitExtraVal').innerText = formatPLN(extraPit);
  document.getElementById('rowPitYtd').classList.toggle('hidden', !ytd);
  document.getElementById('pitYtdNote').classList.toggle('hidden', !(ytd && ytd.found < ytd.expected));
  if (ytd) {
    document.getElementById('infoPitYtdVal').innerText = formatPLN(ytd.prev + pitBaseOf(res));
    document.getElementById('pitYtdNote').innerText = dict[currentLang].pitYtdNote.replace('{found}', ytd.found).replace('{expected}', ytd.expected);
  }
  document.getElementById('infoWorkedDaysVal').innerText = res.regWorkedDays;
  document.getElementById('infoTotalDaysVal').innerText = res.totalEngagedDays;
  document.getElementById('infoSchedVal').innerText = inputs.schedDays;
  document.getElementById('infoNightTariffVal').innerText = formatPLN(res.nightTariff) + dict[currentLang].perHour;
  const wage = minWageInfo(cYear);
  const wageText = wage.source === 'official' ? ''
    : (wage.source === 'user' ? dict[currentLang].minWageUser : dict[currentLang].minWageUnknown)
      .replace('{year}', cYear).replace('{sum}', formatPLN(wage.value)).replace('{knownYear}', wage.knownYear);
  document.getElementById('minWageNote').classList.toggle('hidden', !wageText);
  document.getElementById('minWageNote').innerText = wageText;
  showBreakdown(res, inputs, extraPit);
}

/* Згорнутий список відрахувань унизу «Деталей». ZUS, NFZ і PIT показуються завжди, решта — лише ненульові. */
function showBreakdown(res, inputs, extraPit) {
  const b = deductionsBreakdown(res, inputs, extraPit);
  const put = (id, text) => { document.getElementById(id).innerText = text; };
  const row = (name, value, always = false) => {
    document.getElementById('ded' + name).classList.toggle('hidden', !always && value === 0);
    put(`ded${name}Val`, formatPLN(value));
  };
  put('deductionsTitle', dict[currentLang].dedTitle.replace('{sum}', formatPLN(b.total)));
  row('ZusEmerytalne', b.rows.zusEmerytalne, true);
  row('ZusRentowe', b.rows.zusRentowe, true);
  row('ZusChorobowe', b.rows.zusChorobowe, true);
  row('Nfz', b.rows.nfz, true);
  row('Pit', b.rows.pit, true);
  put('dedPitLabel', inputs.isUnder26 ? dict[currentLang].dedPitExempt : dict[currentLang].dedPit);
  if (inputs.isUnder26) put('dedPitVal', '');          // «— 0» уже в назві рядка
  row('PitExtra', b.rows.pitExtra);
  row('Ppk', b.rows.ppk);
  row('BenefitZus', b.rows.benefitZus);
  row('BenefitTax', b.rows.benefitTax);
  row('Extra', b.rows.deduction);
  row('Laundry', b.laundry);
  put('dedLaundryVal', '+' + formatPLN(b.laundry));
  put('dedTotalVal', formatPLN(b.total));
  put('dedCheckVal', `${formatPLN(res.gross)} − ${formatPLN(b.total)} + ${formatPLN(b.laundry)} = ${formatPLN(res.net - extraPit)}`);
  document.getElementById('dedRoundNote').classList.toggle('hidden', !(b.roundingDiffers || b.checkDiffers));
}

/* «Деталі»: «Премія 15 %», а коли L4 зменшив обраний відсоток — ще «(15 % − 2,5 % за L4)». */
function showBonusRow(pct, selected, l4Days) {
  const fmt = v => String(v).replace('.', ',') + dict[currentLang].pctSign;
  const reduced = pct !== selected && pct === effectiveBonusPct(selected, l4Days);
  document.getElementById('infoBonusPct').innerText = fmt(pct);
  document.getElementById('infoBonusL4').innerText = reduced
    ? dict[currentLang].infoBonusL4.replace('{selected}', fmt(selected)).replace('{cut}', fmt(l4BonusCut(l4Days))) : '';
}

function setFormatSum(id, val, isHighlight = false) {
  const el = document.getElementById(id);
  if (el) { el.innerText = formatPLN(val); el.style.color = val === 0 ? 'var(--text-muted)' : (isHighlight ? 'var(--success)' : 'var(--text-main)'); }
}

function updateUI(g, n) {
  refreshPeriod();
  document.getElementById('grossResult').innerText = formatPLN(g);
  document.getElementById('netResult').innerText = formatPLN(n);
}

const appBody = document.getElementById('app-body');

/* Поля, що очищаються від дотику: числові та позначені data-clear-on-focus. Значення атрибута — що показати,
   коли користувач стер таке поле й вийшов (відрахування: «0»; мінімалка: порожньо = видалити). */
const clearsOnFocus = el => el.tagName === 'INPUT' && !el.readOnly && (el.type === 'number' || el.hasAttribute('data-clear-on-focus'));

appBody.addEventListener('focusin', e => {
  if (clearsOnFocus(e.target)) {
    e.target.dataset.prevVal = e.target.value; e.target.value = '';
    delete e.target.dataset.edited;
  }
});

/* Позначаємо, що користувач щось вводив у полі: тоді порожнє значення — його свідомий вибір,
   і старе значення при виході з поля повертати не можна (розрахунок і збереження вже з порожнім). */
appBody.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.prevVal !== undefined) e.target.dataset.edited = '1';
});

appBody.addEventListener('focusout', e => {
  if (clearsOnFocus(e.target)) {
    if (e.target.value === '' && e.target.dataset.prevVal !== undefined) {
      if (!e.target.dataset.edited) {
        e.target.value = e.target.dataset.prevVal;               // просто торкнулись і вийшли — повертаємо як було
      } else if (e.target.id === 'baseSalary') {
        e.target.value = userProfile.baseSalary;                 // порожня ставка = ставка з профілю (так рахує calculateSalary)
        saveLocalGuestData();
      } else if (e.target.type !== 'number' && e.target.getAttribute('data-clear-on-focus')) {
        e.target.value = e.target.getAttribute('data-clear-on-focus');
      }
    }
    if (e.target.id === 'scheduleDays' && !e.target.value) {
      e.target.value = stateDaysFor(document.getElementById('monthSelect').value);
      calculateSalary();
    }
    delete e.target.dataset.prevVal; delete e.target.dataset.edited;
    if (e.target.id === 'profExtraDeduction') settleDeduction();   // після повернення попереднього значення чи «0»
  }
});

appBody.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'monthSelect' || !isMonthField(e.target)) return;
  leaveLegacyBonus(id);
  if (SCHED_IDS.includes(id)) syncSchedule();
  calculateSalary(); saveLocalGuestData();
  if (id === 'vacationDays') {
    revealUrlopHintOnce();
    autoFillUrlopBonus(document.getElementById('monthSelect').value).then(() => { calculateSalary(); saveLocalGuestData(); });
  }
});

appBody.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'monthSelect') {
    document.getElementById('scheduleDays').value = stateDaysFor(e.target.value);
    if (auth.currentUser) loadCloudData(); else return loadLocalData();
  } else if (isMonthField(e.target)) {
    leaveLegacyBonus(id);
    calculateSalary(); saveLocalGuestData();
  }
});

/* Дотик до повзунка чи до його рядка (<label>): зміна місяця, як і в інших полів. */
function toggleCarry(id) {
  if (document.getElementById(id).disabled) return;
  setSwitch(id, !switchOn(id));
  if (id === 'nightCarryIn') document.getElementById('nightCarryInHint').classList.add('hidden');   // далі це вибір користувача
  leaveLegacyBonus(id);
  calculateSalary(); saveLocalGuestData();
  if (id === 'nightCarryOut' && !auth.currentUser) warnGuestNextCarryIn();
}
for (const id of CARRY_IDS) document.getElementById(id).addEventListener('click', () => toggleCarry(id));

/* Гість зберігається одразу при редагуванні, тож підказуємо в момент, коли вмикають перехід. */
function warnGuestNextCarryIn() {
  const monthVal = document.getElementById('monthSelect').value;
  const next = localRecords()[shiftMonthId(monthVal, -1)];
  if (takeNextCarryInWarning(monthVal, { nightCarryOut: isCarryOn('nightCarryOut') }, next)) showToast(dict[currentLang].toastNextCarryIn, 8000);
}

document.addEventListener('click', e => {
  const p = e.target.closest('[data-page]'); if (p) { switchPage(Number(p.dataset.page)); return; }
  const st = e.target.closest('[data-step]');
  if (st) { const s = document.getElementById('monthSelect'), i = s.selectedIndex + Number(st.dataset.step);
    if (i >= 0 && i < s.options.length) { s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); } }
});

// «Параметри» → «Вигляд» (обробники тут, а не в розмітці: CSP без 'unsafe-inline')
document.getElementById('langUk').addEventListener('click', () => window.setLang('uk'));
document.getElementById('langPl').addEventListener('click', () => window.setLang('pl'));
document.getElementById('themeSwitch').addEventListener('click', () => window.setTheme(switchOn('themeSwitch') ? 'light' : 'dark'));

/* ВКЛАДКА «ПРОФІЛЬ»: рядок профілів-«пігулок» (дотик — одразу активний), «+», «i»; назва й налаштування; «Зберегти».
   Видалення — у два кроки на сторінці (без alert/confirm/prompt). */
let profileEdit = null;          // null | { kind: 'add' } | { kind: 'first' } (перший запуск)
let profileDeleteId = null;      // профіль, видалення якого чекає підтвердження
let signedInEmail = '';

function renderProfiles() {
  const t = dict[currentLang];
  const kind = profileEdit ? profileEdit.kind : null;
  document.getElementById('profilesSignedIn').classList.toggle('hidden', !signedIn);
  document.getElementById('profilesSignedIn').innerText = signedIn ? t.profilesSignedIn.replace('{email}', signedInEmail) : '';
  // Поки є вхід — одна «пігулка» з email акаунта; локальні профілі неактивні.
  document.getElementById('profileList').replaceChildren(...(signedIn
    ? [profilePill(signedInEmail, true, null)]
    : profiles.list.map(p => profilePill(profileLabel(p), p.id === profiles.active && kind !== 'add', p.id))));
  document.getElementById('btn-profile-add').classList.toggle('hidden', signedIn);
  document.getElementById('btn-profile-add').setAttribute('aria-pressed', String(kind === 'add'));
  document.getElementById('profileNameRow').classList.toggle('hidden', signedIn);
  document.getElementById('secProfileLabel').classList.toggle('hidden', signedIn);
  if (signedIn) showProfileNameError(null);
  if (profiles.list.length <= 1 || signedIn) profileDeleteId = null;
  const target = profiles.list.find(p => p.id === profileDeleteId);
  document.getElementById('btn-profile-delete').classList.toggle('hidden', signedIn || !!kind || profiles.list.length <= 1);
  document.getElementById('btn-profile-cancel').classList.toggle('hidden', kind !== 'add');
  document.getElementById('profileDelete').classList.toggle('hidden', !target);
  document.getElementById('profileDeleteText').innerText = target ? t.profileDeleteConfirm.replace('{name}', profileLabel(target)) : '';
  document.getElementById('profileFoot').classList.toggle('hidden', !!target);
  document.getElementById('btn-save-profile').textContent = kind === 'first' ? t.firstCreate : t.profileNameSave;
  document.getElementById('btn-save-profile').classList.toggle('wide', kind === 'first');
  // Поле «Назва»: назва активного профілю (інший профіль або автоназва іншою мовою — оновлюємо; введене до «Зберегти» не чіпаємо)
  const nameInput = document.getElementById('profileName'), active = activeProfile(profiles);
  if (!signedIn && !kind && (nameInput.dataset.profileId !== profiles.active || active.autoName)) nameInput.value = profileLabel(active);
  nameInput.dataset.profileId = kind ? '' : profiles.active;
  renderWho();
}

/* Під назвою застосунку в шапці: назва активного локального профілю або email акаунта (на першому запуску — нічого). */
function renderWho() {
  const el = document.getElementById('whoBadge');
  const text = signedIn ? signedInEmail : firstRun ? '' : profileLabel(activeProfile(profiles));
  el.textContent = text;
  el.setAttribute('title', text);
}

/* «Пігулка»: коло з першою літерою + назва. id = null — пігулка акаунта (нічого не перемикає). */
function profilePill(name, active, id) {
  const make = (tag, className, text) => { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const letter = [...String(name).trim()][0];
  const btn = make('button', 'prof-pill'), ini = make('span', 'prof-ini', letter ? letter.toLocaleUpperCase() : '?'), label = make('span', 'prof-name', name);
  btn.type = 'button';
  ini.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-pressed', String(active));
  btn.setAttribute('title', name);
  btn.appendChild(ini); btn.appendChild(label);
  if (id) btn.addEventListener('click', () => (id === profiles.active ? closeProfilePanels() : switchProfile(id)));
  return btn;
}

let profileNameError = null;
function showProfileNameError(error) {
  profileNameError = error;
  const el = document.getElementById('profileNameError');
  el.classList.toggle('hidden', !error);
  el.innerText = error === 'duplicate' ? dict[currentLang].errProfileDuplicate : error ? dict[currentLang].errProfileName : '';
}

/* «+»: та сама форма з порожньою назвою й налаштуваннями нового профілю. */
function openAddProfile() {
  if (signedIn || firstRun) return;
  profileEdit = { kind: 'add' }; profileDeleteId = null;
  const input = document.getElementById('profileName');
  input.value = '';
  fillProfileForm(NEW_PROFILE());
  showProfileNameError(null);
  renderProfiles();
  if (input.focus) input.focus();
}

/* «Скасувати» (і дотик до активної пігулки): назад до активного профілю — його назва й налаштування. */
function closeProfilePanels() {
  if (profileEdit && profileEdit.kind === 'first') return;
  const wasAdding = !!(profileEdit && profileEdit.kind === 'add');
  profileEdit = null; profileDeleteId = null; showProfileNameError(null);
  if (wasAdding) { document.getElementById('profileName').dataset.profileId = ''; fillProfileForm(userProfile); }
  renderProfiles();
}

/* Інший активний профіль (або видалено активний): одразу перезавантажуємо місяць, налаштування профілю, «Деталі», статистику. */
async function applyProfiles(state, { force = false } = {}) {
  const changed = force || state.active !== profiles.active;
  const wasAdding = !!(profileEdit && profileEdit.kind === 'add');
  profiles = state; profileEdit = null; profileDeleteId = null;
  renderProfiles();
  if (wasAdding && !changed && !signedIn) fillProfileForm(userProfile);
  if (!changed || signedIn) return;
  carryInWarned.clear();
  window.cachedL4DailyRate = null; ytdState = { monthVal: '', prev: 0, found: 0, expected: 0 };
  await loadProfile();
  await loadLocalData();
  calculateSalary();
  resetStatsView();
}

async function switchProfile(id) {
  if (signedIn) return;
  const r = setActiveProfile(localStorage, id);
  if (r.ok) await applyProfiles(r.state);
}

/* «+» → «Зберегти»: новий профіль з налаштуваннями з форми, одразу активний. */
async function createAnotherProfile(nameText, settings) {
  const r = createProfile(localStorage, nameText);
  if (!r.ok) return showProfileNameError(r.error);
  profileStorage(localStorage, r.id).setItem(GUEST_PROFILE_KEY, JSON.stringify(settings));
  await applyProfiles(setActiveProfile(localStorage, r.id).state);
  showToast(dict[currentLang].toastProfOk);
}

/* Перший запуск → «Створити профіль»: profiles_v1 з профілем 'default' під введеною назвою + його налаштування;
   далі звичайний застосунок на вкладці «Розрахунок». */
async function createFirstProfile(nameText, settings) {
  ensureProfiles(localStorage);
  const r = renameProfile(localStorage, DEFAULT_ID, nameText);
  if (!r.ok) return showProfileNameError(r.error);
  profileStorage(localStorage, DEFAULT_ID).setItem(GUEST_PROFILE_KEY, JSON.stringify(settings));
  setFirstRun(false);
  await applyProfiles(r.state, { force: true });
}

/* Екран першого запуску: вкладка «Профіль» без нижнього меню, з привітанням і кнопкою «Створити профіль». */
function setFirstRun(on) {
  const was = firstRun;
  firstRun = on;
  document.getElementById('app-body').classList.toggle('first-run', on);
  if (on) {
    profiles = MEMORY_PROFILES();
    profileEdit = { kind: 'first' }; profileDeleteId = null;
    document.getElementById('profileName').value = '';
    showProfileNameError(null);
    switchPage(4);
  } else if (was) {
    if (profileEdit && profileEdit.kind === 'first') profileEdit = null;
    switchPage(1);
  }
}

async function confirmDeleteProfile() {
  if (!profileDeleteId || signedIn) return;
  const r = deleteProfile(localStorage, profileDeleteId);
  profileDeleteId = null;
  if (r.ok) await applyProfiles(r.state); else renderProfiles();
}

document.getElementById('btn-profile-add').addEventListener('click', openAddProfile);
document.getElementById('btn-profile-cancel').addEventListener('click', closeProfilePanels);
document.getElementById('btn-profile-delete').addEventListener('click', () => {
  if (profiles.list.length <= 1 || signedIn) return;
  profileEdit = null; profileDeleteId = profiles.active; renderProfiles();
});
document.getElementById('btn-profile-delete-yes').addEventListener('click', confirmDeleteProfile);
document.getElementById('btn-profile-delete-no').addEventListener('click', closeProfilePanels);
document.getElementById('profileName').addEventListener('input', () => showProfileNameError(null));
/* «i» біля рядка профілів: пояснення згорнуте, дотик розгортає / згортає. */
function showProfilesInfo(open) {
  document.getElementById('btn-profiles-info').setAttribute('aria-expanded', String(open));
  document.getElementById('profilesInfo').classList.toggle('hidden', !open);
}
showProfilesInfo(false);
document.getElementById('btn-profiles-info').addEventListener('click', () => showProfilesInfo(document.getElementById('btn-profiles-info').getAttribute('aria-expanded') !== 'true'));

/* ПАНЕЛЬ ХМАРИ (знизу; відкривається кнопкою хмари в шапці). role="dialog", aria-modal; фокус — у панель і назад на кнопку.
   Закривається хрестиком, дотиком до затемнення, Esc і кнопкою «Назад» (Android: MainActivity викликає salaryBack();
   у браузері — запис в історії й popstate). */
let sheetOpen = false;
const sheetEl = () => document.getElementById('cloudSheet');
const focusEl = el => { if (el && el.focus) el.focus(); };
function openCloudSheet() {
  if (sheetOpen) return;
  sheetOpen = true;
  sheetEl().classList.remove('hidden');
  document.getElementById('cloudBackdrop').classList.remove('hidden');
  document.getElementById('app-body').classList.add('sheet-open');
  document.getElementById('btn-cloud').setAttribute('aria-expanded', 'true');
  for (const id of ['appHeader', 'appMain']) document.getElementById(id).inert = true;
  renderCloud();
  if (globalThis.history && history.pushState) { try { history.pushState({ cloudSheet: true }, ''); } catch (e) { /* без історії: хрестик і затемнення */ } }
  focusEl(document.getElementById('btn-cloud-close'));
}
function closeCloudSheet({ fromHistory = false } = {}) {
  if (!sheetOpen) return false;
  sheetOpen = false;
  sheetEl().classList.add('hidden');
  document.getElementById('cloudBackdrop').classList.add('hidden');
  document.getElementById('app-body').classList.remove('sheet-open');
  document.getElementById('btn-cloud').setAttribute('aria-expanded', 'false');
  for (const id of ['appHeader', 'appMain']) document.getElementById(id).inert = false;
  if (!fromHistory && globalThis.history && history.state && history.state.cloudSheet) { try { history.back(); } catch (e) { /* немає історії */ } }
  focusEl(document.getElementById('btn-cloud'));
  return true;
}
document.getElementById('btn-cloud').addEventListener('click', openCloudSheet);
document.getElementById('btn-cloud-close').addEventListener('click', () => closeCloudSheet());
document.getElementById('cloudBackdrop').addEventListener('click', () => closeCloudSheet());
window.addEventListener('popstate', () => closeCloudSheet({ fromHistory: true }));
window.salaryBack = () => closeCloudSheet();               // true — «Назад» закрив панель; false — звичайна дія Android
document.addEventListener('keydown', e => {
  if (!sheetOpen) return;
  if (e.key === 'Escape') { closeCloudSheet(); return; }
  if (e.key !== 'Tab') return;                             // фокус не виходить за межі панелі
  const items = [...sheetEl().querySelectorAll('button, input')].filter(el => !el.closest('.hidden') && !el.disabled);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* Стан хмари для іконки й панелі: немає входу — 'out'; вхід є і синхронізовано — 'ok'; немає мережі чи помилка — 'off'. */
let syncState = null;            // null (немає входу) | 'pending' | 'ok' | 'error'
let lastSyncAt = 0;
function markSync(ok) {
  if (!signedIn) return;
  syncState = ok ? 'ok' : 'error';
  if (ok) lastSyncAt = Date.now();
  renderCloud();
}
const cloudIconState = () => (!signedIn ? 'out' : navigator.onLine === false || syncState === 'error' ? 'off' : 'ok');
function renderCloud() {
  const t = dict[currentLang], state = cloudIconState();
  document.getElementById('btn-cloud').setAttribute('data-state', state);
  const el = document.getElementById('cloudSyncState');
  const locale = currentLang === 'pl' ? 'pl-PL' : 'uk-UA';
  let text = '';
  if (state === 'off') text = t.cloudNoConn;
  else if (state === 'ok' && syncState === 'ok' && lastSyncAt) {
    const at = new Date(lastSyncAt), today = new Date().toDateString() === at.toDateString();
    const time = at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    text = t.cloudSynced.replace('{time}', today ? time : `${at.toLocaleDateString(locale)} ${time}`);
  } else if (state === 'ok') text = t.cloudPending;
  el.textContent = text;
  el.classList.toggle('ok', state === 'ok' && syncState === 'ok');
}
window.addEventListener('offline', () => renderCloud());
window.addEventListener('online', () => { renderCloud(); if (signedIn && syncState === 'error') probeCloud(); });
/* Мережа повернулась після помилки: перевіряємо, що хмара відповідає (поля місяця не перезавантажуємо). */
async function probeCloud() {
  if (!auth.currentUser || !cloudAvailable) return;
  try { await withTimeout(getDocs(collection(db, "users", auth.currentUser.uid, "months")), SAVE_TIMEOUT_MS()); markSync(true); }
  catch (e) { markSync(false); }
}

/* ВКЛАДКА «СТАТИСТИКА»: підсумки за період (цифри рахують ті самі calc.js + pit.js, що й калькулятор).
   Період: останні 3/6/12 місяців або вибрані роки. Майбутніх місяців немає: максимум — поточний.
   Джерело: локальний профіль — його guest_month_* (sourceRecords); акаунт — хмара, а без мережі локальні копії місяців. */
const DEFAULT_PERIOD = () => ({ mode: '12', years: [] });
let statsPeriod = DEFAULT_PERIOD();   // { mode: '3'|'6'|'12'|'years', years: [] }
let statsPick = null;      // вибраний на графіку стовпчик (key)
let statsToken = 0;        // відкидає застарілі відповіді при швидкому перемиканні вкладок
let statsLast = null;      // { years, stats } — щоб перемальовувати (мова, вибір стовпчика) без повторного читання даних
const statsNow = () => (TEST.now !== undefined ? new Date(TEST.now) : new Date());   // «сьогодні»; у тестах підміняється

async function renderStats({ reset = false } = {}) {
  const token = ++statsToken;
  const records = await sourceRecords({ cached: 'all' });
  if (token !== statsToken) return;
  const now = statsNow(), years = availableYears(records, now);
  if (reset) { statsPeriod = DEFAULT_PERIOD(); statsPick = null; }
  statsPeriod = normalizePeriod(statsPeriod, years, now);
  statsLast = { years, stats: collectPeriodStats(records, statsPeriod, userProfile, { premium: fullFeatures, now }) };
  paintStats();
}

function setStatsMode(mode) {
  if (!statsLast || statsPeriod.mode === mode) return;
  statsPeriod = { mode, years: statsPeriod.years }; statsPick = null;
  renderStats().catch(e => console.warn('Статистика:', e));
}

function toggleStatsYear(year) {
  if (!statsLast || statsPeriod.mode !== 'years') return;
  const set = new Set(statsPeriod.years);
  if (set.has(year)) { if (set.size > 1) set.delete(year); } else set.add(year);       // останній рік зняти не можна
  statsPeriod = { mode: 'years', years: [...set] }; statsPick = null;
  renderStats().catch(e => console.warn('Статистика:', e));
}

function paintStats() {
  if (!statsLast) return;
  const t = dict[currentLang], names = t.monthNames, { years, stats } = statsLast, { buckets, mix, totals, kind, ids, missing } = stats;
  const multiYear = new Set(ids.map(id => id.slice(0, 4))).size > 1;
  const label = (year, month) => `${names[month - 1]}${multiYear ? ' ' + year : ''}`;
  const monthLine = b => b.has
    ? `${label(b.year, b.month)}: ${t.statsGross} ${formatPLN(b.gross)} · ${t.statsNet} ${formatPLN(b.net)}`
    : `${label(b.year, b.month)}: ${t.statsNoMonth}`;
  const yearLine = b => b.has
    ? `${b.year}: ${t.statsPerMonth}: ${t.statsGross} ${formatPLN(b.gross)} · ${t.statsNet} ${formatPLN(b.net)} (${b.months} / ${b.expected} ${t.statsMonthsShort})`
    : `${b.year}: ${t.statsNoMonth}`;
  const lineOf = kind === 'year' ? yearLine : monthLine;

  // фільтр: режим, роки, підпис діапазону
  document.querySelectorAll('#periodPills .pill').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mode === statsPeriod.mode)));
  const yearBox = document.getElementById('yearPills');
  yearBox.classList.toggle('hidden', statsPeriod.mode !== 'years');
  yearBox.replaceChildren(...years.map(y => {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pill'; btn.textContent = String(y);
    btn.setAttribute('aria-pressed', String(statsPeriod.years.includes(y)));
    btn.addEventListener('click', () => toggleStatsYear(y));
    return btn;
  }));
  const range = document.getElementById('periodRange');
  if (stats.from) {
    const f = stats.from.split('-').map(Number), l = stats.to.split('-').map(Number);
    range.textContent = `${names[f[1] - 1]} ${f[0]} – ${names[l[1] - 1]} ${l[0]}`;
  } else range.textContent = '';

  // місяці без даних у вибраному періоді (майбутніх немає за побудовою періоду)
  const missBox = document.getElementById('statsMissing');
  missBox.classList.toggle('hidden', missing.length === 0);
  document.getElementById('statsMissingTitle').textContent = `${t.statsMissingN} ${missing.length}`;
  document.getElementById('statsMissingList').replaceChildren(...missing.map(id => {
    const li = document.createElement('li'); const [y, m] = id.split('-').map(Number);
    li.textContent = `${names[m - 1]} ${y}`; return li;
  }));

  const empty = totals.count === 0;
  document.getElementById('statsEmpty').classList.toggle('hidden', !empty);
  document.getElementById('statsBody').classList.toggle('hidden', empty);
  if (empty) return;

  document.getElementById('statsIncomeTitle').textContent = kind === 'year' ? t.statsIncomeYears : t.statsIncome;
  const labels = buckets.map(b => (kind === 'year' ? String(b.year) : names[b.month - 1].slice(0, 3)));
  const subLabels = kind === 'month' && multiYear ? buckets.map((b, i) => (i === 0 || b.month === 1 ? String(b.year) : '')) : null;
  const picked = buckets.find(b => b.key === statsPick);
  if (!picked) statsPick = null;
  drawIncomeChart(document, document.getElementById('incomeChart'), buckets, {
    labels, subLabels, selected: statsPick, ariaLabel: t.statsChartAria, pickLabel: lineOf,
    onPick: key => { statsPick = key; paintStats(); }
  });
  document.getElementById('statsPick').textContent = picked ? lineOf(picked) : t.statsPickHint;

  const total = Object.values(mix).reduce((s, v) => s + v, 0);
  drawMixChart(document, document.getElementById('mixChart'), mix, { ariaLabel: t.statsMixAria, centerText: String(Math.round(total * 10) / 10), unitText: t.mixUnitCenter });
  drawMixLegend(document, document.getElementById('mixLegend'), mix,
    { regular: t.mixRegular, night: t.mixNight, overtime: t.mixOvertime, vacation: t.mixVacation, l4: t.mixL4, excused: t.mixExcused }, { unit: t.mixUnit });

  document.getElementById('statsGrossVal').textContent = formatPLN(totals.gross);
  document.getElementById('statsNetVal').textContent = formatPLN(totals.net);
  document.getElementById('statsAvgVal').textContent = formatPLN(totals.avgNet);
  document.getElementById('statsBestVal').textContent = totals.best ? `${label(totals.best.year, totals.best.month)} · ${formatPLN(totals.best.net)}` : '-';
  document.getElementById('statsCountVal').textContent = `${totals.count} / ${totals.expected}`;
}

document.querySelectorAll('#periodPills .pill').forEach(btn => btn.addEventListener('click', () => setStatsMode(btn.dataset.mode)));


// Повідомлення про нову версію: js/sw-register.js диспатчить подію, коли новий service worker перейняв керування
const updateBanner = document.getElementById('update-banner');
window.addEventListener('salary:update-ready', () => updateBanner.classList.remove('hidden'));
document.getElementById('btn-update').addEventListener('click', () => location.reload());
document.getElementById('btn-update-later').addEventListener('click', () => updateBanner.classList.add('hidden'));
setUserMinWages(readUserMinWages(localStorage));        // до першого розрахунку
setTheme(localStorage.getItem('theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
window.setLang(currentLang);
switchPage(1);
if (firstRun) setFirstRun(true);
handleAuthState(null).finally(() => { guestReady = true; initCloud(); });

/* --- СВАЙП-НАВІГАЦІЯ МІЖ ВІКНАМИ --- */
let touchStartX = 0, touchStartY = 0;
const swipeThreshold = 50; // Мінімальна довжина свайпу в пікселях

document.addEventListener('touchstart', e => {
  // Ігноруємо свайпи на полях вводу, селекторах та нижній панелі вкладок
  if (sheetOpen || firstRun || e.target.closest('input, select, button, .tabs, .ctl, .prof-strip, .segmented, .sheet, .seg, .chart-host')) return;
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
  if (sheetOpen || firstRun || e.target.closest('input, select, button, .tabs, .ctl, .prof-strip, .segmented, .sheet, .seg, .chart-host')) return;
  const touchEndX = e.changedTouches[0].screenX;
  const touchEndY = e.changedTouches[0].screenY;
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  // Перевіряємо, чи рух був горизонтальним і чи перевищив поріг спрацьовування
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > swipeThreshold) {
    if (dx < 0) {
      // Свайп вліво -> Наступна сторінка (до 5)
      if (currentActivePage < 5) switchPage(currentActivePage + 1);
    } else {
      // Свайп вправо -> Попередня сторінка (до 1)
      if (currentActivePage > 1) switchPage(currentActivePage - 1);
    }
  }
}, { passive: true });
