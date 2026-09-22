import React from "react";
import { money } from "../lib/formatters";

export function FgtChip({ small = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold font-mono tracking-tighter ${
        small ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]"
      } bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 text-amber-950 border border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)] ${className}`}
      aria-hidden="true"
    >
      $
    </span>
  );
}

const CHIP_PRESETS = [
  { val: 10, label: "+10", color: "from-blue-600 to-cyan-500", border: "border-cyan-400/40" },
  { val: 50, label: "+50", color: "from-emerald-600 to-teal-500", border: "border-emerald-400/40" },
  { val: 100, label: "+100", color: "from-purple-600 to-pink-500", border: "border-pink-400/40" },
  { val: 500, label: "+500", color: "from-amber-600 to-yellow-500", border: "border-amber-400/40" },
  { val: 1000, label: "+1K", color: "from-rose-600 to-red-500", border: "border-rose-400/40" },
];

export function BetControl({ bet, setBet, maxBalance = 1000000 }) {
  const safeMax = Math.max(1, maxBalance);

  const handleBetChange = (raw) => {
    const val = Number(raw);
    if (!isNaN(val)) {
      setBet(Math.max(1, Math.min(safeMax, val)));
    }
  };

  return (
    <div className="casino-bet-controller">
      <div className="casino-bet-header">
        <div className="casino-bet-title">
          <FgtChip small />
          <span>STAWKA ZAKŁADU</span>
        </div>
        <div className="casino-bet-balance-hint">
          <span>Max:</span>
          <strong className="text-amber-400">{money(safeMax)}</strong>
        </div>
      </div>

      <div className="casino-bet-input-wrap">
        <div className="casino-bet-actions-left">
          <button
            type="button"
            className="casino-bet-mod-btn"
            onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))}
            title="Zmniejsz o połowę"
          >
            ½
          </button>
          <button
            type="button"
            className="casino-bet-mod-btn"
            onClick={() => setBet(Math.min(safeMax, bet * 2))}
            title="Podwój stawkę"
          >
            2×
          </button>
        </div>

        <div className="casino-bet-field">
          <input
            type="number"
            min="1"
            max={safeMax}
            value={bet}
            onChange={(e) => handleBetChange(e.target.value)}
            className="casino-bet-input"
            aria-label="Kwota zakładu"
          />
          <span className="casino-bet-currency">$FGT</span>
        </div>

        <div className="casino-bet-actions-right">
          <button
            type="button"
            className="casino-bet-mod-btn min-btn"
            onClick={() => setBet(10)}
            title="Minimalna stawka (10 $FGT)"
          >
            MIN
          </button>
          <button
            type="button"
            className="casino-bet-mod-btn max-btn"
            onClick={() => setBet(safeMax)}
            title="Maksymalna stawka"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Tactile Poker Chips Row */}
      <div className="casino-chips-grid">
        {CHIP_PRESETS.map((chip) => (
          <button
            key={chip.val}
            type="button"
            className={`casino-chip-item bg-gradient-to-b ${chip.color} ${chip.border}`}
            onClick={() => setBet(Math.min(safeMax, bet + chip.val))}
          >
            <span className="casino-chip-inner">
              <span className="casino-chip-dash" />
              <span className="casino-chip-label">{chip.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
