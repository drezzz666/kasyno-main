import React, { useEffect, useRef } from "react";
import { money } from "../../lib/formatters";

export function CrashTable({
  bet,
  isPlaying,
  currentMult = 0.8,
  isCrashed,
  isCashedOut,
  graphPoints = [],
  last,
}) {
  const canvasRef = useRef(null);
  const dimRef = useRef({ width: 640, height: 360, dpr: typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1 });

  // Handle canvas sizing on mount / window resize only (avoids layout thrashing)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width || 640);
      const height = Math.max(180, rect.height || 360);
      dimRef.current = { width, height, dpr };
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // 60FPS Canvas Graph Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { width, height, dpr } = dimRef.current;

    const ctx = canvas.getContext("2d");
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
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
        </div>
      </div>
    </div>
  );
}
