import React, { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { format } from "../lib/formatters";
import { sounds } from "../lib/sounds";
import { Sparkles, Trophy, Flame, Zap, Check } from "lucide-react";

export function WinCelebrationModal({
  winData,
  onClose,
}) {
  const [displayAmount, setDisplayAmount] = useState(0);

  useEffect(() => {
    if (!winData || !winData.payout || winData.payout <= (winData.bet || 0)) {
      return;
    }

    const payout = winData.payout;
    const bet = winData.bet || 10;
    const multiplier = winData.multiplier || payout / Math.max(1, bet);

    // 1. Play procedural audio chime
    sounds.playWin(multiplier);
    setTimeout(() => sounds.playCoins(), 250);

    // 2. Launch Confetti blast
    const count = multiplier >= 15 ? 200 : multiplier >= 5 ? 120 : 60;
    confetti({
      particleCount: count,
      spread: multiplier >= 15 ? 100 : 70,
      origin: { y: 0.55 },
      colors: ["#f59e0b", "#10b981", "#38bdf8", "#ec4899", "#fbbf24", "#ffffff"],
    });

    if (multiplier >= 10) {
      // Secondary cannon blast
      const end = Date.now() + 1500;
      const interval = setInterval(() => {
        if (Date.now() > end) {
          clearInterval(interval);
          return;
        }
        confetti({
          startVelocity: 30,
          spread: 360,
          ticks: 60,
          origin: { x: Math.random(), y: Math.random() * 0.4 },
          colors: ["#fbbf24", "#34d399", "#f43f5e"],
        });
      }, 300);
    }

    // 3. Number Counter Animation (Count up smoothly)
    let startTimestamp = null;
    const duration = Math.min(1200, Math.max(400, multiplier * 80));

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayAmount(Math.floor(easeOut * payout));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplayAmount(payout);
      }
    };
    requestAnimationFrame(step);

    // 4. Auto dismiss timeout if user doesn't click
    const autoCloseTimer = setTimeout(() => {
      onClose();
    }, 4500);

    return () => clearTimeout(autoCloseTimer);
  }, [winData, onClose]);

  if (!winData || !winData.payout || winData.payout <= (winData.bet || 0)) {
    return null;
  }

  const payout = winData.payout;
  const bet = winData.bet || 10;
  const multiplier = winData.multiplier || (payout / Math.max(1, bet));

  let tierLabel = "WYGRANA!";
  let tierColor = "text-emerald-400";
  let tierBg = "bg-emerald-500/10 border-emerald-500/30";
  let TierIcon = Sparkles;

  if (multiplier >= 50) {
    tierLabel = "EPIC JACKPOT!";
    tierColor = "text-rose-400";
    tierBg = "bg-rose-500/15 border-rose-500/40";
    TierIcon = Trophy;
  } else if (multiplier >= 15) {
    tierLabel = "MEGA WIN!";
    tierColor = "text-purple-400";
    tierBg = "bg-purple-500/15 border-purple-500/40";
    TierIcon = Zap;
  } else if (multiplier >= 5) {
    tierLabel = "BIG WIN!";
    tierColor = "text-amber-400";
    tierBg = "bg-amber-500/15 border-amber-500/40";
    TierIcon = Flame;
  }

  return (
    <div className="win-celebration-backdrop" onClick={onClose}>
      <div className="win-celebration-card" onClick={(e) => e.stopPropagation()}>
        {/* Tier Header Badge */}
        <div className={`win-tier-badge ${tierBg}`}>
          <TierIcon size={18} className={tierColor} />
          <span className={`font-display font-black tracking-widest uppercase text-sm ${tierColor}`}>
            {tierLabel}
          </span>
        </div>

        {/* Multiplier Tag */}
        <div className="win-multiplier-pill">
          <span>MNOŻNIK ×{multiplier.toFixed(2)}</span>
        </div>

        {/* Big Counter Amount */}
        <div className="win-amount-counter">
          <span className="win-counter-number font-mono font-black">
            +{format(displayAmount)}
          </span>
          <span className="win-counter-currency font-display">$FGT</span>
        </div>

        {/* Subtitle result text */}
        {winData.resultText && (
          <p className="win-result-desc text-xs text-slate-300">
            {winData.resultText}
          </p>
        )}

        {/* Collect Action Button */}
        <button
          type="button"
          className="btn-collect-win"
          onClick={onClose}
        >
          <Check size={16} />
          <span>ZBIERZ WYGRANĄ</span>
        </button>
      </div>
    </div>
  );
}
