import React from "react";
import { Zap } from "lucide-react";
import { money, formatPLN } from "../lib/formatters";

export function FgtChip({ small = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold font-mono tracking-tighter ${
        small ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]"
      } bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 text-amber-950 border border-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.4)] ${className}`}
      aria-hidden="true"
    >
      zł
    </span>
  );
}

const CHIP_PRESETS = [
  { val: 1, label: "0.01", isSet: true, color: "from-slate-700 to-slate-600", border: "border-slate-500/40" },
  { val: 5, label: "+0.05", color: "from-slate-600 to-slate-500", border: "border-slate-400/40" },
  { val: 10, label: "+0.10", color: "from-blue-600 to-cyan-500", border: "border-cyan-400/40" },
  { val: 50, label: "+0.50", color: "from-emerald-600 to-teal-500", border: "border-emerald-400/40" },
  { val: 100, label: "+1.00", color: "from-indigo-600 to-violet-500", border: "border-indigo-400/40" },
  { val: 500, label: "+5.00", color: "from-amber-600 to-yellow-500", border: "border-amber-400/40" },
];

export function BetControl({ bet = 10, setBet, maxBalance = 0, turbo, setTurbo }) {
  const userBalance = typeof maxBalance === "number" && !isNaN(maxBalance) ? Math.max(0, maxBalance) : 0;

  // Display value in PLN (e.g. "0.10", "1.00", "0.01")
  const toDisplayStr = (cents) => {
    const val = (cents ?? 10) / 100;
    return val.toFixed(2);
  };

  const [inputVal, setInputVal] = React.useState(() => toDisplayStr(bet));

  React.useEffect(() => {
    setInputVal(toDisplayStr(bet));
  }, [bet]);

  const handleBetChange = (raw) => {
    // Allow empty or partial decimal typing like "0.", "0.0"
    setInputVal(raw);
    if (raw === "" || raw === "." || raw.endsWith(".")) {
      return;
    }

    const valPLN = parseFloat(raw);
    if (!isNaN(valPLN) && valPLN >= 0.01) {
      const cents = Math.round(valPLN * 100);
      setBet(userBalance > 0 ? Math.min(userBalance, cents) : cents);
    }
  };

  const handleBlur = () => {
    const valPLN = parseFloat(inputVal);
    if (isNaN(valPLN) || valPLN < 0.01) {
      setBet(1); // 0.01 zł min
      setInputVal("0.01");
    } else {
      let cents = Math.round(valPLN * 100);
      if (userBalance > 0 && cents > userBalance) {
        cents = userBalance;
      }
      setBet(cents);
      setInputVal(toDisplayStr(cents));
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
              <Zap size={12} />
              <span>Turbo</span>
            </button>
          )}
          <span>Saldo:</span>
          <strong className="text-amber-400 font-mono font-bold">{money(userBalance)}</strong>
        </div>
      </div>

      {/* Bet Input Bar */}
      <div className="casino-bet-input-wrap">
        <div className="casino-bet-prefix" aria-hidden="true">
          <span className="casino-bet-prefix-symbol">zł</span>
        </div>

        <input
          type="number"
          step="0.01"
          min="0.01"
          max={userBalance > 0 ? (userBalance / 100).toFixed(2) : undefined}
          value={inputVal}
          onChange={(e) => handleBetChange(e.target.value)}
          onBlur={handleBlur}
          className="casino-bet-input"
          placeholder="0.10"
          aria-label="Kwota zakładu w zł"
        />

        <div className="casino-bet-quick-actions">
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-quick-btn"
            onClick={() => setBet(Math.max(1, Math.round(bet / 2)))}
            title="Zmniejsz stawkę o połowę (½)"
            aria-label="Zmniejsz stawkę o połowę"
          >
            ½
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-quick-btn"
            onClick={() => setBet(userBalance > 0 ? Math.min(userBalance, bet * 2) : bet * 2)}
            title="Podwój stawkę (2×)"
            aria-label="Podwój stawkę"
          >
            2×
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-quick-btn max-btn"
            onClick={() => setBet(userBalance > 0 ? userBalance : 10)}
            title={`Maksymalna stawka (${money(userBalance)})`}
            aria-label="Ustaw maksymalną stawkę"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Quick Increment Chip Presets */}
      <div className="casino-chips-grid" role="group" aria-label="Szybkie dodawanie do stawki">
        <button
          type="button"
          tabIndex={-1}
          className="casino-chip-item min-chip"
          onClick={() => setBet(10)}
          title="Domyślna stawka (0.10 zł)"
        >
          <span className="chip-label">0.10 zł</span>
        </button>

        {CHIP_PRESETS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            tabIndex={-1}
            className="casino-chip-item"
            onClick={() => {
              if (chip.isSet) {
                setBet(chip.val);
              } else {
                const next = (bet || 0) + chip.val;
                setBet(userBalance > 0 ? Math.min(userBalance, next) : next);
              }
            }}
            title={chip.isSet ? `Ustaw ${chip.label} zł` : `Dodaj ${chip.label} zł do stawki`}
          >
            <span className="chip-label">{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
