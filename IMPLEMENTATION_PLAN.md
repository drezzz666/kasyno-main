# Kompleksowy Plan Implementacji: Grywalność & Frontend Atlantic Privé '91

---

## 1. Indywidualny Balans i Mechanika Gier

### 1.1 Limbo
- **Minimalny cel**: `1.50x` (zapobiega nieskończonemu i bezpiecznemu farmieniu na mnożnikach 1.05x–1.10x).
- **Maksymalny cel**: `10,000x`.
- **RTP**: 96%. Szybkie, jednoetapowe rozliczenie.

### 1.2 Crash (Rakieta)
- **Krzywa wzrostu**: Rakieta startuje od `1.00x`.
- **Balans crash point**:
  - Bardzo niska szansa na przekroczenie mnożnika `10.00x` (większość rund kończy się w przedziale `1.20x` – `4.50x`, dzięki czemu gra jest dynamiczna i nie generuje nagłych gigantycznych wygranych rozwalających balans).
  - Płynny canvas/animacja bez lagów.

### 1.3 Saper (Mines)
- **Liczba min**: Wybór od **3 do 15** min (usunięcie skrajności 1-2 oraz >15 min).
- **Rozgrywka**: Siatka 5x5 (25 pól), natychmiastowy Cashout, 97% RTP na każdym kroku.

### 1.4 Kurczak (Chicken Road)
- **Mechanika**: 17 pasów ruchu.
- **Rozgrywka**: Pierwsze pasy bezpieczniejsze do budowania stawki, późniejsze z większym ryzykiem i natychmiastowym Cashoutem.

### 1.5 Slots (Jednoręki Bandyta 3x3)
- **Mechanika**: 6 klasycznych symboli, 97% RTP.
- **Wygrane**: Wygrane za 3 symbole w linii oraz mniejsze wygrane za pary, co zapewnia stałą dynamikę gry.

### 1.6 Plinko
- **Mechanika**: 14 lub 16 rzędów, ryzyko Low / Medium / High.
- **Balans**: Środkowe pola w Low/Medium amortyzują stawkę (0.5x–1.3x), nie zerując konta po 1 kulce.

### 1.7 Upgrader
- **Mechanika**: Szansa na upgrade obliczana z house edge ~1% ($\text{Szansa} = \frac{95\%}{\text{Mnożnik}}$).
- **Zakres**: od `1.50x` do `10,000x`.

### 1.8 Gry Stołowe (Blackjack, Ruletka, Coinflip, KPN)
- **Blackjack**: Klasyczny stół VIP, standardowe dobieranie i podwajanie.
- **Ruletka**: Europejska (jedno zero).
- **Coinflip**: 1.98x (99% RTP).
- **KPN**: 2.94x.

### 1.9 Bezpieczeństwo i Alerting
- **Stawki**: Pełna swoboda (brak limitu stawek, All-In dozwolony).
- **Brak blokad**: Gracz nie jest blokowany w grze.
- **Alert Discord**: Cichy webhook administracyjny `LogSuspiciousActivity`, jeśli zysk netto gracza w sesji przekroczy **500 000 $FGT**.

---

## 2. Frontend: *Atlantic Privé '91* (Czysty, Surowy Interfejs)

### 2.1 Zasada Zero Śmieci i AI-Slopu
- ❌ **Żadnych migających kropek ONLINE / LIVE**
- ❌ **Żadnych zbędnych opisów** (usuwamy teksty typu "100x", "5 bębnów", "wypłata 3:2", "Graj teraz w najlepszą grę")
- ❌ **Żadnego dublowania informacji** (saldo i mnożniki pokazywane tylko w jednym, właściwym miejscu)
- ❌ **Żadnego rozmycia (backdrop-filter: blur)**

### 2.2 Styl i Komponenty (`frontend/src/index.css`)
- **Czcionka**: Wyłącznie `IBM Plex Serif`.
- **Kolory**: Tła `#07080e`, `#0e1018`, `#14172a`, akcenty mosiężne `#fbbf24`, sygnalizatory `#34d399` / `#fb7185`.
- **Karty stołów (`.table-card`)**: Solidne ciemne tło gradientowe, metaliczna ramka mosiężna (`border-image: var(--gold-border-bevel) 1`), wewnętrzny obrys `::after`.
- **Przyciski (`.btn-plaque`)**: Styl emaliowanej tabliczki, wpuszczony cień `inset`, mikro-unoszenie -1px.
- **Separatory (`.brass-divider`)**: 1px linia mosiężna o zanikających krawędziach.

### 2.3 Struktura Ekranu Głównego i Modali
- **Nagłówek**: Tylko logo/nazwa kasyna, saldo $FGT i przycisk wylogowania/konta.
- **Siatka gier**: Minimalistyczne karty stołów: nazwa gry, prosta ikona/grafika stołu, przycisk "Graj".
- **Stół gry (Modal)**: Skupiony wyłącznie na planszy gry i panelu zakładu (kwota, `1/2`, `2X`, `MAX`, przycisk akcji).
