# Budowanie 2fgt Casino

Wymagany jest Node.js `22.13+` oraz pnpm.

## Instalacja zależności

```powershell
cd "$env:USERPROFILE\Desktop\kasyno-2fgt-full-src"
corepack enable
pnpm install --frozen-lockfile
```

## Build produkcyjny

```powershell
pnpm run build
```

Wynik builda znajduje się w folderze `dist`.

## Uruchomienie lokalnego builda

```powershell
pnpm start -- --port 4174
```

## Tryb developerski

```powershell
pnpm dev
```
