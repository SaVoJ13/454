/* Локальні профілі (js/profiles.js) і їхнє використання в app.js (фейковий DOM + фейковий Firebase).
   Перевіряє: перший запуск нічого не переносить, операції з профілями, ізоляцію даних, повні функції без входу
   (поріг PIT, ставка L4, «Сер. за 1 дн.») на тих самих числах, що й шлях акаунта, вхід і вихід з акаунта. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './fake-dom.mjs';
import {
  PROFILES_KEY, DEFAULT_ID, AUTO_NAMES, displayName, ensureProfiles, readProfiles, activeProfile, checkName, createProfile, renameProfile,
  deleteProfile, setActiveProfile, profileStorage, profileKeys
} from '../js/profiles.js';
import { readGuestRecords, collectPeriodStats } from '../js/stats.js';
import { dict as dict0 } from '../js/i18n.js';
import { compute, computeDailyUrlopBonus, getMinWage } from '../js/calc.js';
import { inputsFromSaved, yearToDate, pitExtra, pitBaseOf } from '../js/pit.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null
  };
};
const snapshot = st => Object.fromEntries([...st.map.entries()].sort(([a], [b]) => a.localeCompare(b)));

// ---------- 1. Перший запуск: лише новий ключ profiles_v1, жоден наявний не змінено й не переміщено ----------
const existing = {
  lang: 'uk', theme: 'dark', hint_urlop_seen: '1', known_emails: '["a@b.c"]', user_min_wages: '{"2028":5000}',
  'guest_month_2026-10': '{"baseSalary":"6000","morningShifts":"10"}', 'guest_month_2026-11': '{"nightShifts":"4"}',
  user_profile_guest: '{"baseSalary":6000,"under26":"no","ppk":"yes"}',
  'cloud_month_u1_2026-11': '{"v":1,"savedAt":"2026-11-01T00:00:00.000Z","data":{}}', user_profile_u1: '{"baseSalary":7000}'
};
{
  const st = memStorage(existing);
  const before = snapshot(st);
  const state = ensureProfiles(st, new Date('2026-11-27T10:00:00Z'));
  const after = snapshot(st);
  assert.deepEqual(state, { active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: '', createdAt: '2026-11-27T10:00:00.000Z', autoName: true }] }, 'перший профіль — з автоматичною назвою');
  assert.deepEqual(Object.keys(after).filter(k => !(k in before)), [PROFILES_KEY], 'додано лише profiles_v1');
  for (const [k, v] of Object.entries(before)) assert.equal(after[k], v, `ключ ${k} не змінено`);
  assert.deepEqual(ensureProfiles(st), state, 'повторний запуск нічого не змінює');
  assert.deepEqual(snapshot(st), after);
  // профіль 'default' бачить наявні гостьові дані без переносу
  assert.deepEqual(Object.keys(readGuestRecords(profileStorage(st, DEFAULT_ID))).sort(), ['2026-10', '2026-11']);
  console.log('  знімок до:   ' + Object.keys(before).join(', '));
  console.log('  знімок після: ' + Object.keys(after).join(', ') + '  (значення наявних ключів побайтово ті самі)');
}

// ---------- 2. Операції: створення, назви, перейменування, активний, видалення ----------
{
  const st = memStorage(existing);
  ensureProfiles(st);
  // перші 12 викликів дають той самий id двічі поспіль (колізія), далі — інші числа
  let seq = 0; const rnd = () => (seq < 12 ? [0.1, 0.5, 0.9, 0.3, 0.7, 0.05][seq++ % 6] : ((seq++ * 0.137) % 1));
  const a = createProfile(st, '  Дружина  ', { random: rnd });
  assert.ok(a.ok); assert.match(a.id, /^p[a-z0-9]{6}$/, 'id = p + 6 символів [a-z0-9]');
  assert.equal(a.state.list[1].name, 'Дружина', 'пробіли по краях обрізано');
  assert.equal(a.state.active, DEFAULT_ID, 'створення не змінює активний профіль');
  assert.notEqual(createProfile(st, 'Третій', { random: rnd }).id, a.id, 'той самий випадковий id не повторюється');
  assert.deepEqual(createProfile(st, 'дружина'), { ok: false, error: 'duplicate' }, 'унікальність без урахування регістру');
  assert.deepEqual(createProfile(st, 'МІЙ ПРОФІЛЬ'), { ok: false, error: 'duplicate' });
  assert.deepEqual(createProfile(st, ''), { ok: false, error: 'length' });
  assert.deepEqual(createProfile(st, '    '), { ok: false, error: 'length' }, 'самі пробіли = порожня назва');
  assert.deepEqual(createProfile(st, 'x'.repeat(31)), { ok: false, error: 'length' }, '31 символ — забагато');
  assert.ok(createProfile(st, 'y'.repeat(30)).ok, '30 символів — можна');
  assert.ok(checkName(readProfiles(st), '  ' + 'z'.repeat(30) + '  ').ok, 'пробіли по краях у довжину не входять');
  // перейменування: ті самі правила; власна назва (інший регістр) дозволена
  assert.deepEqual(renameProfile(st, a.id, 'третій'), { ok: false, error: 'duplicate' });
  assert.deepEqual(renameProfile(st, a.id, ''), { ok: false, error: 'length' });
  assert.ok(renameProfile(st, a.id, 'ДРУЖИНА').ok, 'зміна регістру власної назви');
  assert.equal(readProfiles(st).list.find(p => p.id === a.id).name, 'ДРУЖИНА');
  assert.ok(renameProfile(st, DEFAULT_ID, 'Володимир').ok);
  // дані профілю: ключі з префіксом; спільні ключі не належать жодному профілю
  const ps = profileStorage(st, a.id);
  ps.setItem('guest_month_2026-09', '{"morningShifts":"7"}'); ps.setItem('user_profile_guest', '{"baseSalary":5000}');
  assert.equal(st.getItem(`prof_${a.id}__guest_month_2026-09`), '{"morningShifts":"7"}');
  assert.equal(st.getItem(`prof_${a.id}__user_profile_guest`), '{"baseSalary":5000}');
  assert.throws(() => ps.setItem('lang', 'pl'), /не належить профілю/, 'спільний ключ через сховище профілю не записується');
  assert.equal(ps.getItem('lang'), null);
  assert.deepEqual(Object.keys(readGuestRecords(ps)), ['2026-09'], 'профіль бачить лише свої місяці');
  const def = profileStorage(st, DEFAULT_ID);
  assert.deepEqual(Object.keys(readGuestRecords(def)).sort(), ['2026-10', '2026-11'], 'default не бачить prof_…');
  assert.equal(def.length, 3); assert.ok([0, 1, 2].every(i => !def.key(i).startsWith('prof_')));
  assert.equal(ps.length, 2); assert.deepEqual([ps.key(0), ps.key(1)].sort(), ['guest_month_2026-09', 'user_profile_guest']);
  // активний і видалення
  assert.ok(setActiveProfile(st, a.id).ok); assert.equal(activeProfile(readProfiles(st)).id, a.id);
  assert.deepEqual(setActiveProfile(st, 'pnone00'), { ok: false, error: 'unknown' });
  const globalsBefore = Object.fromEntries(['lang', 'theme', 'hint_urlop_seen', 'known_emails', 'user_min_wages', 'cloud_month_u1_2026-11', 'user_profile_u1'].map(k => [k, st.getItem(k)]));
  const defKeysBefore = profileKeys(st, DEFAULT_ID).sort();
  const del = deleteProfile(st, a.id);
  assert.ok(del.ok); assert.equal(del.state.active, DEFAULT_ID, 'видалили активний — активним став перший у списку');
  assert.deepEqual([...st.map.keys()].filter(k => k.startsWith(`prof_${a.id}__`)), [], 'усі ключі профілю видалено');
  assert.deepEqual(profileKeys(st, DEFAULT_ID).sort(), defKeysBefore, 'ключі іншого профілю на місці');
  for (const [k, v] of Object.entries(globalsBefore)) assert.equal(st.getItem(k), v, `спільний ключ ${k} на місці`);
  // видалення 'default' прибирає ключі без префікса, але не чужі й не спільні
  const rest = readProfiles(st).list.filter(p => p.id !== DEFAULT_ID);
  profileStorage(st, rest[0].id).setItem('guest_month_2026-01', '{}');
  assert.ok(deleteProfile(st, DEFAULT_ID).ok);
  assert.ok(!st.map.has('guest_month_2026-10') && !st.map.has('user_profile_guest'));
  assert.ok(st.map.has(`prof_${rest[0].id}__guest_month_2026-01`) && st.map.has('cloud_month_u1_2026-11') && st.map.has('lang'));
  // останній профіль видалити не можна
  for (const p of readProfiles(st).list.slice(1)) assert.ok(deleteProfile(st, p.id).ok);
  const last = readProfiles(st).list[0];
  assert.deepEqual(deleteProfile(st, last.id), { ok: false, error: 'last' });
  assert.equal(readProfiles(st).list.length, 1);
  // пошкоджений profiles_v1 → знову один 'default' (дані без префікса не чіпаються)
  st.setItem(PROFILES_KEY, '{зламано');
  assert.equal(readProfiles(st), null);
  assert.equal(ensureProfiles(st).active, DEFAULT_ID);
}

// ---------- 2b. Автоматична назва (1.19.1): міграція, показ мовою інтерфейсу, унікальність ----------
{
  assert.deepEqual(AUTO_NAMES, ['Мій профіль', 'Mój profil'], 'автоматичні назви — з i18n обома мовами');
  const p = { id: DEFAULT_ID, name: '', autoName: true };
  assert.equal(displayName(p, dict0.uk.profileDefaultName), 'Мій профіль');
  assert.equal(displayName(p, dict0.pl.profileDefaultName), 'Mój profil');
  assert.equal(displayName({ id: 'p1', name: 'Аня' }, 'Мій профіль'), 'Аня');
  // міграція: рівно «Мій профіль» / «Mój profil» → autoName; інші назви (і схожі) не чіпаються
  const old = { active: 'pbbbbbb', list: [
    { id: DEFAULT_ID, name: 'Мій профіль', createdAt: 'a' }, { id: 'pbbbbbb', name: 'Mój profil', createdAt: 'b' },
    { id: 'pcccccc', name: 'Аня', createdAt: 'c' }, { id: 'pdddddd', name: 'мій профіль 2', createdAt: 'd' }] };
  const st = memStorage({ [PROFILES_KEY]: JSON.stringify(old), 'guest_month_2026-01': '{}' });
  const s1 = ensureProfiles(st);
  assert.deepEqual(s1.list.map(x => [x.id, x.name, x.autoName === true]),
    [[DEFAULT_ID, '', true], ['pbbbbbb', '', true], ['pcccccc', 'Аня', false], ['pdddddd', 'мій профіль 2', false]]);
  assert.equal(s1.active, 'pbbbbbb', 'активний не змінюється');
  assert.deepEqual(JSON.parse(st.getItem(PROFILES_KEY)), s1, 'міграцію записано в profiles_v1');
  assert.equal(st.getItem('guest_month_2026-01'), '{}', 'дані профілю не чіпаються');
  const written = st.getItem(PROFILES_KEY); ensureProfiles(st);
  assert.equal(st.getItem(PROFILES_KEY), written, 'повторний запуск не переписує');
  // унікальність: профіль з autoName займає обидві автоматичні назви
  const st2 = memStorage(); ensureProfiles(st2);
  for (const t of ['Мій профіль', 'МІЙ ПРОФІЛЬ', 'Mój profil', 'mÓj PROFIL', '  Mój profil ']) {
    assert.deepEqual(createProfile(st2, t), { ok: false, error: 'duplicate' }, `«${t}» зайнята автоматичною назвою`);
  }
  const b = createProfile(st2, 'Дружина');
  assert.deepEqual(renameProfile(st2, b.id, 'Mój profil'), { ok: false, error: 'duplicate' }, 'перейменувати на автоназву іншого — ні');
  // перейменування: autoName зникає; власна назва не перетворюється на автоматичну
  assert.ok(renameProfile(st2, DEFAULT_ID, 'Я').ok);
  assert.deepEqual(readProfiles(st2).list[0], { id: DEFAULT_ID, name: 'Я', createdAt: readProfiles(st2).list[0].createdAt }, 'після перейменування autoName немає');
  assert.equal(JSON.parse(st2.getItem(PROFILES_KEY)).list[0].autoName, undefined);
  ensureProfiles(st2); assert.equal(readProfiles(st2).list[0].name, 'Я', 'власна назва не мігрує');
  // тепер автоназва вільна: її можна дати іншому профілю, і він стає автоматичним (показується мовою інтерфейсу)
  assert.ok(renameProfile(st2, b.id, 'mój profil').ok);
  assert.deepEqual(readProfiles(st2).list[1].autoName, true);
  assert.deepEqual(renameProfile(st2, DEFAULT_ID, 'Мій профіль'), { ok: false, error: 'duplicate' }, 'і тоді вона зайнята обома мовами');
  // перейменування профілю з autoName на його ж автоназву (будь-якою мовою) — дозволено, лишається autoName
  assert.ok(renameProfile(st2, b.id, 'Мій профіль').ok); assert.equal(readProfiles(st2).list[1].autoName, true);
}

// ---------- 3. app.js: фейковий DOM і фейковий Firebase ----------
const numberIds = [...readFileSync(new URL('../index.html', import.meta.url), 'utf8').matchAll(/<input type="number"[^>]*? id="(\w+)"/g)].map(m => m[1]);
const { getEl, fire, store } = installFakeDom({ groups: { 'input[type=number]': numberIds, '#periodPills .pill': ['pill3', 'pill6', 'pill12', 'pillYears'], '[data-cloud-only]': ['cloudOnly1', 'cloudOnly2'] } });
numberIds.forEach(getEl);
['3', '6', '12', 'years'].forEach((m, i) => { getEl(['pill3', 'pill6', 'pill12', 'pillYears'][i]).dataset.mode = m; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
const money = v => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v);

const cloud = new Map();
let authCb = null;
const auth = { currentUser: null };
const stub = {
  auth, db: {}, onAuthStateChanged: (_a, cb) => { authCb = cb; },
  signInWithEmailAndPassword: async () => {}, createUserWithEmailAndPassword: async () => {}, sendPasswordResetEmail: async () => {},
  signOut: async a => { a.currentUser = null; await authCb(null); },
  doc: (_db, ...p) => ({ path: p.join('/') }), collection: (_db, ...p) => ({ path: p.join('/') }),
  getDoc: async ref => { const d = cloud.get(ref.path); return { exists: () => !!d, data: () => d }; },
  setDoc: async (ref, data) => { cloud.set(ref.path, { ...cloud.get(ref.path), ...data }); },
  getDocs: async ref => ({ forEach(cb) { for (const [p, d] of cloud) if (p.startsWith(ref.path + '/')) cb({ id: p.slice(ref.path.length + 1), data: () => d }); } })
};
globalThis.__salaryTest = { cloudLoader: async () => stub, now: new Date(2026, 11, 15, 12).getTime() };
console.warn = () => {};

// оновлення зі старої версії: гостьові дані вже є, profiles_v1 ще немає
const oldMonth = { baseSalary: '6200', morningShifts: '12', nightShifts: '3', scheduleDays: '20', bonusTotalPct: 15 };
const seedOld = { lang: 'uk', theme: 'light', 'guest_month_2026-05': JSON.stringify(oldMonth), user_profile_guest: JSON.stringify({ baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' }) };
for (const [k, v] of Object.entries(seedOld)) store.set(k, v);
const appBefore = Object.fromEntries(store);
await import('../js/app.js');
await sleep(100);
{
  const added = [...store.keys()].filter(k => !(k in appBefore));
  assert.deepEqual(added, [PROFILES_KEY], 'перший запуск застосунку додає лише profiles_v1');
  for (const [k, v] of Object.entries(appBefore)) assert.equal(store.get(k), v, `застосунок не змінив ${k}`);
  assert.deepEqual(JSON.parse(store.get(PROFILES_KEY)).list.map(p => [p.name, p.autoName]), [['', true]], 'у profiles_v1 — autoName, без тексту');
}
const body = getEl('app-body');
const select = async id => { getEl('monthSelect').value = id; await fire(body, 'change', getEl('monthSelect')); await sleep(40); };
const type = async (id, value) => { getEl(id).value = value; await fire(body, 'input', getEl(id)); await sleep(20); };
const hidden = id => getEl(id).classList.contains('hidden');
const click = async id => { await fire(getEl(id), 'click'); await sleep(40); };
const listNames = () => getEl('profileList').children.map(b => b.textContent);
const pressed = () => getEl('profileList').children.filter(b => b.attrs['aria-pressed'] === 'true').map(b => b.textContent);
const profilesState = () => JSON.parse(store.get(PROFILES_KEY));
const profileOf = name => profilesState().list.find(p => p.name === name);

// 3a. Без входу — усі функції: класи, CSS, без плашки PRO і примітки «після входу»
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
assert.equal(body.classList.contains('full-features'), true, 'без входу — повні функції');
assert.equal(body.classList.contains('is-logged-in'), false);
assert.ok(/\.full-features \.card\.pro-only\{display:block\}/.test(css) && /\.full-features \.field\.pro-only\{display:flex\}/.test(css), 'поля відпустки/L4/донорства видно за full-features');
assert.ok(!/is-logged-in \.(card|field)\.pro-only/.test(css), 'видимість полів більше не залежить від входу');
assert.ok(!/data-i18n="proNote"/.test(html) && !/pro-badge/.test(html), 'без примітки «після входу (PRO)» і плашки PRO');
assert.equal(hidden('cloudOnly1'), true, 'хмарні кнопки ([data-cloud-only]) без входу сховані');
assert.equal(getEl('whoBadge').textContent, dict.uk.profileDefaultName, 'у шапці — назва активного профілю');
assert.ok(/id="whoBadge" data-page="4"/.test(html), 'дотик до напису відкриває вкладку «Профіль»');
assert.ok(/\.who\{[^}]*text-overflow:ellipsis/.test(css), 'довгі назви обрізаються трьома крапками');
assert.deepEqual(listNames(), [dict.uk.profileDefaultName]); assert.deepEqual(pressed(), [dict.uk.profileDefaultName]);
// автоматична назва перемикається разом із мовою: список і шапка
window.setLang('pl');
assert.deepEqual(listNames(), ['Mój profil'], 'PL: список'); assert.equal(getEl('whoBadge').textContent, 'Mój profil', 'PL: шапка');
window.setLang('uk');
assert.deepEqual(listNames(), ['Мій профіль'], 'UA: список'); assert.equal(getEl('whoBadge').textContent, 'Мій профіль', 'UA: шапка');
assert.equal(hidden('btn-profile-delete'), true, 'один профіль — кнопки «Видалити» немає');
assert.equal(hidden('profilesLocal'), false); assert.equal(hidden('profilesSignedIn'), true);
// наявний місяць видно в профілі 'default'
await select('2026-05');
assert.equal(getEl('morningShifts').value, '12', 'старий гостьовий місяць відкривається в профілі «Мій профіль»');

// 3b. Відпустка, L4, донорство працюють без входу (як compute з isPremium: true)
const profile = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };
await select('2026-06');
await type('morningShifts', '10'); await type('vacationDays', '2'); await type('urlopBonus', '300'); await type('bloodDonationDays', '1'); await type('l4Days', '3');
{
  const rec = JSON.parse(store.get('guest_month_2026-06'));
  assert.equal(rec.vacationDays, '2'); assert.equal(rec.l4Days, '3');
  const exp = compute({ ...inputsFromSaved(rec, '2026-06', profile), l4DailyRateCached: globalThis.cachedL4DailyRate });
  assert.ok(exp.totalUrlopBonus > 0 && exp.bloodDonationPay > 0 && exp.l4Pay > 0, 'передумова: відпускні, донорство й L4 ненульові');
  assert.equal(getEl('infoVacationSum').innerText, money(exp.totalUrlopBonus), 'відпускні рахуються без входу');
  assert.equal(getEl('infoBloodSum').innerText, money(exp.bloodDonationPay), 'поважна відсутність рахується без входу');
  assert.equal(getEl('infoL4Sum').innerText, money(exp.l4Pay), 'L4 рахується без входу');
  assert.equal(globalThis.cachedL4DailyRate, (compute({ ...inputsFromSaved(oldMonth, '2026-05', profile), vacDays: 0, dailyUrlopBonus: 0, extraBonus: 0, bloodDonationDays: 0, l4Days: 0, isPremium: false }).gross * (1 - 0.1371)) / 30,
    'ставка L4 — із середнього збереженого місяця профілю (травень)');
  assert.equal(getEl('netResult').innerText, money(exp.net));
}

// 3c. Новий профіль через поле на сторінці: помилки під полем, без alert/confirm/prompt
const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(appSrc), 'app.js не викликає alert/confirm/prompt');
await click('btn-profile-add');
assert.equal(hidden('profileEdit'), false); assert.equal(hidden('profileActions'), true);
for (const [text, err] of [['', dict.uk.errProfileName], ['   ', dict.uk.errProfileName], ['x'.repeat(31), dict.uk.errProfileName], ['мій ПРОФІЛЬ', dict.uk.errProfileDuplicate]]) {
  getEl('profileName').value = text; await click('btn-profile-name-save');
  assert.equal(hidden('profileNameError'), false); assert.equal(getEl('profileNameError').innerText, err, `«${text}» → ${err}`);
  assert.equal(profilesState().list.length, 1, 'з помилкою профіль не створюється');
}
window.setLang('pl');
assert.equal(getEl('profileNameError').innerText, dict.pl.errProfileDuplicate, 'помилка перекладається');
window.setLang('uk');
getEl('profileName').value = 'Дружина'; await click('btn-profile-name-save');
const wife = profileOf('Дружина');
assert.ok(wife && /^p[a-z0-9]{6}$/.test(wife.id));
assert.equal(profilesState().active, wife.id, 'новий профіль одразу активний');
assert.equal(hidden('profileEdit'), true); assert.equal(hidden('profileNameError'), true);
assert.deepEqual(listNames(), [dict.uk.profileDefaultName, 'Дружина']); assert.deepEqual(pressed(), ['Дружина']);
assert.equal(getEl('whoBadge').textContent, 'Дружина'); assert.equal(hidden('btn-profile-delete'), false);

// 3d. Ізоляція: місяць профілю А не видно в Б (калькулятор, readGuestRecords, статистика)
assert.equal(getEl('morningShifts').value, '', 'червень профілю А не видно в профілі Б');
assert.equal(getEl('vacationDays').value, '');
await type('morningShifts', '5');
assert.equal(JSON.parse(store.get(`prof_${wife.id}__guest_month_2026-06`)).morningShifts, '5', 'місяць Б — у ключі з префіксом');
assert.equal(JSON.parse(store.get('guest_month_2026-06')).morningShifts, '10', 'місяць А не змінено');
assert.deepEqual(Object.keys(readGuestRecords(profileStorage(localStorage, wife.id))), ['2026-06']);
assert.deepEqual(Object.keys(readGuestRecords(profileStorage(localStorage, DEFAULT_ID))).sort(), ['2026-05', '2026-06']);
await select('2026-05');
assert.equal(getEl('morningShifts').value, '', 'травень профілю А не видно в Б');
window.switchPage(3); await sleep(60);
assert.equal(getEl('statsCountVal').textContent, '1 / 12', 'статистика Б — лише його місяць');
// інша ставка в налаштуваннях Б не змінює А
getEl('profBaseSalary').value = '8000'; await click('btn-save-profile');
assert.equal(JSON.parse(store.get(`prof_${wife.id}__user_profile_guest`)).baseSalary, 8000);
assert.equal(JSON.parse(store.get('user_profile_guest')).baseSalary, 5750);
// назад до А: дотик до профілю в списку
await getEl('profileList').children[0].handlers.click[0](); await sleep(60);
assert.deepEqual(pressed(), [dict.uk.profileDefaultName]);
assert.equal(String(getEl('profBaseSalary').value), '5750', 'налаштування профілю перезавантажено');
assert.equal(getEl('morningShifts').value, '12', 'місяць А знову видно');
assert.equal(getEl('statsCountVal').textContent, '2 / 12', 'статистика А — його два місяці');
window.switchPage(1);

// 3e. Перейменування через поле
await click('btn-profile-rename');
assert.equal(getEl('profileName').value, dict.uk.profileDefaultName, 'у полі — поточна назва');
getEl('profileName').value = 'дружина'; await click('btn-profile-name-save');
assert.equal(getEl('profileNameError').innerText, dict.uk.errProfileDuplicate);
getEl('profileName').value = '  ' + 'я'.repeat(31) + '  '; await click('btn-profile-name-save');
assert.equal(getEl('profileNameError').innerText, dict.uk.errProfileName, '> 30 символів');
getEl('profileName').value = 'Mój profil'; await click('btn-profile-name-save');
assert.equal(getEl('profileNameError').innerText, '', 'автоназва власного профілю — не дублікат');
await click('btn-profile-rename');
getEl('profileName').value = '  Я  '; await click('btn-profile-name-save');
assert.deepEqual(listNames(), ['Я', 'Дружина']); assert.equal(getEl('whoBadge').textContent, 'Я');
assert.equal(profilesState().list[0].autoName, undefined, 'після перейменування autoName зникає');
window.setLang('pl'); assert.deepEqual(listNames(), ['Я', 'Дружина'], 'власна назва не перекладається'); window.setLang('uk');
assert.equal(profilesState().active, DEFAULT_ID, 'перейменування не змінює активний профіль');

// 3f. Поріг PIT, ставка L4 і «Сер. за 1 дн.» з місяців профілю = шлях акаунта на тих самих записах
const seed = { baseSalary: '10500', morningShifts: '16', nightShifts: '4', overtimeDays: '1', weekendDays: '1', scheduleDays: '20', bonusTotalPct: 15 };
const decRec = { ...seed, l4Days: '4', l4MissedShifts: '2', vacationDays: '2', nightShifts: '2' };
const records = {};
for (let j = 1; j <= 11; j++) records[`2026-${String(j).padStart(2, '0')}`] = { ...seed, nightCarryOut: j === 10, nightCarryIn: j === 11 };
records['2026-12'] = decRec;
for (const k of [...store.keys()]) if (k.startsWith('guest_month_')) store.delete(k);
for (const [id, d] of Object.entries(records)) store.set(`guest_month_${id}`, JSON.stringify(d));
await select('2026-11'); await select('2026-12');
const local = { urlop: getEl('urlopBonus').value, l4: getEl('infoL4Sum').innerText, net: getEl('netResult').innerText, rate: globalThis.cachedL4DailyRate,
  pitExtra: getEl('infoPitExtraVal').innerText, ytd: getEl('infoPitYtdVal').innerText, rowPit: !hidden('rowPitExtra') };
{
  const ytd = yearToDate(records, '2026-12', profile);
  assert.equal(ytd.found, 11);
  const urlop = computeDailyUrlopBonus(records, '2026-12', { baseSalary: 10500, minWage: getMinWage(2026) });
  assert.ok(urlop > 0); assert.equal(local.urlop, urlop.toFixed(2), '«Сер. за 1 дн.» — computeDailyUrlopBonus на записах профілю');
  const res = compute({ ...inputsFromSaved({ ...decRec, urlopBonus: local.urlop }, '2026-12', profile), l4DailyRateCached: local.rate });
  const extra = pitExtra(res, ytd.prev);
  assert.ok(extra > 100, `передумова: у грудні перетинається поріг (${ytd.prev} + ${pitBaseOf(res)})`);
  assert.equal(local.rowPit, true, 'рядок «PIT 32%» показано без входу');
  assert.equal(local.pitExtra, money(extra), 'додатковий PIT — pitExtra(yearToDate) на тих самих записах');
  assert.equal(local.net, money(res.net - extra), 'netto з порогом PIT');
  assert.equal(local.ytd, money(ytd.prev + pitBaseOf(res)));
  assert.ok(local.rate > 0 && res.l4Pay > 0); assert.equal(local.l4, money(res.l4Pay));
}
window.switchPage(3); await sleep(60);
const localStats = getEl('statsNetVal').textContent;
{
  const st = collectPeriodStats(records, { mode: '12', years: [] }, profile, { premium: true, now: new Date(2026, 11, 15, 12) });
  assert.equal(localStats, money(st.totals.net), 'статистика профілю — з порогом PIT');
}
window.switchPage(1);

// 3g. Вхід в акаунт із тими самими записами в хмарі: ті самі числа; профілі не діють
for (const [id, d] of Object.entries(records)) cloud.set(`users/u1/months/${id}`, { ...d });
auth.currentUser = { uid: 'u1', email: 'user@example.com' };
await authCb(auth.currentUser); await sleep(40);
await select('2026-11'); await select('2026-12');
assert.equal(getEl('urlopBonus').value, local.urlop, 'акаунт: та сама «Сер. за 1 дн.»');
assert.equal(globalThis.cachedL4DailyRate, local.rate, 'акаунт: та сама ставка L4');
assert.equal(getEl('infoL4Sum').innerText, local.l4);
assert.equal(getEl('infoPitExtraVal').innerText, local.pitExtra, 'акаунт: той самий додатковий PIT');
assert.equal(getEl('netResult').innerText, local.net);
window.switchPage(3); await sleep(60);
assert.equal(getEl('statsNetVal').textContent, localStats, 'акаунт: та сама статистика');
window.switchPage(1);
assert.equal(body.classList.contains('is-logged-in'), true); assert.equal(body.classList.contains('full-features'), true);
assert.equal(hidden('auth-container'), true); assert.equal(hidden('sync-container'), false);
assert.equal(hidden('cloudOnly1'), false, 'хмарні кнопки — після входу');
assert.equal(hidden('profilesLocal'), true, 'список локальних профілів схований');
assert.equal(hidden('profilesSignedIn'), false);
assert.equal(getEl('profilesSignedIn').innerText, dict.uk.profilesSignedIn.replace('{email}', 'user@example.com'));
assert.equal(getEl('whoBadge').textContent, 'user@example.com', 'у шапці — email акаунта');
window.setLang('pl');
assert.equal(getEl('profilesSignedIn').innerText, 'Zalogowano na konto user@example.com. Profile lokalne są dostępne po wylogowaniu.');
window.setLang('uk');
// збереження місяця акаунта не пише в локальний профіль
const localBefore = store.get('guest_month_2026-12');
await type('morningShifts', '3');
assert.equal(store.get('guest_month_2026-12'), localBefore, 'з акаунтом локальні місяці не змінюються');

// 3h. Вихід: повертається активний локальний профіль
await fire(getEl('btn-logout'), 'click'); await sleep(60);
assert.equal(body.classList.contains('is-logged-in'), false);
assert.equal(getEl('whoBadge').textContent, 'Я', 'після виходу — назва активного локального профілю');
assert.equal(hidden('profilesLocal'), false); assert.equal(hidden('profilesSignedIn'), true);
assert.equal(getEl('morningShifts').value, '16', 'місяць локального профілю відновлено');
assert.equal(getEl('netResult').innerText, local.net, 'числа локального профілю ті самі, що до входу');

// 3i. Видалення у два кроки на сторінці
await getEl('profileList').children[1].handlers.click[0](); await sleep(60);
assert.equal(profilesState().active, wife.id);
await click('btn-profile-delete');
assert.equal(hidden('profileDelete'), false); assert.equal(hidden('profileActions'), true);
assert.equal(getEl('profileDeleteText').innerText, 'Видалити профіль «Дружина» і всі його місяці? Це не можна скасувати.');
window.setLang('pl');
assert.equal(getEl('profileDeleteText').innerText, 'Usunąć profil „Дружина” i wszystkie jego miesiące? Tego nie można cofnąć.');
window.setLang('uk');
await click('btn-profile-delete-no');
assert.equal(hidden('profileDelete'), true); assert.equal(profilesState().list.length, 2, '«Скасувати» нічого не видаляє');
assert.ok(store.has(`prof_${wife.id}__guest_month_2026-06`));
const globals = ['lang', 'theme', PROFILES_KEY].filter(k => store.has(k));
await click('btn-profile-delete'); await click('btn-profile-delete-yes');
assert.deepEqual([...store.keys()].filter(k => k.startsWith(`prof_${wife.id}__`)), [], 'ключі профілю видалено');
assert.equal(Object.keys(readGuestRecords(profileStorage(localStorage, DEFAULT_ID))).length, 12, 'місяці іншого профілю на місці');
for (const k of globals) assert.ok(store.has(k), `спільний ${k} на місці`);
assert.equal(profilesState().active, DEFAULT_ID, 'активним став перший профіль');
assert.deepEqual(listNames(), ['Я']); assert.equal(hidden('btn-profile-delete'), true, 'лишився один — кнопки «Видалити» немає');
assert.equal(getEl('whoBadge').textContent, 'Я');
assert.equal(getEl('morningShifts').value, '16', 'після видалення активного одразу відкрито дані першого');

console.log('OK: профілі (перший запуск без переносу, автоназва UA/PL і міграція, створення/назви/видалення, ізоляція, PIT/L4/відпускні без входу = акаунт, вхід і вихід)');
process.exit(0);
