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

// index.html: бейдж у шапці поруч із PRO, класичний скрипт стоїть перед модулем
const html = read('index.html');
assert.ok(/class="pro-badge">PRO<\/span><span class="app-ver" id="appVersion"><\/span>/.test(html), 'немає #appVersion поруч із PRO');
const iv = html.indexOf('src="js/version.js"'), im = html.indexOf('type="module" src="js/app.js"');
assert.ok(iv > 0 && im > iv, 'version.js має підключатись перед app.js');

console.log(`OK: версія ${sandbox.APP_VERSION} (version.js → шапка, sw.js, precache)`);
