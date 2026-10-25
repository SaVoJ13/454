/* Словники інтерфейсу (UA / PL). Тексти перенесені без змін. */

const customDictAdditions = {
  uk: { presenceBonusTitle: "Премія присутність", cardParams: "Параметри", cardShifts: "Відпрацьовано", cardOvertime: "Надгодини", cardAbsence: "Відсутності" },
  pl: { presenceBonusTitle: "Premia frekwencja", cardParams: "Parametry", cardShifts: "Przepracowano", cardOvertime: "Nadgodziny", cardAbsence: "Nieobecności" }
};

export const dict = {
  uk: {
    title: "Калькулятор", month: "Місяць", base: "Ставка (zł)", schedDays: "Графік", bonus: "Премія якість", extraBonus: "Додатково (zł)",
    morning: "Ранкові (шт)", afternoon: "Денні (шт)", night: "Нічні (шт)", weekend: "Вихідні (днів)", overtime: "Всього (днів)",
    overtimeMorning: "З них ранкових ☀️", overtimeNight: "З них нічних 🌙", vacationDays: "Відпустка (днів)", urlopBonus: "Сер. за 1 дн. (zł)",
    bloodDonation: "Поважна відсутність (днів)", bloodBonus: "Сер. за 1 дн. (zł)", l4Days: "Лікарняний L4", l4Missed: "Пропущено (змін)",
    yes: "Так", no: "Ні", menuTitle: "Меню", menuLang: "Мова", menuTheme: "Тема", profHeader: " 👤 Мій профіль",
    profBase: "Стандартна ставка (zł)", profAge: "Вік до 26 років", profPpk: "Участь у PPK", profIns: "Додаткове страхування",
    btnSaveProfile: "Зберегти профіль", toastProfOk: "Профіль збережено!", optThemeLight: "Світла", optThemeDark: "Темна",
    cloudHeader: "Акаунт & Хмара", btnLogin: "Увійти (PRO)", btnRegister: "Реєстрація", btnSaveCloud: "Зберегти місяць",
    btnLoadCloud: "Завантажити", btnLogout: "Вийти", swipeHintLeft: "← Свайп для деталей", swipeHintRight: "Свайп вправо →",
    detailsTitle: "Деталі 📊", breakdownHeader: "Структура нарахувань", infoBasePay: "База (з урахув. L4):",
    infoPresenceBonus: "Присутність", infoQualityBonus: "Якість", infoExtraBonus: "Додаткова премія", infoNightTime: "Нічні (час)",
    infoNightShift: "Нічні (зміни)", infoWeekend: "Вікенди:", infoOvertime: "Надгодини:", infoVacation: "Відпустка:",
    infoBlood: "Поважна відсутність:", infoL4: "Лікарняний L4:", infoLaundry: "Доплата (прання):", infoWorkedDays: "Відпрацьовано змін:",
    infoTotalDays: "Всього днів:", infoSched: "Дні за графіком:", infoNightTariff: "Нічний тариф:", lblNettoShort: "нетто",
    totalBrutto: "BRUTTO:", totalNetto: "NETTO:", perHour: "/год", pwdPlaceholder: "Пароль",
    monthNames: ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"],
    toastSaveCloud: "Дані збережені! ☁️ ", toastLoadCloud: "Дані завантажені! 📥 ", toastLoginErr: "Помилка входу: ",
    toastRegOk: "Реєстрація успішна!", toastRegErr: "Помилка реєстрації: ", toastSelectMonth: "Оберіть місяць!",
    toastSaveErr: "Помилка збереження: ", hoursShort: "г", minsShort: "хв", ariaMenuOpen: "Відкрити меню",
    ariaMenuClose: "Закрити меню", ariaBack: "На головну", ...customDictAdditions.uk
  },
  pl: {
    title: "Kalkulator", month: "Miesiąc", base: "Stawka (zł)", schedDays: "Grafik", bonus: "Premia jakość", extraBonus: "Dodatkowo (zł)",
    morning: "Poranne (szt)", afternoon: "Dzienne (szt)", night: "Nocne (szt)", weekend: "Weekendy (dni)", overtime: "Razem (dni)",
    overtimeMorning: "W tym porannych ☀️", overtimeNight: "W tym nocnych 🌙", vacationDays: "Urlop (dni)", urlopBonus: "Średnia z 1 dn. (zł)",
    bloodDonation: "Nieobecność usprawiedliwiona (dni)", bloodBonus: "Średnia z 1 dn. (zł)", l4Days: "L4 (dni kalend.)", l4Missed: "Opuszczone (zmian)",
    yes: "Tak", no: "Nie", menuTitle: "Menu", menuLang: "Język", menuTheme: "Motyw", profHeader: " 👤 Mój Profil",
    profBase: "Standardowa stawka (zł)", profAge: "Wiek < 26 lat", profPpk: "PPK", profIns: "Ubezpieczenie",
    btnSaveProfile: "Zapisz profil", toastProfOk: "Profil zapisany!", optThemeLight: "Jasny", optThemeDark: "Ciemny",
    cloudHeader: "Konto & Chmura", btnLogin: "Zaloguj (PRO)", btnRegister: "Rejestracja", btnSaveCloud: "Zapisz miesiąc",
    btnLoadCloud: "Pobierz", btnLogout: "Wyloguj", swipeHintLeft: "← Przesuń po szczegóły", swipeHintRight: "Przesuń w prawo →",
    detailsTitle: "Szczegóły 📊", breakdownHeader: "Struktura naliczeń", infoBasePay: "Baza (po L4):",
    infoPresenceBonus: "Frekwencja", infoQualityBonus: "Jakość", infoExtraBonus: "Dodatkowa premia", infoNightTime: "Dodatek nocny (czas)",
    infoNightShift: "Dodatek nocny (zmiana)", infoWeekend: "Weekendy:", infoOvertime: "Nadgodziny:", infoVacation: "Urlop:",
    infoBlood: "Nieobecność usprawiedliwiona:", infoL4: "Chorobowe L4:", infoLaundry: "Dodatek (pranie):", infoWorkedDays: "Przepracowane zmiany:",
    infoTotalDays: "Łącznie dni:", infoSched: "Grafik (norma):", infoNightTariff: "Stawka nocna:", lblNettoShort: "netto",
    totalBrutto: "BRUTTO:", totalNetto: "NETTO:", perHour: "/godz", pwdPlaceholder: "Hasło",
    monthNames: ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"],
    toastSaveCloud: "Zapisano w chmurze! ☁️ ", toastLoadCloud: "Dane pobrane! 📥 ", toastLoginErr: "Błąd logowania: ",
    toastRegOk: "Rejestracja pomyślna!", toastRegErr: "Błąd rejestracji: ", toastSelectMonth: "Wybierz miesiąc!",
    toastSaveErr: "Błąd zapisu: ", hoursShort: "g", minsShort: "min", ariaMenuOpen: "Otwórz menu",
    ariaMenuClose: "Zamknij menu", ariaBack: "Do głównej", ...customDictAdditions.pl
  }
};

Object.assign(dict.uk, {
  appTitle: "Калькулятор зарплати", navCalc: "Розрахунок", navDetails: "Деталі", navProfile: "Профіль", navSettings: "Налаштування",
  netHint: "до виплати", secBase: "Основна зарплата", secBase2: "Основна зарплата та бонуси", secNight: "Нічні зміни та вихідні",
  secVac: "Відпускні", secBlood: "Поважна відсутність", secL4: "Лікарняний", secTotals: "Підсумок", secStats: "Параметри місяця",
  proNote: "Відпустка, поважна відсутність та лікарняний доступні після входу в акаунт (PRO).",
  guestNote: "Без входу дані зберігаються лише на цьому пристрої.", toDetails: "Деталізація", lblEmail: "Email", lblPwd: "Пароль",
  hintSched: "Норма змін; рахується автоматично, можна змінити", hintUrlop: "Авто за 3 попередні місяці (з хмари), можна змінити",
  hintBlood: "Розраховується автоматично", hintL4: "Календарних днів", ariaTheme: "Змінити тему", ariaLangGrp: "Мова",
  ariaNav: "Навігація", ariaPrev: "Попередній місяць", ariaNext: "Наступний місяць", infoWeekend: "Вихідні дні", lblNettoShort: "з них нетто"
});

Object.assign(dict.pl, {
  appTitle: "Kalkulator wynagrodzenia", navCalc: "Kalkulator", navDetails: "Szczegóły", navProfile: "Profil", navSettings: "Ustawienia",
  netHint: "do wypłaty", secBase: "Wynagrodzenie podstawowe", secBase2: "Wynagrodzenie i premie", secNight: "Zmiany nocne i weekendy",
  secVac: "Urlop", secBlood: "Nieobecność usprawiedliwiona", secL4: "Zwolnienie L4", secTotals: "Podsumowanie", secStats: "Parametry miesiąca",
  proNote: "Urlop, nieobecność usprawiedliwiona i L4 są dostępne po zalogowaniu (PRO).",
  guestNote: "Bez logowania dane są zapisywane tylko na tym urządzeniu.", toDetails: "Szczegóły", lblEmail: "Email", lblPwd: "Hasło",
  hintSched: "Norma zmian; liczona automatycznie, można zmienić", hintUrlop: "Auto z 3 poprzednich miesięcy (z chmury), można zmienić",
  hintBlood: "Liczone automatycznie", hintL4: "Dni kalendarzowe", ariaTheme: "Zmień motyw", ariaLangGrp: "Język",
  ariaNav: "Nawigacja", ariaPrev: "Poprzedni miesiąc", ariaNext: "Następny miesiąc", infoWeekend: "Dni weekendowe", lblNettoShort: "w tym netto"
});

Object.assign(dict.uk, {
  toastOffline: "Хмара недоступна без мережі. Працює гостьовий режим.",
  toastProfLocalOnly: "Профіль збережено на пристрої, у хмару не вдалося",
  toastLoadErr: "Не вдалося завантажити дані з хмари",
  toastLoadCached: "Немає мережі. Показано збережену копію від ",
  toastSaveOffline: "Немає зв'язку з хмарою. Не збережено — спробуй ще раз, коли з'явиться мережа.",
  btnResetPassword: "Забули пароль?", toastResetNeedEmail: "Введіть email, на який надіслати лист",
  toastResetSent: "Якщо акаунт існує, лист для скидання пароля надіслано. Перевір також «Спам».",
  toastResetWait: "Лист уже надіслано. Повторити можна через {n} с", toastResetErr: "Не вдалося надіслати лист: ",
  infoPitExtra: "PIT 32% (понад 120 000):", infoPitYtd: "База PIT з початку року:",
  pitYtdNote: "Збережено {found} з {expected} попередніх місяців року. Якщо чогось бракує, поріг 120 000 враховується неточно.",
  navStats: "Рік", navSettingsTab: "Параметри", ariaPrevYear: "Попередній рік", ariaNextYear: "Наступний рік",
  statsEmpty: "За цей рік немає збережених місяців. Збережіть місяць у калькуляторі, і тут з'явиться статистика.",
  statsIncome: "Дохід по місяцях", statsGross: "Брутто", statsNet: "Нетто", statsChartAria: "Брутто і нетто по місяцях",
  statsPickHint: "Торкніться місяця, щоб побачити суми", statsNoMonth: "немає збереженого місяця",
  statsMix: "Структура змін", statsMixAria: "Структура змін за рік",
  mixRegular: "Звичайні зміни", mixNight: "Нічні зміни", mixOvertime: "Надгодини", mixVacation: "Відпустка", mixL4: "Лікарняний L4", mixExcused: "Поважна відсутність",
  mixUnit: "дн.", mixUnitCenter: "днів",
  statsTotals: "Підсумок за рік", statsAvgNet: "Середнє нетто за місяць", statsBest: "Найвище нетто", statsCount: "Місяців із даними",
  statsNote: "Враховано збережені місяці року: гостям з цього пристрою, для акаунта з хмари. Поточний незбережений місяць не входить. Для акаунта netto вже враховує поріг PIT 120 000.",
  updateAvailable: "Доступна нова версія", updateNow: "Оновити", updateLater: "Пізніше",
  errPermission: "Немає доступу. Увійдіть знову.", errUnknown: "Невідома помилка",
  errInvalidCred: "Невірний email або пароль", errInvalidEmail: "Некоректний email",
  errWeakPwd: "Пароль закороткий (мінімум 6 символів)", errEmailInUse: "Цей email уже зареєстровано",
  errNetwork: "Немає підключення до мережі", errTooMany: "Забагато спроб, спробуйте пізніше"
});

Object.assign(dict.pl, {
  toastOffline: "Chmura niedostępna bez sieci. Działa tryb gościa.",
  toastProfLocalOnly: "Profil zapisany na urządzeniu, zapis w chmurze nie powiódł się",
  toastLoadErr: "Nie udało się pobrać danych z chmury",
  toastLoadCached: "Brak sieci. Pokazano zapisaną kopię z ",
  toastSaveOffline: "Brak połączenia z chmurą. Nie zapisano — spróbuj ponownie, gdy sieć wróci.",
  btnResetPassword: "Nie pamiętasz hasła?", toastResetNeedEmail: "Wpisz adres email, na który wysłać wiadomość",
  toastResetSent: "Jeśli konto istnieje, wysłaliśmy wiadomość do zresetowania hasła. Sprawdź też folder Spam.",
  toastResetWait: "Wiadomość już wysłana. Ponownie możesz za {n} s", toastResetErr: "Nie udało się wysłać wiadomości: ",
  infoPitExtra: "PIT 32% (powyżej 120 000):", infoPitYtd: "Podstawa PIT od początku roku:",
  pitYtdNote: "Zapisano {found} z {expected} poprzednich miesięcy roku. Jeśli czegoś brakuje, próg 120 000 jest uwzględniony niedokładnie.",
  navStats: "Rok", navSettingsTab: "Ustawienia", ariaPrevYear: "Poprzedni rok", ariaNextYear: "Następny rok",
  statsEmpty: "Brak zapisanych miesięcy w tym roku. Zapisz miesiąc w kalkulatorze, a pojawią się tu statystyki.",
  statsIncome: "Dochód wg miesięcy", statsGross: "Brutto", statsNet: "Netto", statsChartAria: "Brutto i netto wg miesięcy",
  statsPickHint: "Dotknij miesiąca, aby zobaczyć kwoty", statsNoMonth: "brak zapisanego miesiąca",
  statsMix: "Struktura zmian", statsMixAria: "Struktura zmian w roku",
  mixRegular: "Zmiany zwykłe", mixNight: "Zmiany nocne", mixOvertime: "Nadgodziny", mixVacation: "Urlop", mixL4: "Chorobowe L4", mixExcused: "Nieobecność usprawiedliwiona",
  mixUnit: "dn.", mixUnitCenter: "dni",
  statsTotals: "Podsumowanie roku", statsAvgNet: "Średnie netto miesięcznie", statsBest: "Najwyższe netto", statsCount: "Miesięcy z danymi",
  statsNote: "Uwzględniono zapisane miesiące roku: gościom z tego urządzenia, dla konta z chmury. Bieżący niezapisany miesiąc nie wchodzi. Dla konta netto uwzględnia już próg PIT 120 000.",
  updateAvailable: "Dostępna nowa wersja", updateNow: "Odśwież", updateLater: "Później",
  errPermission: "Brak dostępu. Zaloguj się ponownie.", errUnknown: "Nieznany błąd",
  errInvalidCred: "Nieprawidłowy email lub hasło", errInvalidEmail: "Nieprawidłowy adres email",
  errWeakPwd: "Hasło jest za krótkie (min. 6 znaków)", errEmailInUse: "Ten email jest już zarejestrowany",
  errNetwork: "Brak połączenia z siecią", errTooMany: "Zbyt wiele prób, spróbuj później"
});
