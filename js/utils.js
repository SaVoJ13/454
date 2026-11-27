/* Дрібні UI-утиліти без стану застосунку. */

export const formatPLN = val => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(val);

/* Сума в полі введення: кома й два знаки, без пробілів і «zł» (35.2 → «35,20»). Приймає вже перевірене число. */
export const formatAmount = value => value.toFixed(2).replace('.', ',');

/* Місяці для вибору в калькуляторі, від новіших до старіших: 3 наперед, поточний, 11 назад.
   offset — зсув від поточного місяця. */
export function monthList(now = new Date(), ahead = 3, back = 11) {
  return Array.from({ length: ahead + back + 1 }, (_, i) => {
    const offset = ahead - i;
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = d.getFullYear(), monthIdx = d.getMonth();
    return { id: `${year}-${String(monthIdx + 1).padStart(2, '0')}`, year, monthIdx, offset };
  });
}

let toastTimer;
export function showToast(msg, ms = 3000) {
  const t = document.getElementById('toast');
  t.innerText = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
