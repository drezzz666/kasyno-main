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
    name: "Rozwiąż Captcha",
    shortName: "Captcha",
    badge: "Darmowe $FGT",
    reward: "+40 $FGT",
    desc: "Przepisz kod lub rozwiąż proste działanie z obrazka, aby zgarnąć darmowe żetony.",
    icon: ShieldCheck,
    iconColor: "text-amber-400",
    component: CaptchaMinigame,
    active: true,
  },
  // Future minigames can be added here easily:
  // {
  //   id: "wheel",
  //   name: "Koło Fortuny",
  //   shortName: "Koło",
  //   badge: "Co 24h",
  //   reward: "Do 500 $FGT",
  //   desc: "Zakręć kołem i wylosuj gwarantowaną nagrodę raz na dobę.",
  //   icon: Gift,
  //   iconColor: "text-emerald-400",
  //   component: WheelMinigame,
  //   comingSoon: true,
  // },
];

export function getMinigameById(id) {
  return MINIGAMES.find((m) => m.id === id) || MINIGAMES[0];
}
