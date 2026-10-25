/* Юніт-тест js/monthcache.js: запис/читання, захист від сміття, ліміт місяців, очищення. */
import assert from 'node:assert/strict';
import { saveMonthCache, loadMonthCache, pruneMonthCache, clearMonthCache, MAX_MONTHS } from '../js/monthcache.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

// 1. Запис і читання
let s = new FakeStorage();
const when = new Date('2026-10-21T10:00:00Z');
assert.equal(saveMonthCache(s, 'u1', '2026-10', { baseSalary: '6100' }, when), true);
const got = loadMonthCache(s, 'u1', '2026-10');
assert.deepEqual(got.data, { baseSalary: '6100' });
assert.equal(got.savedAt, '2026-10-21T10:00:00.000Z');
assert.equal(loadMonthCache(s, 'u1', '2026-09'), null, 'іншого місяця немає');
assert.equal(loadMonthCache(s, 'u2', '2026-10'), null, 'чужий акаунт не бачить копію');

// 2. Сміття у сховищі не ламає читання
for (const bad of ['not json', '{"v":2,"savedAt":"x","data":{}}', '{"v":1,"savedAt":"x","data":[]}', '{"v":1,"savedAt":"x","data":null}', '{"v":1,"data":{}}', 'null', '""']) {
  s.setItem('cloud_month_u1_2026-08', bad);
  assert.equal(loadMonthCache(s, 'u1', '2026-08'), null, `некоректний запис: ${bad}`);
}

// 3. Ліміт: лишаються MAX_MONTHS найновіших за часом збереження
s = new FakeStorage();
for (let i = 0; i < MAX_MONTHS + 3; i++) {
  const month = `2025-${String((i % 12) + 1).padStart(2, '0')}-${i}`;          // унікальні ключі
  saveMonthCache(s, 'u1', month, { i }, new Date(Date.UTC(2026, 0, 1 + i)));
}
const left = [...s.m.keys()].filter(k => k.startsWith('cloud_month_u1_'));
assert.equal(left.length, MAX_MONTHS, 'кількість обмежена');
const idx = left.map(k => JSON.parse(s.getItem(k)).data.i).sort((a, b) => a - b);
assert.deepEqual(idx, Array.from({ length: MAX_MONTHS }, (_, j) => j + 3), 'видалено найстаріші');

// 4. Ліміт діє окремо для кожного акаунта
s = new FakeStorage();
for (let i = 0; i < MAX_MONTHS; i++) saveMonthCache(s, 'u2', `m${i}`, {}, new Date(Date.UTC(2026, 0, 1 + i)));
for (let i = 0; i < MAX_MONTHS + 2; i++) saveMonthCache(s, 'u1', `m${i}`, {}, new Date(Date.UTC(2026, 0, 1 + i)));
assert.equal([...s.m.keys()].filter(k => k.startsWith('cloud_month_u2_')).length, MAX_MONTHS, 'u2 не зачеплено обрізанням u1');

// 5. Очищення: лише копії цього акаунта, решта сховища недоторкана
s = new FakeStorage();
saveMonthCache(s, 'u1', '2026-10', {}); saveMonthCache(s, 'u1', '2026-09', {}); saveMonthCache(s, 'u2', '2026-10', {});
s.setItem('guest_month_2026-10', '{"a":1}'); s.setItem('user_profile_u1', '{}'); s.setItem('lang', 'pl');
clearMonthCache(s, 'u1');
assert.deepEqual([...s.m.keys()].sort(), ['cloud_month_u2_2026-10', 'guest_month_2026-10', 'lang', 'user_profile_u1'], 'видалено тільки cloud_month_u1_*');

// 6. Помилка сховища (квота) не кидає виняток
const full = { length: 0, key: () => null, getItem: () => null, removeItem() {}, setItem() { throw new Error('QuotaExceededError'); } };
assert.equal(saveMonthCache(full, 'u1', '2026-10', {}), false);

// 7. app.js справді користується кешем (запис, читання, очищення)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/app.js'), 'utf8');
for (const call of ['saveMonthCache(', 'loadMonthCache(', 'clearMonthCache(']) assert.ok(app.includes(call), `app.js не викликає ${call}`);

console.log('OK: кеш місяців (запис, сміття, ліміт, очищення, квота)');
