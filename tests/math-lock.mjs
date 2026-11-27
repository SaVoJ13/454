// Захист математики: SHA-256 заморожених файлів (CRLF -> LF перед хешуванням).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const LOCKED = {
  'js/calc.js': '673c1311ce8a1e5558efc44c5ee36b4278368dcda288fca2dbdca4197ddefc44',   // оновлено за рішенням власника 2026-11-26, гілка feature/deductions-view
  'js/pit.js': '4a8b0db5a3eeab44156e4e04ef7d817b725a914342bcc67651d26a4bb45f9042',   // оновлено за рішенням власника 2026-11-26, гілка feature/deductions-view
  'js/stats.js': '290c08caa8cba8544286c5403d89e554cc810708128492299990f70acfe20bd0',
  'tests/golden.json': '2fd316653ff82736c9f21e219d8834bbf6d0c0519c5fccbe5dcf7ccb42a023a5',
  'tests/reference.mjs': 'd2affb5a3dd010d4df49cc33efbf88cc2556dc2e1f653930c7cc9cad7a94ada8',   // оновлено за рішенням власника 2026-11-26, гілка feature/extra-deduction
};

let failed = 0;
for (const [file, expected] of Object.entries(LOCKED)) {
  const text = readFileSync(root + file, 'utf8').replace(/\r\n/g, '\n');
  const actual = createHash('sha256').update(text, 'utf8').digest('hex');
  if (actual === expected) console.log(`OK   ${file}`);
  else { failed++; console.error(`FAIL ${file}: очікувано ${expected}, отримано ${actual}`); }
}
if (failed) { console.error(`math-lock: змінено заморожених файлів: ${failed}`); process.exit(1); }
console.log('math-lock: OK');
