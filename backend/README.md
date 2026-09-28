# 2fgt Casino Core Server (Golang Edition)

Wysokowydajny, nowoczesny serwer backendowy kasyna społecznościowego (Social Casino) napisany w języku **Go (Golang 1.26)** z bazą **PostgreSQL 17**, autoryzacją **OIDC (Authentik)** oraz obsługą komunikacji czasu rzeczywistego przez **WebSockets**.

---

## Główne cechy i architektura

1. **Wydajność i mikro-obraz**:
   - Binarka kompilowana statycznie (`CGO_ENABLED=0`).
   - Obraz Dockera oparty na `alpine:3.20` waży zaledwie **~25 MB** (w porównaniu do 500+ MB w Node.js).
   - Zużycie pamięci RAM w spoczynku: **< 15 MB**.

2. **Bezpieczeństwo i atomowość finansowa (ACID)**:
   - Wszystkie zakłady, wygrane, bonusy i doładowania są przetwarzane w atomowych transakcjach PostgreSQL (`pgxpool`).
   - Całkowita ochrona przed debetem: `UPDATE players SET balance = balance - bet WHERE balance >= bet`.
   - **Brak podwójnych gier**: Wymuszony indeks częściowy `CREATE UNIQUE INDEX idx_game_rounds_single_active ON game_rounds (user_id) WHERE state = 'active'`.
   - **Atomowy poziom i XP**: Inkrementacja XP i wyliczanie poziomu bezpośrednio w SQL: `SET xp = xp + 10, level = 1 + ((xp + 10) / 500) RETURNING xp, level`.

3. **Silniki gier**:
   - **Ruletka Europejska** (`internal/games/roulette`): Zakłady pojedyncze 0–36 (×36), kolory/parzyste/połowy (×2), tuziny (×3).
   - **Blackjack** (`internal/games/blackjack`): Prawidłowe asy (1/11), Natural Blackjack 3:2 (2.5×), remis (Push), dealer stand na 17+, brak dobierania dealera przy furze gracza.
   - **Mines** (`internal/games/mines`): Siatka 5×5 (25 pól), 2–15 min, wzór kombinatoryczny RTP 97%, funkcja Cash-out.
   - **Midnight 2fgt Sloty** (`internal/games/slots`): 5 bębnów, 3 rzędy, wypłaty za 3, 4 i 5 pasujących symboli na linii środkowej.
   - **Provably Fair** (`internal/games/provablyfair`): Kryptograficzne losowanie i weryfikacja HMAC-SHA256 (Server Seed + Client Seed + Nonce).

4. **Autoryzacja i Sesje**:
   - Pełna integracja z Authentik OIDC (`.well-known/openid-configuration`, wymiana kodu autoryzacyjnego, pobieranie `userinfo`).
   - Podpisywanie ciasteczek sesji algorytmem HMAC-SHA256 (`casino_session`).
   - Obsługa specyfikacji **OIDC Back-Channel Logout 1.0**.

5. **WebSockets w czasie rzeczywistym**:
   - Endpoint `/ws` do natychmiastowej synchronizacji salda między kartami gracza oraz ogólno-kasynowego paska wygranych (*Global Win Ticker*).

---

## Struktura projektu

```text
backend/
├── cmd/
│   ├── server/main.go       # Główny punkt startowy serwera HTTP + WebSocket
│   └── grant/main.go        # Narzędzie CLI do doładowywania/korygowania salda
├── internal/
│   ├── api/                 # Endpointy REST (/api/casino, /api/auth, routing Chi)
│   ├── auth/                # OIDC Authentik, sesje HMAC, middleware
│   ├── config/              # Ładowanie konfiguracji ze zmiennych środowiskowych
│   ├── db/                  # Połączenie pgxpool i wbudowane migracje schema.sql
│   ├── games/
│   │   ├── blackjack/       # Silnik Blackjacka + testy jednostkowe
│   │   ├── mines/           # Silnik gry Mines + testy jednostkowe
│   │   ├── provablyfair/    # Silnik Provably Fair + testy jednostkowe
│   │   ├── roulette/        # Silnik Ruletki Europejskiej + testy jednostkowe
│   │   └── slots/           # Silnik automatu Midnight 2fgt + testy jednostkowe
│   ├── ledger/              # Serwis transakcyjny gracza, portfela i misji
│   └── ws/                  # Hub WebSocketów, zarządzanie połączeniami
├── Dockerfile               # Dwuetapowy build Dockera (~25 MB)
├── docker-compose.yml       # Orkiestracja PostgreSQL + Serwer Go
└── go.mod
```

---

## Uruchomienie

### 1. Docker Compose (Zalecane na serwerze)

```bash
docker compose up -d --build
```

Serwer uruchomi się na porcie `8080`, a baza PostgreSQL na `5432`.

### 2. Uruchomienie lokalne (Development)

Wymagany Go 1.22+:

```bash
cd backend

# Uruchomienie testów jednostkowych
go test -v ./...

# Start serwera
go run cmd/server/main.go
```

---

## Narzędzie administracyjne doładowań (CLI Grant)

Możesz doładować lub skorygować saldo dowolnemu graczowi podając jego `user_id`, `nick` lub `email`:

```bash
go run cmd/grant/main.go Janek 1000 "Bonus turniejowy"
go run cmd/grant/main.go "user_12345" -250 "Korekta"
```

Wewnątrz kontenera Docker:
```bash
docker exec -it kasyno_backend_go /app/grant Janek 1000
```
