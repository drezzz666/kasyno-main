import React from "react";
import { Target } from "lucide-react";

export const LIMBO_PRESETS = [
  { label: "1.50×", val: 1.5 },
  { label: "2.00×", val: 2.0 },
  { label: "3.00×", val: 3.0 },
  { label: "5.00×", val: 5.0 },
  { label: "10.0×", val: 10.0 },
  { label: "20.0×", val: 20.0 },
  { label: "50.0×", val: 50.0 },
  { label: "100×", val: 100.0 },
];

export function LimboTable({
  target = 2.0,
  setTarget,
  last,
  animating = false,
  displayMult = 1.0,
  loading = false,
  bet = 0,
}) {
  const outcome = last?.payload?.result_multiplier;
  const isSettled = Boolean(last && !animating);
  const isWin = isSettled && Boolean(last?.payload?.won);

  const numTarget = Math.max(1.5, Math.min(10000, Number(target) || 2.0));
  const rawChance = Math.min(95.0, Math.max(0.01, 96.0 / numTarget));
  const winChance = rawChance.toFixed(2);
  const potentialWin = Math.floor((Number(bet) || 0) * numTarget);

  return (
    <div className="limbo-container w-full max-w-xl mx-auto flex flex-col items-center justify-center gap-3 sm:gap-4 p-2 select-none my-auto">
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
          <span className="limbo-target-val">{numTarget.toFixed(2)}×</span>
        </div>
      </div>

      {/* Prominent Multiplier Preset Console */}
      <div className="w-full bg-[#0c121d]/90 border border-slate-800 shadow-xl rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 backdrop-blur-sm">
        {/* Header: Title & Win Chance / Payout */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300">
            <Target size={15} className="text-blue-400" />
            <span>Wybierz Mnożnik</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400">Szansa:</span>
            <span className="text-emerald-400 font-black">{winChance}%</span>
            {potentialWin > 0 && (
              <>
                <span className="text-slate-600 hidden xs:inline">•</span>
                <span className="text-slate-400 hidden xs:inline">Wygrana:</span>
                <span className="text-blue-400 font-black hidden xs:inline">{potentialWin} ₽</span>
              </>
            )}
          </div>
        </div>

        {/* 8 Prominent Preset Buttons (4 cols on mobile, 8 cols on desktop) */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2 w-full">
          {LIMBO_PRESETS.map((p) => {
            const isSelected = Math.abs(numTarget - p.val) < 0.01;
            return (
              <button
                key={p.val}
                type="button"
                disabled={loading || animating}
                onClick={() => setTarget && setTarget(p.val)}
                className={`h-11 sm:h-12 rounded-xl font-mono font-black text-xs sm:text-sm md:text-base transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
                  isSelected
                    ? "bg-blue-600 text-white border-2 border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.45)] scale-102"
                    : "bg-[#141b27] hover:bg-[#1e293b] text-slate-200 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Fine-tuning Stepper & Custom Multiplier Input */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            disabled={loading || animating || numTarget <= 1.5}
            onClick={() => setTarget && setTarget(Math.max(1.5, Math.round((numTarget - 0.1) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="-0.1×"
          >
            -0.1×
          </button>
          <button
            type="button"
            disabled={loading || animating || numTarget <= 1.5}
            onClick={() => setTarget && setTarget(Math.max(1.5, Math.round((numTarget * 0.5) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="½"
          >
            ½
          </button>
          <div className="relative flex-1 flex items-center">
            <input
              type="number"
              step="0.05"
              min="1.50"
              max="10000"
              value={target}
              disabled={loading || animating}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setTarget && setTarget(isNaN(v) ? "" : v);
              }}
              onBlur={() => {
                setTarget && setTarget((t) => Math.max(1.5, Math.min(10000, Number(t) || 2.0)));
              }}
              className="w-full h-10 px-3 pr-8 rounded-lg bg-[#0a0f18] border border-slate-700/90 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-blue-500 shadow-inner"
              placeholder="Własny mnożnik..."
            />
            <span className="absolute right-3 text-xs font-black text-slate-400 pointer-events-none">×</span>
          </div>
          <button
            type="button"
            disabled={loading || animating || numTarget >= 10000}
            onClick={() => setTarget && setTarget(Math.min(10000, Math.round((numTarget * 2) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="2×"
          >
            2×
          </button>
          <button
            type="button"
            disabled={loading || animating || numTarget >= 10000}
            onClick={() => setTarget && setTarget(Math.min(10000, Math.round((numTarget + 0.1) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="+0.1×"
          >
            +0.1×
          </button>
        </div>
      </div>
    </div>
  );
}

