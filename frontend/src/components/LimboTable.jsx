import React, { useState } from "react";
import { Zap, Target, HelpCircle, Flame } from "lucide-react";

const TARGET_PRESETS = [
  { label: "1.5×", val: 1.5 },
  { label: "2.0×", val: 2.0 },
  { label: "5.0×", val: 5.0 },
  { label: "10×", val: 10.0 },
  { label: "50×", val: 50.0 },
  { label: "100×", val: 100.0 },
  { label: "1000×", val: 1000.0 },
];

export function LimboTable({
  target,
  setTarget,
  last,
  loading,
  animating,
  displayMult,
}) {
  const winChance = Math.min(99.0, (99.0 / Math.max(1.01, target))).toFixed(2);
  const outcome = last?.payload?.result_multiplier;
  const isSettled = Boolean(last && !animating);
  const isWin = isSettled && Boolean(last?.payload?.won);

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
              <span>Docelowy Mnożnik</span>
            </span>
            <span className="limbo-config-sub">Min: 1.01× | Max: 10,000×</span>
          </div>

          <div className="limbo-input-wrap">
            <input
              type="number"
              step="0.1"
              min="1.01"
              max="10000"
              disabled={loading || animating}
              value={target}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 1.01) {
                  setTarget(Math.min(10000, v));
                }
              }}
              className="limbo-target-input"
            />
            <span className="limbo-input-suffix">×</span>
          </div>

          <div className="limbo-presets-row">
            {TARGET_PRESETS.map((p) => (
              <button
                key={p.val}
                type="button"
                disabled={loading || animating}
                className={`limbo-preset-btn ${target === p.val ? "active" : ""}`}
                onClick={() => setTarget(p.val)}
              >
                {p.label}
              </button>
            ))}
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
              99.0% (Provably Fair)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
