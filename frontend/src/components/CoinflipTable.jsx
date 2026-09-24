import React from "react";

export function CoinflipTable({
  choice,
  setChoice,
  last,
  loading,
  isFlipping,
}) {
  const p = last?.payload || {};
  const outcome = p.outcome;
  const currentSide = isFlipping ? "" : (outcome || choice || "heads");

  return (
    <div className="coinflip-container">
      {/* 3D Coin Arena */}
      <div className="coin-arena">
        <div className={`coin-3d ${isFlipping ? "flipping" : ""} ${!isFlipping && currentSide ? `show-${currentSide}` : "show-heads"}`}>
          <div className="coin-face coin-front">
            <div className="coin-ring">
              <span className="coin-symbol">🦅</span>
              <span className="coin-text">ORZEŁ</span>
            </div>
          </div>
          <div className="coin-face coin-back">
            <div className="coin-ring">
              <span className="coin-symbol">👑</span>
              <span className="coin-text">RESZKA</span>
            </div>
          </div>
        </div>
      </div>

      {/* Choice Selector */}
      <div className="coinflip-controls">
        <span className="text-xs sm:text-sm uppercase tracking-wider font-bold text-slate-400 text-center">
          Wybierz stronę monety:
        </span>
        <div className="coin-choices-row">
          <button
            type="button"
            disabled={loading || isFlipping}
            className={`coin-choice-btn ${choice === "heads" ? "active" : ""}`}
            onClick={() => setChoice("heads")}
          >
            <span className="text-2xl sm:text-3xl">🦅</span>
            <div className="flex flex-col text-left">
              <strong className="text-sm sm:text-base font-bold">Orzeł (Heads)</strong>
              <span className="text-[11px] sm:text-xs text-amber-400 font-mono font-semibold">Mnożnik ×1.98</span>
            </div>
          </button>

          <button
            type="button"
            disabled={loading || isFlipping}
            className={`coin-choice-btn ${choice === "tails" ? "active" : ""}`}
            onClick={() => setChoice("tails")}
          >
            <span className="text-2xl sm:text-3xl">👑</span>
            <div className="flex flex-col text-left">
              <strong className="text-sm sm:text-base font-bold">Reszka (Tails)</strong>
              <span className="text-[11px] sm:text-xs text-amber-400 font-mono font-semibold">Mnożnik ×1.98</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
