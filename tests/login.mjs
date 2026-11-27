/* Вхід в акаунт: форма для менеджерів паролів (без відправлення за адресою) і запам'ятовані email-и.
   Пароль не має опинитися в localStorage. app.js запускається на фейковому DOM із фейковим Firebase. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installFakeDom, findAll } from './fake-dom.mjs';
import { readKnownEmails, rememberEmail, forgetEmail, KNOWN_EMAILS_KEY, MAX_KNOWN_EMAILS } from '../js/emails.js';

// 1. Розмітка
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const form = html.slice(html.indexOf('<form id="loginForm"'), html.indexOf('</form>'));
assert.ok(form.startsWith('<form id="loginForm" autocomplete="on"'), 'є форма входу');
assert.equal((html.match(/<form\b/g) || []).length, 1);
assert.ok(!/<form[^>]*\saction=/.test(html), 'форма без адреси');
assert.ok(html.includes("form-action 'none'"), 'CSP і далі забороняє відправлення форм');
assert.ok(/<input type="email" id="email" name="username" autocomplete="username"/.test(form));
assert.ok(/<input type="password" id="password" name="password" autocomplete="current-password"/.test(form));
assert.ok(/<button type="submit" id="btn-login"/.test(form) && /<button type="button" id="btn-register"/.test(form));
assert.equal((form.match(/type="submit"/g) || []).length, 1, 'відправляє форму лише «Увійти»');
assert.ok(form.indexOf('id="email"') < form.indexOf('id="knownEmails"') && form.indexOf('id="knownEmails"') < form.indexOf('id="password"'), 'чипи — під полем email');
// з 1.20.0 форма — у панелі хмари (не на вкладці «Профіль»); перемикач «Вхід | Реєстрація» над нею; «око» в полі пароля
const sheet = html.slice(html.indexOf('id="cloudSheet"'), html.indexOf('</section>', html.indexOf('id="cloudSheet"')));
const profileView = html.slice(html.indexOf('id="viewProfile"'), html.indexOf('id="viewSettings"'));
assert.ok(sheet.includes('<form id="loginForm"') && !profileView.includes('loginForm'), 'форма входу — у панелі хмари');
assert.ok(sheet.indexOf('id="authModeLogin"') < sheet.indexOf('<form') && sheet.includes('id="authModeRegister"'), 'перемикач «Вхід | Реєстрація»');
assert.ok(/<button type="button" class="eye-btn" id="btn-pwd-eye"/.test(form), '«око» — у полі пароля, type="button"');

// 2. Чистий модуль
const mem = new Map(), storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
assert.deepEqual(readKnownEmails(storage), []);
for (const bad of ['не json', 'null', '{"a":1}', '[1,null,""]']) { mem.set(KNOWN_EMAILS_KEY, bad); assert.deepEqual(readKnownEmails(storage), [], bad); }
assert.deepEqual(rememberEmail(storage, '  A@X.pl '), ['a@x.pl']);
assert.deepEqual(rememberEmail(storage, 'b@x.pl'), ['b@x.pl', 'a@x.pl']);
assert.deepEqual(rememberEmail(storage, 'a@X.PL'), ['a@x.pl', 'b@x.pl'], 'без повторів, регістр не важливий, останній — першим');
assert.deepEqual(rememberEmail(storage, '   '), ['a@x.pl', 'b@x.pl']);
for (const n of [1, 2, 3, 4]) rememberEmail(storage, `u${n}@x.pl`);
assert.equal(MAX_KNOWN_EMAILS, 5);
assert.deepEqual(readKnownEmails(storage), ['u4@x.pl', 'u3@x.pl', 'u2@x.pl', 'u1@x.pl', 'a@x.pl'], 'найстаріший (b) видалено');
assert.deepEqual(forgetEmail(storage, ' U3@x.pl '), ['u4@x.pl', 'u2@x.pl', 'u1@x.pl', 'a@x.pl']);
assert.doesNotThrow(() => rememberEmail({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'q@x.pl'));

// 3. app.js
const { getEl, fire, store } = installFakeDom();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { dict } = await import('../js/i18n.js');
store.set('known_emails', '["old@x.pl"]');
const calls = [], auth = { currentUser: null };
let authCb = null, fail = null;
const enter = kind => async (a, email, password) => {
  calls.push({ kind, email, password, autocomplete: getEl('password').getAttribute('autocomplete') });
  if (fail) throw Object.assign(new Error(fail), { code: fail });
  a.currentUser = { uid: 'u1', email: email.trim().toLowerCase() };
  await authCb(a.currentUser);
};
const stub = {
  auth, db: {}, signInWithEmailAndPassword: enter('in'), createUserWithEmailAndPassword: enter('up'),
  sendPasswordResetEmail: async () => {}, signOut: async a => { a.currentUser = null; await authCb(null); },
  onAuthStateChanged: (_a, cb) => { authCb = cb; },
  doc: (_db, ...p) => ({ path: p.join('/') }), collection: (_db, ...p) => ({ path: p.join('/') }),
  getDoc: async () => ({ exists: () => false }), setDoc: async () => {}, getDocs: async () => ({ forEach() {} })
};
globalThis.__salaryTest = { cloudLoader: async () => stub };
console.warn = () => {};
await import('../js/app.js');
await sleep(80);
assert.ok(authCb);

const email = getEl('email'), password = getEl('password');
password.setAttribute('autocomplete', 'current-password');       // як у розмітці (фейковий DOM її не читає)
let focused = 0; password.focus = () => { focused++; };
const known = () => JSON.parse(store.get('known_emails') || '[]');
const chips = () => getEl('knownEmailsList').children.map(c => c.children[0].textContent);
const chip = (address, part) => findAll(getEl('knownEmailsList').children.find(c => c.children[0].textContent === address), n => n.className === part)[0];
const boxHidden = () => getEl('knownEmails').classList.contains('hidden');
let prevented = 0;
const submit = async () => { for (const fn of getEl('loginForm').handlers.submit) await fn({ preventDefault: () => { prevented++; } }); };
const fill = async (address, secret) => { email.value = address; await fire(email, 'input'); password.value = secret; };
const logout = () => fire(getEl('btn-logout'), 'click');
const SECRET = 'S3cret-Pass!';

// старт гостя: остання адреса вже в полі, чипів немає
assert.equal(email.value, 'old@x.pl'); assert.equal(boxHidden(), true);

// відправлення форми запускає вхід і не перезавантажує сторінку
assert.equal(getEl('loginForm').handlers.submit.length, 1);
assert.ok(!getEl('btn-login').handlers.click, 'без окремого обробника кнопки (інакше вхід двічі)');
await fill('  New.User@Example.com ', SECRET);
await submit();
assert.equal(prevented, 1); assert.equal(location.reloads, 0);
assert.deepEqual(calls.map(c => [c.kind, c.password, c.autocomplete]), [['in', SECRET, 'current-password']]);
assert.deepEqual(known(), ['new.user@example.com', 'old@x.pl']);

// вихід: список лишається, у полі остання адреса, пароль порожній, решта — чипами
await logout();
assert.deepEqual(known(), ['new.user@example.com', 'old@x.pl']);
assert.equal(email.value, 'new.user@example.com'); assert.equal(password.value, '');
assert.equal(boxHidden(), false); assert.deepEqual(chips(), ['old@x.pl']);

// невдалий вхід нічого не запам'ятовує
fail = 'auth/invalid-credential'; await fill('wrong@x.pl', SECRET); await submit(); fail = null;
assert.deepEqual(known(), ['new.user@example.com', 'old@x.pl']);
assert.equal(getEl('toast').innerText, dict.uk.toastLoginErr + dict.uk.errInvalidCred);

// повторний вхід в іншому регістрі — без дубліката, стає першим
await fill('OLD@x.pl', SECRET); await submit(); await logout();
assert.deepEqual(known(), ['old@x.pl', 'new.user@example.com']);

// реєстрація: new-password лише на час створення акаунта
await fill('reg@x.pl', SECRET); await fire(getEl('btn-register'), 'click');
assert.deepEqual([calls.at(-1).kind, calls.at(-1).autocomplete], ['up', 'new-password']);
assert.equal(password.getAttribute('autocomplete'), 'current-password');
assert.equal(known()[0], 'reg@x.pl'); await logout();
fail = 'auth/email-already-in-use'; await fill('taken@x.pl', SECRET); await fire(getEl('btn-register'), 'click'); fail = null;
assert.equal(password.getAttribute('autocomplete'), 'current-password', 'повертається і після помилки');
assert.ok(!known().includes('taken@x.pl'));

// перемикач «Реєстрація»: основна кнопка «Створити акаунт», відправлення форми (Enter) — реєстрація
const hiddenEl = id => getEl(id).classList.contains('hidden');
assert.deepEqual([hiddenEl('btn-login'), hiddenEl('btn-register'), hiddenEl('btn-reset-password')], [false, true, false], 'режим «Вхід»');
await fire(getEl('authModeRegister'), 'click');
assert.deepEqual([hiddenEl('btn-login'), hiddenEl('btn-register'), hiddenEl('btn-reset-password')], [true, false, true], 'режим «Реєстрація»');
assert.equal(getEl('authModeRegister').attrs['aria-pressed'], 'true'); assert.equal(getEl('authModeLogin').attrs['aria-pressed'], 'false');
await fill('enter@x.pl', SECRET); await submit();
assert.deepEqual([calls.at(-1).kind, calls.at(-1).email, calls.at(-1).autocomplete], ['up', 'enter@x.pl', 'new-password'], 'Enter у режимі реєстрації створює акаунт');
await logout();
assert.equal(hiddenEl('btn-login'), false, 'після виходу — знову «Вхід»'); assert.equal(getEl('authModeLogin').attrs['aria-pressed'], 'true');
assert.deepEqual(known().slice(0, 1), ['enter@x.pl']); forgetEmail(localStorage, 'enter@x.pl');

// «око»: показати / сховати пароль; підпис двома мовами; після виходу пароль знову схований
const eye = getEl('btn-pwd-eye');
await fire(eye, 'click');
assert.equal(password.type, 'text'); assert.equal(eye.attrs['aria-pressed'], 'true'); assert.equal(eye.attrs['aria-label'], 'Сховати пароль');
window.setLang('pl'); assert.equal(eye.attrs['aria-label'], 'Ukryj hasło'); window.setLang('uk');
await fire(eye, 'click');
assert.equal(password.type, 'password'); assert.equal(eye.attrs['aria-label'], 'Показати пароль');
await fire(eye, 'click'); await fill('eye@x.pl', SECRET); await submit(); await logout();
assert.equal(password.type, 'password', 'після виходу пароль схований'); forgetEmail(localStorage, 'eye@x.pl');

// понад 5 — найстаріший випадає
for (const n of [1, 2, 3]) { await fill(`n${n}@x.pl`, SECRET); await submit(); await logout(); }
assert.deepEqual(known(), ['n3@x.pl', 'n2@x.pl', 'n1@x.pl', 'reg@x.pl', 'old@x.pl']);

// чип підставляє адресу й переводить фокус на пароль
assert.deepEqual(chips(), ['n2@x.pl', 'n1@x.pl', 'reg@x.pl', 'old@x.pl']);
const before = calls.length;
await fire(chip('n1@x.pl', 'mail-pick'), 'click');
assert.equal(email.value, 'n1@x.pl'); assert.equal(focused, 1); assert.equal(calls.length, before, 'чип не запускає вхід');
assert.deepEqual(chips(), ['n3@x.pl', 'n2@x.pl', 'reg@x.pl', 'old@x.pl']);
assert.equal(chip('n2@x.pl', 'mail-pick').type, 'button'); assert.equal(chip('n2@x.pl', 'mail-forget').type, 'button');

// «×» забуває адресу; підпис — двома мовами
assert.equal(chip('n2@x.pl', 'mail-forget').getAttribute('aria-label'), 'Забути цей email');
window.setLang('pl');
assert.equal(chip('n2@x.pl', 'mail-forget').getAttribute('aria-label'), 'Zapomnij ten e-mail');
assert.deepEqual([dict.uk.knownEmailsTitle, dict.pl.knownEmailsTitle], ['Раніше входили:', 'Wcześniej logowano:']);
window.setLang('uk');
await fire(chip('n2@x.pl', 'mail-forget'), 'click');
assert.deepEqual(known(), ['n3@x.pl', 'n1@x.pl', 'reg@x.pl', 'old@x.pl']); assert.ok(!chips().includes('n2@x.pl'));
assert.equal(email.value, 'n1@x.pl', 'поле не змінюється');

// стерли поле — видно всі адреси, зокрема останню; коли забули всі, блок ховається
await fill('', '');
assert.deepEqual(chips(), known());
for (const address of known()) await fire(chip(address, 'mail-forget'), 'click');
assert.deepEqual(known(), []); assert.equal(boxHidden(), true);

// пароля немає в жодному записі сховища
await fill('last@x.pl', SECRET); await submit();
assert.ok(store.size > 0);
for (const [key, value] of store) assert.ok(!key.includes(SECRET) && !value.includes(SECRET), `пароль у localStorage: ${key}`);

console.log('OK: вхід (форма в панелі хмари без відправлення, «Вхід | Реєстрація», «око», запам\'ятовані email-и до 5, «×», пароль не зберігається)');
process.exit(0);
