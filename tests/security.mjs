/* Статичні перевірки безпеки: CSP, відсутність inline-коду, правила Firestore, версія SDK, CI.
   Не замінюють перевірку в браузері та в консолі Firebase (Rules Playground / емулятор). */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const html = read('index.html');

// 1. CSP присутній і без небезпечних дозволів
const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1];
assert.ok(csp, 'у index.html немає CSP <meta>');
for (const bad of ["'unsafe-inline'", "'unsafe-eval'", ' * ', 'http:']) assert.ok(!csp.includes(bad), `CSP містить заборонене: ${bad}`);
for (const need of ["default-src 'self'", "script-src 'self' https://www.gstatic.com", "object-src 'none'", "base-uri 'self'"]) assert.ok(csp.includes(need), `CSP без: ${need}`);

// 2. Жодного inline-коду в розмітці (інакше CSP вимагатиме 'unsafe-inline')
assert.ok(!/\son[a-z]+\s*=/i.test(html), 'є inline-обробник on*=');
assert.ok(!/\sstyle\s*=/i.test(html), 'є inline style="…"');
assert.ok(!/<style[\s>]/i.test(html), 'є <style>');
for (const m of html.matchAll(/<script\b([^>]*)>/gi)) assert.ok(/\bsrc=/.test(m[1]), 'є inline <script>');

// 3. У JS немає eval / Function / запису HTML / inline style
const jsFiles = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js'));
for (const f of jsFiles) {
  const src = read(`js/${f}`);
  assert.ok(!/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(src), `${f}: eval/Function/document.write`);
  assert.ok(!/setAttribute\(\s*['"]style['"]|\.cssText\s*=/.test(src), `${f}: inline style через JS`);
  for (const m of src.matchAll(/\.(?:innerHTML|outerHTML)\s*=\s*([^;\n]+)/g)) assert.match(m[1].trim(), /^(''|"")$/, `${f}: innerHTML лише для очищення`);
  // Єдиний виняток — ідентифікатор простору імен SVG: це не адреса, її ніхто не завантажує (потрібна для createElementNS у js/charts.js)
  for (const m of src.matchAll(/https?:\/\/[^\s'"`)]+/g)) assert.ok(m[0].startsWith('https://www.gstatic.com/firebasejs/') || m[0] === 'http://www.w3.org/2000/svg', `${f}: сторонній URL ${m[0]}`);
}

// 3b. firebase.js: одна версія SDK, мажорна ≥ 12
const versions = new Set([...read('js/firebase.js').matchAll(/firebasejs\/(\d+)\.\d+\.\d+\//g)].map(m => m[0]));
assert.equal(versions.size, 1, `різні версії SDK: ${[...versions]}`);
assert.ok(Number([...versions][0].match(/firebasejs\/(\d+)/)[1]) >= 12, 'SDK застарів (<12)');

// 4. Правила Firestore: власник-only, нічого відкритого
const rules = read('firestore.rules');
assert.ok(!/if\s+true/.test(rules.replace(/allow read, write: if false/g, '')), 'у правилах є "if true"');
assert.ok(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(rules), 'немає глобальної заборони');
const allows = [...rules.matchAll(/allow [^:]+:\s*if([^;]+);/g)].map(m => m[1]);
for (const a of allows) assert.ok(/isOwner\(uid\)|^\s*false\s*$/.test(a), `allow без перевірки власника: ${a.trim()}`);
assert.equal(JSON.parse(read('firebase.json')).firestore.rules, 'firestore.rules');

// 5. CI з мінімальними правами
assert.match(read('.github/workflows/test.yml'), /permissions:\s*\n\s+contents: read/, 'test.yml без permissions: contents: read');

console.log('OK: безпека (CSP, без inline-коду, правила Firestore, SDK ≥ 12, CI permissions)');
