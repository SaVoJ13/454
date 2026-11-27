/* Версія застосунку: одне джерело (js/version.js), показ у шапці, використання в sw.js. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// version.js виконується як класичний скрипт і задає self.APP_VERSION у семвер-форматі
const sandbox = {}; sandbox.self = sandbox;
vm.runInNewContext(read('js/version.js'), sandbox);
assert.match(sandbox.APP_VERSION, /^\d+\.\d+\.\d+$/, 'APP_VERSION має бути у форматі X.Y.Z');

// sw.js бере версію з version.js і кешує сам version.js
const sw = read('sw.js');
assert.ok(/importScripts\(\s*'\.\/js\/version\.js'\s*\)/.test(sw), 'sw.js має підключати version.js через importScripts');
assert.ok(/const VERSION = self\.APP_VERSION/.test(sw), 'sw.js має брати VERSION з self.APP_VERSION');
assert.ok(/CORE = \[[^\]]*'\.\/js\/version\.js'/.test(sw), 'version.js має бути в precache (CORE)');

// index.html: версія — у «Параметрах» (окремий рядок унизу), у шапці її немає (з 1.19.1); класичний скрипт стоїть перед модулем
const html = read('index.html');
const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
const settings = html.slice(html.indexOf('<section class="view" id="viewSettings">'), html.indexOf('<section class="view" id="viewStats">'));
assert.ok(!/appVersion|app-ver/.test(header), 'у шапці версії більше немає');
assert.ok(/<p class="app-ver" id="appVersion"><\/p><\/div><\/div><\/section>\s*$/.test(settings), '#appVersion — останній рядок «Параметрів»');
assert.ok(!/pro-badge|>PRO</.test(html), 'плашки PRO немає');
// app.js показує «Версія X.Y.Z» / «Wersja X.Y.Z» з version.js (через i18n, при кожній зміні мови)
const { dict } = await import('../js/i18n.js');
assert.equal(dict.uk.appVersionLabel.replace('{v}', sandbox.APP_VERSION), `Версія ${sandbox.APP_VERSION}`);
assert.equal(dict.pl.appVersionLabel.replace('{v}', sandbox.APP_VERSION), `Wersja ${sandbox.APP_VERSION}`);
const app = read('js/app.js');
assert.ok(/appVersionLabel\.replace\('\{v\}', globalThis\.APP_VERSION\)/.test(app) && /renderAppVersion\(\); renderKnownEmails/.test(app), 'app.js бере версію з APP_VERSION і оновлює її в setLang');
const iv = html.indexOf('src="js/version.js"'), im = html.indexOf('type="module" src="js/app.js"');
assert.ok(iv > 0 && im > iv, 'version.js має підключатись перед app.js');

console.log(`OK: версія ${sandbox.APP_VERSION} (version.js → «Параметри», sw.js, precache; у шапці немає)`);
