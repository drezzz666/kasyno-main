import React, { useState } from "react";
import { Target } from "lucide-react";

const TARGET_PRESETS = [
  { label: "1.50×", val: 1.5 },
  { label: "2.00×", val: 2.0 },
  { label: "3.00×", val: 3.0 },
  { label: "5.00×", val: 5.0 },
  { label: "10.0×", val: 10.0 },
  { label: "20.0×", val: 20.0 },
  { label: "50.0×", val: 50.0 },
  { label: "100×", val: 100.0 },
  { label: "500×", val: 500.0 },
  { label: "1000×", val: 1000.0 },
  { label: "5000×", val: 5000.0 },
];

export function LimboTable({
  target,
  last,
  animating,
  displayMult,
}) {
  const outcome = last?.payload?.result_multiplier;
  const isSettled = Boolean(last && !animating);
  const isWin = isSettled && Boolean(last?.payload?.won);

  return (
    <div className="limbo-container w-full flex items-center justify-center">
      {/* Visual Arena */}
      <div className="limbo-arena w-full">
        {/* Glow effect */}
        <div
          className={`limbo-glow-aura ${
            animating
              ? "animating"
              : isSettled
                ? isWin
                  ? "winner"
                  : "loser"
                : "idle"
          }`}
        />

        {/* Central Multiplier Ticker */}
        <div
          className={`limbo-main-ticker ${
            animating
              ? "rolling"
              : isSettled
                ? isWin
                  ? "win-text"
                  : "loss-text"
                : ""
          }`}
        >
          {animating
            ? `${(Number(displayMult) || 1.0).toFixed(2)}x`
            : outcome !== undefined && outcome !== null
              ? `${(Number(outcome) || 1.0).toFixed(2)}x`
              : "1.00x"}
        </div>

        {/* Target Badge */}
        <div className="limbo-target-badge">
          <span className="limbo-target-label">CEL:</span>
          <span className="limbo-target-val">{(Number(target) || 2.0).toFixed(2)}×</span>
        </div>
      </div>
    </div>
  );
}
