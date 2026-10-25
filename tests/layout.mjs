/* Розкладка: де стоять кнопки «Зберегти місяць». Кнопка потрібна внизу калькулятора та в деталях,
   у профілі її немає. Для гостей вона прихована (data-cloud-only + .hidden до входу). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8');
const at = id => html.indexOf(`id="${id}"`);
const section = (from, to) => html.slice(at(from), to ? at(to) : html.indexOf('</main>'));
const page1 = section('page1', 'page2'), page2 = section('page2', 'viewProfile'), profile = section('viewProfile', 'viewSettings');

const saveBtn = /<button[^>]*data-sync-up[^>]*data-i18n="btnSaveCloud"/;
assert.ok(saveBtn.test(page1), 'на сторінці калькулятора немає «Зберегти місяць»');
assert.ok(saveBtn.test(page2), 'на сторінці деталей немає «Зберегти місяць»');
assert.ok(!/data-sync-up|btnSaveCloud/.test(profile), 'у профілі не має бути «Зберегти місяць»');

// у калькуляторі кнопка — найнижчий елемент: після кнопки «Деталізація», і більше нічого інтерактивного
const tail = page1.slice(page1.indexOf('data-i18n="toDetails"'));
assert.ok(tail.indexOf('data-sync-up') > 0, 'кнопка збереження має бути після «Деталізація»');
assert.equal((tail.match(/<button/g) || []).length, 1, 'після «Деталізація» має бути лише кнопка збереження');

// для гостей приховано
for (const m of html.matchAll(/<div class="([^"]*)" data-cloud-only>/g)) assert.ok(m[1].split(' ').includes('hidden'), 'data-cloud-only без .hidden');
assert.equal((html.match(/data-cloud-only/g) || []).length, 2, 'очікується 2 контейнери з data-cloud-only');
assert.ok(profile.includes('id="btn-sync-down"') && profile.includes('id="btn-logout"'), 'у профілі мають лишитись «Завантажити» та «Вийти»');
assert.equal((html.match(/\bid="btn-sync-up/g) || []).length, 2, 'дублікати id кнопок збереження');


// Навігація: кожна вкладка веде на свою секцію, а свайп знає про всі сторінки
const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../js/app.js'), 'utf8');
const viewIds = [...app.match(/const VIEW_IDS = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
const navNums = [...html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>')).matchAll(/data-page="(\d+)"/g)].map(m => Number(m[1]));
assert.deepEqual(navNums, viewIds.map((_, i) => i + 1), 'номери вкладок мають збігатися з порядком VIEW_IDS');
for (const id of viewIds) assert.ok(html.includes(`id="${id}"`), `немає секції #${id}`);
assert.match(app, new RegExp(`currentActivePage < ${viewIds.length}\\)`), `свайп має доходити до останньої сторінки (${viewIds.length})`);

assert.equal((app.match(/\.seg, \.chart-host'\)\) return;/g) || []).length, 2, 'touchstart і touchend мають ігнорувати .chart-host (графіки не гортають сторінку)');

console.log('OK: розкладка (збереження місяця: калькулятор внизу + деталі, не в профілі)');
