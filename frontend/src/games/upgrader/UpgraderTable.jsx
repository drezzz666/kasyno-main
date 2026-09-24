import React, { useState, useEffect, useRef } from "react";
import { money } from "../../lib/formatters";
import { sounds } from "../../lib/sounds";
import { Sparkles, ArrowDown, ArrowUp, Zap, RotateCw } from "lucide-react";

const MULTIPLIER_PRESETS = [
  { label: "1.5×", val: 1.5 },
  { label: "2×", val: 2.0 },
  { label: "3×", val: 3.0 },
  { label: "5×", val: 5.0 },
  { label: "10×", val: 10.0 },
  { label: "20×", val: 20.0 },
  { label: "50×", val: 50.0 },
  { label: "100×", val: 100.0 },
];

export function UpgraderTable({
  bet,
  setBet,
  maxBalance = 0,
  target,
  setTarget,
  rollType,
  setRollType,
  last,
  loading,
  onPlay,
  animatingRef,
  onBusyChange,
  triggerOutcome,
  turbo,
}) {
  const [spinning, setSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [lastOutcome, setLastOutcome] = useState(null);
  const spinTimeoutRef = useRef(null);

  // 96% RTP formula: chance% = 96.0 / target
  const clampedTarget = Math.max(1.05, Math.min(10000, Number(target) || 2.0));
  const rawChance = Math.min(95.0, Math.max(0.01, 96.0 / clampedTarget));
  const winChance = Number(rawChance.toFixed(2));
  const potentialPayout = Math.floor(bet * clampedTarget);

  // When a new round outcome arrives from backend:
  useEffect(() => {
    if (!last || last.game !== "upgrader") return;
    const p = last.payload || {};
    const rolled = p.rolled_number !== undefined ? p.rolled_number : 50.0;
    const isWin = Boolean(last.payout > 0 || p.won);

    setLastOutcome({
      rolled,
      won: isWin,
      payout: last.payout,
      mult: p.target_multiplier || clampedTarget,
      rollType: p.roll_type || rollType,
    });

    // Start spin animation:
    // 0% is at top (0 deg). Roll is 0..100 -> angle is (rolled / 100) * 360 deg.
    // We add 4-6 full spins (1440 - 2160 deg) for dramatic effect.
    setSpinning(true);
    if (animatingRef) animatingRef.current = true;
    if (onBusyChange) onBusyChange(true);

    const spinDuration = turbo ? 700 : 2600;
    const extraSpins = turbo ? 3 : 5;
    const targetAngle = extraSpins * 360 + (rolled / 100) * 360;

    // Reset rotation and trigger smooth spin
    setWheelRotation(targetAngle);

    if (sounds?.playClick) sounds.playClick();

    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    spinTimeoutRef.current = setTimeout(() => {
      setSpinning(false);
      if (animatingRef) animatingRef.current = false;
      if (onBusyChange) onBusyChange(false);

      if (isWin) {
        if (sounds?.playWin) sounds.playWin();
      } else {
        if (sounds?.playLoss) sounds.playLoss();
      }

      if (triggerOutcome) {
        triggerOutcome(last, 0);
      }
    }, spinDuration);

    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, [last?.id]);

  // SVG Arc calculation for winning sector
  // Needle is at top (0°).
  // If rollType === "under": winning arc is [0, winChance% * 3.6 deg]
  // If rollType === "over": winning arc is [(100 - winChance)% * 3.6 deg, 360 deg]
  const radius = 105;
  const circumference = 2 * Math.PI * radius;
  const winStrokeLength = (winChance / 100) * circumference;
  const strokeDashoffset =
    rollType === "under" ? 0 : circumference - winStrokeLength;

  return (
    <div className="upgrader-container flex flex-col w-full max-w-5xl mx-auto select-none p-2 sm:p-4 gap-4">
      {/* Top Main Grid: Left Bet/Multiplier, Center Wheel, Right Target Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Side: Input Hajs & Multipliers (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between p-4 rounded-2xl bg-[#0e1624] border border-slate-800/90 shadow-xl gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Wpisz Hajs (Stawka)
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {money(bet)}
              </span>
            </div>

            {/* Bet Input */}
            <div className="relative flex items-center">
              <input
                type="number"
                min="1"
                max={maxBalance || 1000000}
                value={bet}
                disabled={loading || spinning}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 1);
                  setBet(v);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-[#141e2e] border border-slate-700/80 text-white font-mono font-bold text-base focus:outline-none focus:border-amber-500 transition-colors"
              />
              <span className="absolute right-3 text-xs font-bold text-slate-400 pointer-events-none">
                PLN
              </span>
            </div>

            {/* Quick Bet Buttons */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() => setBet(10)}
                className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Min
              </button>
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))}
                className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-bold text-slate-300 transition-colors cursor-pointer"
              >
                ½
              </button>
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() =>
                  setBet((b) =>
                    Math.min(maxBalance || 1000000, Math.floor(b * 2))
                  )
                }
                className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-bold text-slate-300 transition-colors cursor-pointer"
              >
                2×
              </button>
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() => setBet(maxBalance || 100)}
                className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Max
              </button>
            </div>
          </div>

          {/* Multiplier Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Wybierz Mnożnik
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                ×{clampedTarget.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {MULTIPLIER_PRESETS.map((p) => {
                const isSelected = Math.abs(clampedTarget - p.val) < 0.01;
                return (
                  <button
                    key={p.label}
                    type="button"
                    disabled={loading || spinning}
                    onClick={() => setTarget(p.val)}
                    className={`px-2 py-2 rounded-lg text-xs font-black font-mono transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 scale-102"
                        : "bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/50"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Multiplier Input */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.05"
                min="1.05"
                max="10000"
                value={target}
                disabled={loading || spinning}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTarget(isNaN(v) ? 2.0 : v);
                }}
                className="w-full px-3 py-1.5 rounded-lg bg-[#141e2e] border border-slate-700 text-white font-mono text-xs font-bold focus:outline-none focus:border-amber-500"
                placeholder="Własny mnożnik..."
              />
            </div>
          </div>

          {/* Roll Under / Roll Over Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading || spinning}
              onClick={() => setRollType("under")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                rollType === "under"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-sm"
                  : "bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800"
              }`}
            >
              <ArrowDown size={14} />
              <span>Roll under ↓</span>
            </button>
            <button
              type="button"
              disabled={loading || spinning}
              onClick={() => setRollType("over")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                rollType === "over"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-sm"
                  : "bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800"
              }`}
            >
              <ArrowUp size={14} />
              <span>Roll over ↑</span>
            </button>
          </div>
        </div>

        {/* Center: Upgrader Gauge / Wheel (4 cols) */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl bg-[#0c121d] border border-slate-800/90 shadow-2xl relative overflow-hidden min-h-[340px]">
          {/* Ambient Background Glow */}
          <div
            className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
              spinning
                ? "bg-amber-500/10 animate-pulse"
                : lastOutcome?.won
                ? "bg-emerald-500/15"
                : lastOutcome
                ? "bg-rose-500/10"
                : "bg-transparent"
            }`}
          />

          {/* Wheel Container */}
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* Background SVG Gauge Ring */}
            <svg
              viewBox="0 0 260 260"
              className="w-full h-full transform -rotate-90 pointer-events-none"
            >
              {/* Outer Track */}
              <circle
                cx="130"
                cy="130"
                r={radius}
                fill="none"
                stroke="#172233"
                strokeWidth="12"
              />

              {/* Decorative Inner Ring */}
              <circle
                cx="130"
                cy="130"
                r={radius - 16}
                fill="none"
                stroke="#1f2d42"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />

              {/* Winning Sector Arc (Gold / Amber Glow) */}
              <circle
                cx="130"
                cy="130"
                r={radius}
                fill="none"
                stroke="url(#upgraderGoldGradient)"
                strokeWidth="12"
                strokeDasharray={`${winStrokeLength} ${circumference}`}
                strokeDashoffset={-strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-300"
              />

              <defs>
                <linearGradient
                  id="upgraderGoldGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
              </defs>
            </svg>

            {/* Rotating Pointer / Arrow (Spins when user rolls!) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                transition: spinning
                  ? `transform ${
                      turbo ? 0.7 : 2.6
                    }s cubic-bezier(0.12, 0.8, 0.2, 1)`
                  : "none",
              }}
            >
              {/* Needle Arrow at 12 o'clock */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <div className="w-4 h-4 bg-amber-400 rotate-45 rounded-xs shadow-lg shadow-amber-400/80 border border-amber-200" />
                <div className="w-1 h-3 bg-amber-400 shadow-md" />
              </div>
            </div>

            {/* Center Info Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white drop-shadow-md">
                {winChance.toFixed(2)}%
              </span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                Upgrade chance
              </span>

              {/* Stake Balance Badge */}
              <div className="mt-3 px-3 py-1 rounded-full bg-[#162234] border border-slate-700/80 shadow-inner flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold text-amber-400">
                  {money(bet)}
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">
                  Stawka
                </span>
              </div>
            </div>
          </div>

          {/* Live Outcome Banner */}
          {lastOutcome && !spinning && (
            <div
              className={`mt-2 px-3 py-1 rounded-lg text-xs font-mono font-bold border animate-bounce ${
                lastOutcome.won
                  ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/60 shadow-lg shadow-emerald-500/20"
                  : "bg-rose-950/90 text-rose-300 border-rose-500/60"
              }`}
            >
              {lastOutcome.won
                ? `Wylosowano ${lastOutcome.rolled.toFixed(2)}% • WYGRANA ${money(
                    lastOutcome.payout
                  )}!`
                : `Wylosowano ${lastOutcome.rolled.toFixed(2)}% • Przegrana`}
            </div>
          )}
        </div>

        {/* Right Side: Potential Win & UPGRADE Action (4 cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between p-4 rounded-2xl bg-[#0e1624] border border-slate-800/90 shadow-xl gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Możliwa Wygrana
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                ×{clampedTarget.toFixed(2)}
              </span>
            </div>

            {/* Target Display Card */}
            <div className="p-4 rounded-xl bg-[#141e2e] border border-slate-700/80 flex flex-col items-center justify-center text-center shadow-inner">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 tracking-tight">
                {money(potentialPayout)}
              </span>
              <span className="text-xs font-semibold text-slate-400 mt-1">
                Zysk netto: +{money(Math.max(0, potentialPayout - bet))}
              </span>
            </div>
          </div>

          {/* Large Glowing Gold UPGRADE Button */}
          <button
            type="button"
            disabled={loading || spinning || bet > maxBalance}
            onClick={() => {
              if (onPlay) {
                onPlay({
                  target_multiplier: clampedTarget,
                  roll_type: rollType,
                });
              }
            }}
            className={`w-full py-4 rounded-xl font-black text-base sm:text-lg flex items-center justify-center gap-2.5 transition-all shadow-xl cursor-pointer active:scale-98 ${
              loading || spinning || bet > maxBalance
                ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                : "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/30 border border-amber-300/80 hover:shadow-amber-500/50"
            }`}
          >
            {spinning ? (
              <>
                <RotateCw size={20} className="animate-spin" />
                <span>UPGRADING...</span>
              </>
            ) : (
              <>
                <Zap size={20} className="fill-slate-950" />
                <span>UPGRADE</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
