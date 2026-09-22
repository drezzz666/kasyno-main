import React, { useEffect, useRef, useState } from "react";

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
  const [rotation, setRotation] = useState(0);
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

export function RouletteBets({ choice, setChoice, disabled = false }) {
  const pick = (v, label, cls = "") => (
    <button
      type="button"
      disabled={disabled}
      className={`${cls} ${choice === v ? "selected" : ""}`}
      onClick={() => setChoice(v)}
    >
      {label}
    </button>
  );

  return (
    <div className="roulette-table">
      <div className="number-grid">
        {pick("0", "0", "zero span-zero")}
        {Array.from({ length: 36 }, (_, i) => {
          const n = i + 1;
          return pick(
            String(n),
            String(n),
            redNumbers.has(n) ? "red" : "black",
          );
        })}
      </div>
      <div className="outside-bets">
        {pick("dozen1", "1–12 (×3)")}
        {pick("dozen2", "13–24 (×3)")}
        {pick("dozen3", "25–36 (×3)")}
        {pick("low", "1–18 (×2)")}
        {pick("even", "PARZYSTE (×2)")}
        {pick("red", "CZERWONE (×2)", "red")}
        {pick("black", "CZARNE (×2)", "black")}
        {pick("odd", "NIEPARZYSTE (×2)")}
        {pick("high", "19–36 (×2)")}
      </div>
    </div>
  );
}
