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
    badge: "+80 $FGT",
    reward: "+80 $FGT",
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
