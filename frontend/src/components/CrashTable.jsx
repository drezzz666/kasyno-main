import React, { useEffect, useRef } from "react";
import { Rocket, Zap, Target } from "lucide-react";
import { money } from "../lib/formatters";

const CRASH_PRESETS = [
  { label: "0.9×", val: 0.9 },
  { label: "1.1×", val: 1.1 },
  { label: "1.2×", val: 1.2 },
  { label: "1.5×", val: 1.5 },
  { label: "2.0×", val: 2.0 },
  { label: "3.0×", val: 3.0 },
];

export function CrashTable({
  bet,
  autoCashout,
  setAutoCashout,
  isPlaying,
  currentMult = 0.8,
  isCrashed,
  isCashedOut,
  onCashout,
  graphPoints = [],
  last,
  loading,
}) {
  const canvasRef = useRef(null);

  // 60FPS Canvas Graph Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = 420;
    const height = 240;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid Lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = height - (height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!graphPoints || graphPoints.length < 2) return;

    const maxMult = Math.max(2.0, currentMult * 1.15);
    const maxTime = Math.max(5, graphPoints[graphPoints.length - 1]?.x || 5);

    // 2. Draw Exponential Curve
    ctx.beginPath();
    ctx.strokeStyle = isCrashed
      ? "#f43f5e"
      : isCashedOut
        ? "#34d399"
        : currentMult >= 2.0
          ? "#10b981"
          : "#38bdf8";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    graphPoints.forEach((pt, idx) => {
      const x = (pt.x / maxTime) * (width - 30) + 15;
      const y = height - ((pt.y - 0.8) / (maxMult - 0.8)) * (height - 40) - 20;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 3. Fill Gradient Area Under Curve
    const lastPt = graphPoints[graphPoints.length - 1];
    const lastX = (lastPt.x / maxTime) * (width - 30) + 15;
    const lastY = height - ((lastPt.y - 0.8) / (maxMult - 0.8)) * (height - 40) - 20;

    ctx.lineTo(lastX, height);
    ctx.lineTo(15, height);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    if (isCrashed) {
      grad.addColorStop(0, "rgba(244, 63, 94, 0.35)");
      grad.addColorStop(1, "rgba(244, 63, 94, 0.0)");
    } else if (isCashedOut) {
      grad.addColorStop(0, "rgba(52, 211, 153, 0.35)");
      grad.addColorStop(1, "rgba(52, 211, 153, 0.0)");
    } else {
      grad.addColorStop(0, "rgba(56, 189, 248, 0.35)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // 4. Draw Rocket / Leading Glow Dot
    if (!isCrashed) {
      ctx.beginPath();
      ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [graphPoints, isCrashed, isCashedOut, currentMult]);

  const livePayout = Math.floor(bet * currentMult);

  return (
    <div className="crash-container">
      {/* Canvas Curve Arena */}
      <div className="crash-arena">
        <canvas ref={canvasRef} className="crash-canvas" />

        {/* Live Center Multiplier */}
        <div className="crash-center-overlay">
          <div
            className={`crash-live-ticker ${
              isCrashed
                ? "crashed"
                : isCashedOut
                  ? "cashed-out"
                  : isPlaying
                    ? "flying"
                    : "idle"
            }`}
          >
            {isPlaying
              ? `${currentMult.toFixed(2)}x`
              : isCrashed
                ? `ROZBITO @ ${(last?.payload?.crash_point || currentMult).toFixed(2)}x`
                : isCashedOut
                  ? `WYPŁACONO @ ${(last?.payload?.cashed_at || currentMult).toFixed(2)}x`
                  : `${(last?.payload?.crash_point || 0.8).toFixed(2)}x`}
          </div>

          {isPlaying && (
            <div className="crash-live-profit">
              Wypłata: <strong>{money(livePayout)}</strong>
            </div>
          )}

          {isPlaying && onCashout && (
            <button
              type="button"
              className="btn-crash-cashout mt-3 px-6 py-2 pointer-events-auto"
              onClick={onCashout}
            >
              <span className="btn-crash-cashout-main">WYPŁAĆ ({currentMult.toFixed(2)}×)</span>
              <span className="btn-crash-cashout-sub">Wypłata: {money(livePayout)}</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive Controls & Auto-Cashout */}
      <div className="crash-controls-row">
        <div className="crash-auto-cashout-box w-full">
          <div className="crash-auto-header flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Target size={14} className="text-amber-400" />
              <span>Docelowy Cashout</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Min: 0.80× | Max: 1,000×</span>
          </div>

          <div className="crash-auto-input-wrap">
            <input
              type="number"
              step="0.05"
              min="0.8"
              max="1000"
              disabled={isPlaying || loading}
              value={autoCashout}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0.8) {
                  setAutoCashout(Math.min(1000, v));
                }
              }}
              className="crash-auto-input"
            />
            <span className="crash-auto-suffix">×</span>
          </div>

          <div className="limbo-presets-row mt-2">
            {CRASH_PRESETS.map((p) => (
              <button
                key={p.val}
                type="button"
                disabled={isPlaying || loading}
                className={`limbo-preset-btn ${autoCashout === p.val ? "active" : ""}`}
                onClick={() => setAutoCashout(p.val)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
