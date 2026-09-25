import React, { useEffect, useState, useRef } from "react";
import { sounds } from "../../lib/sounds";

const ALL_SYMBOLS = ["7", "💎", "⭐", "🔔", "🍒", "🍋"];

function SlotReel({
  reelIndex,
  targetSymbols,
  isSpinning,
  turbo,
  onStopped,
  isWinningSpin,
  winningSymbolsSet,
}) {
  const [currentSymbols, setCurrentSymbols] = useState(() => targetSymbols || ["7", "7", "7"]);
  const [stopped, setStopped] = useState(!isSpinning);
  const [bounce, setBounce] = useState(false);
  const [nudgeY, setNudgeY] = useState(0);
  const [isNudging, setIsNudging] = useState(false);
  const timeoutRef = useRef(null);
  const nudgeTimerRef = useRef(null);

  useEffect(() => {
    if (isSpinning) {
      setStopped(false);
      setBounce(false);
      setNudgeY(0);
      setIsNudging(false);

      const duration = turbo ? 100 + reelIndex * 80 : 700 + reelIndex * 380;
      const startTime = performance.now();
      let tickDelay = turbo ? 30 : 60;

      const roll = () => {
        const elapsed = performance.now() - startTime;
        if (elapsed < duration) {
          setCurrentSymbols([
            ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
          ]);

          // Smooth gradual deceleration in the final 260ms of spin
          const remaining = duration - elapsed;
          if (remaining < 260 && !turbo) {
            tickDelay = Math.min(140, tickDelay + 14);
          }

          timeoutRef.current = setTimeout(roll, tickDelay);
        } else {
          // Lock onto backend target outcome
          const finalSymbols = targetSymbols || ["7", "7", "7"];
          setCurrentSymbols(finalSymbols);
          setStopped(true);

          // Occasional organic nudge (misalignment that snaps into place)
          const willNudge = !turbo && Math.random() < 0.42;
          if (willNudge) {
            const offset = (Math.random() > 0.5 ? 1 : -1) * Math.floor(7 + Math.random() * 6);
            setNudgeY(offset);
            setIsNudging(false);
            sounds.playPegTick();

            // After brief suspense pause, smoothly snap straight
            nudgeTimerRef.current = setTimeout(() => {
              setIsNudging(true);
              setNudgeY(0);
              setBounce(true);
              sounds.playPegTick();
              if (onStopped) onStopped(reelIndex);
            }, 120);
          } else {
            setNudgeY(0);
            setIsNudging(false);
            setBounce(true);
            sounds.playPegTick();
            if (onStopped) onStopped(reelIndex);
          }
        }
      };

      timeoutRef.current = setTimeout(roll, tickDelay);

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      };
    } else {
      if (targetSymbols) setCurrentSymbols(targetSymbols);
      setStopped(true);
      setNudgeY(0);
      setIsNudging(false);
    }
  }, [isSpinning, targetSymbols, turbo, reelIndex]);

  const centerSymbol = currentSymbols[1];
  const isWinningBox = stopped && nudgeY === 0 && isWinningSpin && winningSymbolsSet.has(centerSymbol);

  return (
    <div className="slot-reel-viewport">
      <div
        className={`slot-reel-column ${!stopped ? "spinning" : ""} ${bounce ? "reel-snap-bounce" : ""}`}
        style={{
          transform: `translate3d(0, ${nudgeY}px, 0)`,
          transition: isNudging ? "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        }}
      >
        {currentSymbols.map((symbol, rowIdx) => {
          const isCenter = rowIdx === 1;
          const isWin = isCenter && isWinningBox;

          return (
            <div
              key={rowIdx}
              className={`slot-symbol-box ${isCenter ? "center-line" : ""} ${
                isWin ? "win-symbol-pulse" : ""
              } ${!stopped ? "symbol-blur" : ""}`}
            >
              <span className={`symbol-glyph symbol-${symbol}`}>{symbol}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SlotsTable({ last, loading, slotsSpinning, turbo }) {
  const targetReels = last?.payload?.reels || [
    ["🍒", "7", "💎"],
    ["⭐", "7", "🔔"],
    ["🍋", "7", "🍒"],
  ];

  const [stoppedCount, setStoppedCount] = useState(3);
  const [isWinHighlighted, setIsWinHighlighted] = useState(false);

  useEffect(() => {
    if (slotsSpinning) {
      setStoppedCount(0);
      setIsWinHighlighted(false);
    } else {
      setStoppedCount(3);
      const hasWon = Boolean(last?.payload?.winning || (last?.payout && last.payout > 0));
      setIsWinHighlighted(hasWon);
    }
  }, [slotsSpinning, last]);

  const handleReelStopped = (idx) => {
    setStoppedCount((prev) => {
      const next = prev + 1;
      if (next === 3) {
        const hasWon = Boolean(last?.payload?.winning || (last?.payout && last.payout > 0));
        if (hasWon) {
          setTimeout(() => {
            setIsWinHighlighted(true);
            sounds.playWin();
          }, turbo ? 20 : 60);
        }
      }
      return next;
    });
  };

  // Center payline symbols
  const middleSymbols = targetReels.map((col) => col[1]);
  const symbolCounts = {};
  middleSymbols.forEach((s) => {
    symbolCounts[s] = (symbolCounts[s] || 0) + 1;
  });

  const isWinningSpin = Boolean(
    (last?.payload?.winning || (last?.payout && last.payout > 0)) && isWinHighlighted
  );

  const winningSymbolsSet = new Set(
    Object.entries(symbolCounts)
      .filter(([sym, cnt]) => cnt >= 2 || isWinningSpin)
      .map(([sym]) => sym)
  );

  return (
    <div className={`slots-container ${isWinningSpin ? "winner-glow" : ""}`}>
      {/* Payline Laser Indicators */}
      <div className={`payline-indicator left ${isWinningSpin ? "active" : ""}`} />
      <div className={`payline-indicator right ${isWinningSpin ? "active" : ""}`} />
      {isWinningSpin && <div className="payline-laser" />}

      {/* 3-Reel Classic Slot Grid */}
      <div className="slots-reels-grid classic-3reel">
        {[0, 1, 2].map((reelIdx) => (
          <SlotReel
            key={reelIdx}
            reelIndex={reelIdx}
            targetSymbols={targetReels[reelIdx]}
            isSpinning={slotsSpinning}
            turbo={turbo}
            onStopped={handleReelStopped}
            isWinningSpin={isWinningSpin}
            winningSymbolsSet={winningSymbolsSet}
          />
        ))}
      </div>
    </div>
  );
}
