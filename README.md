# 2fgt Casino (kasyno.2fgt.pl)

Prywatny klub gier na wirtualne żetony (Social Casino) oparty na Next.js, SQLite (Better-SQLite3 + Drizzle ORM) oraz logowaniu OIDC (Authentik).

## Architektura

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4.
- **Backend / API**: Next.js Server Components i API Routes (`/api/casino`, `/api/auth/*`).
- **Baza danych**: SQLite (`better-sqlite3`) z migracjami Drizzle (`/data/casino.db`).
- **Autentykacja**: OpenID Connect (OIDC) zintegrowany z Authentik. Bezpieczne sesje cookie podpisane kluczem HMAC SHA-256.

## Moduły autoryzacji

Wszystkie funkcje autoryzacji znajdują się w `@/lib/auth`:
- `getAuthUser()`: Pobiera aktualnie zalogowanego użytkownika (z nagłówków / sesji cookie).
- `requireAuthUser()`: Wymusza zalogowanie, przekierowując do `/api/auth/login`.
- `authSignInPath()`: Zwraca ścieżkę logowania (`/api/auth/login`).
- `authSignOutPath()`: Zwraca ścieżkę wylogowania (`/api/auth/logout`).

## Uruchamianie

### Docker (zalecane w produkcji)

```bash
docker compose up -d --build
```

Aplikacja będzie dostępna pod adresem: `http://localhost:3000`.

### Lokalnie z PNPM

```bash
pnpm install
pnpm run dev
```

### Zmienne środowiskowe (.env)

```env
APP_URL=http://localhost:3000
DATABASE_PATH=/app/data/casino.db
SESSION_SECRET=kasyno-2fgt-secret-key-replace-in-env-production-32-chars

# Authentik OIDC
AUTHENTIK_ISSUER=https://auth.2fgt.pl/application/o/kasyno
AUTHENTIK_CLIENT_ID=kasyno-client-id
AUTHENTIK_CLIENT_SECRET=kasyno-client-secret
AUTHENTIK_REDIRECT_URI=https://kasyno.2fgt.pl/api/auth/callback
```
