import React, { useEffect, useState, useRef } from "react";
import confetti from "canvas-confetti";
import { format } from "../lib/formatters";
import { sounds } from "../lib/sounds";
import { Sparkles, Trophy, Flame, Zap, Check, XCircle, RefreshCw } from "lucide-react";

export function RoundOutcomeModal({
  outcomeData,
  onClose,
}) {
  const [displayAmount, setDisplayAmount] = useState(0);
  const lastTriggeredPayloadRef = useRef(null);

  useEffect(() => {
    if (!outcomeData) return;
    if (lastTriggeredPayloadRef.current === outcomeData) return;
    lastTriggeredPayloadRef.current = outcomeData;

    const payout = outcomeData.payout || 0;
    const bet = outcomeData.bet || 10;
    const isWin = payout > bet;
    const isPush = payout === bet && bet > 0;
    const multiplier = outcomeData.multiplier || (payout / Math.max(1, bet));

    if (isWin) {
      // 1. Audio
      sounds.playWin(multiplier);
      setTimeout(() => sounds.playCoins(), 200);

      // 2. Confetti
      const count = multiplier >= 15 ? 200 : multiplier >= 5 ? 120 : 60;
      confetti({
        particleCount: count,
        spread: multiplier >= 15 ? 100 : 70,
        origin: { y: 0.55 },
        colors: ["#f59e0b", "#10b981", "#38bdf8", "#ec4899", "#fbbf24", "#ffffff"],
      });

      if (multiplier >= 10) {
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

      // 3. Counter Animation
      let startTimestamp = null;
      const duration = Math.min(1000, Math.max(300, multiplier * 60));
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        setDisplayAmount(Math.floor(easeOut * payout));
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          setDisplayAmount(payout);
        }
      };
      requestAnimationFrame(step);
    } else if (isPush) {
      sounds.playPush();
      setDisplayAmount(payout);
    } else {
      sounds.playLoss();
      setDisplayAmount(0);
    }
  }, [outcomeData]);

  useEffect(() => {
    if (!outcomeData) return;
    const isWin = (outcomeData.payout || 0) > (outcomeData.bet || 10);
    const timer = setTimeout(() => {
      onClose();
    }, isWin ? 4000 : 2500);

    return () => clearTimeout(timer);
  }, [outcomeData, onClose]);

  if (!outcomeData) return null;

  const payout = outcomeData.payout || 0;
  const bet = outcomeData.bet || 10;
  const isWin = payout > bet;
  const isPush = payout === bet && bet > 0;
  const isLoss = payout < bet;
  const multiplier = outcomeData.multiplier || (payout / Math.max(1, bet));

  let tierLabel = "WYGRANA!";
  let tierColor = "text-emerald-400";
  let tierBg = "bg-emerald-500/15 border-emerald-500/40";
  let TierIcon = Sparkles;

  if (isWin) {
    if (multiplier >= 50) {
      tierLabel = "EPIC JACKPOT!";
      tierColor = "text-rose-400";
      tierBg = "bg-rose-500/20 border-rose-500/50";
      TierIcon = Trophy;
    } else if (multiplier >= 15) {
      tierLabel = "MEGA WIN!";
      tierColor = "text-purple-400";
      tierBg = "bg-purple-500/20 border-purple-500/50";
      TierIcon = Zap;
    } else if (multiplier >= 3) {
      tierLabel = "BIG WIN!";
      tierColor = "text-amber-400";
      tierBg = "bg-amber-500/20 border-amber-500/50";
      TierIcon = Flame;
    }
  } else if (isPush) {
    tierLabel = "REMIS (PUSH)";
    tierColor = "text-sky-400";
    tierBg = "bg-sky-500/15 border-sky-500/40";
    TierIcon = RefreshCw;
  } else {
    tierLabel = "PRZEGRANA";
    tierColor = "text-rose-400";
    tierBg = "bg-rose-500/15 border-rose-500/30";
    TierIcon = XCircle;
  }

  return (
    <div className="win-celebration-backdrop" onClick={onClose}>
      <div className={`win-celebration-card ${isLoss ? "loss-card" : isPush ? "push-card" : ""}`} onClick={(e) => e.stopPropagation()}>
        {/* Tier Header Badge */}
        <div className={`win-tier-badge ${tierBg}`}>
          <TierIcon size={18} className={tierColor} />
          <span className={`font-display font-black tracking-widest uppercase text-sm ${tierColor}`}>
            {tierLabel}
          </span>
        </div>

        {/* Multiplier Tag */}
        <div className="win-multiplier-pill">
          <span>
            {isWin
              ? `MNOŻNIK ×${(Number(multiplier) || 1.0).toFixed(2)}`
              : isPush
                ? "ZWROT STAWKI ×1.00"
                : "STRATA STAWKI"}
          </span>
        </div>

        {/* Amount Display */}
        <div className="win-amount-counter">
          <span className={`win-counter-number font-mono font-black ${isLoss ? "text-rose-400" : isPush ? "text-sky-400" : "text-amber-400"}`}>
            {isWin ? `+${format(displayAmount)}` : isPush ? `${format(payout)}` : `-${format(bet)}`}
          </span>
          <span className="win-counter-currency font-display">$FGT</span>
        </div>

        {/* Result description */}
        {outcomeData.resultText && (
          <p className="win-result-desc text-xs text-slate-300">
            {outcomeData.resultText}
          </p>
        )}

        {/* Action Button */}
        <button
          type="button"
          className={`btn-collect-win ${isLoss ? "btn-loss" : isPush ? "btn-push" : ""}`}
          onClick={onClose}
        >
          <Check size={16} />
          <span>{isWin ? "ZBIERZ WYGRANĄ" : isPush ? "KONTYNUUJ" : "ZAGRAJ PONOWNIE"}</span>
        </button>
      </div>
    </div>
  );
}
