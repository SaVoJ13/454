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
    profBase: "Стандартна ставка (zł)", profAge: "Вік до 26 років", profPpk: "Участь у PPK",
    btnSaveProfile: "Зберегти профіль", toastProfOk: "Профіль збережено!", optThemeLight: "Світла", optThemeDark: "Темна",
    cloudHeader: "Акаунт & Хмара", btnLogin: "Увійти", btnRegister: "Реєстрація", btnSaveCloud: "Зберегти місяць",
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
    profBase: "Standardowa stawka (zł)", profAge: "Wiek < 26 lat", profPpk: "PPK",
    btnSaveProfile: "Zapisz profil", toastProfOk: "Profil zapisany!", optThemeLight: "Jasny", optThemeDark: "Ciemny",
    cloudHeader: "Konto & Chmura", btnLogin: "Zaloguj", btnRegister: "Rejestracja", btnSaveCloud: "Zapisz miesiąc",
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
  profilesTitle: "Профілі", profileDefaultName: "Мій профіль", profileAdd: "Додати профіль", profileRename: "Перейменувати", profileDelete: "Видалити", profileNamePh: "Назва профілю", profileNameSave: "Зберегти", profileCancel: "Скасувати", profileDeleteYes: "Так, видалити", profileDeleteConfirm: "Видалити профіль «{name}» і всі його місяці? Це не можна скасувати.", errProfileName: "Назва від 1 до 30 символів", errProfileDuplicate: "Профіль з такою назвою вже є", profilesNote: "Кожен профіль має свої місяці, налаштування й статистику. Дані зберігаються лише на цьому пристрої.", profSettingsTitle: "Налаштування профілю", appVersionLabel: "Версія {v}",
  appTitle: "Калькулятор зарплати", navCalc: "Розрахунок", navDetails: "Деталі", navProfile: "Профіль", navSettings: "Налаштування",
  netHint: "до виплати", secBase: "Основна зарплата", secBase2: "Основна зарплата та бонуси", secNight: "Нічні зміни та вихідні",
  secVac: "Відпускні", secBlood: "Поважна відсутність", secL4: "Лікарняний", secTotals: "Підсумок", secStats: "Параметри місяця",
  proNote: "Відпустка, поважна відсутність та лікарняний доступні після входу в акаунт (PRO).",
  guestNote: "Без входу дані зберігаються лише на цьому пристрої.", toDetails: "Деталізація", lblEmail: "Email", lblPwd: "Пароль", knownEmailsTitle: "Раніше входили:", ariaForgetEmail: "Забути цей email",
  hintSched: "Норма змін; рахується автоматично, можна змінити", hintUrlop: "Для коректного розрахунку потрібні збережені дані за попередні 4 місяці.", ariaExplain: "Пояснення",
  hintBlood: "Розраховується автоматично", hintL4: "Календарних днів", ariaTheme: "Змінити тему", ariaLangGrp: "Мова",
  ariaNav: "Навігація", ariaPrev: "Попередній місяць", ariaNext: "Наступний місяць", infoWeekend: "Вихідні дні", lblNettoShort: "з них нетто"
});

Object.assign(dict.pl, {
  profilesTitle: "Profile", profileDefaultName: "Mój profil", profileAdd: "Dodaj profil", profileRename: "Zmień nazwę", profileDelete: "Usuń", profileNamePh: "Nazwa profilu", profileNameSave: "Zapisz", profileCancel: "Anuluj", profileDeleteYes: "Tak, usuń", profileDeleteConfirm: "Usunąć profil „{name}” i wszystkie jego miesiące? Tego nie można cofnąć.", errProfileName: "Nazwa od 1 do 30 znaków", errProfileDuplicate: "Profil o tej nazwie już istnieje", profilesNote: "Każdy profil ma własne miesiące, ustawienia i statystyki. Dane są zapisywane tylko na tym urządzeniu.", profSettingsTitle: "Ustawienia profilu", appVersionLabel: "Wersja {v}",
  appTitle: "Kalkulator wynagrodzenia", navCalc: "Kalkulator", navDetails: "Szczegóły", navProfile: "Profil", navSettings: "Ustawienia",
  netHint: "do wypłaty", secBase: "Wynagrodzenie podstawowe", secBase2: "Wynagrodzenie i premie", secNight: "Zmiany nocne i weekendy",
  secVac: "Urlop", secBlood: "Nieobecność usprawiedliwiona", secL4: "Zwolnienie L4", secTotals: "Podsumowanie", secStats: "Parametry miesiąca",
  proNote: "Urlop, nieobecność usprawiedliwiona i L4 są dostępne po zalogowaniu (PRO).",
  guestNote: "Bez logowania dane są zapisywane tylko na tym urządzeniu.", toDetails: "Szczegóły", lblEmail: "Email", lblPwd: "Hasło", knownEmailsTitle: "Wcześniej logowano:", ariaForgetEmail: "Zapomnij ten e-mail",
  hintSched: "Norma zmian; liczona automatycznie, można zmienić", hintUrlop: "Do poprawnego wyliczenia potrzebne są zapisane dane z 4 poprzednich miesięcy.", ariaExplain: "Wyjaśnienie",
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
  navStats: "Статистика", navSettingsTab: "Параметри",
  period3: "3 міс.", period6: "6 міс.", period12: "12 міс.", periodYears: "Роки", statsPeriodAria: "Період статистики", statsYearsAria: "Вибір років",
  statsMissingN: "Бракує даних за місяців:", statsMissingHint: "Ці місяці ще не збережені, тому в підсумок не входять. Майбутні місяці не враховуються.",
  statsIncomeYears: "Середній дохід по роках", statsPerMonth: "середнє на місяць", statsMonthsShort: "міс.",
  statsEmpty: "За вибраний період немає збережених місяців. Збережіть місяць у калькуляторі, і тут з'явиться статистика.",
  statsIncome: "Дохід по місяцях", statsGross: "Брутто", statsNet: "Нетто", statsChartAria: "Брутто і нетто по місяцях",
  statsPickHint: "Торкніться місяця, щоб побачити суми", statsNoMonth: "немає збереженого місяця",
  statsMix: "Структура змін", statsMixAria: "Структура змін за період",
  mixRegular: "Звичайні зміни", mixNight: "Нічні зміни", mixOvertime: "Надгодини", mixVacation: "Відпустка", mixL4: "Лікарняний L4", mixExcused: "Поважна відсутність",
  mixUnit: "дн.", mixUnitCenter: "днів",
  statsTotals: "Підсумок за період", statsAvgNet: "Середнє нетто за місяць", statsBest: "Найвище нетто", statsCount: "Місяців із даними",
  statsNote: "Враховано збережені місяці періоду (до поточного включно): гостям з цього пристрою, для акаунта з хмари. Майбутні місяці не входять. Для акаунта netto вже враховує поріг PIT 120 000.",
  updateAvailable: "Доступна нова версія", updateNow: "Оновити", updateLater: "Пізніше",
  errPermission: "Немає доступу. Увійдіть знову.", errUnknown: "Невідома помилка",
  errInvalidCred: "Невірний email або пароль", errInvalidEmail: "Некоректний email",
  errWeakPwd: "Пароль закороткий (мінімум 6 символів)", errEmailInUse: "Цей email уже зареєстровано",
  errNetwork: "Немає підключення до мережі", errTooMany: "Забагато спроб, спробуйте пізніше",
  nightCarryOut: "Остання нічна зміна переходить у наступний місяць (тут 2 год)", nightCarryIn: "Нічна зміна з попереднього місяця (+6 год)",
  hintNightCarryAuto: "Увімкнено за попереднім місяцем", infoNightCarry: "Перехідні нічні години",
  profExtraDeduction: "Додаткове відрахування, zł/міс.", hintExtraDeduction: "Наприклад, додаткове страхування",
  infoDeduction: "Додаткове відрахування", minWageUnknown: "Мінімалка на {year} ще невідома — використано {sum} за {knownYear}",
  toastNextCarryIn: "Наступний місяць уже збережено — увімкни в ньому «Нічна зміна з попереднього місяця (+6 год)»",
  bonusTotal: "Премія", hintBonusConverted: "Премію цього місяця перераховано з двох старих полів — перевір відсоток",
  pctSign: " %", infoBonusL4: "({selected} − {cut} за L4)",
  secMinWage: "Мінімальна зарплата", minWageField: "Мінімалка на {year}, zł", errMinWage: "Невірна сума (3000–20000 zł)",
  minWageAllKnown: "Офіційні суми є для всіх років у календарі: {years}",
  minWagePriority: "Офіційна сума з оновлення застосунку завжди має перевагу над введеною вручну.",
  minWageUser: "Мінімалка на {year} введена вручну: {sum}",
  errDeduction: "Невірна сума", errDeductionMax: "Не більше 2000 zł",
  dedTitle: "Відрахування: −{sum}", dedZusEmerytalne: "ZUS emerytalne 9,76 %", dedZusRentowe: "ZUS rentowe 1,5 %",
  dedZusChorobowe: "ZUS chorobowe 2,45 %", dedNfz: "NFZ 9 % (здоров'я)", dedPit: "PIT (12 %, мінус kwota 300)",
  dedPitExempt: "PIT: звільнення до 26 років — 0", dedPitExtra: "PIT 32 % понад 120 000", dedPpk: "PPK 2 %",
  dedBenefitZus: "Бенефіт: ZUS/NFZ", dedBenefitTax: "Бенефіт: податок", dedLaundry: "+ Компенсація за прання",
  dedTotal: "Разом відрахувань", dedCheck: "Брутто − відрахування + прання = Нетто",
  dedRoundNote: "Сума рядків може відрізнятися на 0,01–0,02 zł через округлення"
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
  navStats: "Statystyki", navSettingsTab: "Ustawienia",
  period3: "3 mies.", period6: "6 mies.", period12: "12 mies.", periodYears: "Lata", statsPeriodAria: "Okres statystyk", statsYearsAria: "Wybór lat",
  statsMissingN: "Brak danych za miesięcy:", statsMissingHint: "Te miesiące nie są jeszcze zapisane, więc nie wchodzą do podsumowania. Przyszłe miesiące nie są liczone.",
  statsIncomeYears: "Średni dochód wg lat", statsPerMonth: "średnio miesięcznie", statsMonthsShort: "mies.",
  statsEmpty: "Brak zapisanych miesięcy w wybranym okresie. Zapisz miesiąc w kalkulatorze, a pojawią się tu statystyki.",
  statsIncome: "Dochód wg miesięcy", statsGross: "Brutto", statsNet: "Netto", statsChartAria: "Brutto i netto wg miesięcy",
  statsPickHint: "Dotknij miesiąca, aby zobaczyć kwoty", statsNoMonth: "brak zapisanego miesiąca",
  statsMix: "Struktura zmian", statsMixAria: "Struktura zmian w okresie",
  mixRegular: "Zmiany zwykłe", mixNight: "Zmiany nocne", mixOvertime: "Nadgodziny", mixVacation: "Urlop", mixL4: "Chorobowe L4", mixExcused: "Nieobecność usprawiedliwiona",
  mixUnit: "dn.", mixUnitCenter: "dni",
  statsTotals: "Podsumowanie okresu", statsAvgNet: "Średnie netto miesięcznie", statsBest: "Najwyższe netto", statsCount: "Miesięcy z danymi",
  statsNote: "Uwzględniono zapisane miesiące okresu (do bieżącego włącznie): gościom z tego urządzenia, dla konta z chmury. Przyszłe miesiące nie wchodzą. Dla konta netto uwzględnia już próg PIT 120 000.",
  updateAvailable: "Dostępna nowa wersja", updateNow: "Odśwież", updateLater: "Później",
  errPermission: "Brak dostępu. Zaloguj się ponownie.", errUnknown: "Nieznany błąd",
  errInvalidCred: "Nieprawidłowy email lub hasło", errInvalidEmail: "Nieprawidłowy adres email",
  errWeakPwd: "Hasło jest za krótkie (min. 6 znaków)", errEmailInUse: "Ten email jest już zarejestrowany",
  errNetwork: "Brak połączenia z siecią", errTooMany: "Zbyt wiele prób, spróbuj później",
  nightCarryOut: "Ostatnia nocna zmiana przechodzi na następny miesiąc (tu 2 godz.)", nightCarryIn: "Nocna zmiana z poprzedniego miesiąca (+6 godz.)",
  hintNightCarryAuto: "Włączone na podstawie poprzedniego miesiąca", infoNightCarry: "Przechodnie godziny nocne",
  profExtraDeduction: "Dodatkowe potrącenie, zł/mies.", hintExtraDeduction: "Np. dodatkowe ubezpieczenie",
  infoDeduction: "Dodatkowe potrącenie", minWageUnknown: "Płaca minimalna na {year} nie jest jeszcze znana — użyto {sum} z {knownYear}",
  toastNextCarryIn: "Następny miesiąc jest już zapisany — włącz w nim «Nocna zmiana z poprzedniego miesiąca (+6 godz.)»",
  bonusTotal: "Premia", hintBonusConverted: "Premię tego miesiąca przeliczono z dwóch starych pól — sprawdź procent",
  pctSign: "%", infoBonusL4: "({selected} − {cut} za L4)",
  secMinWage: "Płaca minimalna", minWageField: "Płaca minimalna na {year}, zł", errMinWage: "Nieprawidłowa kwota (3000–20000 zł)",
  minWageAllKnown: "Oficjalne kwoty są dla wszystkich lat w kalendarzu: {years}",
  minWagePriority: "Oficjalna kwota z aktualizacji aplikacji zawsze ma pierwszeństwo przed wpisaną ręcznie.",
  minWageUser: "Płaca minimalna na {year} wpisana ręcznie: {sum}",
  errDeduction: "Nieprawidłowa kwota", errDeductionMax: "Nie więcej niż 2000 zł",
  dedTitle: "Potrącenia: −{sum}", dedZusEmerytalne: "ZUS emerytalne 9,76%", dedZusRentowe: "ZUS rentowe 1,5%",
  dedZusChorobowe: "ZUS chorobowe 2,45%", dedNfz: "NFZ 9% (zdrowotna)", dedPit: "PIT (12%, minus kwota 300)",
  dedPitExempt: "PIT: zwolnienie do 26 lat — 0", dedPitExtra: "PIT 32% powyżej 120 000", dedPpk: "PPK 2%",
  dedBenefitZus: "Benefit: ZUS/NFZ", dedBenefitTax: "Benefit: podatek", dedLaundry: "+ Ekwiwalent za pranie",
  dedTotal: "Razem potrąceń", dedCheck: "Brutto − potrącenia + pranie = Netto",
  dedRoundNote: "Suma pozycji może różnić się o 0,01–0,02 zł z powodu zaokrągleń"
});

/* 1.20.0: новий вигляд — шапка з кнопкою хмари, панель хмари, «Вигляд» у «Параметрах», вкладка «Профіль», перший запуск. */
Object.assign(dict.uk, {
  ariaCloud: "Зберігання в хмарі", ariaClose: "Закрити", secAppearance: "Вигляд", darkTheme: "Темна тема",
  cloudOutTitle: "Зберігати в хмарі", cloudOutText: "Увійдіть, щоб зберігати дані в хмарі й бачити їх на інших пристроях і на сайті.",
  ariaAuthMode: "Вхід або реєстрація", authModeLogin: "Вхід", authModeRegister: "Реєстрація", btnCreateAccount: "Створити акаунт",
  ariaShowPwd: "Показати пароль", ariaHidePwd: "Сховати пароль",
  cloudInTitle: "Хмару підключено", cloudAccount: "Акаунт", cloudState: "Стан", cloudSynced: "Синхронізовано {time}",
  cloudNoConn: "Немає з'єднання", cloudPending: "Синхронізація…", btnLogoutAccount: "Вийти з акаунта",
  cloudLogoutNote: "Після виходу дані лишаться на телефоні.", btnLoadCloud: "Завантажити з хмари",
  ariaProfilesInfo: "Про профілі",
  profilesInfo: "Кожен профіль має свої місяці, налаштування й статистику. Дані зберігаються на цьому телефоні. Щоб зберегти їх у хмарі, натисніть хмаринку вгорі.",
  secProfile: "Профіль", secSettings: "Налаштування", profileNameLabel: "Назва", profileNamePhNew: "Напр., Володимир",
  tileRate: "Ставка, zł", tileDeduction: "Відрахування, zł/міс.", tileDeductionHint: "Напр., страхування", tileUnder26: "До 26 років", tilePpk: "PPK",
  profileDeleteBtn: "Видалити профіль", firstTitle: "Вітаємо!", firstTextA: "Дані зберігаються на телефоні. Хмара —", firstTextB: "угорі.",
  firstCreate: "Створити профіль"
});

Object.assign(dict.pl, {
  ariaCloud: "Przechowywanie w chmurze", ariaClose: "Zamknij", secAppearance: "Wygląd", darkTheme: "Ciemny motyw",
  cloudOutTitle: "Zapisuj w chmurze", cloudOutText: "Zaloguj się, aby zapisywać dane w chmurze i widzieć je na innych urządzeniach i na stronie.",
  ariaAuthMode: "Logowanie lub rejestracja", authModeLogin: "Logowanie", authModeRegister: "Rejestracja", btnCreateAccount: "Utwórz konto",
  ariaShowPwd: "Pokaż hasło", ariaHidePwd: "Ukryj hasło",
  cloudInTitle: "Chmura połączona", cloudAccount: "Konto", cloudState: "Stan", cloudSynced: "Zsynchronizowano {time}",
  cloudNoConn: "Brak połączenia", cloudPending: "Synchronizacja…", btnLogoutAccount: "Wyloguj się z konta",
  cloudLogoutNote: "Po wylogowaniu dane zostaną na telefonie.", btnLoadCloud: "Pobierz z chmury",
  ariaProfilesInfo: "O profilach",
  profilesInfo: "Każdy profil ma własne miesiące, ustawienia i statystyki. Dane są zapisywane na tym telefonie. Aby zapisać je w chmurze, dotknij chmurki u góry.",
  secProfile: "Profil", secSettings: "Ustawienia", profileNameLabel: "Nazwa", profileNamePhNew: "Np. Anna",
  tileRate: "Stawka, zł", tileDeduction: "Potrącenie, zł/mies.", tileDeductionHint: "Np. ubezpieczenie", tileUnder26: "Do 26 lat", tilePpk: "PPK",
  profileDeleteBtn: "Usuń profil", firstTitle: "Witamy!", firstTextA: "Dane są zapisywane na telefonie. Chmura —", firstTextB: "u góry.",
  firstCreate: "Utwórz profil"
});

/* 1.21.0: свій акаунт для кожного профілю. */
Object.assign(dict.uk, {
  cloudConnectText: "Підключіть «{name}» до акаунта, щоб зберігати його в хмарі й бачити на інших пристроях і на сайті.",
  cloudExpired: "Сеанс акаунта {email} завершено. Увійдіть знову, щоб синхронізувати «{name}».",
  errTaken: "Цей акаунт уже підключено до профілю «{name}»", errWrongAccount: "Цей профіль підключено до акаунта {email}",
  toastDataUploaded: "Дані профілю збережено в хмарі", toastConnectErr: "Не вдалося підключити профіль: ",
  toastLogoutErr: "Не вдалося вийти з акаунта", toastStillLoading: "Місяць ще завантажується — спробуй за мить",
  mergeTitle: "Дані є і тут, і в хмарі", mergeText: "У хмарі вже є {N} міс., на телефоні — {M} міс.",
  mergeAdd: "Додати місяці з телефону, яких немає в хмарі", mergeCloud: "Залишити лише хмарні",
  mergeNote: "На телефоні нічого не видаляється. Місяць, що є в обох місцях, береться з хмари.",
  profileDeleteCloudConfirm: "Видалити профіль «{name}» з цього телефона? Дані в хмарі акаунта {email} залишаться.",
  profileRecovered: "Відновлений профіль {n}", cloudSuffix: "хмара", ariaCloudProfile: "Підключено до хмари"
});

Object.assign(dict.pl, {
  cloudConnectText: "Połącz „{name}” z kontem, aby zapisywać go w chmurze i widzieć na innych urządzeniach i na stronie.",
  cloudExpired: "Sesja konta {email} wygasła. Zaloguj się ponownie, aby synchronizować „{name}”.",
  errTaken: "To konto jest już połączone z profilem „{name}”", errWrongAccount: "Ten profil jest połączony z kontem {email}",
  toastDataUploaded: "Dane profilu zapisano w chmurze", toastConnectErr: "Nie udało się połączyć profilu: ",
  toastLogoutErr: "Nie udało się wylogować z konta", toastStillLoading: "Miesiąc się jeszcze wczytuje — spróbuj za chwilę",
  mergeTitle: "Dane są tu i w chmurze", mergeText: "W chmurze jest już {N} mies., na telefonie — {M} mies.",
  mergeAdd: "Dodaj miesiące z telefonu, których nie ma w chmurze", mergeCloud: "Zostaw tylko chmurowe",
  mergeNote: "Na telefonie nic nie jest usuwane. Miesiąc, który jest w obu miejscach, bierzemy z chmury.",
  profileDeleteCloudConfirm: "Usunąć profil „{name}” z tego telefonu? Dane w chmurze konta {email} zostaną.",
  profileRecovered: "Przywrócony profil {n}", cloudSuffix: "chmura", ariaCloudProfile: "Połączony z chmurą"
});
