# Mini-gry Kasyna (`frontend/src/minigames`)

Ten katalog zawiera system modułowych minigier (np. Captcha Faucet, Koło Fortuny itp.).

## Struktura plików
- `registry.js` - Rejestr i lista metadanych wszystkich dostępnych minigier.
- `MinigamesModal.jsx` - Uniwersalny kontener/modal wyświetlający aktywną minigrę lub pasek wyboru minigier.
- `CaptchaMinigame.jsx` - Komponent mini-gry Captcha.
- `index.js` - Główny export modułu minigier.

## Jak dodać nową minigrę w przyszłości:

1. **Stwórz komponent minigry**:
   Utwórz nowy plik w tym katalogu, np. `WheelMinigame.jsx`:
   ```jsx
   import React from "react";
   
   export function WheelMinigame({ syncBalance, currentBalance, onClose }) {
     return (
       <div className="wheel-minigame">
         {/* Logika Twojej minigry */}
       </div>
     );
   }
   ```

2. **Zarejestruj minigrę w `registry.js`**:
   Dodaj wpis do tablicy `MINIGAMES`:
   ```javascript
   import { WheelMinigame } from "./WheelMinigame";
   import { Gift } from "lucide-react";
   
   export const MINIGAMES = [
     // ...
     {
       id: "wheel",
       name: "Koło Fortuny",
       shortName: "Koło",
       badge: "Co 24h",
       reward: "Do 500 $FGT",
       desc: "Zakręć kołem i zgarnij darmowe żetony.",
       icon: Gift,
       iconColor: "text-emerald-400",
       component: WheelMinigame,
       active: true,
     },
   ];
   ```

3. **Gotowe!**
   Nowa minigra pojawi się automatycznie w modalu minigier i będzie dostępna dla graczy.
