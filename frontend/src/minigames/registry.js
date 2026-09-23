import { ShieldCheck, Sparkles, Gift, Dices } from "lucide-react";
import { CaptchaMinigame } from "./CaptchaMinigame";

/**
 * Registry of all available Mini-Games.
 * To add a new minigame in the future:
 * 1. Create a component in `src/minigames/YourGame.jsx`
 * 2. Add an entry below in `MINIGAMES` array
 */
export const MINIGAMES = [
  {
    id: "captcha",
    name: "Captcha Faucet",
    shortName: "Captcha",
    badge: "+40 $FGT",
    reward: "+40 $FGT",
    desc: "Przepisz kod z obrazka i odbierz darmowe żetony.",
    icon: ShieldCheck,
    iconColor: "text-amber-400",
    component: CaptchaMinigame,
    active: true,
  },
  {
    id: "wheel",
    name: "Koło Fortuny",
    shortName: "Koło",
    badge: "Wkrótce",
    reward: "Do 500 $FGT",
    desc: "Darmowe zakręcenie kołem raz na 24h.",
    icon: Gift,
    iconColor: "text-emerald-400",
    component: null,
    active: false,
    comingSoon: true,
  },
  {
    id: "scratch",
    name: "Zdrapka",
    shortName: "Zdrapka",
    badge: "Wkrótce",
    reward: "Do 1000 $FGT",
    desc: "Dopasuj 3 symbole i zgarnij nagrodę.",
    icon: Sparkles,
    iconColor: "text-purple-400",
    component: null,
    active: false,
    comingSoon: true,
  },
  {
    id: "dice_faucet",
    name: "Kostka XP",
    shortName: "Kostka",
    badge: "Wkrótce",
    reward: "Mnożnik XP",
    desc: "Rzuć kostką i zgarnij booster punktów poziomu.",
    icon: Dices,
    iconColor: "text-sky-400",
    component: null,
    active: false,
    comingSoon: true,
  },
];

export function getMinigameById(id) {
  return MINIGAMES.find((m) => m.id === id) || MINIGAMES[0];
}
