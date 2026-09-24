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
  setTarget,
  last,
  loading,
  animating,
  displayMult,
}) {
  const winChance = Math.min(64.0, (96.0 / Math.max(1.50, target))).toFixed(2);
  const outcome = last?.payload?.result_multiplier;
  const isSettled = Boolean(last && !animating);
  const isWin = isSettled && Boolean(last?.payload?.won);

  const adjustTarget = (delta) => {
    setTarget((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      return Math.min(10000, Math.max(1.50, next));
    });
  };

  const scaleTarget = (factor) => {
    setTarget((prev) => {
      const next = Math.round(prev * factor * 10) / 10;
      return Math.min(10000, Math.max(1.50, next));
    });
  };

  return (
    <div className="limbo-container">
      {/* Visual Arena */}
      <div className="limbo-arena">
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
            ? `${(displayMult || 1.0).toFixed(2)}x`
            : outcome
              ? `${Number(outcome).toFixed(2)}x`
              : "1.00x"}
        </div>

        {/* Target Badge */}
        <div className="limbo-target-badge">
          <span className="limbo-target-label">CEL:</span>
          <span className="limbo-target-val">{target.toFixed(2)}×</span>
        </div>
      </div>

      {/* Target & Win Chance Configuration */}
      <div className="limbo-controls-grid">
        <div className="limbo-config-card">
          <div className="limbo-config-header">
            <span className="limbo-config-title">
              <Target size={14} className="text-amber-400" />
              <span>Wybór Mnożnika Docelowego</span>
            </span>
            <span className="limbo-config-sub">Min: 1.50× | Max: 10,000×</span>
          </div>

          {/* Stepper / Multiplier Display Bar */}
          <div className="limbo-stepper-row">
            <button
              type="button"
              disabled={loading || animating || target <= 1.50}
              className="limbo-step-btn"
              onClick={() => adjustTarget(-0.1)}
              title="-0.1x"
            >
              -0.1×
            </button>
            <button
              type="button"
              disabled={loading || animating || target <= 1.50}
              className="limbo-step-btn"
              onClick={() => scaleTarget(0.5)}
              title="Połowa (½)"
            >
              ½
            </button>

            <div className="limbo-target-display">
              <span className="limbo-target-display-val">{target.toFixed(2)}</span>
              <span className="limbo-target-display-suffix">×</span>
            </div>

            <button
              type="button"
              disabled={loading || animating || target >= 10000}
              className="limbo-step-btn"
              onClick={() => scaleTarget(2)}
              title="Podwój (2×)"
            >
              2×
            </button>
            <button
              type="button"
              disabled={loading || animating || target >= 10000}
              className="limbo-step-btn"
              onClick={() => adjustTarget(0.1)}
              title="+0.1x"
            >
              +0.1×
            </button>
          </div>

          {/* Multiplier Preset Buttons Grid */}
          <div className="limbo-buttons-grid">
            {TARGET_PRESETS.map((p) => {
              const isActive = Math.abs(target - p.val) < 0.001;
              return (
                <button
                  key={p.val}
                  type="button"
                  disabled={loading || animating}
                  className={`limbo-preset-btn ${isActive ? "active" : ""}`}
                  onClick={() => setTarget(p.val)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="limbo-stats-card">
          <div className="limbo-stat-row">
            <span className="limbo-stat-label">Szansa na wygraną:</span>
            <span className="limbo-stat-value text-emerald-400 font-mono">
              {winChance}%
            </span>
          </div>
          <div className="limbo-stat-row">
            <span className="limbo-stat-label">RTP Gry:</span>
            <span className="limbo-stat-value text-slate-300 font-mono">
              96.0% (Provably Fair)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
