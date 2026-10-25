/* Перевіряє переклади: однакові ключі в UA/PL і наявність усіх ключів,
   які використовуються в index.html та app.js. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dict } from '../js/i18n.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const app = readFileSync(join(root, 'js/app.js'), 'utf8');

const uk = new Set(Object.keys(dict.uk)), pl = new Set(Object.keys(dict.pl));
const onlyUk = [...uk].filter(k => !pl.has(k)), onlyPl = [...pl].filter(k => !uk.has(k));
assert.deepEqual(onlyUk, [], `Є в UA, немає в PL: ${onlyUk}`);
assert.deepEqual(onlyPl, [], `Є в PL, немає в UA: ${onlyPl}`);

const used = new Set();
for (const m of html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)) used.add(m[1]);
for (const m of app.matchAll(/dict\[currentLang\]\.(\w+)/g)) used.add(m[1]);
const missing = [...used].filter(k => !uk.has(k));
assert.deepEqual(missing, [], `Ключі без перекладу: ${missing}`);

console.log(`OK: i18n (${uk.size} ключів, ${used.size} використано)`);
