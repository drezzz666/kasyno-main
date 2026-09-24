# 🎰 2FGT Casino – Kompletny Przewodnik Testów, Audytu Bezpieczeństwa i Pentestingu

> **Wersja:** 2.4.0-PROD  
> **Waluta bazowa:** Żetony wirtualne `$FGT` (Fidget Tokens, jednostki całkowite w ledgerze)  
> **Silnik backendu:** Go 1.22+ (PostgreSQL + pgx/v5, transakcyjne blokady `pg_advisory_xact_lock`)  
> **Silnik frontendu:** React 19 + Vite + Canvas 2D + Lucide Icons + Tailwind / CSS  
> **Architektura uczciwości:** Silnik kryptograficzny Provably Fair (HMAC-SHA256, Server Seed + Client Seed + Nonce)

---

## 📑 Spis Treści
1. [Architektura Systemu i Założenia Ekonomiczne](#1-architektura-systemu-i-założenia-ekonomiczne)
2. [Matryca Testowa 10 Gier Kasynowych](#2-matryca-testowa-10-gier-kasynowych)
3. [Testy Bezpieczeństwa, Antycheata i Pentestów](#3-testy-bezpieczeństwa-antycheata-i-pentestów)
4. [Zautomatyzowane Skrypty Testowe (Bash, Go, Concurrency)](#4-zautomatyzowane-skrypty-testowe)
5. [Audyt Braku Wycieków Danych (Zero-Knowledge Client Audit)](#5-audyt-braku-wycieków-danych)
6. [🔥 WIELKI PROMPT NA GŁĘBOKIE TESTY (QA & Pentest AI Agent)](#6-wielki-prompt-na-głębokie-testy)

---

## 1. Architektura Systemu i Założenia Ekonomiczne

| Parametr | Wartość | Opis / Zabezpieczenie |
| :--- | :--- | :--- |
| **Początkowe saldo** | `1 000 $FGT` | Przyznawane automatycznie przy pierwszym logowaniu przez SSO |
| **Domyślna stawka** | `10 $FGT` | Podstawowa stawka w selektorach wszystkich gier |
| **Minimalna stawka** | `1 $FGT` | Zabezpieczona w `ValidateBetAmount` |
| **Maksymalna stawka** | `100 000 $FGT` | Górny limit pojedynczego zakładu |
| **Bonus Dzienny (Streak)** | `200 $FGT` + `100 $FGT`/dzień (max `2 000 $FGT`) | Wymaga 24h odstępu, resetowany w przypadku przerwania serii |
| **Koło Ratunkowe** | **BRAK** (Całkowicie usunięte) | Zabezpieczenie przed farmieniem darmowych środków |
| **Misje Dzienne** | Co 6h (00:00, 06:00, 12:00, 18:00 UTC) | Kwalifikacja stawki: min. `10 $FGT` |
| **Zarobek XP** | $\lfloor \sqrt{\text{stawka}} / 4 \rfloor$ (1–15 XP) | Zapobiega exploitom micro-bet 1 $FGT |
| **Nagroda za poziom** | `+50 $FGT` za każdy LVL | Przyznawana automatycznie przy awansie |

---

## 2. Matryca Testowa 10 Gier Kasynowych

### 2.1 🐔 Chicken Cross (Minigra Przeprawy Kurczaka)
- [ ] **Liczba pasów ruchu:** 10 pasów (Lanes 0–9).
- [ ] **Poziomy trudności i krzywa mnożników (RTP 95%):**
  - **Easy:** `[0.90x, 1.10x, 1.25x, 1.45x, 1.75x, 2.15x, 2.70x, 3.50x, 4.60x, 6.20x]`
  - **Medium:** `[0.75x, 1.15x, 1.50x, 2.00x, 2.65x, 3.60x, 5.00x, 7.00x, 10.00x, 15.00x]`
  - **Hard:** `[0.60x, 1.10x, 1.85x, 3.10x, 5.40x, 9.80x, 18.50x, 36.00x, 75.00x, 160.00x]`
  - **Expert:** `[0.50x, 0.90x, 1.80x, 4.50x, 12.00x, 35.00x, 110.00x, 380.00x, 1200.00x, 4000.00x]`
- [ ] **Ochrona przed darmowym profitem (Warmup Multipliers):** Pierwszy pas na poziomie Medium/Hard/Expert posiada mnożnik $< 1.00x$. Wypłata na kroku 1 oznacza stratę części stawki.
- [ ] **Brak podglądu wyników (Zero-Knowledge):** Kolizje są losowane w locie na serwerze (`crypto/rand`) w momencie wysłania `action: "step"`. Klient nie otrzymuje mapy przeszkód w odpowiedzi `start_chicken`.
- [ ] **Płynna animacja skoku:** Pojedyncza pozycja kurczaka w locie (`activeChickenLane`), brak „duplikowania” kurczaka na starym i nowym pasie.
- [ ] **Animacja kolizji radiowozu:** W przypadku przegranej radiowóz zjeżdża z góry i taranuje kurczaka. Popup przegranej pojawia się **wyłącznie po zakończeniu animacji uderzenia** (opóźnienie ~1400 ms).
- [ ] **Stabilność kamery:** Po zderzeniu kamera pozostaje na pasie kolizji i resetuje się do lewej krawędzi dopiero po kliknięciu „Zagraj ponownie”.

### 2.2 🚀 Crash (Rakieta Kosmiczna)
- [ ] **Punkt startowy:** Rakieta i wykres Canvas startują od mnożnika **`0.80x`**.
- [ ] **Wzór lotu:** $M(t) = 0.80 \times e^{\text{speed} \times t}$.
- [ ] **Obsługa Auto-Cashout:** Minimalny próg ustawienia wynosi `0.80x`.
- [ ] **Synchronizacja serwerowa:** Próba wypłaty `cashout_crash` z zawyżonym mnożnikiem jest weryfikowana serwerowo względem czasu lotu ($+150\text{ ms}$ tolerancji na ping).

### 2.3 💣 Mines (Saper)
- [ ] **Siatka:** $5 \times 5$ (25 kafelków), wybór min od 2 do 24.
- [ ] **Maskowanie stanu:** W stanie aktywnym (`active`) serwer zwraca `MaskActive`, ukrywając pozycje nieodkrytych min. Pełna plansza odkrywana jest dopiero po uderzeniu w minę lub `cashout`.

### 2.4 🔴 Ruletka Europejska (Roulette)
- [ ] **Koło:** 37 numerów (0–36, 1 zielone zero).
- [ ] **Wypłaty:** Straight (pojedynczy numer) $\times 36$, Tuziny i Kolumny $\times 3$, Kolory / Parzyste $\times 2$.
- [ ] **Multi-zakład:** Poprawne sumowanie wielu zakładów na stole i łączna walidacja salda.

### 2.5 🃏 Blackjack 21
- [ ] **Zasady krupiera:** Krupier dobiera do miękkiego/twardego 16, pasuje na 17+.
- [ ] **Naturalny Blackjack:** Wypłata w stosunku $3:2$ ($1.5\times$ zysku).
- [ ] **Akcje gracza:** `hit`, `stand`, `double` (podwojenie stawki z pobraniem z salda).

### 2.6 🎰 Midnight Slots (5 Bębnów)
- [ ] **Kombinacje:** 3 pasujące symbole = $\times 2$, 4 symbole = $\times 6$, 5 symboli = $\times 12$.

### 2.7 🟡 Coinflip & ✂️ KPN (Kamień, Papier, Nożyce)
- [ ] **RTP 99%:** Stały mnożnik wygranej $\times 1.98$, remis w KPN zwraca stawkę ($\times 1.00$).

### 2.8 🔺 Plinko
- [ ] **Piramida:** 8–16 rzędów, profile ryzyka: Low, Medium, High.
- [ ] **Fizyka:** Generowanie ścieżki lewo/prawo na serwerze i animacja spadku kulek.

### 2.9 🎯 Limbo
- [ ] **Zakres celu:** Od `1.50x` do `10 000.00x`.

---

## 3. Testy Bezpieczeństwa, Antycheata i Pentestów

### 3.1 Rate Limiting & Wykrywanie Botów (Sliding Window)
Silnik `backend/internal/anticheat/anticheat.go` monitoruje aktywność każdego `userID` i `IP`:
- **Limit 1:** Maksymalnie **4 akcje gry na 1 sekundę** (`POST /api/casino`).
- **Limit 2:** Maksymalnie **12 akcji na 10 sekund**.
- **Limit 3:** Maksymalnie **30 akcji na 60 sekund**.
- **Limit odpytań stanu:** Maksymalnie **8 żądań na sekundę** (`GET /api/casino`).
- **Skutek przekroczenia:** Po 3 naruszeniach konto otrzymuje flagę `BOT_DETECTED`, serwer zwraca kod `HTTP 429 Too Many Requests`, a alert trafia na dedykowany webhook Discorda Security.

### 3.2 Ochrona Przed Race Condition & Double-Spend
Każda operacja finansowa w ledgerze wykonuje blokadę doradczą PostgreSQL:
```sql
SELECT pg_advisory_xact_lock(user_lock_key);
```
- Brak możliwości równoległego postawienia dwóch zakładów przy saldzie wystarczającym tylko na jeden.
- Brak możliwości równoczesnego `cashout` i `step` w grach turowych (Mines, Chicken).

### 3.3 Integralność Kryptograficzna Captcha
- Obrazy generowane czysto binarnie w pamięci RAM w formacie PNG.
- Podpis HMAC-SHA256 z kluczem `SESSION_SECRET`: `HMAC(userID + answer + id + issuedAt)`.
- Jednorazowość tokenów (rejestr zużytych ID w pamięci, wygasanie po 3 minutach).

---

## 4. Zautomatyzowane Skrypty Testowe

### 4.1 Uruchomienie Pełnego Pakietu Testów Jednostkowych w Go
```bash
cd /home/ubuntu/kasyno/backend
go test -v -race ./...
```

### 4.2 Test Budowania Frontendu (Vite Production Build)
```bash
cd /home/ubuntu/kasyno/frontend
pnpm build
```

### 4.3 Skrypt Testowy Współbieżności i Race Conditions (Bash + Curl)
```bash
#!/usr/bin/env bash
# Test równoległego wysyłania 20 zakładów (Double Spend Test)
COOKIE="casino_session=TUTAJ_TOKEN_SESJI"
URL="http://localhost:8080/api/casino"

echo "=== Rozpoczęcie Testu Współbieżności (Race Condition) ==="
for i in {1..20}; do
  curl -s -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -d '{"game":"coinflip","action":"bet","bet":500,"choice":"heads"}' &
done
wait
echo "=== Zakończono. Sprawdź czy saldo nie zeszło poniżej zera ==="
```

### 4.4 Test Antycheat Rate-Limiter (Wymuszenie HTTP 429 i Flagi Bot)
```bash
#!/usr/bin/env bash
COOKIE="casino_session=TUTAJ_TOKEN_SESJI"
URL="http://localhost:8080/api/casino"

echo "=== Test Przekroczenia Rate Limitu (Flood 15 zapytań w 0.5s) ==="
for i in {1..15}; do
  curl -s -o /dev/null -w "Request $i: HTTP %{http_code}\n" -X POST "$URL" \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -d '{"game":"coinflip","action":"bet","bet":10,"choice":"heads"}'
done
```

---

## 5. Audyt Braku Wycieków Danych (Zero-Knowledge Client Audit)

Podczas trwania aktywnej rundy w grach turowych wykonaj zapytanie:
```bash
curl -s -X GET "http://localhost:8080/api/casino" -H "Cookie: casino_session=..." | jq .activeRound
```
**Kryteria akceptacji:**
1. **Chicken Cross:** Odpowiedź `payload` NIE ZAWIERA pól `collision_lanes`, `death_steps`, ani `crash_point`.
2. **Mines:** Odpowiedź `payload` zawiera wyłącznie `{"mines_count": X, "revealed": [...]}`, bez tablicy `mine_positions`.
3. **Crash:** Odpowiedź `payload` zawiera `{"started_at": X, "flight_speed": Y, "auto_cashout": Z}`, bez wylosowanego `crash_point`.

---

## 6. 🔥 WIELKI PROMPT NA GŁĘBOKIE TESTY

Skopiuj poniższy prompt i wklej go do agenta testowego AI, dedykowanego subagenta lub zespołu QA w celu przeprowadzenia bezwzględnego, głębokiego audytu całej platformy:

```text
Jesteś elitarnym inżynierem QA, audytorem bezpieczeństwa aplikacji finansowych i certyfikowanym pentesterem kasyn online. Twoim celem jest przeprowadzenie całościowego, bezwzględnego audytu platformy kasynowej 2FGT (Go backend + React 19 frontend + PostgreSQL).

PRZEPROWADŹ GŁĘBOKIE TESTY WE WSZYSTKICH PONIŻSZYCH OBSZARACH I ZWRÓĆ RAPORT AUDYTOWY:

================================================================================
OBSZAR 1: EKONOMIA, WALUTA ($FGT) I SPÓJNOŚĆ LEDGERA
================================================================================
1. Zweryfikuj, czy wszystkie kwoty w interfejsie są sformatowane w walucie "$FGT" (np. "1,000 $FGT").
2. Sprawdź, czy saldo początkowe wynosi dokładnie 1 000 $FGT.
3. Sprawdź, czy domyślny zakład wynosi 10 $FGT, a minimalny 1 $FGT.
4. Potwierdź, że funkcja koła ratunkowego (bankruptcy relief / faucet) została CAŁKOWICIE usunięta z backendu, API oraz frontendu.
5. Sprawdź naliczanie bonusu dziennego (streak): 200 $FGT bazowo + 100 $FGT za każdy dzień serii, max 2 000 $FGT.
6. Sprawdź algorytm XP: czy zapobiega micro-bet exploitom (stawka 1 $FGT nie może farmić nielimitowanego XP).
7. Sprawdź nagrodę za poziom: +50 $FGT za każdy nowy poziom gracza.

================================================================================
OBSZAR 2: AUDYT 10 GIER KASYNOWYCH I INTEGRACJA CHICKEN CROSS
================================================================================
1. CHICKEN CROSS:
   - Przetestuj 10 pasów ruchu na 4 poziomach (Easy, Medium, Hard, Expert).
   - Zweryfikuj krzywą mnożników: czy początkowe mnożniki na Medium (0.75x), Hard (0.60x) i Expert (0.50x) chronią kasyno przed darmowym profitem z 1-kliknięcia (RTP 95%).
   - Sprawdź animację skoku: czy pozycja kurczaka jest pojedyncza i nie zostawia widmowych kopii.
   - Sprawdź animację kolizji: czy radiowóz taranuje kurczaka z góry, a popup przegranej pojawia się DOPIERO po uderzeniu (~1.4s opóźnienia).
   - Sprawdź kamerę: czy po przegranej kamera pozostaje na pasie kolizji i cofa się w lewo dopiero przy nowej grze.
   - Zweryfikuj brak wycieków danych w MaskChicken (klient nie wie z góry, kiedy nastąpi kolizja).
2. CRASH:
   - Sprawdź czy mnożnik i wykres startują od 0.80x.
   - Sprawdź poprawność auto-cashoutu oraz ręcznego cashoutu z tolerancją na opóźnienia sieciowe.
3. MINES:
   - Sprawdź maskowanie min w trakcie trwania rundy.
   - Przetestuj cashout przy 1, 5 i 10 odkrytych diamentach.
4. RULETKA, BLACKJACK, SLOTY, COINFLIP, KPN, PLINKO, LIMBO:
   - Sprawdź poprawność rozliczania stawek, mnożników wygranych, remisów i podwojeń (double).

================================================================================
OBSZAR 3: TESTY BEZPIECZEŃSTWA, ANTYCHEATA I WSPÓŁBIEŻNOŚCI
================================================================================
1. RACE CONDITION / DOUBLE SPENDING:
   - Wyślij 50 równoległych żądań postawienia zakładu i sprawdź, czy blokada PostgreSQL (pg_advisory_xact_lock) zapobiega ujemnemu saldu.
2. RATE LIMITING:
   - Przetestuj sliding window: 4 akcje/s, 12 akcji/10s, 30 akcji/60s.
   - Sprawdź, czy po 3 naruszeniach konto otrzymuje flagę BOT_DETECTED i zwracany jest kod HTTP 429.
3. ZERO-KNOWLEDGE CLIENT AUDIT:
   - Przechwyć odpowiedzi GET /api/casino i POST /api/casino pod kątem wycieku pól prywatnych (karty zakryte krupiera, miny, crash point, death lane).
4. CAPTCHA SECURITY:
   - Przetestuj odporność na replay attack, fałszowanie podpisu HMAC i wygasanie tokenów po 3 minutach.

================================================================================
FORMAT RAPORTU:
================================================================================
Zwróć raport zawierający:
1. Podsumowanie wykonanych testów (Pass/Fail).
2. Wykryte luki, błędy lub niespójności matematyczne/ekonomiczne.
3. Konkretne rekomendacje naprawcze z kodem źródłowym.
```
