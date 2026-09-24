import React, { useState, useEffect, useRef } from "react";
import { money } from "../../lib/formatters";
import { sounds } from "../../lib/sounds";
import { ArrowDown, ArrowUp, Zap, RotateCw } from "lucide-react";

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
  const [lastOutcome, setLastOutcome] = useState(null);
  const pointerRef = useRef(null);
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

    setSpinning(true);
    if (animatingRef) animatingRef.current = true;
    if (onBusyChange) onBusyChange(true);

    const spinDuration = turbo ? 750 : 2500;
    const extraSpins = turbo ? 2 : 4;
    // Exactly from 0deg -> (extraSpins * 360) + destinationAngle
    const targetAngle = extraSpins * 360 + (rolled / 100) * 360;

    // 1. Instantly snap pointer to 0deg (top / 12 o'clock) with NO transition
    if (pointerRef.current) {
      pointerRef.current.style.transition = "none";
      pointerRef.current.style.transform = "rotate(0deg)";
      // Force browser reflow to apply 0deg before transitioning
      void pointerRef.current.offsetWidth;

      // 2. Animate to targetAngle with consistent cubic-bezier easing
      requestAnimationFrame(() => {
        if (pointerRef.current) {
          pointerRef.current.style.transition = `transform ${spinDuration}ms cubic-bezier(0.12, 0.85, 0.22, 1)`;
          pointerRef.current.style.transform = `rotate(${targetAngle}deg)`;
        }
      });
    }

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

  // SVG Arc calculation for winning sector (Radius: 130, ViewBox: 320x320)
  // With strokeLinecap="butt" the stroke boundary is mathematically exact to 0.01%
  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const winStrokeLength = (winChance / 100) * circumference;
  const strokeDashoffset =
    rollType === "under" ? 0 : circumference - winStrokeLength;

  // Exact boundary cut-off angle in degrees
  const boundaryAngle =
    rollType === "under" ? (winChance / 100) * 360 : ((100 - winChance) / 100) * 360;

  return (
    <div className="upgrader-container flex flex-col w-full max-w-6xl mx-auto select-none p-2 sm:p-4 md:p-6 gap-2.5 sm:gap-6">
      {/* Responsive Grid: On mobile stacks cleanly, on desktop expansive 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-6 items-stretch">
        
        {/* Box 1: Left Inputs & Multipliers (Mobile Order 2, Desktop Order 1, 4 cols) */}
        <div className="order-2 lg:order-1 lg:col-span-4 flex flex-col justify-between p-3.5 sm:p-6 rounded-xl sm:rounded-2xl bg-[#0c131f] border border-slate-800 shadow-xl gap-3 sm:gap-5">
          {/* Stawka Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300">
                Stawka
              </span>
            </div>

            {/* Bet Input */}
            <div className="relative flex items-center mb-2 sm:mb-3">
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
                className="w-full px-3.5 py-2.5 sm:py-3.5 rounded-lg sm:rounded-xl bg-[#131d2e] border-2 border-slate-700/80 text-white font-mono font-black text-base sm:text-xl focus:outline-none focus:border-amber-500 transition-colors shadow-inner"
              />
              <span className="absolute right-3.5 text-xs sm:text-sm font-black text-slate-400 pointer-events-none">
                $FGT
              </span>
            </div>

            {/* Quick Bet Buttons */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() => setBet(10)}
                className="py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                Min
              </button>
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))}
                className="py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 transition-all cursor-pointer active:scale-95 shadow-sm"
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
                className="py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                2×
              </button>
              <button
                type="button"
                disabled={loading || spinning}
                onClick={() => setBet(maxBalance || 100)}
                className="py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 transition-all cursor-pointer active:scale-95 shadow-sm"
              >
                Max
              </button>
            </div>
          </div>

          {/* Multiplier Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300">
                Wybierz Mnożnik
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mb-2 sm:mb-3">
              {MULTIPLIER_PRESETS.map((p) => {
                const isSelected = Math.abs(clampedTarget - p.val) < 0.01;
                return (
                  <button
                    key={p.label}
                    type="button"
                    disabled={loading || spinning}
                    onClick={() => setTarget(p.val)}
                    className={`py-2 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/40 scale-102 border-2 border-amber-300"
                        : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Multiplier Input */}
            <div className="relative flex items-center">
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
                className="w-full px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#131d2e] border-2 border-slate-700 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-amber-500"
                placeholder="Własny mnożnik..."
              />
              <span className="absolute right-3.5 text-xs font-black text-slate-400 pointer-events-none">
                × cel
              </span>
            </div>
          </div>
        </div>

        {/* Box 2: Center Grand Gauge Wheel + Integrated Roll Mode (Mobile Order 1, Desktop Order 2, 4 cols) */}
        <div className="order-1 lg:order-2 lg:col-span-4 flex flex-col items-center justify-between p-3 sm:p-6 rounded-xl sm:rounded-2xl bg-[#080d16] border border-slate-800 shadow-2xl relative overflow-hidden min-h-[260px] sm:min-h-[420px] md:min-h-[460px] gap-2">
          {/* Ambient Glow */}
          <div
            className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
              spinning
                ? "bg-amber-500/15 animate-pulse"
                : lastOutcome?.won
                ? "bg-emerald-500/25"
                : lastOutcome
                ? "bg-rose-500/20"
                : "bg-transparent"
            }`}
          />

          {/* Compact Roll Mode Selector at top of the wheel */}
          <div className="z-20 flex items-center bg-[#131d2e] p-1 rounded-xl border border-slate-700/80 shadow-md">
            <button
              type="button"
              disabled={loading || spinning}
              onClick={() => setRollType("under")}
              className={`flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                rollType === "under"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ArrowDown size={14} />
              <span>Roll under</span>
            </button>
            <button
              type="button"
              disabled={loading || spinning}
              onClick={() => setRollType("over")}
              className={`flex items-center gap-1.5 px-3 py-1 sm:py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                rollType === "over"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ArrowUp size={14} />
              <span>Roll over</span>
            </button>
          </div>

          {/* Wheel Container (Compact on phone, huge on PC) */}
          <div className="relative w-48 h-48 xs:w-56 xs:h-56 sm:w-80 sm:h-80 md:w-92 md:h-92 lg:w-[360px] lg:h-[360px] flex items-center justify-center my-auto">
            <svg
              viewBox="0 0 320 320"
              className="w-full h-full transform -rotate-90 pointer-events-none drop-shadow-2xl"
            >
              {/* Outer Dark Track */}
              <circle
                cx="160"
                cy="160"
                r={radius}
                fill="none"
                stroke="#151e2d"
                strokeWidth="18"
              />

              {/* Decorative Inner Dotted Ring */}
              <circle
                cx="160"
                cy="160"
                r={radius - 24}
                fill="none"
                stroke="#1f2d42"
                strokeWidth="2.5"
                strokeDasharray="6 6"
              />

              {/* Mathematically Exact Winning Sector Arc (strokeLinecap="butt" prevents 1% bleeding!) */}
              <circle
                cx="160"
                cy="160"
                r={radius}
                fill="none"
                stroke="url(#upgraderGoldSuperGradient)"
                strokeWidth="18"
                strokeDasharray={`${winStrokeLength} ${circumference}`}
                strokeDashoffset={-strokeDashoffset}
                strokeLinecap="butt"
                className="transition-all duration-300"
              />

              <defs>
                <linearGradient
                  id="upgraderGoldSuperGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
              </defs>
            </svg>

            {/* Exact Cut-off Divider Marker at the boundary angle */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                transform: `rotate(${boundaryAngle}deg)`,
              }}
            >
              <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-5 bg-white shadow-lg shadow-white rounded-full z-15" />
            </div>

            {/* Rotating Pointer Needle (Starts from exact top 0deg every time) */}
            <div
              ref={pointerRef}
              className="absolute inset-0 pointer-events-none"
              style={{
                transform: "rotate(0deg)",
              }}
            >
              <div className="absolute top-0.5 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
                <div className="w-5 h-5 sm:w-6 sm:h-6 bg-amber-400 rotate-45 rounded-xs shadow-2xl shadow-amber-400 border-2 border-white" />
                <div className="w-1.5 sm:w-2 h-4 sm:h-5 bg-amber-400 shadow-lg" />
              </div>
            </div>

            {/* Center Info Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 sm:p-4 z-10 pointer-events-none">
              <span className="text-3xl xs:text-4xl sm:text-6xl md:text-7xl font-black font-mono tracking-tight text-white drop-shadow-2xl">
                {winChance.toFixed(2)}%
              </span>
              <span className="text-[10px] sm:text-sm md:text-base font-black text-slate-300 uppercase tracking-widest mt-0.5 sm:mt-1">
                Szansa na Upgrade
              </span>

              {/* Stake Badge */}
              <div className="mt-1.5 sm:mt-3 px-3 sm:px-4 py-0.5 sm:py-1 rounded-full bg-[#141f30] border border-slate-700/90 shadow-inner flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm font-mono font-black text-amber-400">
                  {money(bet)}
                </span>
                <span className="text-[9px] sm:text-xs text-slate-400 uppercase font-bold">
                  Stawka
                </span>
              </div>
            </div>
          </div>

          {/* Outcome Banner */}
          {lastOutcome && !spinning && (
            <div
              className={`z-20 px-3 sm:px-5 py-1 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm md:text-base font-mono font-black border animate-bounce shadow-2xl ${
                lastOutcome.won
                  ? "bg-emerald-950 text-emerald-300 border-emerald-500 shadow-emerald-500/40"
                  : "bg-rose-950 text-rose-300 border-rose-500 shadow-rose-500/30"
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

        {/* Box 3: Potential Win & Big UPGRADE Button (Mobile Order 3, Desktop Order 3, 4 cols) */}
        <div className="order-3 lg:order-3 lg:col-span-4 flex flex-col justify-between p-3.5 sm:p-6 rounded-xl sm:rounded-2xl bg-[#0c131f] border border-slate-800 shadow-xl gap-3 sm:gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300">
                Możliwa Wygrana
              </span>
            </div>

            {/* Target Display Card */}
            <div className="p-4 sm:p-8 rounded-xl sm:rounded-2xl bg-[#131d2e] border-2 border-slate-700/80 flex flex-col items-center justify-center text-center shadow-inner">
              <span className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-black font-mono text-emerald-400 tracking-tight">
                {money(potentialPayout)}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-400 mt-1 sm:mt-2">
                Mnożnik: <strong className="text-white">×{clampedTarget.toFixed(2)}</strong> • Zysk: +{money(Math.max(0, potentialPayout - bet))}
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
            className={`w-full py-3.5 sm:py-5 rounded-xl sm:rounded-2xl font-black text-lg sm:text-2xl flex items-center justify-center gap-2.5 sm:gap-3 transition-all shadow-2xl cursor-pointer active:scale-98 ${
              loading || spinning || bet > maxBalance
                ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                : "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-amber-500/40 border-2 border-amber-300 hover:shadow-amber-500/60"
            }`}
          >
            {spinning ? (
              <>
                <RotateCw size={22} className="animate-spin sm:w-7 sm:h-7" />
                <span>UPGRADING...</span>
              </>
            ) : (
              <>
                <Zap size={22} className="fill-slate-950 sm:w-7 sm:h-7" />
                <span>UPGRADE</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
