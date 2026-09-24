import React, { useState, useEffect, useRef } from "react";
import { money } from "../../lib/formatters";
import { sounds } from "../../lib/sounds";

export const CHICKEN_MULTIPLIERS = [
  1.15, 1.37, 1.64, 2.00, 2.46, 3.07, 3.91, 5.08, 6.77,
  9.31, 13.30, 19.95, 31.92, 55.86, 111.72, 279.30, 1117.20,
];

// SVG Cute Chubby White Chicken (matching Stake aesthetic)
export function ChickenSprite({ isJumping = false }) {
  return (
    <div
      className={`relative flex items-center justify-center transition-transform duration-200 select-none ${
        isJumping ? "animate-chicken-jump" : ""
      }`}
    >
      <svg
        viewBox="0 0 60 52"
        className="w-12 h-11 sm:w-14 sm:h-12 md:w-16 md:h-14 drop-shadow-xl"
        fill="none"
      >
        {/* Soft Drop Shadow under body */}
        <ellipse cx="30" cy="46" rx="18" ry="5.5" fill="#000000" fillOpacity="0.45" />

        {/* Little Yellow/Orange Feet */}
        <ellipse cx="26" cy="44" rx="4" ry="2.5" fill="#f59e0b" />
        <ellipse cx="34" cy="44" rx="4" ry="2.5" fill="#f59e0b" />

        {/* Plump White Chicken Body with chubby cheeks and upturned tail */}
        <path
          d="M12 24 C10 18 14 10 22 8 C30 6 42 10 46 18 C50 26 48 38 40 43 C32 47 18 46 12 38 C9 34 8 28 12 24 Z"
          fill="#ffffff"
          stroke="#e2e8f0"
          strokeWidth="1.5"
        />

        {/* Subtle Body Underbelly Shading */}
        <path
          d="M14 34 C18 43 32 45 40 40 C43 37 45 32 44 28 C38 34 26 37 14 34 Z"
          fill="#e2e8f0"
          fillOpacity="0.75"
        />

        {/* Red Crown / Comb on Head */}
        <path
          d="M24 7 C23 3 26 1 29 2 C32 1 35 3 34 7 Z"
          fill="#ef4444"
        />
        <path
          d="M21 9 C20 6 22 4 25 5 C27 4 28 6 27 9 Z"
          fill="#f87171"
        />

        {/* Soft Feather Wing on Side */}
        <path
          d="M16 26 C15 22 22 20 28 24 C30 26 28 32 24 33 C19 34 16 30 16 26 Z"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="1.2"
        />

        {/* Cute Yellow / Orange Triangular Beak */}
        <polygon
          points="41,23 49,27 41,31"
          fill="#f59e0b"
          stroke="#d97706"
          strokeWidth="1"
        />

        {/* Round Glossy Black Bead Eye */}
        <circle cx="36" cy="20" r="3.2" fill="#0f172a" />
        <circle cx="37" cy="19" r="1.1" fill="#ffffff" />
      </svg>
    </div>
  );
}

// SVG Rozjechany Kurczak na drodze (Flattened Run-Over Dead Chicken)
export function FlattenedDeadChickenSprite() {
  return (
    <div className="relative flex flex-col items-center justify-center select-none pointer-events-none">
      {/* Tire skid marks on road */}
      <div className="absolute -top-12 flex justify-between w-12 h-20 opacity-80 pointer-events-none">
        <div className="w-2 h-full bg-slate-950/90 rounded-full" />
        <div className="w-2 h-full bg-slate-950/90 rounded-full" />
      </div>

      <svg
        viewBox="0 0 70 45"
        className="w-16 h-11 sm:w-20 sm:h-13 md:w-22 md:h-15 drop-shadow-2xl z-10"
        fill="none"
      >
        <ellipse cx="35" cy="24" rx="30" ry="16" fill="#090d16" fillOpacity="0.8" />
        <ellipse
          cx="35"
          cy="22"
          rx="26"
          ry="13"
          fill="#cbd5e1"
          stroke="#475569"
          strokeWidth="1.5"
        />
        <ellipse cx="16" cy="22" rx="10" ry="7" fill="#94a3b8" />
        <ellipse cx="52" cy="22" rx="9" ry="6" fill="#94a3b8" />
        <path
          d="M18 12 L50 32 M24 10 L56 30 M12 14 L44 34"
          stroke="#0f172a"
          strokeWidth="2.5"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />
        <polygon points="56,22 64,25 56,28" fill="#d97706" />
        <ellipse cx="38" cy="10" rx="6" ry="3" fill="#dc2626" />
        <g stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round">
          <line x1="43" y1="16" x2="49" y2="22" />
          <line x1="49" y1="16" x2="43" y2="22" />
        </g>
        <circle cx="28" cy="8" r="1.5" fill="#f8fafc" />
        <circle cx="18" cy="30" r="1.8" fill="#f8fafc" />
      </svg>
    </div>
  );
}

// SVG Concrete Road Blockade / Barrier [ | | | | | ]
export function RoadBlockade() {
  return (
    <div className="chicken-blockade animate-blockade-drop relative flex items-center justify-center pointer-events-none z-20">
      <svg
        viewBox="0 0 64 26"
        className="w-14 sm:w-16 md:w-20 h-6 sm:h-7 drop-shadow-xl"
        fill="none"
      >
        <rect x="2" y="4" width="60" height="20" rx="5" fill="#000000" fillOpacity="0.55" />
        <rect
          x="3"
          y="2"
          width="58"
          height="19"
          rx="4"
          fill="#475569"
          stroke="#94a3b8"
          strokeWidth="1.5"
        />
        <rect
          x="6"
          y="5"
          width="52"
          height="13"
          rx="2.5"
          fill="#1e293b"
        />
        <g stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round">
          <line x1="13" y1="7" x2="13" y2="16" />
          <line x1="20" y1="7" x2="20" y2="16" />
          <line x1="27" y1="7" x2="27" y2="16" />
          <line x1="34" y1="7" x2="34" y2="16" />
          <line x1="41" y1="7" x2="41" y2="16" />
          <line x1="48" y1="7" x2="48" y2="16" />
        </g>
      </svg>
    </div>
  );
}

// SVG Golden Chicken Coin (on passed lanes)
export function ChickenGoldCoin() {
  return (
    <div className="chicken-gold-coin animate-coin-glow relative flex items-center justify-center pointer-events-none">
      <svg
        viewBox="0 0 52 52"
        className="w-11 h-11 sm:w-13 sm:h-13 md:w-15 md:h-15 drop-shadow-xl"
        fill="none"
      >
        <circle cx="26" cy="27" r="23" fill="#000000" fillOpacity="0.45" />
        <circle
          cx="26"
          cy="26"
          r="23"
          fill="url(#coinOuterGrad)"
          stroke="#78350f"
          strokeWidth="1.5"
        />
        <circle
          cx="26"
          cy="26"
          r="19"
          fill="url(#coinInnerGrad)"
          stroke="#b45309"
          strokeWidth="1.2"
        />
        <circle
          cx="26"
          cy="26"
          r="16.5"
          stroke="#d97706"
          strokeWidth="1.2"
          strokeDasharray="3 3.5"
          fill="none"
        />
        <path
          d="M20 28 C18 24 20 19 25 18 C28 17 32 19 33 22 C35 24 33 27 30 28 C28 29 25 29 23 31 C21 32 19 31 20 28 Z"
          fill="#b45309"
          stroke="#78350f"
          strokeWidth="0.8"
        />
        <polygon points="32,21 36,23 32,25" fill="#92400e" />
        <circle cx="26" cy="17" r="1.5" fill="#92400e" />

        <defs>
          <radialGradient id="coinOuterGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="35%" stopColor="#fbbf24" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>
          <radialGradient id="coinInnerGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="40%" stopColor="#fde047" />
            <stop offset="75%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ca8a04" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

// SVG Sewer Grate (Kratka ściekowa)
export function SewerGrate({ isCurrent, isPassed, isCrash }) {
  return (
    <svg viewBox="0 0 64 42" className="w-10 sm:w-13 md:w-16 h-7 sm:h-9 md:h-11 drop-shadow-md max-w-full" fill="none">
      <ellipse
        cx="32"
        cy="21"
        rx="30"
        ry="18"
        fill={isCrash ? "#450a0a" : isCurrent ? "#1e293b" : "#141c28"}
        stroke={isCrash ? "#ef4444" : isCurrent ? "#fbbf24" : isPassed ? "#10b981" : "#2a374a"}
        strokeWidth="2.5"
      />
      <ellipse
        cx="32"
        cy="21"
        rx="24"
        ry="13"
        fill={isCrash ? "#1f0505" : "#0c131d"}
        stroke={isCrash ? "#7f1d1d" : isCurrent ? "#d97706" : "#1f2937"}
        strokeWidth="1.5"
      />
      <g stroke={isCrash ? "#dc2626" : isCurrent ? "#fbbf24" : isPassed ? "#34d399" : "#3e4c5e"} strokeWidth="2.5" strokeLinecap="round">
        <line x1="20" y1="12" x2="20" y2="30" />
        <line x1="26" y1="10" x2="26" y2="32" />
        <line x1="32" y1="9"  x2="32" y2="33" />
        <line x1="38" y1="10" x2="38" y2="32" />
        <line x1="44" y1="12" x2="44" y2="30" />
      </g>
    </svg>
  );
}

// Stake Yellow Taxi Top-Down
export function StakeYellowTaxi() {
  return (
    <svg viewBox="0 0 46 76" className="w-10 h-18 sm:w-12 sm:h-22 md:w-14 md:h-24 drop-shadow-2xl" fill="none">
      <ellipse cx="23" cy="38" rx="20" ry="34" fill="#000000" fillOpacity="0.55" />
      <rect x="5" y="4" width="36" height="68" rx="8" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5" />
      <polygon points="9,22 37,22 34,12 12,12" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      <polygon points="10,54 36,54 34,60 12,60" fill="#0f172a" />
      <rect x="8" y="23" width="30" height="30" rx="4" fill="#fbbf24" />
      <rect x="15" y="34" width="16" height="7" rx="2" fill="#ffffff" stroke="#000000" strokeWidth="0.8" />
      <text x="23" y="39.5" fontSize="4.5" fontWeight="900" fill="#000000" textAnchor="middle" fontFamily="sans-serif">TAXI</text>
      <circle cx="10" cy="6" r="2.5" fill="#fef08a" />
      <circle cx="36" cy="6" r="2.5" fill="#fef08a" />
      <rect x="8" y="68" width="6" height="2.5" rx="1" fill="#ef4444" />
      <rect x="32" y="68" width="6" height="2.5" rx="1" fill="#ef4444" />
    </svg>
  );
}

// Stake Purple Truck Semi Top-Down
export function StakePurpleTruck() {
  return (
    <svg viewBox="0 0 48 90" className="w-10 h-20 sm:w-12 sm:h-24 md:w-14 md:h-28 drop-shadow-2xl" fill="none">
      <ellipse cx="24" cy="45" rx="21" ry="42" fill="#000000" fillOpacity="0.6" />
      <rect x="6" y="2" width="36" height="84" rx="7" fill="#7c3aed" stroke="#5b21b6" strokeWidth="1.5" />
      <rect x="8" y="24" width="32" height="36" rx="4" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      <polygon points="10,23 38,23 35,13 13,13" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      <rect x="14" y="4" width="20" height="7" rx="2" fill="#334155" stroke="#cbd5e1" strokeWidth="0.8" />
      <line x1="18" y1="5" x2="18" y2="10" stroke="#f8fafc" strokeWidth="0.8" />
      <line x1="24" y1="5" x2="24" y2="10" stroke="#f8fafc" strokeWidth="0.8" />
      <line x1="30" y1="5" x2="30" y2="10" stroke="#f8fafc" strokeWidth="0.8" />
      <circle cx="10" cy="5" r="2.5" fill="#fef08a" />
      <circle cx="38" cy="5" r="2.5" fill="#fef08a" />
      <rect x="9" y="82" width="7" height="3" rx="1" fill="#ef4444" />
      <rect x="32" y="82" width="7" height="3" rx="1" fill="#ef4444" />
    </svg>
  );
}

// Stake White Delivery Van Top-Down
export function StakeWhiteVan() {
  return (
    <svg viewBox="0 0 46 80" className="w-10 h-18 sm:w-12 sm:h-22 md:w-14 md:h-24 drop-shadow-2xl" fill="none">
      <ellipse cx="23" cy="40" rx="20" ry="36" fill="#000000" fillOpacity="0.55" />
      <rect x="6" y="3" width="34" height="74" rx="7" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" />
      <polygon points="10,22 36,22 33,12 13,12" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
      <rect x="9" y="24" width="28" height="28" rx="3" fill="#e2e8f0" />
      <circle cx="10" cy="5" r="2.5" fill="#fef08a" />
      <circle cx="36" cy="5" r="2.5" fill="#fef08a" />
      <rect x="9" y="73" width="6" height="2.5" rx="1" fill="#ef4444" />
      <rect x="31" y="73" width="6" height="2.5" rx="1" fill="#ef4444" />
    </svg>
  );
}

// Ambient vehicle chooser
export function AmbientVehicle({ carIndex = 0 }) {
  const mod = carIndex % 3;
  if (mod === 0) return <StakeYellowTaxi />;
  if (mod === 1) return <StakePurpleTruck />;
  return <StakeWhiteVan />;
}

// Police car on collision
export function PoliceCarTopDown({ isAnimating = true }) {
  return (
    <div className={`relative flex flex-col items-center justify-center ${isAnimating ? "animate-car-crash" : ""}`}>
      <svg viewBox="0 0 54 86" className="w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-26 drop-shadow-2xl z-20">
        <ellipse cx="27" cy="44" rx="24" ry="40" fill="#000000" fillOpacity="0.6" />
        <rect x="7" y="4" width="40" height="76" rx="9" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
        <rect x="10" y="24" width="34" height="34" rx="4" fill="#f8fafc" />
        <polygon points="12,23 42,23 39,13 15,13" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
        <polygon points="14,59 40,59 38,66 16,66" fill="#1e293b" />
        <path d="M12 12C12 7 17 5 27 5C37 5 42 7 42 12L42 22L12 22Z" fill="#090d16" />
        <rect x="17" y="38" width="20" height="6" rx="2" fill="#090d16" />
        <rect x="18" y="39" width="8" height="4" rx="1" fill="#ef4444" className="animate-pulse" />
        <rect x="28" y="39" width="8" height="4" rx="1" fill="#3b82f6" className="animate-pulse" />
        <circle cx="13" cy="6" r="2.5" fill="#fef08a" />
        <circle cx="41" cy="6" r="2.5" fill="#fef08a" />
        <rect x="23" y="77" width="8" height="3" rx="1" fill="#ffffff" />
      </svg>
    </div>
  );
}

// SVG Traffic Light Pole (Flashing Amber)
export function TrafficLightPole() {
  return (
    <svg viewBox="0 0 42 90" className="w-8 h-18 sm:w-10 sm:h-22 md:w-12 md:h-26 drop-shadow-md">
      <ellipse cx="21" cy="85" rx="14" ry="5" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
      <ellipse cx="21" cy="83" rx="10" ry="3.5" fill="#1e293b" />
      <rect x="18.5" y="36" width="5" height="48" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      <rect x="6" y="4" width="30" height="34" rx="6" fill="#1e293b" stroke="#0f172a" strokeWidth="2" />
      <path d="M12 9 C12 6 18 6 18 9" stroke="#0f172a" strokeWidth="2" fill="none" />
      <path d="M24 9 C24 6 30 6 30 9" stroke="#0f172a" strokeWidth="2" fill="none" />
      <circle cx="15" cy="21" r="6" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" className="animate-pulse" />
      <circle cx="14" cy="19" r="2" fill="#ffffff" fillOpacity="0.8" />
      <circle cx="27" cy="21" r="6" fill="#090d16" stroke="#1e293b" strokeWidth="1.5" />
    </svg>
  );
}

// Priority Road Sign (Yellow Diamond)
export function PriorityRoadSign() {
  return (
    <svg viewBox="0 0 36 60" className="w-6 h-10 sm:w-7 sm:h-12 drop-shadow-md">
      <rect x="16.5" y="24" width="3" height="34" fill="#334155" stroke="#1e293b" strokeWidth="0.5" />
      <ellipse cx="18" cy="57" rx="8" ry="2.5" fill="#0f172a" />
      <polygon points="18,2 32,16 18,30 4,16" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
      <polygon points="18,5 29,16 18,27 7,16" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
    </svg>
  );
}

// Low-poly Isometric Slate Rock & Shrub
export function StakeSidewalkRock() {
  return (
    <svg viewBox="0 0 54 44" className="w-10 h-8 sm:w-12 sm:h-10 md:w-14 md:h-11 drop-shadow-lg">
      <ellipse cx="27" cy="34" rx="23" ry="9" fill="#090d16" fillOpacity="0.6" />
      <polygon points="12,32 26,14 42,20 46,34 32,38 16,36" fill="#334155" stroke="#1e293b" strokeWidth="1.2" />
      <polygon points="26,14 42,20 36,28 22,24" fill="#475569" />
      <polygon points="12,32 26,14 22,24 16,36" fill="#1e293b" />
      <circle cx="20" cy="18" r="4" fill="#10b981" fillOpacity="0.7" />
      <circle cx="34" cy="24" r="3.5" fill="#059669" fillOpacity="0.7" />
    </svg>
  );
}

export function ChickenTable({
  round,
  last,
  post,
  loading,
  turbo,
  triggerOutcome,
  animatingRef,
  onBusyChange,
}) {
  const [jumping, setJumping] = useState(false);
  const [jumpLane, setJumpLane] = useState(null);
  const [cashingOut, setCashingOut] = useState(false);
  const [crashAnim, setCrashAnim] = useState(null);
  const [cameraOffset, setCameraOffset] = useState(0);
  const viewportRef = useRef(null);
  const outcomeTimeoutRef = useRef(null);
  const prevRoundIdRef = useRef(null);

  const activeRound = round?.game === "chicken" ? round : null;
  const isSettled = !activeRound && last?.game === "chicken" && last?.state === "settled";
  const r = activeRound || (isSettled ? last : null);
  const p = r?.payload || {};

  const multipliers = p.multipliers || CHICKEN_MULTIPLIERS;
  const currentLane = p.currentLane || 0;
  const hazardLane = crashAnim?.lane || p.hazardLane || 0;
  const currentMult = p.multiplier !== undefined ? p.multiplier : 1.00;

  const currentBet = r?.bet || 10;
  const currentProfit = Math.floor(currentBet * currentMult);
  const isLoss = (isSettled && last?.payout === 0) || Boolean(crashAnim);

  const activeChickenLane = isLoss ? -1 : (jumping && jumpLane !== null ? jumpLane : currentLane);

  useEffect(() => {
    return () => {
      if (outcomeTimeoutRef.current) clearTimeout(outcomeTimeoutRef.current);
      if (animatingRef) animatingRef.current = false;
      if (onBusyChange) onBusyChange(false);
    };
  }, [animatingRef, onBusyChange]);

  useEffect(() => {
    const isNewGameStarting = activeRound && activeRound.id !== prevRoundIdRef.current;
    if (isNewGameStarting) {
      prevRoundIdRef.current = activeRound.id;
      if (outcomeTimeoutRef.current) {
        clearTimeout(outcomeTimeoutRef.current);
        outcomeTimeoutRef.current = null;
      }
      if (animatingRef) animatingRef.current = false;
      if (onBusyChange) onBusyChange(false);
      setCrashAnim(null);
      setJumping(false);
      setJumpLane(null);
    }
  }, [activeRound?.id, animatingRef, onBusyChange]);

  // Dynamic random traffic: 1 car every 5 seconds on a random visible unblocked lane
  const [activeTrafficCars, setActiveTrafficCars] = useState([]);

  useEffect(() => {
    const spawnTrafficCar = () => {
      const candidateLanes = [];
      const minLane = currentLane + 1;
      const maxLane = Math.min(17, currentLane + 5);

      for (let l = minLane; l <= maxLane; l++) {
        candidateLanes.push(l);
      }

      if (candidateLanes.length === 0) {
        for (let l = currentLane + 1; l <= 17; l++) {
          candidateLanes.push(l);
        }
      }

      if (candidateLanes.length === 0) return;

      const randomLane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
      const randomCarIndex = Math.floor(Math.random() * 3);
      const carId = `car_${Date.now()}_${Math.random()}`;

      setActiveTrafficCars((prev) => [...prev, { id: carId, lane: randomLane, carIndex: randomCarIndex }]);

      setTimeout(() => {
        setActiveTrafficCars((prev) => prev.filter((c) => c.id !== carId));
      }, 2100);
    };

    const interval = setInterval(spawnTrafficCar, 5000);
    return () => clearInterval(interval);
  }, [currentLane]);

  // Camera tracking centered on chicken
  useEffect(() => {
    const updateCamera = () => {
      if (!viewportRef.current) return;
      const viewportWidth = viewportRef.current.clientWidth;

      const focusLane = (isLoss && hazardLane > 0)
        ? hazardLane
        : (activeRound ? activeChickenLane : 0);

      if (focusLane === 0) {
        setCameraOffset(0);
        return;
      }

      const laneEl = viewportRef.current.querySelector(`[data-lane="${focusLane}"]`);
      if (!laneEl) return;

      const laneLeft = laneEl.offsetLeft;
      const laneWidth = laneEl.offsetWidth;
      const laneCenter = laneLeft + laneWidth / 2;

      const desired = laneCenter - viewportWidth / 2;
      const trackEl = viewportRef.current.querySelector(".chicken-camera-track");
      const totalWidth = trackEl ? trackEl.scrollWidth : 2800;
      const maxOffset = Math.max(0, totalWidth - viewportWidth);

      setCameraOffset(Math.max(0, Math.min(maxOffset, desired)));
    };

    const timer = requestAnimationFrame(updateCamera);
    window.addEventListener("resize", updateCamera);
    return () => {
      cancelAnimationFrame(timer);
      window.removeEventListener("resize", updateCamera);
    };
  }, [activeRound?.id, activeChickenLane, isLoss, hazardLane]);

  // Handle jump step (triggered by clicking directly on the board / next lane)
  const handleStep = async () => {
    if (!activeRound || loading || jumping || cashingOut || crashAnim) return;
    const nextTarget = currentLane + 1;
    setJumping(true);
    setJumpLane(nextTarget);
    sounds.playTileClick();

    try {
      const res = await post({ action: "chicken", roundId: activeRound.id, move: "step", lane: nextTarget });
      if (res?.round?.state === "settled") {
        if (animatingRef) animatingRef.current = true;
        if (onBusyChange) onBusyChange(true);

        if (res.round.payout === 0) {
          // LOSS: Car hits chicken
          setCrashAnim({ active: true, lane: nextTarget });
          sounds.playExplosion();

          const delay = turbo ? 100 : 500;
          if (outcomeTimeoutRef.current) clearTimeout(outcomeTimeoutRef.current);
          outcomeTimeoutRef.current = setTimeout(() => {
            if (animatingRef) animatingRef.current = false;
            if (onBusyChange) onBusyChange(false);
            if (triggerOutcome) triggerOutcome(res.round, 0);
          }, delay);
        } else {
          // WIN / FINISH (Lane 17 reached!)
          sounds.playGemReveal(1.8);
          const delay = turbo ? 100 : 500;
          if (outcomeTimeoutRef.current) clearTimeout(outcomeTimeoutRef.current);
          outcomeTimeoutRef.current = setTimeout(() => {
            if (animatingRef) animatingRef.current = false;
            if (onBusyChange) onBusyChange(false);
            if (triggerOutcome) triggerOutcome(res.round, 0);
          }, delay);
        }
      } else {
        // Safe step
        sounds.playGemReveal(1.0 + currentLane * 0.05);
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
        if (animatingRef) animatingRef.current = true;
        if (onBusyChange) onBusyChange(true);
        const delay = turbo ? 100 : 500;
        if (outcomeTimeoutRef.current) clearTimeout(outcomeTimeoutRef.current);
        outcomeTimeoutRef.current = setTimeout(() => {
          if (animatingRef) animatingRef.current = false;
          if (onBusyChange) onBusyChange(false);
          if (triggerOutcome) triggerOutcome(res.round, 0);
        }, delay);
      }
    } finally {
      setCashingOut(false);
    }
  };

  return (
    <div className="chicken-game-canvas flex flex-col w-full select-none">
      {/* Top Street Viewport with Rich Stake-Style Surroundings */}
      <div
        ref={viewportRef}
        className="chicken-street-surface relative w-full h-[360px] sm:h-[400px] rounded-xl bg-[#0c131e] border border-slate-800/90 overflow-hidden shadow-2xl"
      >
        {/* Smooth Moving Camera Track */}
        <div
          className="chicken-camera-track flex items-stretch h-full"
          style={{
            transform: `translateX(-${cameraOffset}px)`,
            transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
            width: "max-content",
            minWidth: "100%",
          }}
        >
          {/* Left Sidewalk with 3D Curb, Traffic Light, Diamond Sign & Zebra Crossing */}
          <div className="chicken-left-sidewalk relative w-28 sm:w-34 flex-shrink-0 bg-[#16202e] border-r-4 border-[#243242] flex flex-col items-center justify-between p-3 z-10 shadow-lg">
            {/* Top Traffic Light & Diamond Priority Sign */}
            <div className="pt-2 flex items-center justify-center gap-2">
              <TrafficLightPole />
              <PriorityRoadSign />
            </div>

            {/* Zebra Crossing Lines with beveled road curb markings */}
            <div className="w-full flex flex-col gap-2.5 px-1 my-auto opacity-85">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-full h-3.5 bg-slate-300/40 rounded-sm shadow-inner" />
              ))}
            </div>

            {/* Chicken on Sidewalk ONLY if activeChickenLane === 0 */}
            {activeChickenLane === 0 && !isLoss && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 animate-chicken-hop">
                <ChickenSprite isJumping={jumping} />
              </div>
            )}

            {/* Bottom Sidewalk Slate Rock & Shrub */}
            <div className="pb-2">
              <StakeSidewalkRock />
            </div>
          </div>

          {/* 17 Vertical Lanes (Click on lane to step forward!) */}
          <div className="flex items-stretch h-full flex-shrink-0">
            {multipliers.map((mult, idx) => {
              const laneNum = idx + 1;
              const isCompleted = currentLane >= laneNum;
              const isCurrent = currentLane === laneNum;
              const isPassed = currentLane > laneNum;
              const isNext = currentLane === laneNum - 1 && activeRound;
              const isCrashedLane = hazardLane === laneNum;
              const hasChicken = activeChickenLane === laneNum;

              const hasBlockade = isCompleted;
              const laneCars = activeTrafficCars.filter((c) => c.lane === laneNum && !hasBlockade && !isCrashedLane);

              return (
                <div
                  key={laneNum}
                  data-lane={laneNum}
                  onClick={() => {
                    if (isNext && !jumping && !cashingOut && !crashAnim) {
                      handleStep();
                    }
                  }}
                  className={`chicken-road-lane relative w-36 sm:w-40 md:w-44 flex-shrink-0 h-full flex flex-col items-center justify-between py-4 sm:py-5 border-r border-dashed border-slate-700/60 transition-colors duration-200 overflow-hidden ${
                    isNext ? "cursor-pointer hover:bg-slate-800/50" : ""
                  }`}
                >
                  {/* Top Lane Empty Space (Numbers removed as requested) */}
                  <div className="w-full h-6" />

                  {/* Ambient Car driving down (1 car every ~5s on random lane) */}
                  {laneCars.map((car) => (
                    <div
                      key={car.id}
                      className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-10"
                      style={{
                        animation: "trafficDriveDownSlow 2.0s linear forwards",
                      }}
                    >
                      <AmbientVehicle carIndex={car.carIndex} />
                    </div>
                  ))}

                  {/* Concrete Road Blockade [ | | | | | ] positioned closer to the center right above chicken */}
                  {hasBlockade && (
                    <div className="absolute top-[28%] left-1/2 -translate-x-1/2 z-20">
                      <RoadBlockade />
                    </div>
                  )}

                  {/* Center Road Element: Rozjechany Kurczak (Crash) / Chicken / Gold Coin / Sewer Grate */}
                  <div className="relative flex flex-col items-center justify-center my-auto w-full px-2 pt-6">
                    {/* Crash: Police car + Flattened Dead Chicken on asphalt */}
                    {isCrashedLane && (
                      <div className="absolute z-30 flex flex-col items-center justify-center pointer-events-none">
                        <div className="mb-[-12px]">
                          <PoliceCarTopDown isAnimating={true} />
                        </div>
                        <FlattenedDeadChickenSprite />
                      </div>
                    )}

                    {/* Cute White Chicken ONLY on activeChickenLane */}
                    {hasChicken && !isCrashedLane && (
                      <div className={`absolute z-30 flex items-center justify-center ${jumping ? "animate-chicken-jump" : "animate-chicken-hop"}`}>
                        <ChickenSprite isJumping={jumping} />
                      </div>
                    )}

                    {/* Next Step GO Arrow Indicator (Click on board to jump!) */}
                    {isNext && !isCrashedLane && !hasChicken && (
                      <div className="absolute -top-8 z-20 flex flex-col items-center animate-bounce">
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-950/90 px-2.5 py-0.5 rounded border border-amber-500/50 shadow-md">
                          SKOCZ
                        </span>
                      </div>
                    )}

                    {/* Ground Floor Element:
                        - If lane is PASSED: Golden Chicken Coin!
                        - If lane is CURRENT: Clean asphalt under chicken
                        - If unreached: Sewer Grate base
                    */}
                    <div className={`transition-transform duration-200 ${isNext ? "scale-105" : ""}`}>
                      {isPassed && !isCrashedLane ? (
                        <ChickenGoldCoin />
                      ) : isCurrent || isCrashedLane ? null : (
                        <SewerGrate
                          isCurrent={false}
                          isPassed={false}
                          isCrash={false}
                        />
                      )}
                    </div>
                  </div>

                  {/* Bottom Multiplier Pill Badge */}
                  <div
                    className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-mono font-bold transition-all shadow-md truncate max-w-[90%] text-center z-10 ${
                      isCrashedLane
                        ? "bg-rose-950/90 text-rose-300 border border-rose-500 shadow-rose-900/50 scale-105"
                        : isCurrent
                        ? "bg-amber-400 text-slate-950 shadow-amber-400/40 scale-105 font-black"
                        : isCompleted
                        ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/50"
                        : isNext
                        ? "bg-slate-800 text-amber-300 border border-amber-400/60 animate-pulse"
                        : "bg-[#141d28] text-slate-400 border border-slate-700/60"
                    }`}
                  >
                    {mult.toFixed(2)}x
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Finish Sidewalk / Goal Meta */}
          <div className="chicken-right-sidewalk relative w-28 sm:w-34 flex-shrink-0 bg-[#16202e] border-l-4 border-[#243242] flex flex-col items-center justify-between p-3 z-10 shadow-lg">
            <div className="text-xs font-mono font-black tracking-wider text-emerald-400 bg-emerald-950/90 px-3 py-1 rounded border border-emerald-500/50 shadow-sm mt-1">
              META
            </div>

            {/* Checkered / Finish Zebra Lines */}
            <div className="w-full flex flex-col gap-2.5 px-1 my-auto opacity-90">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="w-full h-3.5 bg-emerald-500/30 border border-emerald-500/20 rounded-sm" />
              ))}
            </div>

            <div className="pb-2">
              <StakeSidewalkRock />
            </div>
          </div>
        </div>
      </div>

      {/* Active Controls Toolbar (Clean Stake layout: Win stats on left, Cashout button on right) */}
      {activeRound && (
        <div className="chicken-hud-bottom flex items-center justify-between gap-4 p-3.5 mt-3 rounded-xl bg-[#121c2a] border border-slate-700/70 shadow-xl">
          {/* Left: Win Info */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                Aktualna wygrana:
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {money(currentProfit)}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  ×{currentMult.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Cashout Button */}
          <div className="flex items-center">
            <button
              type="button"
              disabled={loading || jumping || cashingOut || currentLane < 1 || Boolean(crashAnim)}
              onClick={handleCashout}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm shadow-md transition-all flex items-center gap-2 ${
                currentLane >= 1
                  ? "bg-[#00e701] hover:bg-[#00c801] active:scale-[0.98] text-slate-950 shadow-emerald-500/20 cursor-pointer font-black"
                  : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
              }`}
            >
              <span>Wypłać {currentLane >= 1 ? money(currentProfit) : ""}</span>
              {currentLane >= 1 && (
                <span className="text-xs bg-slate-950/20 px-1.5 py-0.5 rounded font-mono font-black">
                  ×{currentMult.toFixed(2)}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
