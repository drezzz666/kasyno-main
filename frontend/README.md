# 2fgt Casino Modern Frontend (Pure JavaScript / React)

Nowoczesny, responsywny interfejs kasyna społecznościowego stworzony w **czystym JavaScript (React JSX)**, **Vite** i **Tailwind CSS 4**, zaprojektowany zgodnie z zasadami **No AI Slop** (ciemny, matowy motyw obsydianowy, szmaragdowe i złote akcenty, fizyczne kontrolki, brak generycznych haseł).

---

## Główne cechy

1. **Czysty JavaScript (Zero TypeScript overhead)**:
   - Kod w plikach `.jsx` / `.js`.
   - Błyskawiczny czas budowania w Vite (~3 sekundy).
2. **Modułowa architektura**:
   - `src/components/RouletteTable.jsx` – koło ruletki w CSS/SVG + siatka zakładów.
   - `src/components/BlackjackTable.jsx` – stół do blackjacka z kartami i punktacją.
   - `src/components/MinesTable.jsx` – plansza 5×5 z kryształami i minami.
   - `src/components/SlotsTable.jsx` – automat 5×3 Midnight 2fgt.
   - `src/components/BetControls.jsx` – suwaki i przyciski stawek (`+10`, `+50`, `+100`, `+500`, `½`, `2×`).
   - `src/components/LiveTicker.jsx` – pasek wygranych na żywo przez WebSockets.
3. **Komunikacja**:
   - Bezpośrednia łączność z backendem Go przez REST (`/api/casino`, `/api/auth`) oraz WebSockets (`/ws`).
4. **Wydajny obraz produkcyjny**:
   - Dwuetapowy Dockerfile z Nginx Alpine (~20 MB).

---

## Uruchomienie lokalne

```bash
cd frontend
pnpm install
pnpm dev
```

Aplikacja uruchomi się pod adresem: `http://localhost:3000` (z automatycznym proxy do Go backendu na `localhost:8080`).

---

## Budowanie do produkcji

```bash
pnpm build
```

Wynikowe zoptymalizowane pliki statyczne znajdą się w folderze `dist/`.
