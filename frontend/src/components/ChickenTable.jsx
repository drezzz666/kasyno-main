import React, { useState, useEffect, useRef } from "react";
import { money, format } from "../lib/formatters";
import { ShieldCheck, AlertTriangle, Flame } from "lucide-react";
import { sounds } from "../lib/sounds";

export const CHICKEN_MULTIPLIERS = {
  easy: [0.90, 1.10, 1.25, 1.45, 1.75, 2.15, 2.70, 3.50, 4.60, 6.20],
  medium: [0.75, 1.15, 1.50, 2.00, 2.65, 3.60, 5.00, 7.00, 10.00, 15.00],
  hard: [0.60, 1.10, 1.85, 3.10, 5.40, 9.80, 18.50, 36.00, 75.00, 160.00],
  expert: [0.50, 0.90, 1.80, 4.50, 12.00, 35.00, 110.00, 380.00, 1200.00, 4000.00],
};

// SVG Sewer Grate (Kratka ściekowa / Właz kanalizacyjny)
export function SewerGrate({ isCurrent, isPassed, isCrash, isNext }) {
  return (
    <svg viewBox="0 0 64 42" className="w-14 h-9 drop-shadow-md" fill="none">
      {/* Outer Rim */}
      <ellipse
        cx="32"
        cy="21"
        rx="30"
        ry="18"
        fill={isCrash ? "#450a0a" : isCurrent ? "#1e293b" : "#1a222d"}
        stroke={isCrash ? "#ef4444" : isCurrent ? "#fbbf24" : isPassed ? "#10b981" : "#334155"}
        strokeWidth="2.5"
      />
      {/* Inner Inset */}
      <ellipse
        cx="32"
        cy="21"
        rx="24"
        ry="13"
        fill={isCrash ? "#1f0505" : "#0f1622"}
        stroke={isCrash ? "#7f1d1d" : isCurrent ? "#d97706" : "#242f3d"}
        strokeWidth="1.5"
      />
      {/* Slats / Kratka */}
      <g stroke={isCrash ? "#dc2626" : isCurrent ? "#fbbf24" : isPassed ? "#34d399" : "#475569"} strokeWidth="2.5" strokeLinecap="round">
        <line x1="20" y1="12" x2="20" y2="30" />
        <line x1="26" y1="10" x2="26" y2="32" />
        <line x1="32" y1="9"  x2="32" y2="33" />
        <line x1="38" y1="10" x2="38" y2="32" />
        <line x1="44" y1="12" x2="44" y2="30" />
      </g>
    </svg>
  );
}

// SVG Police Cruiser Top-Down (Radiowóz ze zrzutu ekranu Stake)
export function PoliceCarTopDown({ isAnimating = true }) {
  return (
    <div className={`relative flex flex-col items-center justify-center ${isAnimating ? "animate-car-crash" : ""}`}>
      {/* Tire skid marks behind car */}
      <div className="absolute -top-12 flex justify-between w-8 h-12 opacity-70 pointer-events-none">
        <div className="w-1.5 h-full bg-slate-950/80 rounded-full" />
        <div className="w-1.5 h-full bg-slate-950/80 rounded-full" />
      </div>

      <svg viewBox="0 0 54 86" className="w-14 h-22 drop-shadow-2xl z-20">
        {/* Car Shadow */}
        <ellipse cx="27" cy="44" rx="24" ry="40" fill="#000000" fillOpacity="0.6" />
        {/* Main Chassis */}
        <rect x="7" y="4" width="40" height="76" rx="9" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
        {/* White Police Roof & Doors */}
        <rect x="10" y="24" width="34" height="34" rx="4" fill="#f8fafc" />
        {/* Windshield Front */}
        <polygon points="12,23 42,23 39,13 15,13" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
        {/* Rear Window */}
        <polygon points="14,59 40,59 38,66 16,66" fill="#1e293b" />
        {/* Hood Black */}
        <path d="M12 12C12 7 17 5 27 5C37 5 42 7 42 12L42 22L12 22Z" fill="#090d16" />
        {/* Emergency Lightbar Red/Blue Flasher */}
        <rect x="17" y="38" width="20" height="6" rx="2" fill="#090d16" />
        <rect x="18" y="39" width="8" height="4" rx="1" fill="#ef4444" className="animate-pulse" />
        <rect x="28" y="39" width="8" height="4" rx="1" fill="#3b82f6" className="animate-pulse" />
        {/* Headlights */}
        <circle cx="13" cy="6" r="2.5" fill="#fef08a" />
        <circle cx="41" cy="6" r="2.5" fill="#fef08a" />
        {/* License Plate */}
        <rect x="23" y="77" width="8" height="3" rx="1" fill="#ffffff" />
      </svg>
    </div>
  );
}

// SVG Chicken (Kurczak ze zrzutu ekranu)
export function ChickenSprite({ isDead = false, isJumping = false }) {
  return (
    <div className={`relative flex items-center justify-center transition-transform duration-200 ${isJumping ? "animate-chicken-jump" : ""}`}>
      <svg viewBox="0 0 40 40" className="w-10 h-10 drop-shadow-lg">
        {/* Shadow */}
        <ellipse cx="20" cy="35" rx="9" ry="3.5" fill="#000000" fillOpacity="0.4" />
        {/* Comb / Grzebień */}
        <path d="M17 5C17 3.5 19 2 21 2C23 2 24 3.5 24 5C25 5 27 6.5 27 8C27 9.5 25 11 24 11L17 11C15 11 14 9.5 14 8C14 6.5 15 5 17 5Z" fill={isDead ? "#475569" : "#ef4444"} />
        {/* Body */}
        <circle cx="20" cy="20" r="13" fill={isDead ? "#78350f" : "#fbbf24"} stroke={isDead ? "#451a03" : "#d97706"} strokeWidth="1.5" />
        {/* Wing */}
        <ellipse cx="14" cy="22" rx="6" ry="7" transform={isJumping ? "rotate(-35 14 22)" : "rotate(-15 14 22)"} fill={isDead ? "#92400e" : "#f59e0b"} className="transition-transform" />
        {/* Beak */}
        <polygon points="30,17 38,20 30,23" fill={isDead ? "#94a3b8" : "#f97316"} />
        {/* Wattle */}
        <ellipse cx="30" cy="24" rx="2" ry="3" fill={isDead ? "#475569" : "#dc2626"} />
        {/* Eyes */}
        {isDead ? (
          <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
            <line x1="23" y1="13" x2="29" y2="19" />
            <line x1="29" y1="13" x2="23" y2="19" />
          </g>
        ) : (
          <g>
            <circle cx="26" cy="15" r="3.5" fill="#ffffff" />
            <circle cx="27.5" cy="15" r="1.8" fill="#0f172a" />
            <circle cx="28.2" cy="14.2" r="0.7" fill="#ffffff" />
          </g>
        )}
      </svg>
    </div>
  );
}

// SVG Traffic Light (Semafor drogowy)
export function TrafficLightPole() {
  return (
    <svg viewBox="0 0 42 90" className="w-10 h-22 drop-shadow-md">
      {/* Base Footing */}
      <ellipse cx="21" cy="85" rx="14" ry="5" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      <ellipse cx="21" cy="83" rx="10" ry="3.5" fill="#1e293b" />
      {/* Pole */}
      <rect x="18.5" y="36" width="5" height="48" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      {/* Light Box */}
      <rect x="6" y="4" width="30" height="34" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      {/* Visors */}
      <path d="M12 9 C12 6 18 6 18 9" stroke="#0f172a" strokeWidth="2" fill="none" />
      <path d="M24 9 C24 6 30 6 30 9" stroke="#0f172a" strokeWidth="2" fill="none" />
      {/* Left Light (Flashing Yellow) */}
      <circle cx="15" cy="21" r="6" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" className="animate-pulse" />
      <circle cx="14" cy="19" r="2" fill="#ffffff" fillOpacity="0.8" />
      {/* Right Light (Dark / Off) */}
      <circle cx="27" cy="21" r="6" fill="#090d16" stroke="#1e293b" strokeWidth="1.5" />
    </svg>
  );
}

// SVG Roadside Shrub / Rock
export function RoadsideShrub() {
  return (
    <svg viewBox="0 0 52 40" className="w-12 h-9 drop-shadow-md">
      <ellipse cx="26" cy="28" rx="22" ry="10" fill="#1e293b" />
      <path
        d="M8 26 C6 18 14 10 22 13 C26 7 36 8 40 14 C47 16 48 24 44 28 Z"
        fill="#293548"
        stroke="#1a2333"
        strokeWidth="1.5"
      />
      <circle cx="22" cy="18" r="4" fill="#334155" />
      <circle cx="34" cy="20" r="5" fill="#334155" />
    </svg>
  );
}

export function ChickenTable({
  round,
  last,
  post,
  loading,
  difficulty = "medium",
  setDifficulty,
  turbo,
  triggerOutcome,
}) {
  const [jumping, setJumping] = useState(false);
  const [jumpLane, setJumpLane] = useState(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [crashAnim, setCrashAnim] = useState(null); // { active: bool, lane: int, type: string }
  const roadContainerRef = useRef(null);

  const activeRound = round?.game === "chicken" ? round : null;
  const isSettled = !activeRound && last?.game === "chicken" && last?.state === "settled";
  const r = activeRound || (isSettled ? last : null);
  const p = r?.payload || {};

  const currentDiff = p.difficulty || difficulty || "medium";
  const multipliers = p.multipliers || CHICKEN_MULTIPLIERS[currentDiff] || CHICKEN_MULTIPLIERS.medium;
  const currentLane = p.currentLane || 0;
  const hazardLane = crashAnim?.lane || p.hazardLane || 0;
  const hazardType = crashAnim?.type || p.hazardType || "";
  const currentMult = p.multiplier !== undefined ? p.multiplier : 1.00;
  const nextMult = currentLane < 10 ? multipliers[currentLane] : multipliers[9];

  const currentBet = r?.bet || 10;
  const currentProfit = Math.floor(currentBet * currentMult);
  const isLoss = (isSettled && last?.payout === 0) || Boolean(crashAnim);

  // EXACTLY ONE single active lane for the chicken:
  // If crash/loss: -1 (rendered inside crash scene on hazardLane)
  // If jumping: jumpLane
  // Otherwise: currentLane
  const activeChickenLane = isLoss ? -1 : (jumping && jumpLane !== null ? jumpLane : currentLane);

  // Track active round id to detect when a brand new game starts
  const prevRoundIdRef = useRef(null);

  // Auto-scroll logic: Only scroll LEFT on a brand new game start.
  // During active play follow chicken, and on loss/crash STAY on the crash lane!
  useEffect(() => {
    if (!roadContainerRef.current) return;

    const isNewGameStarting = activeRound && activeRound.id !== prevRoundIdRef.current;
    if (isNewGameStarting) {
      prevRoundIdRef.current = activeRound.id;
      setCrashAnim(null);
      setJumping(false);
      setJumpLane(null);
      // New game start: immediately scroll back to the start line on the left
      roadContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    if (activeRound && currentLane > 0) {
      // While playing: follow chicken smoothly
      const laneEl = roadContainerRef.current.querySelector(`[data-lane="${currentLane}"]`);
      if (laneEl) {
        laneEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    } else if (isLoss && hazardLane > 0) {
      // On crash: make sure camera stays right on the crash lane!
      const crashEl = roadContainerRef.current.querySelector(`[data-lane="${hazardLane}"]`);
      if (crashEl) {
        crashEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeRound?.id, currentLane, isLoss, hazardLane]);

  // Handle jump step
  const handleStep = async () => {
    if (!activeRound || loading || jumping || cashingOut || crashAnim) return;
    const nextTarget = currentLane + 1;
    setJumping(true);
    setJumpLane(nextTarget);
    sounds.playTileClick();

    try {
      const res = await post({ action: "chicken", roundId: activeRound.id, move: "step", lane: nextTarget });
      if (res?.round?.state === "settled") {
        if (res.round.payout === 0) {
          // LOSS: Trigger car crash animation on nextTarget!
          const hazType = res.round.payload?.hazardType || "police_car";
          setCrashAnim({ active: true, lane: nextTarget, type: hazType });
          sounds.playExplosion();

          // Scroll to crash lane
          if (roadContainerRef.current) {
            const crashEl = roadContainerRef.current.querySelector(`[data-lane="${nextTarget}"]`);
            if (crashEl) {
              crashEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
            }
          }

          // Delay the outcome popup so user sees the car run over the chicken first!
          const delay = turbo ? 800 : 1400;
          setTimeout(() => {
            if (triggerOutcome) triggerOutcome(res.round);
          }, delay);
        } else {
          // WIN / FINISH
          sounds.playGemReveal(1.8);
          const delay = turbo ? 300 : 600;
          setTimeout(() => {
            if (triggerOutcome) triggerOutcome(res.round);
          }, delay);
        }
      } else {
        // Safe step
        sounds.playGemReveal(1.0 + currentLane * 0.1);
      }
    } finally {
      setTimeout(() => {
        setJumping(false);
        setJumpLane(null);
      }, 350);
    }
  };

  // Handle cashout
  const handleCashout = async () => {
    if (!activeRound || loading || currentLane < 1 || cashingOut || crashAnim) return;
    setCashingOut(true);
    sounds.playCoins();

    try {
      const res = await post({ action: "chicken", roundId: activeRound.id, move: "cashout" });
      if (res?.round) {
        const delay = turbo ? 200 : 400;
        setTimeout(() => {
          if (triggerOutcome) triggerOutcome(res.round);
        }, delay);
      }
    } finally {
      setCashingOut(false);
    }
  };

  return (
    <div className="chicken-game-canvas flex flex-col w-full select-none">
      {/* Top Street Viewport */}
      <div
        ref={roadContainerRef}
        className="chicken-street-surface relative w-full h-80 rounded-xl bg-[#0f1723] border border-slate-800/80 overflow-x-auto overflow-y-hidden shadow-2xl flex items-stretch custom-scrollbar"
      >
        {/* Left Sidewalk with Traffic Signal & Zebra Crossing */}
        <div className="chicken-left-sidewalk relative w-24 flex-shrink-0 bg-[#16202c] border-r-2 border-slate-700/80 flex flex-col items-center justify-between p-2 z-10">
          {/* Top Traffic Light */}
          <div className="pt-1">
            <TrafficLightPole />
          </div>

          {/* Zebra Crossing Lines */}
          <div className="w-full flex flex-col gap-1.5 px-1 my-auto opacity-80">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full h-2.5 bg-slate-400/40 rounded-sm" />
            ))}
          </div>

          {/* Chicken on Sidewalk ONLY if activeChickenLane === 0 */}
          {activeChickenLane === 0 && !isLoss && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 animate-chicken-hop">
              <ChickenSprite isJumping={jumping} />
            </div>
          )}

          {/* Bottom Roadside Shrub */}
          <div className="pb-1">
            <RoadsideShrub />
          </div>
        </div>

        {/* 10 Vertical Lanes stretching rightwards */}
        <div className="flex items-stretch h-full flex-1">
          {multipliers.map((mult, idx) => {
            const laneNum = idx + 1;
            const isCompleted = currentLane >= laneNum;
            const isCurrent = currentLane === laneNum;
            const isNext = currentLane === laneNum - 1 && activeRound;
            const isCrashedLane = hazardLane === laneNum;
            const hasChicken = activeChickenLane === laneNum;

            return (
              <div
                key={laneNum}
                data-lane={laneNum}
                onClick={() => {
                  if (isNext && !jumping && !cashingOut && !crashAnim) {
                    handleStep();
                  }
                }}
                className={`chicken-road-lane relative w-24 flex-shrink-0 h-full flex flex-col items-center justify-between py-5 border-r border-dashed border-slate-700/50 transition-colors duration-200 ${
                  isNext ? "cursor-pointer hover:bg-slate-800/40" : ""
                }`}
              >
                {/* Lane Top Number */}
                <div className="text-[11px] font-mono font-bold text-slate-500">
                  {isCompleted && !isCrashedLane ? (
                    <span className="text-emerald-400 font-bold">✓</span>
                  ) : (
                    `#${laneNum}`
                  )}
                </div>

                {/* Center Road Element: Sewer Grate / Single Chicken / Police Car Crash */}
                <div className="relative flex flex-col items-center justify-center my-auto w-full">
                  {/* Police Car or Fire Hazard on Crash */}
                  {isCrashedLane && (
                    <div className="absolute z-30 flex flex-col items-center justify-center pointer-events-none">
                      {/* Shockwave burst effect */}
                      <div className="absolute w-16 h-16 rounded-full bg-rose-500/40 animate-impact-shockwave pointer-events-none" />

                      {hazardType === "police_car" || hazardType === "car" || hazardType === "truck" ? (
                        <PoliceCarTopDown isAnimating={true} />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-orange-600/40 border-2 border-orange-500 flex items-center justify-center animate-pulse">
                          <Flame size={32} className="text-orange-400 animate-bounce" />
                        </div>
                      )}
                      <div className="mt-1">
                        <ChickenSprite isDead={true} />
                      </div>
                    </div>
                  )}

                  {/* Chicken ONLY on activeChickenLane */}
                  {hasChicken && !isCrashedLane && (
                    <div className={`absolute z-30 flex items-center justify-center ${jumping ? "animate-chicken-jump" : "animate-chicken-hop"}`}>
                      <ChickenSprite isJumping={jumping} />
                    </div>
                  )}

                  {/* Next Step GO Arrow Indicator (shown only when no chicken on this lane) */}
                  {isNext && !isCrashedLane && !hasChicken && (
                    <div className="absolute -top-7 z-20 flex flex-col items-center animate-bounce">
                      <span className="text-[9px] font-bold text-amber-400 bg-amber-950/90 px-1.5 py-0.5 rounded border border-amber-500/40">
                        GO
                      </span>
                    </div>
                  )}

                  {/* Sewer Grate Base */}
                  <div className={`transition-transform duration-200 ${isNext ? "scale-105" : ""}`}>
                    <SewerGrate
                      isCurrent={isCurrent}
                      isPassed={isCompleted}
                      isCrash={isCrashedLane}
                      isNext={isNext}
                    />
                  </div>
                </div>

                {/* Bottom Multiplier Pill Badge */}
                <div
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all shadow-md ${
                    isCrashedLane
                      ? "bg-rose-950/90 text-rose-300 border border-rose-500 shadow-rose-900/50 scale-105"
                      : isCurrent
                      ? mult < 1.00
                        ? "bg-orange-500 text-slate-950 shadow-orange-500/40 scale-105 font-black"
                        : "bg-amber-400 text-slate-950 shadow-amber-400/40 scale-105 font-black"
                      : isCompleted
                      ? mult < 1.00
                        ? "bg-orange-950/60 text-orange-300 border border-orange-600/40"
                        : "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50"
                      : isNext
                      ? mult < 1.00
                        ? "bg-slate-800 text-orange-300 border border-orange-400/60 animate-pulse"
                        : "bg-slate-800 text-amber-300 border border-amber-400/60 animate-pulse"
                      : mult < 1.00
                      ? "bg-[#1f1a24] text-slate-500 border border-slate-700/50"
                      : "bg-[#182330] text-slate-400 border border-slate-700/60"
                  }`}
                >
                  {mult.toFixed(2)}x
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Controls Toolbar */}
      {activeRound && (
        <div className="chicken-hud-bottom flex items-center justify-between gap-3 p-3 mt-3 rounded-xl bg-slate-900/90 border border-slate-700/60 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-slate-400 uppercase font-semibold">Aktualna wygrana:</span>
            <span className="text-base font-bold font-mono text-emerald-400">
              {money(currentProfit)}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-bold border ${currentMult < 1.00 ? "bg-orange-500/20 text-orange-300 border-orange-500/40" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}`}>
              ×{currentMult.toFixed(2)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || jumping || cashingOut || Boolean(crashAnim)}
              onClick={handleStep}
              className="px-4 py-2 rounded-lg bg-[#00e701] hover:bg-[#00c801] active:scale-[0.98] text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
            >
              Skocz (×{nextMult.toFixed(2)})
            </button>

            <button
              type="button"
              disabled={loading || jumping || cashingOut || currentLane < 1 || Boolean(crashAnim)}
              onClick={handleCashout}
              className={`px-4 py-2 rounded-lg font-bold text-xs shadow-md transition-all ${
                currentLane >= 1
                  ? "bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 shadow-amber-500/30"
                  : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
              }`}
            >
              Wypłać {money(currentProfit)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
