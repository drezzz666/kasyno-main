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
    <div className="rps-container w-full flex items-center justify-center">
      {/* Showdown Arena */}
      <div className="rps-arena w-full">
        <div className={`rps-fighter-card ${isShooting ? "shaking" : ""} ${outcome === "win" ? "winner" : ""}`}>
          <span className="rps-fighter-label">Twój wybór</span>
          <div className="rps-gesture-icon">{playerChoice ? (iconMap[playerChoice] || "✊") : "❓"}</div>
          <span className="rps-gesture-name">{playerChoice ? (nameMap[playerChoice] || playerChoice) : "Wybierz w panelu"}</span>
        </div>

        <div className="rps-vs-badge">
          <Swords size={20} className={isShooting ? "animate-spin text-amber-400" : "text-slate-400"} />
          <span className="text-[10px] font-mono font-bold text-slate-400">VS</span>
        </div>

        <div className={`rps-fighter-card house ${isShooting ? "shaking-house" : ""} ${outcome === "loss" ? "winner" : ""}`}>
          <span className="rps-fighter-label">Krupier</span>
          <div className="rps-gesture-icon">
            {isShooting ? "❓" : (houseChoice ? (iconMap[houseChoice] || "✌️") : "❓")}
          </div>
          <span className="rps-gesture-name">
            {isShooting ? "Wybieranie…" : (houseChoice ? (nameMap[houseChoice] || houseChoice) : "Oczekuje")}
          </span>
        </div>
      </div>
    </div>
  );
}
