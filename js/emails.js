/* Email-и, з якими вже входили на цьому пристрої (щоб не вводити заново). Лише адреси: пароль не зберігається ніде.
   Чистий модуль без DOM; сховище передається параметром. Список — від останнього входу, без повторів. */
export const KNOWN_EMAILS_KEY = 'known_emails';
export const MAX_KNOWN_EMAILS = 5;

export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();

const clean = list => [...new Set(list.filter(e => typeof e === 'string').map(normalizeEmail).filter(Boolean))].slice(0, MAX_KNOWN_EMAILS);

export function readKnownEmails(storage) {
  try {
    const list = JSON.parse(storage.getItem(KNOWN_EMAILS_KEY));
    return Array.isArray(list) ? clean(list) : [];
  } catch (e) {
    return [];
  }
}

function write(storage, list) {
  try { storage.setItem(KNOWN_EMAILS_KEY, JSON.stringify(list)); } catch (e) { /* переповнене сховище: список не критичний */ }
  return list;
}

/* Після успішного входу: адреса стає першою, понад MAX_KNOWN_EMAILS найстаріші випадають. */
export const rememberEmail = (storage, email) => write(storage, clean([email, ...readKnownEmails(storage)]));

export const forgetEmail = (storage, email) => write(storage, readKnownEmails(storage).filter(e => e !== normalizeEmail(email)));
