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
  const currentChoice = isShooting ? choice : (choice || p.player_choice);
  const playerChoice = currentChoice;
  const houseChoice = isShooting ? "rock" : (p.house_choice || null);
  const outcome = p.outcome; // "win", "tie", "loss"

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
    <div className="rps-container">
      {/* Showdown Arena */}
      <div className="rps-arena">
        <div className={`rps-fighter-card ${isShooting ? "shaking" : ""} ${outcome === "win" ? "winner" : ""}`}>
          <span className="rps-fighter-label">Twój wybór</span>
          <div className="rps-gesture-icon">{playerChoice ? (iconMap[playerChoice] || "✊") : "❓"}</div>
          <span className="rps-gesture-name">{playerChoice ? (nameMap[playerChoice] || playerChoice) : "Wybierz poniżej"}</span>
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

      {/* Choice Selector */}
      <div className="rps-choices-panel">
        <span className="text-xs uppercase tracking-wider font-bold text-slate-400 text-center">
          Wybierz swój gest przed rozpoczęciem:
        </span>
        <div className="rps-choices-grid">
          {[
            { id: "rock", icon: "✊", name: "Kamień", beats: "bije Nożyce" },
            { id: "paper", icon: "✋", name: "Papier", beats: "bije Kamień" },
            { id: "scissors", icon: "✌️", name: "Nożyce", beats: "bije Papier" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={loading || isShooting}
              className={`rps-choice-btn ${choice === item.id ? "active" : ""}`}
              onClick={() => setChoice(item.id)}
            >
              <span className="text-2xl">{item.icon}</span>
              <strong className="text-xs font-bold text-white">{item.name}</strong>
              <span className="text-[9px] text-slate-400">{item.beats}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
