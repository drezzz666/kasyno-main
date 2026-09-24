import React, { useEffect, useState, useRef } from "react";
import { sounds } from "../lib/sounds";

const ALL_SYMBOLS = ["2", "F", "G", "T", "◆", "♛"];

export function SlotsTable({ last, loading, slotsSpinning, turbo }) {
  const lastRef = useRef(last);
  lastRef.current = last;

  const currentReels = last?.payload?.reels || [
    ["2", "2", "F"],
    ["F", "F", "G"],
    ["G", "G", "T"],
    ["T", "T", "◆"],
    ["◆", "◆", "♛"],
  ];

  const [stoppedReels, setStoppedReels] = useState([true, true, true, true, true]);
  const [displayedReels, setDisplayedReels] = useState(currentReels);
  const [isWinHighlighted, setIsWinHighlighted] = useState(false);
  const spinIntervalsRef = useRef([]);
  const stopTimersRef = useRef([]);

  // Handle spin lifecycle & staggered reel stopping
  useEffect(() => {
    // Clear any prior intervals / timers
    spinIntervalsRef.current.forEach((id) => id && clearInterval(id));
    spinIntervalsRef.current = [];
    stopTimersRef.current.forEach((id) => id && clearTimeout(id));
    stopTimersRef.current = [];

    if (slotsSpinning) {
      setIsWinHighlighted(false);
      setStoppedReels([false, false, false, false, false]);

      const intervalSpeed = turbo ? 25 : 45;
      const stoppedMask = [false, false, false, false, false];

      // Single synchronized rolling loop for active reels (eliminates 80% re-renders)
      const rollInterval = setInterval(() => {
        setDisplayedReels((prev) => {
          let changed = false;
          const next = [...prev];
          for (let i = 0; i < 5; i++) {
            if (!stoppedMask[i]) {
              changed = true;
              next[i] = [
                ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
                ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
                ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
              ];
            }
          }
          return changed ? next : prev;
        });
      }, intervalSpeed);
      spinIntervalsRef.current = [rollInterval];

      // Staggered reel landings (lightning fast in turbo)
      const stopDelays = turbo
        ? [40, 75, 110, 145, 180]
        : [220, 420, 620, 820, 1020];

      const newStopTimers = stopDelays.map((delay, reelIdx) => {
        return setTimeout(() => {
          stoppedMask[reelIdx] = true;

          // Lock in the final symbols for this reel from current backend round
          const targetReels = lastRef.current?.payload?.reels || currentReels;
          setDisplayedReels((prev) => {
            const next = [...prev];
            next[reelIdx] = targetReels[reelIdx] || [
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            ];
            return next;
          });

          // Mark this reel as stopped for snap/bounce animation
          setStoppedReels((prev) => {
            const next = [...prev];
            next[reelIdx] = true;
            return next;
          });

          // Play lock sound
          sounds.playPegTick();

          // If last reel locked, stop roll timer and check for win animation
          if (reelIdx === 4) {
            clearInterval(rollInterval);
            const round = lastRef.current;
            const hasWon = Boolean(round?.payload?.winning || (round?.payout && round.payout > 0));
            if (hasWon) {
              setTimeout(() => {
                setIsWinHighlighted(true);
                sounds.playWin();
              }, turbo ? 20 : 60);
            }
          }
        }, delay);
      });
      stopTimersRef.current = newStopTimers;

      return () => {
        clearInterval(rollInterval);
        stopTimersRef.current.forEach((id) => id && clearTimeout(id));
      };
    } else {
      // Idle state
      const targetReels = last?.payload?.reels || currentReels;
      setDisplayedReels(targetReels);
      setStoppedReels([true, true, true, true, true]);
      const hasWon = Boolean(last?.payload?.winning || (last?.payout && last.payout > 0));
      setIsWinHighlighted(hasWon);
    }
  }, [slotsSpinning, turbo]);

  // Check which middle symbols are part of the winning combo
  const middleSymbols = displayedReels.map((col) => col[1]);
  const symbolCounts = {};
  middleSymbols.forEach((s) => {
    symbolCounts[s] = (symbolCounts[s] || 0) + 1;
  });

  const isWinningSpin = Boolean(
    (last?.payload?.winning || (last?.payout && last.payout > 0)) && isWinHighlighted
  );

  const winningSymbolsSet = new Set(
    Object.entries(symbolCounts)
      .filter(([sym, cnt]) => cnt >= 2 || (sym === "♛" && isWinningSpin))
      .map(([sym]) => sym)
  );

  return (
    <div className={`slots-container ${isWinningSpin ? "winner-glow" : ""}`}>
      {/* Payline Laser Indicators */}
      <div className={`payline-indicator left ${isWinningSpin ? "active" : ""}`} />
      <div className={`payline-indicator right ${isWinningSpin ? "active" : ""}`} />
      {isWinningSpin && <div className="payline-laser" />}

      {/* 5-Reel Slot Grid */}
      <div className="slots-reels-grid">
        {[0, 1, 2, 3, 4].map((reelIdx) => {
          const isSpinning = !stoppedReels[reelIdx];
          const isJustStopped = stoppedReels[reelIdx] && slotsSpinning;

          return (
            <div
              key={reelIdx}
              className={`slot-reel-column ${isSpinning ? "spinning" : ""} ${
                isJustStopped ? "reel-snap-bounce" : ""
              }`}
            >
              {[0, 1, 2].map((rowIdx) => {
                const symbol = displayedReels[reelIdx]?.[rowIdx] || "2";
                const isCenter = rowIdx === 1;
                const isWinningBox =
                  isCenter &&
                  isWinningSpin &&
                  winningSymbolsSet.has(symbol);

                return (
                  <div
                    key={rowIdx}
                    className={`slot-symbol-box ${isCenter ? "center-line" : ""} ${
                      isWinningBox ? "win-symbol-pulse" : ""
                    } ${isSpinning ? "symbol-blur" : ""}`}
                  >
                    <span className={`symbol-glyph symbol-${symbol}`}>
                      {symbol}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
