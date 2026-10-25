/* manifest.json: поля, іконки (файли існують, розміри збігаються з реальними), maskable окремо, узгодженість назв і кольорів. */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const m = JSON.parse(read('manifest.json'));
const html = read('index.html');
const sw = read('sw.js');
const { dict } = await import('../js/i18n.js');

// 1. Обов'язкові поля
for (const k of ['id', 'name', 'short_name', 'description', 'lang', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons'])
  assert.ok(m[k] !== undefined && m[k] !== '', `manifest: немає "${k}"`);
assert.equal(m.display, 'standalone');
assert.ok(m.short_name.length <= 12, 'short_name довший за 12 символів — обрізається на екрані додатків');
assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.match(m.background_color, /^#[0-9a-f]{6}$/i);

// 2. Узгодженість з застосунком: назва, <title>, колір теми
assert.equal(m.name, dict.uk.appTitle, 'name у manifest має збігатися з назвою в інтерфейсі (dict.uk.appTitle)');
assert.equal((html.match(/<title>([^<]*)<\/title>/) || [])[1], m.name, '<title> має збігатися з manifest.name');
assert.equal((html.match(/<meta name="theme-color" content="([^"]+)"/) || [])[1].toLowerCase(), m.theme_color.toLowerCase(), 'theme_color у manifest ≠ <meta theme-color>');
assert.ok(/<meta name="description" content="[^"]+"/.test(html), 'немає <meta description>');
assert.ok(/<link rel="manifest" href="manifest\.json">/.test(html));

// 3. Іконки: файл існує, це PNG, заявлений розмір = реальний, purpose не змішаний
const pngSize = file => { const b = readFileSync(join(root, file)); assert.equal(b.subarray(1, 4).toString(), 'PNG', `${file}: не PNG`); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`; };
const purposes = new Set();
for (const icon of m.icons) {
  const file = icon.src.replace(/^\.\//, '');
  assert.ok(existsSync(join(root, file)), `іконка не знайдена: ${file} (manifest посилається на неї)`);
  assert.equal(icon.type, 'image/png');
  assert.equal(pngSize(file), icon.sizes, `${file}: заявлено ${icon.sizes}, а в файлі ${pngSize(file)}`);
  const p = (icon.purpose || 'any').split(/\s+/);
  assert.ok(!(p.includes('any') && p.includes('maskable')), `${file}: "any maskable" в одному записі — розділи на два файли`);
  for (const x of p) purposes.add(`${x}:${icon.sizes}`);
}
for (const need of ['any:192x192', 'any:512x512', 'maskable:192x192', 'maskable:512x512']) assert.ok(purposes.has(need), `немає іконки ${need}`);

// 4. У прекеші — manifest і малі іконки (≤192). Великі (512) браузер бере сам під час встановлення PWA; у CORE вони змусили б
//    кожне оновлення заново качати сотні КБ (прекеш іде з cache: 'reload').
const core = (sw.match(/CORE = \[([\s\S]*?)\]/) || [])[1] || '';
const sizeOf = i => parseInt(i.sizes.split('x')[0]);
const file = i => i.src.replace(/^\.\//, '');
for (const f of ['manifest.json', ...m.icons.filter(i => sizeOf(i) <= 192).map(file)]) assert.ok(core.includes(`'./${f}'`), `sw.js CORE без ${f}`);
for (const f of m.icons.filter(i => sizeOf(i) > 192).map(file)) assert.ok(!core.includes(`'./${f}'`), `${f}: велика іконка не має бути в прекеші`);

// 4b. maskable не може бути копією звичайної іконки: Android обрізає край маскою (коло ≈ 80%), тож графіці потрібне поле навколо
for (const mk of m.icons.filter(i => i.purpose === 'maskable')) {
  for (const an of m.icons.filter(i => i.purpose === 'any' && i.sizes === mk.sizes))
    assert.ok(!readFileSync(join(root, file(mk))).equals(readFileSync(join(root, file(an)))), `${file(mk)} — байт у байт копія ${file(an)}: для maskable потрібна версія з полями`);
}

// 5. apple-touch-icon існує
const apple = (html.match(/rel="apple-touch-icon" href="([^"]+)"/) || [])[1];
assert.ok(apple && existsSync(join(root, apple)), `apple-touch-icon не знайдено: ${apple}`);

console.log(`OK: manifest (${m.icons.length} іконки, any/maskable розділені, назва/колір збігаються, усе в precache)`);
