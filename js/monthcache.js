/* Локальна копія місяців хмарного акаунта — щоб бачити свої дані без мережі.
   Чистий модуль: сховище передається параметром (у браузері — localStorage), тому легко тестується.
   Копія — лише запасний варіант на випадок збою мережі; джерело правди завжди хмара. */

export const MAX_MONTHS = 12;                       // скільки місяців акаунта тримаємо локально
const PREFIX = 'cloud_month_';
const keyFor = (uid, monthVal) => `${PREFIX}${uid}_${monthVal}`;

function keysWithPrefix(storage, prefix) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  return keys;                                      // збираємо спершу, видаляємо після (не під час обходу)
}

export function saveMonthCache(storage, uid, monthVal, data, now = new Date()) {
  try {
    storage.setItem(keyFor(uid, monthVal), JSON.stringify({ v: 1, savedAt: now.toISOString(), data }));
    pruneMonthCache(storage, uid);
    return true;
  } catch (e) {
    return false;                                   // переповнене сховище тощо — кеш не критичний
  }
}

export function loadMonthCache(storage, uid, monthVal) {
  try {
    const raw = storage.getItem(keyFor(uid, monthVal));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const ok = entry && entry.v === 1 && typeof entry.savedAt === 'string'
      && entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data);
    return ok ? entry : null;
  } catch (e) {
    return null;                                    // пошкоджений запис = немає копії
  }
}

export function pruneMonthCache(storage, uid, max = MAX_MONTHS) {
  const keys = keysWithPrefix(storage, `${PREFIX}${uid}_`);
  if (keys.length <= max) return;
  const dated = keys.map(k => {
    let t = 0;
    try { t = Date.parse(JSON.parse(storage.getItem(k)).savedAt) || 0; } catch (e) { /* t = 0 → видаляється першим */ }
    return { k, t };
  }).sort((a, b) => a.t - b.t);
  for (const { k } of dated.slice(0, keys.length - max)) storage.removeItem(k);
}

/* Id ('YYYY-MM') місяців акаунта, що є в локальній копії, за зростанням. Без розбору вмісту — лише ключі. */
export function listMonthCache(storage, uid) {
  const prefix = `${PREFIX}${uid}_`;
  return keysWithPrefix(storage, prefix).map(k => k.slice(prefix.length)).filter(id => /^\d{4}-\d{2}$/.test(id)).sort();
}

export function clearMonthCache(storage, uid) {
  for (const k of keysWithPrefix(storage, `${PREFIX}${uid}_`)) storage.removeItem(k);
}
