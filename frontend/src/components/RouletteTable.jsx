import React, { useEffect, useRef } from "react";
import { Trash2, Flame } from "lucide-react";

export const wheelOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const redNumbers = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const rouletteSectorAngle = 360 / wheelOrder.length;
const rouletteStops = wheelOrder
  .map(
    (n, i) =>
      `${n === 0 ? "#10b981" : redNumbers.has(n) ? "#dc2626" : "#18181b"} ${i * rouletteSectorAngle}deg ${(i + 1) * rouletteSectorAngle}deg`,
  )
  .join(",");

export function RouletteWheelVisual({
  mustStartSpinning,
  prizeNumber,
  onStopSpinning,
  turbo = false,
}) {
  const [rotation, setRotation] = React.useState(0);
  const runningRef = useRef(false);
  const timerRef = useRef(null);
  const stopRef = useRef(onStopSpinning);
  const finishRef = useRef(() => {});

  stopRef.current = onStopSpinning;
  finishRef.current = () => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    stopRef.current();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mustStartSpinning || runningRef.current) return;
    runningRef.current = true;
    const targetRotation =
      ((-(prizeNumber * rouletteSectorAngle) % 360) + 360) % 360;
    setRotation((previous) => {
      const current = ((previous % 360) + 360) % 360;
      const spins = turbo ? 2 : 4;
      const delta = spins * 360 + ((targetRotation - current + 360) % 360);
      return previous + delta;
    });
    timerRef.current = window.setTimeout(() => finishRef.current(), turbo ? 850 : 6420);
  }, [mustStartSpinning, prizeNumber, turbo]);

  return (
    <div className="roulette-custom" aria-label="Koło ruletki">
      <div className="roulette-pointer" aria-hidden="true" />
      <div
        className="roulette-dial"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: `transform ${turbo ? "0.75s" : "6s"} cubic-bezier(0.12, 0.8, 0.32, 1)`,
          background: `conic-gradient(from ${-rouletteSectorAngle / 2}deg,${rouletteStops})`,
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "transform") finishRef.current();
        }}
      >
        <div className="roulette-labels">
          {wheelOrder.map((n, i) => (
            <span
              className="roulette-spoke"
              style={{ transform: `rotate(${i * rouletteSectorAngle}deg)` }}
              key={n}
            >
              <b
                style={{
                  transform: `translateX(-50%) rotate(${-i * rouletteSectorAngle}deg)`,
                }}
              >
                {n}
              </b>
            </span>
          ))}
        </div>
        <div className="roulette-inner-ring">
          <div className="roulette-hub" />
        </div>
      </div>
    </div>
  );
}

// 3 rows of European roulette numbers
const ROW_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const ROW_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const ROW_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

export function RouletteBets({
  selectedBets = new Set(),
  onToggleBet,
  onClearBets,
  winningNumber = null,
  disabled = false,
}) {
  const isWinning = (spot) => {
    if (winningNumber === null || winningNumber === undefined) return false;
    const num = Number(spot);
    if (!isNaN(num) && num === winningNumber) return true;
    const color = winningNumber === 0 ? "green" : redNumbers.has(winningNumber) ? "red" : "black";
    if (spot === color) return true;
    if (spot === "even" && winningNumber > 0 && winningNumber % 2 === 0) return true;
    if (spot === "odd" && winningNumber > 0 && winningNumber % 2 === 1) return true;
    if (spot === "low" && winningNumber >= 1 && winningNumber <= 18) return true;
    if (spot === "high" && winningNumber >= 19 && winningNumber <= 36) return true;
    if (spot === "dozen1" && winningNumber >= 1 && winningNumber <= 12) return true;
    if (spot === "dozen2" && winningNumber >= 13 && winningNumber <= 24) return true;
    if (spot === "dozen3" && winningNumber >= 25 && winningNumber <= 36) return true;
    return false;
  };

  const renderBtn = (id, label, sublabel, cls = "") => {
    const isSelected = selectedBets.has(id);
    const won = isWinning(id);

    return (
      <button
        key={id}
        type="button"
        disabled={disabled}
        className={`simple-r-btn ${cls} ${isSelected ? "selected" : ""} ${won ? "winner" : ""}`}
        onClick={() => onToggleBet(id)}
      >
        <span className="font-extrabold text-sm sm:text-base">{label}</span>
        {sublabel && <span className="text-xs opacity-85 font-mono">{sublabel}</span>}
      </button>
    );
  };

  return (
    <div className="simple-roulette-container">
      {/* 1. Main Colors & Zero */}
      <div className="simple-r-colors-row">
        {renderBtn("red", "CZERWONE", "×2", "btn-red-main")}
        {renderBtn("0", "0 ZIELONE", "×36", "btn-zero-main")}
        {renderBtn("black", "CZARNE", "×2", "btn-black-main")}
      </div>

      {/* 2. 50/50 Outside Bets */}
      <div className="simple-r-grid-4">
        {renderBtn("low", "1–18", "×2 (Niskie)")}
        {renderBtn("even", "PARZYSTE", "×2 (Even)")}
        {renderBtn("odd", "NIEPARZYSTE", "×2 (Odd)")}
        {renderBtn("high", "19–36", "×2 (Wysokie)")}
      </div>

      {/* 3. Dozens (Tuziny ×3) */}
      <div className="simple-r-grid-3">
        {renderBtn("dozen1", "1. Tuzin", "1–12 (×3)")}
        {renderBtn("dozen2", "2. Tuzin", "13–24 (×3)")}
        {renderBtn("dozen3", "3. Tuzin", "25–36 (×3)")}
      </div>

      {/* 4. Actions Row */}
      {selectedBets.size > 0 && (
        <div className="simple-r-actions-row">
          <button
            type="button"
            disabled={disabled}
            onClick={onClearBets}
            className="simple-action-btn danger w-full justify-center py-2"
          >
            <Trash2 size={15} />
            <span>Wyczyść zaznaczone zakłady ({selectedBets.size})</span>
          </button>
        </div>
      )}
    </div>
  );
}
