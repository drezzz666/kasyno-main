import React from "react";
import { Swords } from "lucide-react";

export function RPSTable({
  choice,
  setChoice,
  last,
  loading,
  isShooting,
}) {
  const p = last?.payload || {};
  const [dirtyChoice, setDirtyChoice] = React.useState(false);

  // Reset dirtyChoice whenever a new round finishes
  React.useEffect(() => {
    setDirtyChoice(false);
  }, [last]);

  const handleSelectChoice = (id) => {
    setDirtyChoice(true);
    setChoice(id);
  };

  const isBusy = isShooting || loading;
  const playerChoice = choice || p.player_choice;
  const houseChoice = isBusy ? null : (p.house_choice || null);
  const outcome = (isBusy || dirtyChoice) ? null : p.outcome; // "win", "tie", "loss"

  const iconMap = {
    rock: "✊",
    paper: "✋",
    scissors: "✌️",
  };

  const nameMap = {
    rock: "Kamień",
    paper: "Papier",
    scissors: "Nożyce",
  };

  return (
    <div className="rps-arena w-full max-w-sm sm:max-w-md mx-auto flex flex-col items-center justify-center gap-2.5 sm:gap-3.5 p-2 sm:p-4 select-none">
      {/* Krupier (House) - Top Fighter Card */}
      <div className={`rps-fighter-card house w-full ${isShooting ? "shaking-house" : ""} ${outcome === "loss" ? "winner" : outcome === "win" ? "loser" : ""}`}>
        <span className="rps-fighter-label">Krupier</span>
        <div className="rps-gesture-icon">
          {isShooting ? "❓" : (houseChoice ? (iconMap[houseChoice] || "✌️") : "❓")}
        </div>
        <span className="rps-gesture-name">
          {isShooting ? "Wybieranie…" : (houseChoice ? (nameMap[houseChoice] || houseChoice) : "Oczekuje")}
        </span>
      </div>

      {/* VS Badge in the center */}
      <div className="rps-vs-badge flex items-center justify-center gap-2 py-1 px-3.5 rounded-full bg-[#101622] border border-slate-700/80 shadow-md">
        <Swords size={20} className={isShooting ? "animate-spin text-amber-400" : "text-amber-400"} />
        <span className="text-[11px] font-mono font-black text-slate-300 tracking-wider">VS</span>
      </div>

      {/* Twój wybór (Player) - Bottom Fighter Card */}
      <div className={`rps-fighter-card w-full ${isShooting ? "shaking" : ""} ${outcome === "win" ? "winner" : outcome === "loss" ? "loser" : ""}`}>
        <span className="rps-fighter-label">Twój wybór</span>
        <div className="rps-gesture-icon">{playerChoice ? (iconMap[playerChoice] || "✊") : "❓"}</div>
        <span className="rps-gesture-name">{playerChoice ? (nameMap[playerChoice] || playerChoice) : "Wybierz w panelu"}</span>
      </div>
    </div>
  );
}
