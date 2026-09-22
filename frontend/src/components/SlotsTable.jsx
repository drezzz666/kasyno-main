import React, { useEffect, useState, useRef } from "react";
import { sounds } from "../lib/sounds";

const ALL_SYMBOLS = ["2", "F", "G", "T", "◆", "♛"];

export function SlotsTable({ last, loading, slotsSpinning, turbo }) {
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

  // Handle spin lifecycle & staggered reel stopping
  useEffect(() => {
    if (slotsSpinning) {
      setIsWinHighlighted(false);
      setStoppedReels([false, false, false, false, false]);

      // Clear any prior intervals
      spinIntervalsRef.current.forEach((id) => clearInterval(id));
      spinIntervalsRef.current = [];

      const intervalSpeed = turbo ? 15 : 45;

      // Start rapid rolling shuffle for all reels
      const newIntervals = [0, 1, 2, 3, 4].map((reelIdx) => {
        return setInterval(() => {
          setDisplayedReels((prev) => {
            const next = [...prev];
            next[reelIdx] = [
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
              ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)],
            ];
            return next;
          });
        }, intervalSpeed);
      });
      spinIntervalsRef.current = newIntervals;

      // Staggered reel landings (lightning fast in turbo)
      const stopDelays = turbo
        ? [40, 75, 110, 145, 180]
        : [250, 450, 650, 850, 1050];

      const stopTimers = stopDelays.map((delay, reelIdx) => {
        return setTimeout(() => {
          // Stop this reel's rapid roll
          if (spinIntervalsRef.current[reelIdx]) {
            clearInterval(spinIntervalsRef.current[reelIdx]);
          }

          // Lock in the final symbols for this reel from last payload or current
          setDisplayedReels((prev) => {
            const next = [...prev];
            next[reelIdx] = currentReels[reelIdx] || [
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

          // If last reel locked, check for win animation
          if (reelIdx === 4) {
            setTimeout(() => {
              if (last?.payload?.winning || (last?.payout && last.payout > 0)) {
                setIsWinHighlighted(true);
                sounds.playWin();
              }
            }, turbo ? 30 : 80);
          }
        }, delay);
      });

      return () => {
        spinIntervalsRef.current.forEach((id) => clearInterval(id));
        stopTimers.forEach((id) => clearTimeout(id));
      };
    } else {
      // Idle state
      setDisplayedReels(currentReels);
      setStoppedReels([true, true, true, true, true]);
      if (last?.payload?.winning || (last?.payout && last.payout > 0)) {
        setIsWinHighlighted(true);
      } else {
        setIsWinHighlighted(false);
      }
    }
  }, [slotsSpinning, last?.id, turbo]);

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
