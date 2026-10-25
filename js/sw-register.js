/* Класичний скрипт (не модуль): працює, навіть якщо app.js не завантажився.
   Реєструє service worker і сповіщає застосунок, що з'явилась нова версія. */
if ('serviceWorker' in navigator) {
  // Перше встановлення теж спричиняє controllerchange — банер потрібен лише тоді, коли контролер уже був
  const hadController = !!navigator.serviceWorker.controller;
  let notified = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || notified) return;
    notified = true;
    window.dispatchEvent(new CustomEvent('salary:update-ready'));
  });

  window.addEventListener('load', () => {
    // updateViaCache: 'none' — і sw.js, і version.js перевіряються в обхід HTTP-кешу (інакше оновлення запізнюються)
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        // Встановлений PWA рідко робить повну навігацію — шукаємо оновлення щоразу, коли користувач повертається
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(err => console.error('Помилка реєстрації Service Worker:', err));
  });
}
