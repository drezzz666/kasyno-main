import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, Sparkles, Trophy, Package, CheckCircle2, RotateCcw, Flame, Gem, Crown, Coins } from "lucide-react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";
import { money } from "../lib/formatters";

const GoldIcon = ({ size = 24, className }) => (
  <img src="/images/gold.webp" alt="" width={size} height={size} className={className} loading="lazy" decoding="async" />
);

// Tier colors and icons configuration
const TIER_META = {
  nic: {
    label: "NIC",
    border: "border-slate-600/50",
    bg: "from-slate-800/80 via-slate-900/90 to-slate-950",
    barColor: "#475569",
    glow: "rgba(71, 85, 105, 0.2)",
    textColor: "text-slate-400",
    badgeBg: "bg-slate-700/50 text-slate-300",
    icon: Package,
  },
  low: {
    label: "ZWYKŁY",
    border: "border-blue-500/40",
    bg: "from-blue-950/60 via-slate-900/90 to-slate-950",
    barColor: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.3)",
    textColor: "text-blue-400",
    badgeBg: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    icon: Coins,
  },
  mid: {
    label: "RZADKI",
    border: "border-purple-500/40",
    bg: "from-purple-950/60 via-slate-900/90 to-slate-950",
    barColor: "#a855f7",
    glow: "rgba(168, 85, 247, 0.35)",
    textColor: "text-purple-400",
    badgeBg: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    icon: Gem,
  },
  high: {
    label: "MISTRZOWSKI",
    border: "border-pink-500/50",
    bg: "from-pink-950/60 via-slate-900/90 to-slate-950",
    barColor: "#ec4899",
    glow: "rgba(236, 72, 153, 0.4)",
    textColor: "text-pink-400",
    badgeBg: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
    icon: Crown,
  },
  jackpot: {
    label: "🔥 JACKPOT",
    border: "border-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.3)]",
    bg: "from-amber-950/70 via-amber-900/40 to-slate-950",
    barColor: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.6)",
    textColor: "text-amber-300",
    badgeBg: "bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black shadow-md",
    icon: GoldIcon,
  },
};

// Possible items template pool per box type
const BOX_POOLS = {
  plebs: [
    { prize: 0, name: "Nic", tier: "nic" },
    { prize: 100, name: "100 ₽", tier: "low" },
    { prize: 500, name: "500 ₽", tier: "mid" },
    { prize: 1500, name: "1 500 ₽", tier: "high" },
    { prize: 5000, name: "5 000 ₽ (Jackpot)", tier: "jackpot" },
  ],
  arystokracja: [
    { prize: 0, name: "Nic", tier: "nic" },
    { prize: 250, name: "250 ₽", tier: "low" },
    { prize: 1000, name: "1 000 ₽", tier: "mid" },
    { prize: 3000, name: "3 000 ₽", tier: "high" },
    { prize: 10000, name: "10 000 ₽", tier: "high" },
    { prize: 50000, name: "50 000 ₽ (Jackpot)", tier: "jackpot" },
  ],
  lepsza: [
    { prize: 0, name: "Nic", tier: "nic" },
    { prize: 1000, name: "1 000 ₽", tier: "low" },
    { prize: 5000, name: "5 000 ₽", tier: "mid" },
    { prize: 10000, name: "10 000 ₽", tier: "high" },
    { prize: 25000, name: "25 000 ₽", tier: "high" },
    { prize: 50000, name: "50 000 ₽", tier: "high" },
    { prize: 100000, name: "100 000 ₽ (Jackpot)", tier: "jackpot" },
  ],
};

const CARD_WIDTH = 140; // in px
const CARD_GAP = 8;     // in px
const ITEM_STEP = CARD_WIDTH + CARD_GAP; // 148px
const TOTAL_ITEMS = 65;
const WINNING_INDEX = 48; // Exact winning slot index
const SPIN_DURATION_MS = 5200; // 5.2s duration

export function CaseSpinner({ boxConfig, outcome, onComplete, onBack, onReopen, canReopen, reopenButtonText }) {
  const [items, setItems] = useState([]);
  const [isSpinning, setIsSpinning] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [translateX, setTranslateX] = useState(0);

  const containerRef = useRef(null);
  const soundTickRef = useRef(null);
  const animStartTimeRef = useRef(null);
  const lastTickCardRef = useRef(-1);

  // Generate full items strip with the winning item placed at WINNING_INDEX
  useEffect(() => {
    if (!boxConfig || !outcome) return;

    const pool = BOX_POOLS[boxConfig.id] || BOX_POOLS.plebs;

    // Determine tier of the winning outcome
    let winTier = "nic";
    if (outcome.prize > 0) {
      if (outcome.isJackpot || outcome.prize >= (boxConfig.id === "plebs" ? 5000 : boxConfig.id === "arystokracja" ? 50000 : 100000)) {
        winTier = "jackpot";
      } else if (outcome.prize >= 10000) {
        winTier = "high";
      } else if (outcome.prize >= 1000) {
        winTier = "mid";
      } else {
        winTier = "low";
      }
    }

    const winningItem = {
      prize: outcome.prize,
      name: outcome.prizeName || (outcome.prize > 0 ? `${money(outcome.prize)}` : "Nic"),
      tier: winTier,
      isWinner: true,
      key: `win-${outcome.prize}-${Date.now()}`,
    };

    const newItems = [];
    for (let i = 0; i < TOTAL_ITEMS; i++) {
      if (i === WINNING_INDEX) {
        newItems.push(winningItem);
      } else {
        // Pick random item from pool
        const randItem = pool[Math.floor(Math.random() * pool.length)];
        newItems.push({
          ...randItem,
          isWinner: false,
          key: `item-${i}-${randItem.prize}`,
        });
      }
    }

    setItems(newItems);
    setIsFinished(false);
    setTranslateX(0);

    // Start spin after brief mount tick
    const startTimer = setTimeout(() => {
      startSpinAnimation(winningItem);
    }, 120);

    return () => {
      clearTimeout(startTimer);
      if (soundTickRef.current) cancelAnimationFrame(soundTickRef.current);
    };
  }, [boxConfig, outcome]);

  const startSpinAnimation = (winningItem) => {
    if (!containerRef.current) return;

    const containerWidth = containerRef.current.offsetWidth || 700;
    const centerPoint = containerWidth / 2;

    // Calculate exact center of winning card
    const winningItemCenter = WINNING_INDEX * ITEM_STEP + CARD_WIDTH / 2;
    // Add realistic random offset (-40px to +40px) inside the card bounds so it doesn't land dead-center every single time
    const randomInnerCardOffset = (Math.random() - 0.5) * (CARD_WIDTH * 0.65);
    const targetX = winningItemCenter - centerPoint + randomInnerCardOffset;

    setIsSpinning(true);
    setTranslateX(targetX);
    animStartTimeRef.current = performance.now();
    lastTickCardRef.current = -1;

    // Ticker audio loop matching the cubic-bezier physics curve
    const tickLoop = (currentTime) => {
      if (!animStartTimeRef.current) return;
      const elapsed = currentTime - animStartTimeRef.current;
      const progress = Math.min(1, elapsed / SPIN_DURATION_MS);

      // Evaluate cubic-bezier(0.08, 0.6, 0.15, 1.0) approx for progress
      const easedProgress = Math.min(1, 1 - Math.pow(1 - progress, 3.8));
      const currentScrollX = easedProgress * targetX;

      // Check which card is crossing the center line
      const currentCenterCardIndex = Math.floor((currentScrollX + centerPoint) / ITEM_STEP);

      if (currentCenterCardIndex !== lastTickCardRef.current) {
        lastTickCardRef.current = currentCenterCardIndex;
        if (sounds && typeof sounds.playCaseTick === "function") {
          sounds.playCaseTick();
        }
      }

      if (progress < 1) {
        soundTickRef.current = requestAnimationFrame(tickLoop);
      } else {
        // Spin finished!
        handleSpinEnd(winningItem);
      }
    };

    soundTickRef.current = requestAnimationFrame(tickLoop);
  };

  const handleSpinEnd = (winningItem) => {
    setIsSpinning(false);
    setIsFinished(true);

    if (winningItem.prize > 0) {
      if (winningItem.tier === "jackpot" || winningItem.prize >= 10000) {
        try {
          if (sounds && typeof sounds.playBigWin === "function") {
            sounds.playBigWin();
          }
        } catch (_) {}
        confetti({
          particleCount: 130,
          spread: 95,
          origin: { y: 0.6 },
          colors: ["#F59E0B", "#10B981", "#38BDF8", "#EC4899", "#A855F7"],
        });
      } else {
        try {
          if (sounds && typeof sounds.playCoins === "function") {
            sounds.playCoins();
          }
        } catch (_) {}
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.65 },
        });
      }
    } else {
      try {
        if (sounds && typeof sounds.playLoss === "function") {
          sounds.playLoss();
        }
      } catch (_) {}
    }

    if (onComplete) {
      onComplete(outcome);
    }
  };

  return (
    <div className="case-spinner-wrapper w-full select-none space-y-4 animate-in fade-in zoom-in-95 duration-200">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 px-2">
        <button
          type="button"
          onClick={onBack}
          disabled={!isFinished || isSpinning}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
            !isFinished || isSpinning
              ? "bg-slate-800/40 text-slate-500 border-slate-800 cursor-not-allowed pointer-events-none select-none"
              : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-slate-600 shadow-md"
          }`}
        >
          <ArrowLeft size={14} />
          POWRÓT
        </button>

        {/* Box Name Header */}
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-black tracking-wider uppercase text-amber-300">
            {boxConfig.name}
          </span>
        </div>

        <div className="text-xs font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 rounded-lg">
          Max: <strong className="text-amber-300">{boxConfig.maxWin}</strong>
        </div>
      </div>

      {/* Main Roulette Carousel Container */}
      <div className="relative rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-slate-700/80 p-1.5 shadow-2xl overflow-hidden">
        {/* Left and Right Fade Gradients */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent z-20" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28 bg-gradient-to-l from-slate-950 via-slate-950/80 to-transparent z-20" />

        {/* Vertical Center Indicator Arrow / Needle (Top & Bottom) */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 z-30 flex flex-col justify-between items-center py-0.5">
          {/* Top Yellow Needle */}
          <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-t-[12px] border-t-amber-400 drop-shadow-[0_2px_8px_rgba(251,191,36,0.9)] animate-pulse" />

          {/* Central Vertical Glowing Line */}
          <div className="w-[2px] h-full bg-gradient-to-b from-amber-400 via-amber-300 to-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.85)]" />

          {/* Bottom Yellow Needle */}
          <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[12px] border-b-amber-400 drop-shadow-[0_-2px_8px_rgba(251,191,36,0.9)] animate-pulse" />
        </div>

        {/* Carousel Viewport */}
        <div
          ref={containerRef}
          className="relative w-full h-[170px] overflow-hidden rounded-xl bg-slate-950/90 flex items-center"
        >
          {/* Animated Horizontal Tape */}
          <div
            className="flex items-center absolute left-0"
            style={{
              gap: `${CARD_GAP}px`,
              transform: `translateX(-${translateX}px)`,
              transition: isSpinning
                ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.08, 0.6, 0.15, 1.0)`
                : "none",
              willChange: "transform",
            }}
          >
            {items.map((item, idx) => {
              const meta = TIER_META[item.tier] || TIER_META.nic;
              const IconComp = meta.icon;
              const isWinnerLanded = isFinished && idx === WINNING_INDEX;

              return (
                <div
                  key={item.key || idx}
                  className={`shrink-0 rounded-xl relative overflow-hidden flex flex-col items-center justify-between p-3 border transition-all ${
                    meta.border
                  } ${
                    isWinnerLanded
                      ? "ring-2 ring-amber-400 scale-[1.04] shadow-[0_0_24px_rgba(245,158,11,0.5)] z-10"
                      : "opacity-85"
                  }`}
                  style={{
                    width: `${CARD_WIDTH}px`,
                    height: "155px",
                    background: `linear-gradient(180deg, ${meta.barColor}15 0%, #090d16 100%)`,
                  }}
                >

                  {/* Icon Visual */}
                  <div className="my-auto flex flex-col items-center justify-center">
                    <IconComp size={item.tier === "jackpot" ? 40 : 28} className={meta.textColor} />
                  </div>

                  {/* Card Bottom Prize Text */}
                  <div className="w-full text-center mt-1">
                    <p className={`text-xs font-black truncate leading-tight ${meta.textColor}`}>
                      {item.name}
                    </p>
                  </div>

                  {/* Rarity Bottom Stripe Bar (CS:GO style) */}
                  <div
                    className="absolute bottom-0 inset-x-0 h-1.5"
                    style={{
                      backgroundColor: meta.barColor,
                      boxShadow: `0 0 10px ${meta.barColor}`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Outcome Reveal Bottom Banner (shown when spin completes) */}
      {isFinished && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 shadow-2xl ${
            outcome.prize > 0
              ? outcome.isJackpot
                ? "bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-slate-900 border-amber-500/80 text-amber-200"
                : "bg-gradient-to-r from-emerald-950/80 via-slate-900 to-slate-900 border-emerald-500/80 text-emerald-200"
              : "bg-slate-900/90 border-slate-700 text-slate-300"
          }`}
        >
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div
              className={`p-3 rounded-2xl shrink-0 ${
                outcome.prize > 0
                  ? outcome.isJackpot
                    ? "bg-amber-500/30 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                    : "bg-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {outcome.prize > 0 ? (
                outcome.isJackpot ? <Trophy size={32} /> : <CheckCircle2 size={32} />
              ) : (
                <Package size={32} />
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                {outcome.prize > 0 ? "Otrzymano nagrodę" : "Wynik losowania"}
              </p>
              <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                {outcome.prize > 0 ? (
                  <span>
                    🎉 <strong className="text-amber-300 font-black">+{money(outcome.prize)}</strong>
                    {outcome.isJackpot && (
                      <span className="text-amber-400 ml-2 inline-flex items-center gap-1 text-sm bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40">
                        <Flame size={14} /> JACKPOT!
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">Pusta skrzynka (Brak wygranej)</span>
                )}
              </h3>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            {canReopen && (
              <button
                type="button"
                onClick={onReopen}
                className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl text-xs font-extrabold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all shadow-lg flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                {reopenButtonText || "Otwórz kolejną"}
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-md"
            >
              Wróć do skrzynek
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
