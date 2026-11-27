/* Локальні профілі на одному пристрої (наприклад, двоє людей на одному телефоні).
   Чистий модуль: без DOM і Firebase, сховище (localStorage) передається параметром.

   Список: ключ profiles_v1 = { active: id, list: [{ id, name, createdAt, autoName? }] }.
   autoName: true — назву користувач не задавав: name порожній, а показується автоматична назва мовою інтерфейсу
   (displayName). Автоматичні назви — AUTO_NAMES з i18n («Мій профіль» / «Mój profil»).
   Профіль 'default' користується тими самими ключами, що й гість до появи профілів (guest_month_YYYY-MM,
   user_profile_guest), тому наявні дані нікуди не переносяться. Інші профілі: prof_<id>__guest_month_YYYY-MM
   і prof_<id>__user_profile_guest. Усе інше в сховищі (мова, тема, кеш хмари акаунта тощо) спільне. */

import { dict } from './i18n.js';

export const PROFILES_KEY = 'profiles_v1';
export const DEFAULT_ID = 'default';
export const NAME_MAX = 30;
const PREFIX = 'prof_';
const SEP = '__';
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/* Автоматичні назви всіма мовами інтерфейсу. Профіль із такою назвою вважається таким, що назви ще не має. */
export const AUTO_NAMES = Object.values(dict).map(t => t.profileDefaultName);
const low = text => text.toLocaleLowerCase();
const isAutoText = text => AUTO_NAMES.some(n => low(n) === low(text));

/* Назва для показу: автоматична — мовою інтерфейсу (autoLabel), інакше власна. */
export const displayName = (p, autoLabel) => (p.autoName ? autoLabel : p.name);

/* Назви ключів, що належать профілю (у профілі 'default' вони без префікса). */
export const isProfileKeyName = name => typeof name === 'string' && (name === 'user_profile_guest' || name.startsWith('guest_month_'));
const rawKey = (id, name) => (id === DEFAULT_ID ? name : `${PREFIX}${id}${SEP}${name}`);

function validState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.list) || s.list.length === 0) return false;
  const ids = new Set();
  for (const p of s.list) {
    if (!p || typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || ids.has(p.id)) return false;
    ids.add(p.id);
  }
  return true;
}

/* Список профілів або null, якщо його ще немає (чи він пошкоджений). Невідомий active → перший у списку. */
export function readProfiles(storage) {
  let s = null;
  try { s = JSON.parse(storage.getItem(PROFILES_KEY)); } catch (e) { return null; }
  if (!validState(s)) return null;
  // Міграція 1.19.0 → 1.19.1: назва рівно «Мій профіль» / «Mój profil» (її створив застосунок) стає автоматичною
  const list = s.list.map(p => (p.autoName === true || AUTO_NAMES.includes(p.name)
    ? { id: p.id, name: '', createdAt: p.createdAt || '', autoName: true }
    : { id: p.id, name: p.name, createdAt: p.createdAt || '' }));
  return { active: list.some(p => p.id === s.active) ? s.active : list[0].id, list };
}

const write = (storage, state) => { storage.setItem(PROFILES_KEY, JSON.stringify(state)); return state; };

/* Перший запуск: створює один профіль 'default' з автоматичною назвою. Жоден наявний ключ, крім profiles_v1, не змінюється.
   Наявний список, якому потрібна міграція автоматичних назв, записується одразу в новому вигляді. */
export function ensureProfiles(storage, now = new Date()) {
  const s = readProfiles(storage);
  if (s) {
    if (JSON.stringify(s) !== storage.getItem(PROFILES_KEY)) write(storage, s);
    return s;
  }
  return write(storage, { active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: '', createdAt: now.toISOString(), autoName: true }] });
}

export const activeProfile = state => state.list.find(p => p.id === state.active) || state.list[0];

/* Назва: обрізаємо пробіли по краях; 1–30 символів; унікальна без урахування регістру (крім профілю exceptId).
   Профіль з autoName займає всі автоматичні назви (обидві мови). Введена автоматична назва повертає профілю autoName.
   → { ok, name, autoName } або { ok: false, error: 'length' | 'duplicate' }. */
export function checkName(state, text, exceptId = null) {
  const name = String(text ?? '').trim();
  const len = [...name].length;
  if (len < 1 || len > NAME_MAX) return { ok: false, error: 'length' };
  const auto = isAutoText(name);
  const taken = p => (p.autoName ? auto : low(p.name) === low(name));
  if (state.list.some(p => p.id !== exceptId && taken(p))) return { ok: false, error: 'duplicate' };
  return { ok: true, name: auto ? '' : name, autoName: auto };
}

// Запис профілю в тому самому порядку полів, що й readProfiles (тож ensureProfiles не переписує його без потреби)
const entry = (p, checked) => (checked.autoName
  ? { id: p.id, name: '', createdAt: p.createdAt || '', autoName: true }
  : { id: p.id, name: checked.name, createdAt: p.createdAt || '' });

function newId(state, random) {
  for (;;) {
    let id = 'p';
    for (let i = 0; i < 6; i++) id += ID_CHARS[Math.floor(random() * ID_CHARS.length) % ID_CHARS.length];
    if (!state.list.some(p => p.id === id)) return id;
  }
}

/* Новий профіль (не стає активним сам). → { ok, state, id } або { ok: false, error: 'length' | 'duplicate' }. */
export function createProfile(storage, text, { random = Math.random, now = new Date() } = {}) {
  const state = readProfiles(storage);
  const checked = checkName(state, text);
  if (!checked.ok) return checked;
  const id = newId(state, random);
  const next = write(storage, { active: state.active, list: [...state.list, entry({ id, createdAt: now.toISOString() }, checked)] });
  return { ok: true, state: next, id };
}

export function renameProfile(storage, id, text) {
  const state = readProfiles(storage);
  if (!state.list.some(p => p.id === id)) return { ok: false, error: 'unknown' };
  const checked = checkName(state, text, id);
  if (!checked.ok) return checked;
  return { ok: true, state: write(storage, { ...state, list: state.list.map(p => (p.id === id ? entry(p, checked) : p)) }) };
}

export function setActiveProfile(storage, id) {
  const state = readProfiles(storage);
  if (!state.list.some(p => p.id === id)) return { ok: false, error: 'unknown' };
  return { ok: true, state: write(storage, { ...state, active: id }) };
}

/* Сирі ключі сховища, що належать профілю id. */
export function profileKeys(storage, id) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (id === DEFAULT_ID ? isProfileKeyName(key) : (typeof key === 'string' && key.startsWith(`${PREFIX}${id}${SEP}`))) keys.push(key);
  }
  return keys;
}

/* Видаляє профіль і всі його ключі. Останній профіль видалити не можна. Видалили активний → активним стає перший. */
export function deleteProfile(storage, id) {
  const state = readProfiles(storage);
  if (!state.list.some(p => p.id === id)) return { ok: false, error: 'unknown' };
  if (state.list.length <= 1) return { ok: false, error: 'last' };
  for (const key of profileKeys(storage, id)) storage.removeItem(key);
  const list = state.list.filter(p => p.id !== id);
  return { ok: true, state: write(storage, { active: state.active === id ? list[0].id : state.active, list }) };
}

/* Сховище одного профілю з тим самим інтерфейсом, що й localStorage (length, key, getItem, setItem, removeItem).
   Видно лише ключі цього профілю під звичайними назвами (guest_month_…, user_profile_guest), тож readGuestRecords()
   зі stats.js повертає місяці лише цього профілю. Для 'default' — ключі без префікса; ключі prof_… у ньому не видно. */
export function profileStorage(storage, id) {
  const own = () => profileKeys(storage, id);
  const nameOf = key => (id === DEFAULT_ID ? key : key.slice(`${PREFIX}${id}${SEP}`.length));
  const check = name => { if (!isProfileKeyName(name)) throw new Error(`profileStorage: ключ «${name}» не належить профілю`); return rawKey(id, name); };
  return {
    get length() { return own().length; },
    key(i) { const k = own()[i]; return k === undefined ? null : nameOf(k); },
    getItem(name) { return isProfileKeyName(name) ? storage.getItem(rawKey(id, name)) : null; },
    setItem(name, value) { storage.setItem(check(name), value); },
    removeItem(name) { if (isProfileKeyName(name)) storage.removeItem(rawKey(id, name)); }
  };
}
