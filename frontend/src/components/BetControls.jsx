import React from "react";
import { Zap } from "lucide-react";
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

export function BetControl({ bet, setBet, maxBalance = 0, turbo, setTurbo }) {
  const userBalance = typeof maxBalance === "number" && !isNaN(maxBalance) ? Math.max(0, maxBalance) : 0;
  const safeMax = userBalance > 0 ? userBalance : 1000000;

  const handleBetChange = (raw) => {
    const val = Number(raw);
    if (!isNaN(val)) {
      setBet(Math.max(1, userBalance > 0 ? Math.min(userBalance, val) : val));
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
          {typeof turbo === "boolean" && (
            <button
              type="button"
              className={`turbo-toggle-btn ${turbo ? "active" : ""}`}
              onClick={() => setTurbo(!turbo)}
              title={turbo ? "Tryb Turbo aktywny (błyskawiczne animacje)" : "Włącz tryb Turbo (błyskawiczne animacje)"}
            >
              <Zap size={11} />
              <span>Turbo</span>
            </button>
          )}
          <span>Saldo:</span>
          <strong className="text-amber-400">{money(userBalance)}</strong>
        </div>
      </div>


      <div className="casino-bet-input-wrap">
        <div className="casino-bet-actions-left">
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-mod-btn"
            onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))}
            title="Zmniejsz o połowę"
            aria-label="Podziel stawkę przez 2"
          >
            ½
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-mod-btn"
            onClick={() => setBet(userBalance > 0 ? Math.min(userBalance, bet * 2) : bet * 2)}
            title="Podwój stawkę"
            aria-label="Podwój stawkę"
          >
            2×
          </button>
        </div>

        <div className="casino-bet-field">
          <input
            type="number"
            min="1"
            max={userBalance > 0 ? userBalance : undefined}
            value={bet}
            onChange={(e) => handleBetChange(e.target.value)}
            className="casino-bet-input"
            aria-label="Kwota zakładu w $FGT"
          />
          <span className="casino-bet-currency" aria-hidden="true">$FGT</span>
        </div>

        <div className="casino-bet-actions-right">
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-mod-btn min-btn"
            onClick={() => setBet(10)}
            title="Minimalna stawka (10 $FGT)"
            aria-label="Ustaw minimalną stawkę 10 $FGT"
          >
            MIN
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-mod-btn max-btn"
            onClick={() => setBet(userBalance > 0 ? userBalance : 10)}
            title="Maksymalna stawka"
            aria-label={`Ustaw maksymalną stawkę ${money(userBalance)} $FGT`}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Tactile Poker Chips Row */}
      <div className="casino-chips-grid" role="group" aria-label="Szybkie dodawanie do stawki">
        {CHIP_PRESETS.map((chip) => (
          <button
            key={chip.val}
            type="button"
            tabIndex={-1}
            className={`casino-chip-item bg-gradient-to-b ${chip.color} ${chip.border}`}
            onClick={() => setBet(userBalance > 0 ? Math.min(userBalance, bet + chip.val) : bet + chip.val)}
            aria-label={`Dodaj ${chip.val} $FGT do stawki`}
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
