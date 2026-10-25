import { dict } from './i18n.js';
import { CONFIG, getNormHours, stateDaysFor, getMinWage, compute, computeDailyUrlopBonus } from './calc.js';
import { formatPLN, showToast } from './utils.js';
import { saveMonthCache, loadMonthCache, clearMonthCache, listMonthCache } from './monthcache.js';
import { pitBaseOf, pitExtra, yearToDate } from './pit.js';
import { collectPeriodStats, readGuestRecords, availableYears, normalizePeriod } from './stats.js';
import { drawIncomeChart, drawMixChart, drawMixLegend } from './charts.js';

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
        if (!user && guestReady && !isPremium) return;
        return handleAuthState(user);
      });
      return true;
    })
    .catch(err => { console.warn('Firebase недоступний:', err); cloudPromise = null; return false; });
  return cloudPromise;
}

window.addEventListener('online', () => { initCloud(); });

const NON_MONTH_IDS = new Set(['langSelect', 'themeSelect', 'email', 'password', 'profBaseSalary', 'profUnder26', 'profPpk', 'profIns']);

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
let isPremium = false;
let currentActivePage = 1;
let requestCounter = 0;
let monthsCollectionCache = null;
let userProfile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
window.cachedL4DailyRate = null;

/* ПРОФІЛЬ ТА МЕНЮ ПРИВ'ЯЗКА ДО АКАУНТУ */

async function loadProfile() {
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  const localKey = `user_profile_${uid}`;
  userProfile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
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
    const savedLocal = localStorage.getItem(localKey);
    if (savedLocal) try { userProfile = { ...userProfile, ...JSON.parse(savedLocal) }; } catch(e) {}
  }
  document.getElementById('profBaseSalary').value = userProfile.baseSalary;
  document.getElementById('profUnder26').value = userProfile.under26;
  document.getElementById('profPpk').value = userProfile.ppk;
  document.getElementById('profIns').value = userProfile.insurance;
}

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const profBase = parseFloat(document.getElementById('profBaseSalary').value);
  userProfile.baseSalary = isNaN(profBase) ? 5750 : profBase;
  userProfile.under26 = document.getElementById('profUnder26').value;
  userProfile.ppk = document.getElementById('profPpk').value;
  userProfile.insurance = document.getElementById('profIns').value;
  const uid = auth.currentUser ? auth.currentUser.uid : 'guest';
  const localKey = `user_profile_${uid}`;
  localStorage.setItem(localKey, JSON.stringify(userProfile));
  let profileCloudFailed = false;
  if (auth.currentUser) {
    try { await setDoc(doc(db, "users", uid, "profile", "userProfile"), userProfile, { merge: true }); } catch(e) { profileCloudFailed = true; }
  }
  const monthVal = document.getElementById('monthSelect').value;
  if (!localStorage.getItem(`guest_month_${monthVal}`) && (!auth.currentUser || !monthsCollectionCache?.some(d => d.id === monthVal))) {
    applyProfileToMain();
  }
  await updateYtdCache(monthVal);        // вік до 26 років змінює, чи діє поріг
  calculateSalary();
  showToast(profileCloudFailed ? dict[currentLang].toastProfLocalOnly : dict[currentLang].toastProfOk);
});

function applyProfileToMain() {
  document.getElementById('baseSalary').value = userProfile.baseSalary;
}

window.setLang = function(lang) {
  currentLang = lang; localStorage.setItem('lang', lang); document.documentElement.lang = lang;
  const t = dict[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => { const v = t[el.dataset.i18n]; if (v) el.textContent = el.hasAttribute('data-nocolon') ? v.replace(/:\s*$/, '') : v; });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { const v = t[el.dataset.i18nPh]; if (v) el.placeholder = v; });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { const v = t[el.dataset.i18nAria]; if (v) el.setAttribute('aria-label', v); });
  document.querySelectorAll('button[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = t.appTitle;
  document.getElementById('langSelect').value = lang;
  initMonths(); calculateSalary(); refreshPeriod(); paintStats();
};

window.setTheme = function(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  localStorage.setItem('theme', theme);
  document.getElementById('themeSelect').value = theme;
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
  clear(bloodDays <= 0, ['bloodBonus']);
  clear(l4Days <= 0, ['l4MissedShifts']);
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
  isPremium = !!user;
  document.getElementById('app-body').classList.toggle('is-logged-in', isPremium);
  document.getElementById('auth-container').classList.toggle('hidden', isPremium);
  document.getElementById('sync-container').classList.toggle('hidden', !isPremium);
  document.querySelectorAll('[data-cloud-only]').forEach(el => el.classList.toggle('hidden', !isPremium));
  await loadProfile();
  if (user) {
    document.getElementById('user-email-display').innerText = "👤 " + user.email;
    await loadCloudData();
  } else {
    loadLocalGuestData();
  }
  calculateSalary();
  statsLast = null; statsPeriod = DEFAULT_PERIOD(); statsPick = null;  // інше джерело даних — вибір періоду починаємо заново
  if (currentActivePage === 3) renderStats({ reset: true }).catch(e => console.warn('Статистика:', e));
}

function fillFrom(d) {
  clearInputs();
  document.querySelectorAll('input, select').forEach(el => {
    if (!NON_MONTH_IDS.has(el.id) && d[el.id] !== undefined) {
      el.value = d[el.id];
    }
  });
  if (d.bonusPctSelect === undefined) document.getElementById('bonusPctSelect').value = "10";
  if (d.presencePctSelect === undefined) {
    const l4 = parseInt(d.l4Days) || 0;
    document.getElementById('presencePctSelect').value = l4 > 0 ? (l4 <= 2 ? "2.5" : "0") : "5";
  }
}

async function handleSyncUp() {
  if (!auth.currentUser) return;
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return showToast(dict[currentLang].toastSelectMonth);
  if (navigator.onLine === false) return showToast(dict[currentLang].toastSaveOffline);   // setDoc без мережі висить без відповіді
  const saveBtns = document.querySelectorAll('[data-sync-up]');
  saveBtns.forEach(b => { b.disabled = true; });
  const data = { updatedAt: new Date().toISOString() };
  document.querySelectorAll('input, select').forEach(el => {
    if(!NON_MONTH_IDS.has(el.id)) data[el.id] = el.value;
  });
  try {
    await withTimeout(setDoc(doc(db, "users", auth.currentUser.uid, "months", monthVal), data, { merge: true }), SAVE_TIMEOUT_MS());
    saveMonthCache(localStorage, auth.currentUser.uid, monthVal, data);
    showToast(dict[currentLang].toastSaveCloud); monthsCollectionCache = null;
    await updateL4Cache(monthVal);
  } catch (error) {
    // таймаут = немає зв'язку з хмарою (запис міг бути в черзі Firestore, повторне збереження безпечне: merge)
    showToast(error && error.message === 'timeout' ? dict[currentLang].toastSaveOffline : dict[currentLang].toastSaveErr + authMsg(error));
  }
  finally { saveBtns.forEach(b => { b.disabled = false; }); }
}

document.querySelectorAll('[data-sync-up]').forEach(b => b.addEventListener('click', handleSyncUp));

document.getElementById('btn-login').addEventListener('click', async () => {
  if (!(await initCloud())) return showToast(dict[currentLang].toastOffline);
  try { await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); }
  catch (e) { showToast(dict[currentLang].toastLoginErr + authMsg(e)); }
});

document.getElementById('btn-register').addEventListener('click', async () => {
  if (!(await initCloud())) return showToast(dict[currentLang].toastOffline);
  try { await createUserWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value); showToast(dict[currentLang].toastRegOk); }
  catch (e) { showToast(dict[currentLang].toastRegErr + authMsg(e)); }
});

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
  // Гостьові дані (guest_month_*, user_profile_guest) — окремий режим, їх не чіпаємо.
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
    return showCachedMonth(uid, monthVal, defaultSched);
  }
  if (currentReq !== requestCounter) return;
  try {
    if (snap.exists()) {
      saveMonthCache(localStorage, uid, monthVal, snap.data());
      fillFrom(snap.data());
      if (!snap.data().scheduleDays) document.getElementById('scheduleDays').value = defaultSched;
    } else {
      clearInputs(); applyProfileToMain();
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
  const data = {};
  document.querySelectorAll('input, select').forEach(el => {
    if(!NON_MONTH_IDS.has(el.id)) data[el.id] = el.value;
  });
  localStorage.setItem(`guest_month_${monthVal}`, JSON.stringify(data));
}

function loadLocalGuestData() {
  const monthVal = document.getElementById('monthSelect').value;
  if (!monthVal) return;
  const saved = localStorage.getItem(`guest_month_${monthVal}`);
  if (saved) {
    try { fillFrom(JSON.parse(saved)); } catch(e) { clearInputs(); applyProfileToMain(); }
  } else {
    clearInputs(); applyProfileToMain();
  }
  updateVisibility();
}

function clearInputs() {
  document.querySelectorAll('input[type=number]').forEach(el => {
    if(el.id !== 'scheduleDays' && el.id !== 'profBaseSalary' && el.id !== 'baseSalary') el.value = '';
  });
  document.getElementById('extraBonus').value = '';
  document.getElementById('bonusPctSelect').value = "10";
  document.getElementById('presencePctSelect').value = "5";
  const monthVal = document.getElementById('monthSelect').value;
  if(monthVal) document.getElementById('scheduleDays').value = stateDaysFor(monthVal);
}

function initMonths() {
  const select = document.getElementById('monthSelect');
  const currentVal = select.value; select.innerHTML = '';
  const now = new Date(); const currentYear = now.getFullYear(); const currentMonth = now.getMonth();
  const dNames = dict[currentLang].monthNames;
  for(let i = 1; i >= -11; i--) {
    let d = new Date(currentYear, currentMonth + i, 1);
    let y = d.getFullYear(); let m = d.getMonth();
    let val = y + "-" + String(m + 1).padStart(2, '0');
    let opt = document.createElement('option'); opt.value = val; opt.text = dNames[m] + " " + y;
    select.appendChild(opt);
  }
  select.value = currentVal || (currentYear + "-" + String(currentMonth + 1).padStart(2, '0'));
}

/* ВІДПУСКНІ: підготовка даних з хмари (сам алгоритм — у calc.js) */

async function getAutoDailyUrlopBonus(currentMonthVal) {
  if (!auth.currentUser) return 0;
  const year = parseInt(currentMonthVal.split('-')[0]);
  const cur = {
    baseSalary: Math.max(0, parseFloat(document.getElementById('baseSalary').value) || Number(userProfile.baseSalary)),
    minWage: getMinWage(year)
  };
  try {
    const docs = await getCachedMonths();
    const records = {};
    docs.forEach(d => { records[d.id] = d.data; });
    return computeDailyUrlopBonus(records, currentMonthVal, cur);
  } catch (e) { return 0; }
}

async function autoFillUrlopBonus(monthVal) {
  const vacDays = Math.max(0, parseInt(document.getElementById('vacationDays').value) || 0);
  const urlopInput = document.getElementById('urlopBonus');
  if (isPremium && vacDays > 0 && (!urlopInput.value || parseFloat(urlopInput.value) === 0)) {
    const autoDaily = await getAutoDailyUrlopBonus(monthVal);
    if (autoDaily > 0) urlopInput.value = autoDaily.toFixed(2);
  }
}

/* Накопичена з початку року база PIT (для порога 120 000): місяці року ПЕРЕД поточним з хмари,
   а без мережі — з локальної копії. Для гостя порога немає (немає збережених місяців). */
let ytdState = { monthVal: '', prev: 0, found: 0, expected: 0 };
async function updateYtdCache(monthVal) {
  if (!auth.currentUser) { ytdState = { monthVal, prev: 0, found: 0, expected: 0 }; return; }
  const uid = auth.currentUser.uid;
  const records = {};
  (await getCachedMonths()).forEach(d => { records[d.id] = d.data; });
  const [y, m] = monthVal.split('-');
  for (let j = 1; j < parseInt(m); j++) {
    const id = `${y}-${String(j).padStart(2, '0')}`;
    if (!records[id]) { const c = loadMonthCache(localStorage, uid, id); if (c) records[id] = c.data; }
  }
  ytdState = yearToDate(records, monthVal, userProfile);
}

async function updateL4Cache(currentMonthVal) {
  if (!auth.currentUser) { window.cachedL4DailyRate = null; return; }
  const [yStr, mStr] = currentMonthVal.split('-'); let cYear = parseInt(yStr); let cMonth = parseInt(mStr);
  let targetMonths = [];
  for (let i = 1; i <= 12; i++) {
    let pMonth = cMonth - i; let pYear = cYear;
    if (pMonth <= 0) { pMonth += 12; pYear -= 1; }
    targetMonths.push(pYear + "-" + String(pMonth).padStart(2, '0'));
  }
  try {
    const docs = await getCachedMonths();
    let totalNetBase = 0; let monthsFound = 0;
    docs.forEach(docObj => {
      if (targetMonths.includes(docObj.id)) {
        const data = docObj.data;
        const pBase = Math.max(0, parseFloat(data.baseSalary) || userProfile.baseSalary);
        let pPct = parseFloat(data.bonusPctSelect); if (isNaN(pPct)) pPct = 10;
        let pPPct = parseFloat(data.presencePctSelect); if (isNaN(pPPct)) pPPct = parseInt(data.l4Days) > 0 ? 0 : 5;
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
          isUnder26: userProfile.under26 === 'yes', ppkActive: userProfile.ppk === 'yes', insuranceActive: userProfile.insurance === 'yes',
          qualityBonusPct: pPct, presenceBonusPct: pPPct, year: pYear
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
    vacDays: isPremium ? Math.max(0, parseInt(document.getElementById('vacationDays').value) || 0) : 0,
    dailyUrlopBonus: isPremium ? Math.max(0, parseFloat(document.getElementById('urlopBonus').value) || 0) : 0,
    extraBonus: Math.max(0, parseFloat(document.getElementById('extraBonus').value) || 0),
    bloodDonationDays: isPremium ? Math.max(0, parseInt(document.getElementById('bloodDonationDays').value) || 0) : 0,
    l4Days: isPremium ? Math.max(0, parseInt(document.getElementById('l4Days').value) || 0) : 0,
    qualityBonusPct: parseFloat(document.getElementById('bonusPctSelect').value) || 0,
    presenceBonusPct: parseFloat(document.getElementById('presencePctSelect').value) || 0,
    isUnder26: userProfile.under26 === 'yes',
    ppkActive: userProfile.ppk === 'yes',
    insuranceActive: userProfile.insurance === 'yes',
    isPremium, l4DailyRateCached: window.cachedL4DailyRate
  };
  inputs.regWorkedDays = inputs.morningShifts + inputs.afternoonShifts + inputs.nightShifts;
  const res = compute(inputs);
  // Поріг PIT 120 000: лише для залогінених (потрібні збережені місяці року). Нижче порога extraPit = 0,
  // тож результат такий самий, як у compute(); понад поріг — 32% замість 12% з надлишку.
  const ytd = isPremium && ytdState.monthVal === monthVal && !inputs.isUnder26 ? ytdState : null;
  const extraPit = ytd ? pitExtra(res, ytd.prev) : 0;
  const net = res.net - extraPit;
  if (inputs.bloodDonationDays > 0) document.getElementById('bloodBonus').value = res.autoDailyBlood.toFixed(2);
  updateUI(res.gross, net);
  const totalNightMinutes = Math.round(((res.totalMorningShifts * (10/60)) + (res.totalNightShifts * 8)) * 60);
  const nHours = Math.floor(totalNightMinutes / 60); const nMins = totalNightMinutes % 60;
  document.getElementById('infoNightHours').innerText = nHours > 0 ? `${nHours} ${dict[currentLang].hoursShort} ${nMins} ${dict[currentLang].minsShort}` : `${nMins} ${dict[currentLang].minsShort}`;
  document.getElementById('infoPresencePct').innerText = res.presenceBonusPct + '%';
  document.getElementById('infoQualityPct').innerText = res.qualityBonusPct + '%';
  document.getElementById('infoNightShiftsCount').innerText = res.totalNightShifts;
  setFormatSum('infoBasePayVal', res.adjustedBase);
  setFormatSum('infoPresenceBonusSum', res.presenceBonusAmount, true);
  setFormatSum('infoQualityBonusSum', res.qualityBonusAmount, true);
  setFormatSum('infoExtraBonusSum', res.extraBonus, true);
  setFormatSum('infoNightTimeSum', res.totalNightTimePay);
  setFormatSum('infoNightShiftSum', res.totalNightShiftPay);
  setFormatSum('infoWeekendSum', res.totalWeekendPay);
  setFormatSum('infoOvertimeSum', res.totalOvertimePay);
  setFormatSum('infoOvertimeNetSum', res.totalOvertimeNet, true);
  setFormatSum('infoVacationSum', res.totalUrlopBonus);
  setFormatSum('infoBloodSum', res.bloodDonationPay);
  setFormatSum('infoL4Sum', res.l4Pay);
  setFormatSum('infoLaundrySum', res.laundryAllowance, false);
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

appBody.addEventListener('focusin', e => {
  if (e.target.tagName === 'INPUT' && e.target.type === 'number' && !e.target.readOnly) {
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
  if (e.target.tagName === 'INPUT' && e.target.type === 'number' && !e.target.readOnly) {
    if (e.target.value === '' && e.target.dataset.prevVal !== undefined) {
      if (!e.target.dataset.edited) {
        e.target.value = e.target.dataset.prevVal;               // просто торкнулись і вийшли — повертаємо як було
      } else if (e.target.id === 'baseSalary') {
        e.target.value = userProfile.baseSalary;                 // порожня ставка = ставка з профілю (так рахує calculateSalary)
        saveLocalGuestData();
      }
    }
    if (e.target.id === 'scheduleDays' && !e.target.value) {
      e.target.value = stateDaysFor(document.getElementById('monthSelect').value);
      calculateSalary();
    }
    delete e.target.dataset.prevVal; delete e.target.dataset.edited;
  }
});

appBody.addEventListener('input', e => {
  const id = e.target.id;
  // Автозміна премії за присутність при введенні L4
  if (id === 'l4Days') {
    const l4 = parseInt(e.target.value) || 0;
    const pSel = document.getElementById('presencePctSelect');
    if (l4 === 0) pSel.value = "5";
    else if (l4 <= 2) pSel.value = "2.5";
    else pSel.value = "0";
  }
  if (id === 'monthSelect' || NON_MONTH_IDS.has(id)) return;
  if (SCHED_IDS.includes(id)) syncSchedule();
  calculateSalary(); saveLocalGuestData();
  if (id === 'vacationDays') {
    autoFillUrlopBonus(document.getElementById('monthSelect').value).then(() => { calculateSalary(); saveLocalGuestData(); });
  }
});

appBody.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'monthSelect') {
    document.getElementById('scheduleDays').value = stateDaysFor(e.target.value);
    if (auth.currentUser) loadCloudData(); else { loadLocalGuestData(); calculateSalary(); }
  } else if (!NON_MONTH_IDS.has(id)) {
    calculateSalary(); saveLocalGuestData();
  }
});

document.addEventListener('click', e => {
  const p = e.target.closest('[data-page]'); if (p) { switchPage(Number(p.dataset.page)); return; }
  const l = e.target.closest('button[data-lang]'); if (l) { setLang(l.dataset.lang); return; }
  if (e.target.closest('#btn-theme')) { setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); return; }
  const st = e.target.closest('[data-step]');
  if (st) { const s = document.getElementById('monthSelect'), i = s.selectedIndex + Number(st.dataset.step);
    if (i >= 0 && i < s.options.length) { s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); } }
});

document.getElementById('auth-form').addEventListener('submit', e => e.preventDefault());
// Замість inline onchange (потрібно для CSP без 'unsafe-inline')
document.getElementById('langSelect').addEventListener('change', e => window.setLang(e.target.value));
document.getElementById('themeSelect').addEventListener('change', e => window.setTheme(e.target.value));

/* ВКЛАДКА «СТАТИСТИКА»: підсумки за період (цифри рахують ті самі calc.js + pit.js, що й калькулятор).
   Період: останні 3/6/12 місяців або вибрані роки. Майбутніх місяців немає: максимум — поточний.
   Джерело: гість — guest_month_* у localStorage; акаунт — хмара, а без мережі локальні копії місяців. */
const DEFAULT_PERIOD = () => ({ mode: '12', years: [] });
let statsPeriod = DEFAULT_PERIOD();   // { mode: '3'|'6'|'12'|'years', years: [] }
let statsPick = null;      // вибраний на графіку стовпчик (key)
let statsToken = 0;        // відкидає застарілі відповіді при швидкому перемиканні вкладок
let statsLast = null;      // { years, stats } — щоб перемальовувати (мова, вибір стовпчика) без повторного читання даних
const statsNow = () => (TEST.now !== undefined ? new Date(TEST.now) : new Date());   // «сьогодні»; у тестах підміняється

async function gatherStatsRecords() {
  if (!auth.currentUser) return readGuestRecords(localStorage);
  const uid = auth.currentUser.uid, records = {};
  (await getCachedMonths()).forEach(d => { records[d.id] = d.data; });
  for (const id of listMonthCache(localStorage, uid)) {                  // хмара недоступна/неповна — доповнюємо локальними копіями
    if (!records[id]) { const c = loadMonthCache(localStorage, uid, id); if (c) records[id] = c.data; }
  }
  return records;
}

async function renderStats({ reset = false } = {}) {
  const token = ++statsToken;
  const records = await gatherStatsRecords();
  if (token !== statsToken) return;
  const now = statsNow(), years = availableYears(records, now);
  if (reset) { statsPeriod = DEFAULT_PERIOD(); statsPick = null; }
  statsPeriod = normalizePeriod(statsPeriod, years, now);
  statsLast = { years, stats: collectPeriodStats(records, statsPeriod, userProfile, { premium: isPremium, now }) };
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


const appVerEl = document.getElementById('appVersion');
if (appVerEl && globalThis.APP_VERSION) appVerEl.textContent = 'v' + globalThis.APP_VERSION;
// Повідомлення про нову версію: js/sw-register.js диспатчить подію, коли новий service worker перейняв керування
const updateBanner = document.getElementById('update-banner');
window.addEventListener('salary:update-ready', () => updateBanner.classList.remove('hidden'));
document.getElementById('btn-update').addEventListener('click', () => location.reload());
document.getElementById('btn-update-later').addEventListener('click', () => updateBanner.classList.add('hidden'));
setTheme(localStorage.getItem('theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
window.setLang(currentLang);
switchPage(1);
handleAuthState(null).finally(() => { guestReady = true; initCloud(); });

/* --- СВАЙП-НАВІГАЦІЯ МІЖ ВІКНАМИ --- */
let touchStartX = 0, touchStartY = 0;
const swipeThreshold = 50; // Мінімальна довжина свайпу в пікселях

document.addEventListener('touchstart', e => {
  // Ігноруємо свайпи на полях вводу, селекторах та нижній панелі вкладок
  if (e.target.closest('input, select, button, .tabs, .ctl, .seg, .chart-host')) return;
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
  if (e.target.closest('input, select, button, .tabs, .ctl, .seg, .chart-host')) return;
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
