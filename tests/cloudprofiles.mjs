/* Свій акаунт для кожного профілю (1.21.0): перенесення входу 1.20.1, підключення з трьома варіантами даних, кілька
   акаунтів одночасно, вихід, видалення, відновлення профілів. app.js на фейковому DOM і фейковому Firebase (fake-cloud.mjs:
   окремий вхід на кожен appName, доступ до users/{uid} лише з входом цього uid). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom, findAll } from './fake-dom.mjs';
import { fakeCloud } from './fake-cloud.mjs';
import {
  PROFILES_KEY, DEFAULT_ID, NAME_MAX, ensureProfiles, readProfiles, createProfile, renameProfile, setProfileCloud,
  createCloudProfile, nameFromEmail, isFirstRun
} from '../js/profiles.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null };
};

// ---------- 1. Модель ----------
{
  const st = memStorage();
  ensureProfiles(st);
  const second = createProfile(st, 'Дружина').id;
  const c = { uid: 'u1', email: 'a@x.pl', appName: 'p_default' };
  assert.deepEqual(setProfileCloud(st, DEFAULT_ID, c).state.list[0].cloud, c);
  assert.deepEqual(readProfiles(st).list[0].cloud, c, 'cloud зберігається');
  assert.deepEqual(renameProfile(st, DEFAULT_ID, 'Володимир').state.list[0].cloud, c, 'перейменування не губить cloud');
  assert.deepEqual(readProfiles(st).list[0].cloud, c);
  const taken = setProfileCloud(st, second, { ...c, appName: 'p_x' });
  assert.deepEqual([taken.ok, taken.error, taken.profile.name], [false, 'taken', 'Володимир'], 'той самий uid — лише в одному профілі');
  assert.equal(setProfileCloud(st, DEFAULT_ID, null).state.list[0].cloud, undefined);
  for (const bad of [{ uid: 'u' }, { uid: '', email: '', appName: 'a' }, 'x', 5]) {
    st.setItem(PROFILES_KEY, JSON.stringify({ active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: 'A', createdAt: '', cloud: bad }] }));
    assert.equal(readProfiles(st).list[0].cloud, undefined, `пошкоджене cloud відкидається: ${JSON.stringify(bad)}`);
  }
  // назва з email: частина до @, до 30 символів, зайнята — «(хмара)», далі з номером
  const taken1 = { list: [{ id: 'a', name: 'anna', createdAt: '' }, { id: 'b', name: 'Anna (хмара)', createdAt: '' }] };
  assert.equal(nameFromEmail({ list: [] }, 'anna@x.pl', 'хмара', 'Профіль'), 'anna');
  assert.equal(nameFromEmail(taken1, 'anna@x.pl', 'хмара', 'Профіль'), 'anna (хмара 2)');
  const long = nameFromEmail({ list: [] }, `${'q'.repeat(50)}@x.pl`, 'хмара', 'Профіль');
  assert.equal([...long].length, NAME_MAX);
  const longTaken = nameFromEmail({ list: [{ id: 'a', name: long, createdAt: '' }] }, `${'q'.repeat(50)}@x.pl`, 'хмара', 'Профіль');
  assert.equal([...longTaken].length, NAME_MAX); assert.ok(longTaken.endsWith(' (хмара)'));
  assert.equal(nameFromEmail({ list: [] }, '@x.pl', 'хмара', 'Профіль'), 'Профіль');
  // без жодних профілів і даних — акаунт стає єдиним профілем
  const fresh = memStorage();
  assert.deepEqual(createCloudProfile(fresh, c, 'хмара', 'Профіль').state.list.map(p => [p.id, p.name]), [[DEFAULT_ID, 'a']]);
}

// ---------- 2. Відновлення профілів із ключів prof_<id>__… ----------
for (const broken of [{}, { [PROFILES_KEY]: '{зламано' }]) {
  const init = { ...broken, 'prof_pbbbbbb__guest_month_2026-03': '{}', prof_paaaaaa__user_profile_guest: '{}', 'prof_pbbbbbb__guest_month_2026-04': '{}', prof_pzzzzzz__other: '1', lang: 'pl' };
  const st = memStorage(init);
  assert.equal(isFirstRun(st), false, 'є ключі prof_ — не перший запуск');
  const s = ensureProfiles(st, new Date(), n => `Przywrócony profil ${n}`);
  assert.deepEqual(s.list.map(p => [p.id, p.name]), [['paaaaaa', 'Przywrócony profil 1'], ['pbbbbbb', 'Przywrócony profil 2']]);
  for (const [k, v] of Object.entries(init)) if (k !== PROFILES_KEY) assert.equal(st.getItem(k), v, `${k} не змінено`);
}
{
  const st = memStorage({ 'guest_month_2026-03': '{}', prof_paaaaaa__user_profile_guest: '{}' });
  assert.deepEqual(ensureProfiles(st).list.map(p => p.id), [DEFAULT_ID, 'paaaaaa'], 'є й дані default — він перший');
}

// ---------- 3. app.js: телефон з 1.20.1 (вхід на [DEFAULT]) і кілька локальних профілів ----------
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const numberIds = [...html.matchAll(/<input type="number"[^>]*? id="(\w+)"/g)].map(m => m[1]);
const { getEl, fire, store } = installFakeDom({ groups: { 'input[type=number]': numberIds } });
numberIds.forEach(getEl);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');

const fc = fakeCloud({ accounts: { 'owner@x.pl': 'u_owner', 'wife@x.pl': 'u_wife', 'kid@x.pl': 'u_kid', 'bro@x.pl': 'u_bro', 'me@x.pl': 'u_me' } });
const month = (morning, extra = {}) => ({ baseSalary: '6000', morningShifts: String(morning), scheduleDays: '20', bonusTotalPct: 15, ...extra });
const cloudMonth = (uid, id) => fc.docs.get(`users/${uid}/months/${id}`);
const cloudDocs = uid => JSON.stringify([...fc.docs].filter(([p]) => p.startsWith(`users/${uid}/`)).sort());
const putCloud = (uid, id, data) => fc.docs.set(`users/${uid}/months/${id}`, data);
const settings = { baseSalary: 5750, under26: 'no', ppk: 'no', insurance: 'yes' };

const mem = memStorage();
ensureProfiles(mem);
const P = {};
for (const [key, name] of [['wife', 'Дружина'], ['kid', 'Дитина'], ['bro', 'Брат'], ['me', 'Новий'], ['spare', 'Запасний']]) P[key] = createProfile(mem, name).id;
const seed = {
  lang: 'uk', [PROFILES_KEY]: mem.getItem(PROFILES_KEY),
  'guest_month_2026-05': JSON.stringify(month(11)), 'guest_month_2026-06': JSON.stringify(month(12)),
  user_profile_guest: JSON.stringify({ ...settings, baseSalary: 6100 }),
  [`prof_${P.wife}__guest_month_2026-05`]: JSON.stringify(month(7)), [`prof_${P.wife}__guest_month_2026-07`]: JSON.stringify(month(8)),
  [`prof_${P.wife}__user_profile_guest`]: JSON.stringify({ ...settings, baseSalary: 7000, insurance: 'no', extraDeduction: 12 }),
  [`prof_${P.bro}__guest_month_2026-07`]: JSON.stringify(month(3)),
  [`prof_${P.me}__user_profile_guest`]: JSON.stringify({ ...settings, insurance: 'no', extraDeduction: 0 }),
  user_profile_u_owner: JSON.stringify({ ...settings, baseSalary: 9000 })
};
for (const [k, v] of Object.entries(seed)) store.set(k, v);
putCloud('u_owner', '2026-05', month(20)); fc.docs.set('users/u_owner/profile/userProfile', { ...settings, baseSalary: 9000 });
putCloud('u_wife', '2026-05', month(15)); putCloud('u_wife', '2026-06', month(16));
fc.docs.set('users/u_wife/profile/userProfile', { ...settings, baseSalary: 7700 });
putCloud('u_bro', '2026-05', month(2));
fc.auth('[DEFAULT]').currentUser = { uid: 'u_owner', email: 'owner@x.pl' };      // сесія, що лишилась від 1.20.1

globalThis.__salaryTest = { cloudLoader: async () => fc.stub, saveTimeoutMs: 60, now: new Date(2026, 5, 15, 12).getTime() };
console.warn = () => {};
const localKeys = () => Object.fromEntries([...store].filter(([k]) => /^(prof_|guest_month_|user_profile_guest)/.test(k)).sort());
const before = localKeys();
await import('../js/app.js');
await sleep(120);

const body = getEl('app-body');
const hidden = id => getEl(id).classList.contains('hidden');
const click = async id => { await fire(getEl(id), 'click'); await sleep(60); };
const state = () => JSON.parse(store.get(PROFILES_KEY));
const byName = name => state().list.find(p => p.name === name);
const pills = () => getEl('profileList').children;
const pillName = b => findAll(b, n => n.className === 'prof-name')[0].textContent;
const open = async name => { await pills().find(b => pillName(b) === name).handlers.click[0](); await sleep(60); };
const select = async id => { getEl('monthSelect').value = id; await fire(body, 'change', getEl('monthSelect')); await sleep(60); };
const morning = () => getEl('morningShifts').value;
const signIn = async (email, register = false) => {
  if (register) await fire(getEl('authModeRegister'), 'click');
  getEl('email').value = email; getEl('password').value = 'secret-123';
  await getEl('loginForm').handlers.submit[0]({ preventDefault() {} }); await sleep(80);
};
const toast = () => getEl('toast').innerText;
const session = app => fc.auth(app).currentUser?.uid || null;
const unchanged = (snapshot, msg) => { for (const [k, v] of Object.entries(snapshot)) assert.equal(store.get(k), v, `${msg}: ${k}`); };

// 3a. Перенесення входу 1.20.1
assert.deepEqual(localKeys(), before, 'перенесення: локальні ключі без змін');
const owner = byName('owner');
assert.deepEqual(owner.cloud, { uid: 'u_owner', email: 'owner@x.pl', appName: '[DEFAULT]' });
assert.equal(state().active, owner.id, 'новий профіль акаунта — активний');
assert.equal(state().list.length, 7);
assert.equal(fc.calls.signIn.length, 0, 'без повторного входу');
assert.equal(fc.calls.setDoc.length, 0, 'у хмару нічого не пишеться');
assert.equal(getEl('whoBadge').textContent, 'owner', 'у шапці — назва профілю');
assert.equal(getEl('btn-cloud').attrs['data-state'], 'ok');
await select('2026-05');
assert.equal(morning(), '20', 'дані — з хмари акаунта'); assert.equal(String(getEl('profBaseSalary').value), '9000');
await fc.emit('[DEFAULT]'); await sleep(60);
assert.equal(state().list.length, 7, 'повторний запуск не створює другого профілю');

// 3b. Локальний профіль доступний, поки інший підключений
await open(dict.uk.profileDefaultName);
assert.equal(morning(), '11', 'локальний профіль «Мій профіль» зі своїми даними');
assert.equal(body.classList.contains('is-logged-in'), false); assert.equal(getEl('btn-cloud').attrs['data-state'], 'out');
assert.equal(getEl('cloudOutText').textContent, dict.uk.cloudConnectText.replace('{name}', dict.uk.profileDefaultName));
assert.equal(hidden('auth-container'), false);

// 3c. Локальні місяці є, у хмарі порожньо → усе вивантажується без запитань
await open(dict.uk.profileDefaultName); await click('btn-cloud');
let snapshot = localKeys();
await signIn('me@x.pl');
assert.equal(hidden('merge-container'), true, 'без запитань');
assert.deepEqual(state().list[0].cloud, { uid: 'u_me', email: 'me@x.pl', appName: 'p_default' });
assert.equal(cloudMonth('u_me', '2026-05').morningShifts, '11'); assert.equal(cloudMonth('u_me', '2026-06').morningShifts, '12');
assert.equal(fc.docs.get('users/u_me/profile/userProfile').baseSalary, 6100);
assert.equal(fc.docs.get('users/u_me/profile/userProfile').extraDeduction, 36.7, 'відрахування профілю (старий запис) — те саме, що показував телефон');
assert.equal(toast(), dict.uk.toastDataUploaded);
unchanged(snapshot, 'підключення (хмара порожня)');
assert.equal(morning(), '11'); assert.equal(hidden('sync-container'), false);
window.salaryBack();

// 3d. Місяців на телефоні немає → без запитань; налаштування — у хмару, бо там їх немає
await open('Дитина'); await click('btn-cloud'); snapshot = localKeys();
await signIn('kid@x.pl');
assert.equal(hidden('merge-container'), true);
assert.deepEqual(byName('Дитина').cloud, { uid: 'u_kid', email: 'kid@x.pl', appName: `p_${P.kid}` });
assert.ok(fc.docs.has('users/u_kid/profile/userProfile'));
assert.deepEqual([...fc.docs.keys()].filter(k => k.startsWith('users/u_kid/months/')), []);
unchanged(snapshot, 'підключення без місяців'); window.salaryBack();

// 3e. Місяці є і там, і там: спершу «Скасувати» (і закрита панель) — профіль лишається локальним
await open('Дружина'); await click('btn-cloud'); snapshot = localKeys();
const wifeCloud = cloudDocs('u_wife');
await signIn('wife@x.pl');
assert.equal(hidden('merge-container'), false, 'вибір у панелі'); assert.equal(hidden('auth-container'), true);
assert.equal(getEl('cloudMergeText').textContent, 'У хмарі вже є 2 міс., на телефоні — 2 міс.');
assert.equal(getEl('cloudSheet').attrs['aria-labelledby'], 'cloudMergeTitle');
assert.equal(byName('Дружина').cloud, undefined, 'до вибору профіль не підключений');
window.salaryBack(); await sleep(60);
assert.equal(session(`p_${P.wife}`), null, 'закрита панель — тимчасовий вхід знято');
assert.equal(byName('Дружина').cloud, undefined); assert.equal(cloudDocs('u_wife'), wifeCloud);
await click('btn-cloud'); await signIn('wife@x.pl'); await click('btn-merge-cancel');
assert.equal(session(`p_${P.wife}`), null); assert.equal(hidden('auth-container'), false);
// «Додати місяці з телефону, яких немає в хмарі»
await signIn('wife@x.pl'); await click('btn-merge-add');
assert.equal(byName('Дружина').cloud.uid, 'u_wife');
assert.equal(cloudMonth('u_wife', '2026-07').morningShifts, '8', 'місяць, якого бракувало, додано');
assert.equal(cloudMonth('u_wife', '2026-05').morningShifts, '15', 'спільний місяць — хмарна версія');
assert.equal(fc.docs.get('users/u_wife/profile/userProfile').baseSalary, 7700, 'налаштування хмари не перезаписані');
assert.equal(String(getEl('profBaseSalary').value), '7700');
await select('2026-05'); assert.equal(morning(), '15');
unchanged(snapshot, 'підключення «додати»'); window.salaryBack();
// «Залишити лише хмарні»
await open('Брат'); await click('btn-cloud'); snapshot = localKeys();
await signIn('bro@x.pl'); await click('btn-merge-cloud');
assert.equal(byName('Брат').cloud.uid, 'u_bro');
assert.deepEqual([...fc.docs.keys()].filter(k => k.startsWith('users/u_bro/months/')), ['users/u_bro/months/2026-05'], 'з телефону нічого не додано');
await select('2026-07'); assert.equal(morning(), '', 'місяця телефону в підключеному профілі не видно');
unchanged(snapshot, 'підключення «лише хмарні»'); window.salaryBack();

// 3f. Збій запису під час підключення — профіль лишається локальним, на телефоні все на місці
await open('Запасний'); getEl('profBaseSalary').value = '5900'; await click('btn-save-profile');
await select('2026-05'); getEl('morningShifts').value = '4'; await fire(body, 'input', getEl('morningShifts')); await sleep(40);
await click('btn-cloud'); snapshot = localKeys(); fc.mode.setDoc = 'fail';
await signIn('spare@x.pl');
fc.mode.setDoc = 'ok';
assert.equal(byName('Запасний').cloud, undefined); assert.equal(session(`p_${P.spare}`), null);
assert.ok(toast().startsWith(dict.uk.toastConnectErr)); unchanged(snapshot, 'збій підключення');

// 3g. Той самий акаунт до другого профілю → помилка й вихід із тимчасового входу
await signIn('wife@x.pl');
assert.equal(toast(), dict.uk.errTaken.replace('{name}', 'Дружина'));
assert.equal(byName('Запасний').cloud, undefined); assert.equal(session(`p_${P.spare}`), null);
assert.equal(session(`p_${P.wife}`), 'u_wife', 'сесія профілю «Дружина» ціла');
window.salaryBack();

// 3h. Реєстрація нового акаунта: налаштування профілю одразу в хмарі (відрахування нового профілю 0)
await open('Новий'); getEl('toast').innerText = '';
// акаунт «me@x.pl» уже зайнятий профілем «Мій профіль», тож реєструємо іншу адресу
await click('btn-cloud'); await signIn('fresh@x.pl', true);
const fresh = byName('Новий').cloud;
assert.equal(fresh.email, 'fresh@x.pl');
assert.equal(fc.docs.get(`users/${fresh.uid}/profile/userProfile`).extraDeduction, 0);
window.salaryBack();

// 3i. Перемикання між підключеними профілями: без входу й пароля, дані — свого uid
const signIns = fc.calls.signIn.length + fc.calls.signUp.length, signOuts = fc.calls.signOut.length;
for (const [name, value, uid] of [['owner', '20', 'u_owner'], ['Дружина', '15', 'u_wife'], ['Брат', '2', 'u_bro'], ['owner', '20', 'u_owner']]) {
  await open(name); await select('2026-05');
  assert.equal(morning(), value, `${name}: свій місяць`); assert.equal(getEl('user-email-display').innerText, state().list.find(p => p.cloud?.uid === uid).cloud.email);
  assert.equal(getEl('btn-cloud').attrs['data-state'], 'ok');
}
assert.deepEqual([fc.calls.signIn.length + fc.calls.signUp.length, fc.calls.signOut.length], [signIns, signOuts], 'перемикання нікуди не входить і не виходить');
// «Зберегти місяць» пише в акаунт активного профілю
await open('Дружина'); await select('2026-05');
getEl('morningShifts').value = '17'; await fire(body, 'input', getEl('morningShifts'));
const localBefore = localKeys();
await click('btn-sync-up-calc');
assert.equal(cloudMonth('u_wife', '2026-05').morningShifts, '17'); assert.equal(cloudMonth('u_owner', '2026-05').morningShifts, '20');
assert.deepEqual(localKeys(), localBefore, 'підключений профіль не пише в локальні ключі');
// пігулки: хмарка лише в підключених
const marks = pills().filter(b => findAll(b, n => String(n.attrs && n.attrs.class).includes('pill-cloud')).length).map(pillName).sort();
assert.deepEqual(marks, state().list.filter(p => p.cloud).map(p => p.name || dict.uk.profileDefaultName).sort());

// 3j. Сеанс одного профілю завершився: решта працює; повторний вхід іншим акаунтом відхиляється
fc.auth(`p_${P.bro}`).currentUser = null; await fc.emit(`p_${P.bro}`); await sleep(40);
await open('Брат');
assert.equal(getEl('btn-cloud').attrs['data-state'], 'off'); assert.equal(hidden('auth-container'), false); assert.equal(hidden('btn-detach'), false);
assert.equal(getEl('cloudOutText').textContent, dict.uk.cloudExpired.replace('{email}', 'bro@x.pl').replace('{name}', 'Брат'));
assert.equal(getEl('email').value, 'bro@x.pl');
await select('2026-05'); assert.equal(morning(), '2', 'без сеансу — копія місяця з телефону');
const setDocs = fc.calls.setDoc.length; await click('btn-sync-up-calc'); assert.equal(fc.calls.setDoc.length, setDocs, 'без сеансу в хмару не пишемо');
await signIn('kid2@x.pl');
assert.equal(toast(), dict.uk.errWrongAccount.replace('{email}', 'bro@x.pl')); assert.equal(session(`p_${P.bro}`), null); assert.equal(byName('Брат').cloud.uid, 'u_bro');
await signIn('bro@x.pl');
assert.equal(session(`p_${P.bro}`), 'u_bro'); assert.equal(getEl('btn-cloud').attrs['data-state'], 'ok');
await open('owner'); assert.equal(getEl('btn-cloud').attrs['data-state'], 'ok');

// 3k. Вихід з одного профілю: місяці скопійовано в його сховище, інші сесії й хмара без змін
await open('Дружина'); await select('2026-05');
const wifeBefore = cloudDocs('u_wife'), others = ['[DEFAULT]', 'p_default', `p_${P.kid}`, `p_${P.bro}`].map(session);
await click('btn-cloud'); await click('btn-logout');
assert.equal(byName('Дружина').cloud, undefined); assert.equal(session(`p_${P.wife}`), null);
assert.deepEqual(['[DEFAULT]', 'p_default', `p_${P.kid}`, `p_${P.bro}`].map(session), others, 'інші сесії не змінились');
for (const [id, value] of [['2026-05', '17'], ['2026-06', '16'], ['2026-07', '8']]) {
  assert.equal(JSON.parse(store.get(`prof_${P.wife}__guest_month_${id}`)).morningShifts, value, `${id}: хмарна версія в профілі`);
}
assert.equal(JSON.parse(store.get(`prof_${P.wife}__user_profile_guest`)).baseSalary, 7700);
assert.equal(cloudDocs('u_wife'), wifeBefore, 'хмара не змінилась');
assert.ok(![...store.keys()].some(k => k.startsWith('cloud_month_u_wife_')) && !store.has('user_profile_u_wife'));
assert.equal(morning(), '17', 'профіль лишився з даними');
window.salaryBack();

// 3l. Вихід без мережі: копія — з monthcache
await open('Брат'); await select('2026-05');
navigator.onLine = false; fc.mode.getDocs = 'fail';
store.delete(`prof_${P.bro}__guest_month_2026-05`);
await click('btn-cloud'); await click('btn-logout');
navigator.onLine = true; fc.mode.getDocs = 'ok';
assert.equal(byName('Брат').cloud, undefined);
assert.equal(JSON.parse(store.get(`prof_${P.bro}__guest_month_2026-05`)).morningShifts, '2', 'місяць — з копії на телефоні');
window.salaryBack();

// 3m. Видалення підключеного профілю: інший текст, вихід, локальні ключі зникли, хмара ціла
await open('owner');
const ownerCloud = cloudDocs('u_owner');
await click('btn-profile-delete');
assert.equal(getEl('profileDeleteText').innerText, 'Видалити профіль «owner» з цього телефона? Дані в хмарі акаунта owner@x.pl залишаться.');
fc.mode.signOut = 'fail'; await click('btn-profile-delete-yes'); fc.mode.signOut = 'ok';
assert.ok(byName('owner'), 'вийти не вдалось — профіль не видаляється');
await click('btn-profile-delete'); await click('btn-profile-delete-yes');
assert.equal(byName('owner'), undefined); assert.equal(session('[DEFAULT]'), null);
assert.equal(cloudDocs('u_owner'), ownerCloud, 'дані в хмарі не видалялись');
assert.ok(![...store.keys()].some(k => k.startsWith(`prof_${owner.id}__`) || k.startsWith('cloud_month_u_owner_') || k === 'user_profile_u_owner'));
await fc.emit('[DEFAULT]'); await sleep(40); assert.equal(byName('owner'), undefined, 'після виходу профіль не з\'являється знову');
await open('Дитина');
await click('btn-profile-delete'); await click('btn-profile-delete-yes');
assert.equal(store.has(PROFILES_KEY) && !byName('Дитина'), true);
assert.equal(session(`p_${P.kid}`), null); assert.equal(session('p_default'), 'u_me', 'інший акаунт лишився');

console.log('OK: акаунти профілів (перенесення входу 1.20.1, три варіанти даних, той самий uid, реєстрація, перемикання без пароля, окремі сесії, сеанс завершено, вихід і копія, видалення, відновлення)');
process.exit(0);
