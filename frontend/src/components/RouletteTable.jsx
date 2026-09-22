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
      const delta = 4 * 360 + ((targetRotation - current + 360) % 360);
      return previous + delta;
    });
    timerRef.current = window.setTimeout(() => finishRef.current(), 6420);
  }, [mustStartSpinning, prizeNumber]);

  return (
    <div className="roulette-custom" aria-label="Koło ruletki">
      <div className="roulette-pointer" aria-hidden="true" />
      <div
        className="roulette-dial"
        style={{
          transform: `rotate(${rotation}deg)`,
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
  onSelectAllNumbers,
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
    if (spot === "col1" && winningNumber > 0 && (winningNumber - 1) % 3 === 0) return true;
    if (spot === "col2" && winningNumber > 0 && (winningNumber - 2) % 3 === 0) return true;
    if (spot === "col3" && winningNumber > 0 && winningNumber % 3 === 0) return true;
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
        <span className="font-bold">{label}</span>
        {sublabel && <span className="text-[10px] opacity-75">{sublabel}</span>}
      </button>
    );
  };

  return (
    <div className="simple-roulette-container">
      {/* 1. Main Colors & Zero (Most common bets) */}
      <div className="simple-r-colors-row">
        {renderBtn("red", "CZERWONE", "Mnożnik ×2", "btn-red-main")}
        {renderBtn("0", "0 (Zielone)", "Mnożnik ×36", "btn-zero-main")}
        {renderBtn("black", "CZARNE", "Mnożnik ×2", "btn-black-main")}
      </div>

      {/* 2. Simple Outside Bets (1-18, Parzyste, Nieparzyste, 19-36) */}
      <div className="simple-r-grid-4">
        {renderBtn("low", "1–18 (Niskie)", "×2")}
        {renderBtn("even", "PARZYSTE", "×2")}
        {renderBtn("odd", "NIEPARZYSTE", "×2")}
        {renderBtn("high", "19–36 (Wysokie)", "×2")}
      </div>

      {/* 3. Dozens (Tuziny ×3) */}
      <div className="simple-r-grid-3">
        {renderBtn("dozen1", "1st 12 (1–12)", "×3")}
        {renderBtn("dozen2", "2nd 12 (13–24)", "×3")}
        {renderBtn("dozen3", "3rd 12 (25–36)", "×3")}
      </div>

      {/* 4. Numbers Grid 1-36 */}
      <div className="simple-r-numbers-board">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
          <span>Pojedyncze numery (×36):</span>
          <span className="text-slate-500 font-normal">Kliknij numer, aby wybrać</span>
        </div>

        <div className="simple-numbers-table">
          <div className="numbers-subrow">
            {ROW_3.map((n) =>
              renderBtn(
                String(n),
                String(n),
                "",
                redNumbers.has(n) ? "num-red" : "num-black"
              )
            )}
            {renderBtn("col3", "2:1", "×3", "num-col")}
          </div>
          <div className="numbers-subrow">
            {ROW_2.map((n) =>
              renderBtn(
                String(n),
                String(n),
                "",
                redNumbers.has(n) ? "num-red" : "num-black"
              )
            )}
            {renderBtn("col2", "2:1", "×3", "num-col")}
          </div>
          <div className="numbers-subrow">
            {ROW_1.map((n) =>
              renderBtn(
                String(n),
                String(n),
                "",
                redNumbers.has(n) ? "num-red" : "num-black"
              )
            )}
            {renderBtn("col1", "2:1", "×3", "num-col")}
          </div>
        </div>
      </div>

      {/* 5. Quick Presets & Clear */}
      <div className="simple-r-actions-row">
        <button
          type="button"
          disabled={disabled || selectedBets.size === 0}
          onClick={onClearBets}
          className="simple-action-btn danger"
        >
          <Trash2 size={13} />
          <span>Wyczyść wybór</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={onSelectAllNumbers}
          className="simple-action-btn gold"
          title="Wybierz wszystkie 37 numerów koła (0-36)"
        >
          <Flame size={13} className="text-amber-400" />
          <span>Obstaw całe koło (wszystkie 37 numerów)</span>
        </button>
      </div>
    </div>
  );
}
