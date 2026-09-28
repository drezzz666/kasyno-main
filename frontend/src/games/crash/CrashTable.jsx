import React, { useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { money } from "../../lib/formatters";

export const CRASH_PRESETS = [
  { label: "1.20×", val: 1.2 },
  { label: "1.50×", val: 1.5 },
  { label: "2.00×", val: 2.0 },
  { label: "3.00×", val: 3.0 },
  { label: "5.00×", val: 5.0 },
  { label: "10.0×", val: 10.0 },
  { label: "20.0×", val: 20.0 },
  { label: "50.0×", val: 50.0 },
];

export function CrashTable({
  bet = 0,
  isPlaying = false,
  currentMult = 0.8,
  isCrashed = false,
  isCashedOut = false,
  graphPoints = [],
  last,
  autoCashout = 2.0,
  setAutoCashout,
  loading = false,
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
  const numCashout = Math.max(0.8, Math.min(1000, Number(autoCashout) || 2.0));
  const potentialPayout = Math.floor((Number(bet) || 0) * numCashout);

  return (
    <div className="crash-container w-full max-w-2xl mx-auto flex flex-col items-center justify-center gap-3 sm:gap-4 p-2 select-none my-auto">
      {/* Canvas Curve Arena */}
      <div className="crash-arena w-full">
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
              ? `${(Number(currentMult) || 1.0).toFixed(2)}x`
              : isCrashed
                ? `ROZBITO @ ${(Number(last?.payload?.crash_point) || Number(currentMult) || 1.0).toFixed(2)}x`
                : isCashedOut
                  ? `WYPŁACONO @ ${(Number(last?.payload?.cashed_at) || Number(currentMult) || 1.0).toFixed(2)}x`
                  : `${(Number(last?.payload?.crash_point) || 0.8).toFixed(2)}x`}
          </div>
        </div>
      </div>

      {/* Prominent Auto-Cashout Multiplier Console */}
      <div className="w-full bg-[#0c121d]/90 border border-slate-800 shadow-xl rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 backdrop-blur-sm">
        {/* Header: Title & Potential Cashout Payout */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300">
            <Zap size={15} className="text-blue-400 fill-blue-400" />
            <span>Automatyczna Wypłata</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400">Cel:</span>
            <span className="text-blue-400 font-black">{numCashout.toFixed(2)}×</span>
            {potentialPayout > 0 && (
              <>
                <span className="text-slate-600 hidden xs:inline">•</span>
                <span className="text-slate-400 hidden xs:inline">Wypłata:</span>
                <span className="text-emerald-400 font-black hidden xs:inline">{potentialPayout} ₽</span>
              </>
            )}
          </div>
        </div>

        {/* 8 Prominent Preset Buttons (4 cols on mobile, 8 cols on desktop) */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 sm:gap-2 w-full">
          {CRASH_PRESETS.map((p) => {
            const isSelected = Math.abs(numCashout - p.val) < 0.01;
            return (
              <button
                key={p.val}
                type="button"
                disabled={isPlaying || loading}
                onClick={() => setAutoCashout && setAutoCashout(p.val)}
                className={`h-11 sm:h-12 rounded-xl font-mono font-black text-xs sm:text-sm md:text-base transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
                  isSelected
                    ? "bg-blue-600 text-white border-2 border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.45)] scale-102"
                    : "bg-[#141b27] hover:bg-[#1e293b] text-slate-200 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Fine-tuning Stepper & Custom Multiplier Input */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            disabled={isPlaying || loading || numCashout <= 1.0}
            onClick={() => setAutoCashout && setAutoCashout(Math.max(0.8, Math.round((numCashout - 0.1) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="-0.1×"
          >
            -0.1×
          </button>
          <button
            type="button"
            disabled={isPlaying || loading || numCashout <= 1.0}
            onClick={() => setAutoCashout && setAutoCashout(Math.max(0.8, Math.round((numCashout * 0.5) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="½"
          >
            ½
          </button>
          <div className="relative flex-1 flex items-center">
            <input
              type="number"
              step="0.05"
              min="0.80"
              max="1000"
              value={autoCashout}
              disabled={isPlaying || loading}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setAutoCashout && setAutoCashout(isNaN(v) ? "" : v);
              }}
              onBlur={() => {
                setAutoCashout && setAutoCashout((t) => Math.max(0.8, Math.min(1000, Number(t) || 2.0)));
              }}
              className="w-full h-10 px-3 pr-8 rounded-lg bg-[#0a0f18] border border-slate-700/90 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-blue-500 shadow-inner"
              placeholder="Własny cel wypłaty..."
            />
            <span className="absolute right-3 text-xs font-black text-slate-400 pointer-events-none">×</span>
          </div>
          <button
            type="button"
            disabled={isPlaying || loading || numCashout >= 1000}
            onClick={() => setAutoCashout && setAutoCashout(Math.min(1000, Math.round((numCashout * 2) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="2×"
          >
            2×
          </button>
          <button
            type="button"
            disabled={isPlaying || loading || numCashout >= 1000}
            onClick={() => setAutoCashout && setAutoCashout(Math.min(1000, Math.round((numCashout + 0.1) * 10) / 10))}
            className="h-10 px-2.5 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-slate-300 font-mono font-black text-xs border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 cursor-pointer"
            title="+0.1×"
          >
            +0.1×
          </button>
        </div>
      </div>
    </div>
  );
}
