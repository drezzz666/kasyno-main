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
  { val: 5, label: "+5", color: "from-slate-600 to-slate-500", border: "border-slate-400/40" },
  { val: 10, label: "+10", color: "from-blue-600 to-cyan-500", border: "border-cyan-400/40" },
  { val: 25, label: "+25", color: "from-emerald-600 to-teal-500", border: "border-emerald-400/40" },
  { val: 50, label: "+50", color: "from-indigo-600 to-violet-500", border: "border-indigo-400/40" },
  { val: 100, label: "+100", color: "from-purple-600 to-pink-500", border: "border-pink-400/40" },
  { val: 500, label: "+500", color: "from-amber-600 to-yellow-500", border: "border-amber-400/40" },
];

export function BetControl({ bet, setBet, maxBalance = 0, turbo, setTurbo }) {
  const userBalance = typeof maxBalance === "number" && !isNaN(maxBalance) ? Math.max(0, maxBalance) : 0;
  const safeMax = userBalance > 0 ? userBalance : 1000000;

  const [inputVal, setInputVal] = React.useState(String(bet ?? 1));

  React.useEffect(() => {
    setInputVal(String(bet ?? 1));
  }, [bet]);

  const handleBetChange = (raw) => {
    // Allow empty string while user is deleting/editing
    if (raw === "") {
      setInputVal("");
      return;
    }

    const val = Number(raw);
    if (!isNaN(val)) {
      setInputVal(raw);
      if (val >= 1) {
        setBet(userBalance > 0 ? Math.min(userBalance, val) : val);
      }
    }
  };

  const handleBlur = () => {
    const val = Number(inputVal);
    if (isNaN(val) || val < 1) {
      setBet(1);
      setInputVal("1");
    } else if (userBalance > 0 && val > userBalance) {
      setBet(userBalance);
      setInputVal(String(userBalance));
    } else {
      setBet(val);
      setInputVal(String(val));
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

      {/* Spacious Full-Width Bet Input Bar */}
      <div className="casino-bet-input-wrap">
        <div className="casino-bet-prefix" aria-hidden="true">
          <span className="casino-bet-prefix-symbol">$FGT</span>
        </div>

        <input
          type="number"
          min="1"
          max={userBalance > 0 ? userBalance : undefined}
          value={inputVal}
          onChange={(e) => handleBetChange(e.target.value)}
          onBlur={handleBlur}
          className="casino-bet-input"
          placeholder="Stawka..."
          aria-label="Kwota zakładu w $FGT"
        />

        <div className="casino-bet-quick-actions">
          <button
            type="button"
            tabIndex={-1}
            className="casino-bet-quick-btn"
            onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))}
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
          title="Minimalna stawka (10 $FGT)"
          aria-label="Minimalna stawka 10 $FGT"
        >
          <span className="casino-chip-inner">
            <span className="casino-chip-label">MIN</span>
          </span>
        </button>

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
              <span className="casino-chip-label">{chip.label}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
