/* Оновлення застосунку: js/sw-register.js (подія «нова версія»), sw.js (прекеш без HTTP-кешу), розмітка банера. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const swRegisterSrc = read('js/sw-register.js');

/* Запускає sw-register.js у пісочниці з фейковим браузером і повертає керування тестом. */
function boot({ controller }) {
  const log = { registered: null, updates: 0, events: [] };
  const swHandlers = {}, winHandlers = {}, docHandlers = {};
  const reg = { update: () => { log.updates++; return Promise.resolve(); } };
  const sandbox = {
    navigator: { serviceWorker: {
      controller,
      addEventListener: (t, fn) => { swHandlers[t] = fn; },
      register: (url, opts) => { log.registered = { url, opts }; return Promise.resolve(reg); }
    } },
    window: {
      addEventListener: (t, fn) => { winHandlers[t] = fn; },
      dispatchEvent: ev => { log.events.push(ev.type); }
    },
    document: { visibilityState: 'visible', addEventListener: (t, fn) => { docHandlers[t] = fn; } },
    CustomEvent: class { constructor(type) { this.type = type; } },
    console
  };
  vm.runInNewContext(swRegisterSrc, sandbox);
  return { log, sandbox, swHandlers, winHandlers, docHandlers };
}
const tick = () => new Promise(r => setTimeout(r, 0));

// 1. Є попередній контролер → controllerchange дає подію рівно один раз
let t = boot({ controller: {} });
t.swHandlers.controllerchange(); t.swHandlers.controllerchange();
assert.deepEqual([...t.log.events], ['salary:update-ready'], 'подія оновлення — один раз');

// 2. Перше встановлення (контролера не було) → банера немає
t = boot({ controller: null });
t.swHandlers.controllerchange();
assert.deepEqual([...t.log.events], [], 'перше встановлення не показує «нова версія»');

// 3. Реєстрація в обхід HTTP-кешу
t = boot({ controller: {} });
t.winHandlers.load(); await tick();
assert.equal(t.log.registered.url, './sw.js');
assert.equal(t.log.registered.opts.updateViaCache, 'none', 'реєстрація має йти з updateViaCache: none');

// 4. Перевірка оновлень при поверненні в застосунок (лише коли вкладка видима)
t.sandbox.document.visibilityState = 'hidden'; t.docHandlers.visibilitychange();
assert.equal(t.log.updates, 0, 'у фоні не перевіряємо');
t.sandbox.document.visibilityState = 'visible'; t.docHandlers.visibilitychange();
assert.equal(t.log.updates, 1, 'при поверненні — reg.update()');

// 5. Браузер без service worker: скрипт не падає
vm.runInNewContext(swRegisterSrc, { navigator: {}, window: {}, document: {}, console });

// 6. sw.js: новий SW перебирає керування одразу (інакше controllerchange не настане) і прекешує в обхід HTTP-кешу
const sw = read('sw.js');
assert.ok(/self\.skipWaiting\(\)/.test(sw) && /self\.clients\.claim\(\)/.test(sw), 'sw.js: skipWaiting + clients.claim');
assert.ok(/new Request\(url,\s*\{\s*cache:\s*'reload'\s*\}\)/.test(sw), "sw.js: прекеш має йти з cache: 'reload'");

// 6b. Кожен файл js/ має бути в прекеші: інакше новий модуль працюватиме офлайн лише після першого «живого» запиту
const core = (sw.match(/CORE = \[([\s\S]*?)\]/) || [])[1] || '';
for (const f of readdirSync(join(root, 'js')).filter(f => f.endsWith('.js'))) assert.ok(core.includes(`'./js/${f}'`), `sw.js CORE без js/${f}`);

// 7. Розмітка банера: прихований за замовчуванням, обидві кнопки, переклади в обох мовах
const html = read('index.html');
assert.ok(/id="update-banner" class="update-banner hidden"/.test(html), 'банер прихований за замовчуванням');
for (const id of ['btn-update', 'btn-update-later']) assert.ok(html.includes(`id="${id}"`), `немає #${id}`);
const { dict } = await import('../js/i18n.js');
for (const lang of ['uk', 'pl']) for (const k of ['updateAvailable', 'updateNow', 'updateLater', 'toastSaveOffline']) assert.ok(dict[lang][k], `немає ${lang}.${k}`);
assert.ok(/\.update-banner\{/.test(read('css/styles.css')), 'немає стилів .update-banner');

console.log('OK: оновлення (подія нової версії, реєстрація без HTTP-кешу, перевірка при поверненні, прекеш reload, банер)');
