import { ShieldCheck, Package } from "lucide-react";
import { CaptchaMinigame } from "./CaptchaMinigame";
import { MusorDropMinigame } from "./MusorDropMinigame";

/**
 * Registry of all available Mini-Games.
 * To add a new minigame in the future:
 * 1. Create a component in `src/minigames/YourGame.jsx`
 * 2. Add an entry below in `MINIGAMES` array
 */
export const MINIGAMES = [
  {
    id: "musordrop",
    name: "Musor Drop",
    shortName: "Drop",
    badge: "Do 100 000 ₽",
    reward: "Do 100 000 ₽",
    desc: "Otwieraj skrzynki dzienne, kupuj wersje premium i odbieraj skrzynki za poziom!",
    img: "/musor-drop-hero.webp",
    icon: Package,
    iconColor: "text-amber-400",
    component: MusorDropMinigame,
    active: true,
  },
  {
    id: "captcha",
    name: "Captcha Faucet",
    shortName: "Captcha",
    badge: "+80 ₽",
    reward: "+80 ₽",
    desc: "Przepisz kod z obrazka i odbierz darmowe żetony.",
    img: "/captcha-hero.webp",
    icon: ShieldCheck,
    iconColor: "text-amber-400",
    component: CaptchaMinigame,
    active: true,
  },
];

export function getMinigameById(id) {
  return MINIGAMES.find((m) => m.id === id) || MINIGAMES[0];
}
