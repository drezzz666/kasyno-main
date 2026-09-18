# 2fgt Casino (zagraj.2fgt.pl)

Prywatny klub gier na wirtualne żetony (Social Casino) oparty na Next.js 16, SQLite (`better-sqlite3` + Drizzle ORM) oraz logowaniu OIDC (Authentik).

## Architektura

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS.
- **Backend / API**: Next.js Server Components & Route Handlers (`/api/casino`, `/api/auth/*`).
- **Baza danych**: SQLite (`better-sqlite3`) z Drizzle ORM (plik `casino.db`).
- **Autentykacja**: OpenID Connect (OIDC) z automatycznym Discovery (`.well-known/openid-configuration`) zintegrowany z Authentik. Bezpieczne sesje cookie HMAC SHA-256.

## Moduły autoryzacji

Wszystkie funkcje autoryzacji znajdują się w [`lib/auth/index.ts`](file:///home/techus/kasyno.2fgt.pl/lib/auth/index.ts):
- `getAuthUser()`: Pobiera aktualnie zalogowanego użytkownika (z nagłówków / sesji cookie).
- `requireAuthUser()`: Wymusza zalogowanie, przekierowując do `/api/auth/login`.
- `authSignInPath()`: Zwraca ścieżkę logowania (`/api/auth/login`).
- `authSignOutPath()`: Zwraca ścieżkę wylogowania (`/api/auth/logout`).

## Konfiguracja w panelu Authentik

W Authentik utwórz Provider (**OAuth2/OpenID Provider**) oraz powiązaną Aplikację:

1. **Client type**: `Confidential`
2. **Redirect URIs**: `https://zagraj.2fgt.pl/api/auth/callback`
3. **Selected Property Mappings (Scopes)** - wymagane 3 mapowania:
   - `authentik default OAuth Mapping: OpenID 'openid'`
   - `authentik default OAuth Mapping: OpenID 'email'`
   - `authentik default OAuth Mapping: OpenID 'profile'`
4. **Application / Bindings**: Przypisz aplikację do użytkowników/grup mających mieć wstęp do kasyna.

## Konfiguracja środowiskowa (`.env`)

Wszystkie endpointy OIDC (`authorize`, `token`, `userinfo`, `end-session`) są automatycznie pobierane z OpenID Configuration wystawianego przez Authentik.

```env
APP_URL=https://zagraj.2fgt.pl
SESSION_SECRET=twoj_tajny_klucz_minimum_32_znaki
AUTHENTIK_CLIENT_ID=twoj_authentik_client_id
AUTHENTIK_CLIENT_SECRET=twoj_authentik_client_secret
AUTHENTIK_ISSUER=https://login.2fgt.pl/application/o/kasyno/

# Opcjonalne
# DATABASE_PATH=/app/data/casino.db
```

## Uruchamianie

### Docker (produkcja)

```bash
docker compose up -d --build
```

### Lokalnie

```bash
npm install
npm run dev
```
