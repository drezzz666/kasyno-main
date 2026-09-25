import React, { useEffect, useState, useRef } from "react";
import { sounds } from "../../lib/sounds";

const ALL_SYMBOLS = ["7", "💎", "⭐", "🔔", "🍒", "🍋"];
const STRIP_LENGTH = 24;

export function SlotsTable({ last, loading, slotsSpinning, turbo }) {
  const [displayedReels, setDisplayedReels] = useState(() => [
    ["🍒", "7", "💎"],
    ["⭐", "7", "🔔"],
    ["🍋", "7", "🍒"],
  ]);

  const [reelStrips, setReelStrips] = useState(() => [
    ["🍒", "7", "💎"],
    ["⭐", "7", "🔔"],
    ["🍋", "7", "🍒"],
  ]);

  const [reelStates, setReelStates] = useState(["idle", "idle", "idle"]);
  const [isWinHighlighted, setIsWinHighlighted] = useState(false);
  const timersRef = useRef([]);

  useEffect(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    if (slotsSpinning) {
      setIsWinHighlighted(false);

      const targetReels = last?.payload?.reels || [
        ["7", "7", "7"],
        ["7", "7", "7"],
        ["7", "7", "7"],
      ];

      // Build continuous strips starting with current symbols and ending with target outcome
      const newStrips = [0, 1, 2].map((i) => {
        const topSymbols = displayedReels[i] || ["7", "7", "7"];
        const bottomSymbols = targetReels[i] || ["7", "7", "7"];
        const middle = [];
        for (let k = 0; k < STRIP_LENGTH - 6; k++) {
          middle.push(ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)]);
        }
        return [...topSymbols, ...middle, ...bottomSymbols];
      });

      setReelStrips(newStrips);
      setReelStates(["idle", "idle", "idle"]);

      // Trigger spin transition in next animation frame
      const animFrame = requestAnimationFrame(() => {
        setReelStates(["spinning", "spinning", "spinning"]);
      });

      const stopDurations = turbo ? [120, 220, 320] : [950, 1350, 1750];

      stopDurations.forEach((dur, reelIdx) => {
        const t = setTimeout(() => {
          setReelStates((prev) => {
            const next = [...prev];
            next[reelIdx] = "stopped";
            return next;
          });
          sounds.playPegTick();

          if (reelIdx === 2) {
            setDisplayedReels(targetReels);
            const hasWon = Boolean(last?.payload?.winning || (last?.payout && last.payout > 0));
            if (hasWon) {
              const winT = setTimeout(() => {
                setIsWinHighlighted(true);
                sounds.playWin();
              }, turbo ? 20 : 60);
              timersRef.current.push(winT);
            }
          }
        }, dur);
        timersRef.current.push(t);
      });

      return () => {
        cancelAnimationFrame(animFrame);
        timersRef.current.forEach((t) => clearTimeout(t));
      };
    } else {
      if (last?.payload?.reels) {
        setDisplayedReels(last.payload.reels);
        setReelStrips(last.payload.reels);
      }
      setReelStates(["idle", "idle", "idle"]);
      const hasWon = Boolean(last?.payload?.winning || (last?.payout && last.payout > 0));
      setIsWinHighlighted(hasWon);
    }
  }, [slotsSpinning, turbo, last]);

  // Middle payline symbols
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
        {[0, 1, 2].map((reelIdx) => {
          const state = reelStates[reelIdx];
          const isSpinning = state === "spinning";
          const strip = reelStrips[reelIdx] || displayedReels[reelIdx];
          const totalItems = strip.length;
          const shiftPercent = totalItems > 3 && isSpinning
            ? -((totalItems - 3) / totalItems) * 100
            : 0;

          const duration = turbo ? 120 + reelIdx * 100 : 950 + reelIdx * 400;

          return (
            <div key={reelIdx} className="slot-reel-viewport">
              <div
                className={`slot-reel-strip ${isSpinning ? "is-accelerating-spinning" : state === "stopped" ? "reel-snap-bounce" : ""}`}
                style={{
                  transform: isSpinning ? `translate3d(0, ${shiftPercent}%, 0)` : "translate3d(0, 0, 0)",
                  transition: isSpinning ? `transform ${duration}ms cubic-bezier(0.12, 0.85, 0.22, 1.05)` : "none",
                }}
              >
                {strip.map((symbol, sIdx) => {
                  const isCenter = sIdx === 1 || (totalItems > 3 && sIdx === totalItems - 2);
                  const isVisibleInFinal = !isSpinning && sIdx === 1;
                  const isWinningBox = isVisibleInFinal && isWinningSpin && winningSymbolsSet.has(symbol);

                  return (
                    <div
                      key={sIdx}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
