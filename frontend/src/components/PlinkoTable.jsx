import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";

export const PLINKO_MULTIPLIERS = {
  low: {
    8: [10.0, 3.0, 1.5, 1.0, 0.5, 1.0, 1.5, 3.0, 10.0],
    9: [10.0, 4.0, 1.7, 1.1, 0.7, 0.7, 1.1, 1.7, 4.0, 10.0],
    10: [11.0, 4.0, 2.0, 1.1, 0.9, 0.5, 0.9, 1.1, 2.0, 4.0, 11.0],
    11: [12.0, 5.0, 2.0, 1.2, 1.0, 0.7, 0.7, 1.0, 1.2, 2.0, 5.0, 12.0],
    12: [15.0, 6.0, 3.0, 1.5, 1.1, 0.9, 0.5, 0.9, 1.1, 1.5, 3.0, 6.0, 15.0],
    13: [16.0, 8.0, 3.0, 1.8, 1.2, 1.0, 0.7, 0.7, 1.0, 1.2, 1.8, 3.0, 8.0, 16.0],
    14: [20.0, 10.0, 4.0, 2.0, 1.3, 1.0, 0.8, 0.5, 0.8, 1.0, 1.3, 2.0, 4.0, 10.0, 20.0],
    15: [25.0, 12.0, 5.0, 3.0, 1.5, 1.1, 0.9, 0.6, 0.6, 0.9, 1.1, 1.5, 3.0, 5.0, 12.0, 25.0],
    16: [30.0, 15.0, 6.0, 3.0, 1.8, 1.2, 1.0, 0.8, 0.5, 0.8, 1.0, 1.2, 1.8, 3.0, 6.0, 15.0, 30.0],
  },
  medium: {
    8: [20.0, 4.0, 1.5, 0.6, 0.4, 0.6, 1.5, 4.0, 20.0],
    9: [25.0, 6.0, 2.0, 0.9, 0.5, 0.5, 0.9, 2.0, 6.0, 25.0],
    10: [30.0, 8.0, 3.0, 1.2, 0.6, 0.4, 0.6, 1.2, 3.0, 8.0, 30.0],
    11: [40.0, 10.0, 4.0, 1.5, 0.8, 0.5, 0.5, 0.8, 1.5, 4.0, 10.0, 40.0],
    12: [50.0, 12.0, 5.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 5.0, 12.0, 50.0],
    13: [70.0, 15.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 15.0, 70.0],
    14: [100.0, 20.0, 7.0, 4.0, 1.4, 1.0, 0.5, 0.2, 0.5, 1.0, 1.4, 4.0, 7.0, 20.0, 100.0],
    15: [150.0, 30.0, 10.0, 5.0, 2.0, 1.2, 0.6, 0.3, 0.3, 0.6, 1.2, 2.0, 5.0, 10.0, 30.0, 150.0],
    16: [200.0, 40.0, 12.0, 6.0, 3.0, 1.5, 1.0, 0.5, 0.2, 0.5, 1.0, 1.5, 3.0, 6.0, 12.0, 40.0, 200.0],
  },
  high: {
    8: [50.0, 6.0, 1.5, 0.3, 0.0, 0.3, 1.5, 6.0, 50.0],
    9: [75.0, 10.0, 2.0, 0.5, 0.2, 0.2, 0.5, 2.0, 10.0, 75.0],
    10: [100.0, 15.0, 3.0, 0.8, 0.3, 0.0, 0.3, 0.8, 3.0, 15.0, 100.0],
    11: [150.0, 20.0, 5.0, 1.2, 0.3, 0.1, 0.1, 0.3, 1.2, 5.0, 20.0, 150.0],
    12: [250.0, 30.0, 8.0, 2.0, 0.6, 0.2, 0.0, 0.2, 0.6, 2.0, 8.0, 30.0, 250.0],
    13: [350.0, 40.0, 10.0, 3.0, 1.0, 0.3, 0.1, 0.1, 0.3, 1.0, 3.0, 10.0, 40.0, 350.0],
    14: [500.0, 50.0, 14.0, 4.0, 2.0, 0.3, 0.2, 0.0, 0.2, 0.3, 2.0, 4.0, 14.0, 50.0, 500.0],
    15: [750.0, 80.0, 20.0, 7.0, 3.0, 0.5, 0.2, 0.0, 0.0, 0.2, 0.5, 3.0, 7.0, 20.0, 80.0, 750.0],
    16: [1000.0, 100.0, 25.0, 9.0, 4.0, 1.5, 0.5, 0.2, 0.0, 0.2, 0.5, 1.5, 4.0, 9.0, 25.0, 100.0, 1000.0],
  },
};

function interpolateColors(from, to, length) {
  return Array.from({ length }, (_, i) => ({
    r: Math.round(from.r + ((to.r - from.r) / Math.max(1, length - 1)) * i),
    g: Math.round(from.g + ((to.g - from.g) / Math.max(1, length - 1)) * i),
    b: Math.round(from.b + ((to.b - from.b) / Math.max(1, length - 1)) * i),
  }));
}

function getBinColors(binCount) {
  const isEven = binCount % 2 === 0;
  const halfLength = Math.ceil(binCount / 2);

  const red = { r: 255, g: 0, b: 63 };
  const yellow = { r: 255, g: 192, b: 0 };
  const redShadow = { r: 166, g: 0, b: 4 };
  const yellowShadow = { r: 171, g: 121, b: 0 };

  const bgHalf = interpolateColors(red, yellow, halfLength).map((c) => `rgb(${c.r}, ${c.g}, ${c.b})`);
  const shadowHalf = interpolateColors(redShadow, yellowShadow, halfLength).map((c) => `rgb(${c.r}, ${c.g}, ${c.b})`);

  const bgReversed = [...bgHalf].reverse().slice(isEven ? 0 : 1);
  const shadowReversed = [...shadowHalf].reverse().slice(isEven ? 0 : 1);

  return {
    backgrounds: [...bgHalf, ...bgReversed],
    shadows: [...shadowHalf, ...shadowReversed],
  };
}

const WIDTH = 760;
const HEIGHT = 570;
const PADDING_X = 36;
const PADDING_TOP = 40;
const PADDING_BOTTOM = 46;

// Fast Cubic Bezier inline calculation
function cubicBezier(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

// Helper to compute pin coordinates
const getPinPos = (r, c, totalRows) => {
  const lastRowPinCount = 3 + totalRows - 1;
  const pinDistanceX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
  const rowY = PADDING_TOP + ((HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (totalRows - 1)) * r;
  const rowPaddingX = PADDING_X + ((totalRows - 1 - r) * pinDistanceX) / 2;
  const colX = rowPaddingX + c * pinDistanceX;
  return { x: colX, y: rowY };
};

export const PlinkoTable = forwardRef(function PlinkoTable(
  { rows = 14, setRows, risk = "medium", setRisk, onBallFinish, loading, turbo = false },
  ref
) {
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const activeBallsRef = useRef([]);
  const pinHitsRef = useRef(new Map());
  const animFrameIdRef = useRef(null);
  const isLoopRunningRef = useRef(false);

  // Pre-rendered off-screen background & pins canvas cache (Zero per-frame gradient allocations)
  const bgCanvasCacheRef = useRef(null);

  const onBallFinishRef = useRef(onBallFinish);
  onBallFinishRef.current = onBallFinish;

  const currentMults = PLINKO_MULTIPLIERS[risk]?.[rows] || PLINKO_MULTIPLIERS.medium[14];
  const currentMultsRef = useRef(currentMults);
  currentMultsRef.current = currentMults;

  const [bouncedBin, setBouncedBin] = useState(null);
  const [activeBallCount, setActiveBallCount] = useState(0);
  const [recentHits, setRecentHits] = useState([]);
  const [canvasRect, setCanvasRect] = useState(null);

  const binColors = getBinColors(currentMults.length);

  // 1. Pre-render static background and all 120+ metallic pins onto an offscreen canvas
  useEffect(() => {
    let offscreen = bgCanvasCacheRef.current;
    if (!offscreen) {
      offscreen = document.createElement("canvas");
      offscreen.width = WIDTH;
      offscreen.height = HEIGHT;
      bgCanvasCacheRef.current = offscreen;
    }
    const ctx = offscreen.getContext("2d", { alpha: false });
    if (!ctx) return;

    // A. Dark background
    ctx.fillStyle = "#0a0d14";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // B. Subtle grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
    }
    ctx.stroke();

    // C. All metallic pins rendered ONCE
    const pinRadius = Math.max(3.5, 6.0 - rows * 0.16);

    for (let r = 0; r < rows; ++r) {
      const cols = 3 + r;
      for (let c = 0; c < cols; ++c) {
        const pin = getPinPos(r, c, rows);

        // Pin shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.arc(pin.x, pin.y + 2.5, pinRadius, 0, Math.PI * 2);
        ctx.fill();

        // Metallic pin gradient
        const pinGrad = ctx.createRadialGradient(
          pin.x - pinRadius * 0.35,
          pin.y - pinRadius * 0.35,
          pinRadius * 0.1,
          pin.x,
          pin.y,
          pinRadius
        );
        pinGrad.addColorStop(0, "#ffffff");
        pinGrad.addColorStop(0.6, "#cbd5e1");
        pinGrad.addColorStop(1, "#475569");

        ctx.fillStyle = pinGrad;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, pinRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render single initial frame on main canvas
    drawFrame(performance.now());
  }, [rows]);

  // Main high-speed rendering function
  const drawFrame = useCallback((now, dt = 16) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Blit pre-rendered static background & pins in 1 native GPU call (~0.05ms)
    if (bgCanvasCacheRef.current) {
      ctx.drawImage(bgCanvasCacheRef.current, 0, 0);
    } else {
      ctx.fillStyle = "#0a0d14";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // 2. Draw only active pin hits / spring shockwaves (lightweight alpha arcs, NO heavy shadowBlur)
    const pinRadius = Math.max(3.5, 6.0 - rows * 0.16);
    if (pinHitsRef.current.size > 0) {
      pinHitsRef.current.forEach((hitInfo, pinKey) => {
        const elapsed = now - hitInfo.startTime;
        if (elapsed < 200) {
          const p = elapsed / 200;
          const hitAlpha = 1 - p;
          const currentRadius = pinRadius * (1 + (1 - p) * 0.6);
          const hitColor = hitInfo.color || "#ffffff";
          const [rStr, cStr] = pinKey.split("_");
          const pin = getPinPos(parseInt(rStr, 10), parseInt(cStr, 10), rows);

          // Fast concentric ripple (no GPU-stalling shadowBlur)
          ctx.save();
          ctx.strokeStyle = hitColor;
          ctx.globalAlpha = hitAlpha * 0.85;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, pinRadius + p * 18, 0, Math.PI * 2);
          ctx.stroke();

          // Highlighted Pin Head
          ctx.globalAlpha = hitAlpha;
          ctx.fillStyle = hitColor;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, currentRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, currentRadius * 0.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          pinHitsRef.current.delete(pinKey);
        }
      });
    }

    // 3. Update and Draw Active Balls
    const aliveBalls = [];
    const activeBalls = activeBallsRef.current;

    for (let i = 0; i < activeBalls.length; i++) {
      const b = activeBalls[i];
      const seg = b.segments[b.curSegIndex];

      if (!seg) continue;

      b.segProgress += dt / b.stepDuration;

      if (b.segProgress >= 1) {
        b.curSegIndex += 1;
        b.segProgress = 0;

        // Pin hit trigger
        if (seg.pin) {
          sounds.playPegTick();
          pinHitsRef.current.set(`${seg.pin.r}_${seg.pin.c}`, {
            startTime: now,
            color: b.color,
          });
        }

        // Landing in multiplier bin
        if (seg.isFinal || b.curSegIndex >= b.segments.length) {
          const landedSlot = b.data?.slot ?? b.slot;
          const finalMultiplier = b.data?.multiplier ?? (currentMultsRef.current[landedSlot] || 1.0);

          setBouncedBin(landedSlot);
          setTimeout(() => setBouncedBin(null), 250);
          sounds.playWin(finalMultiplier);

          if (finalMultiplier >= 10) {
            sounds.playCoins();
            confetti({
              particleCount: finalMultiplier >= 50 ? 60 : 30,
              spread: 60,
              origin: { y: 0.8 },
              colors: ["#f59e0b", "#10b981", "#38bdf8", "#ec4899", "#fbbf24"],
            });
          }

          setRecentHits((prev) => [
            { id: b.id, mult: finalMultiplier, slot: landedSlot },
            ...prev.slice(0, 5),
          ]);

          if (onBallFinishRef.current && b.data) {
            onBallFinishRef.current({
              ...b.data,
              slot: landedSlot,
              multiplier: finalMultiplier,
            });
          }
          continue; // Ball completed
        }
      }

      // Compute smooth cubic bezier position
      const curSeg = b.segments[b.curSegIndex];
      if (curSeg) {
        const t = Math.min(1, Math.max(0, b.segProgress));
        const pos = cubicBezier(t, curSeg.p0, curSeg.p1, curSeg.p2, curSeg.p3);
        b.x = pos.x;
        b.y = pos.y;

        // Smooth 3D solid sphere ball rendering
        ctx.save();
        ctx.translate(b.x, b.y);

        // Shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.ellipse(0, b.radius * 0.9, b.radius * 0.7, b.radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ball body with fast radial shading
        const grad = ctx.createRadialGradient(
          -b.radius * 0.35,
          -b.radius * 0.35,
          b.radius * 0.05,
          0,
          0,
          b.radius
        );
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.25, b.color);
        grad.addColorStop(0.85, b.color);
        grad.addColorStop(1, "#0f172a");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Rim
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Specular highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.beginPath();
        ctx.arc(-b.radius * 0.34, -b.radius * 0.34, b.radius * 0.24, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        aliveBalls.push(b);
      }
    }

    activeBallsRef.current = aliveBalls;

    // Only update React state when count status changes (avoids rendering thrash)
    setActiveBallCount((prev) => (prev !== aliveBalls.length ? aliveBalls.length : prev));
  }, [rows]);

  // Self-managing RAF loop that idles automatically when no balls/hits are present
  const startAnimationLoop = useCallback(() => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;

    let lastTime = performance.now();

    const loop = (now) => {
      const dt = Math.min(now - lastTime, 40);
      lastTime = now;

      drawFrame(now, dt);

      // Keep running if there are active balls OR active pin ripples
      if (activeBallsRef.current.length > 0 || pinHitsRef.current.size > 0) {
        animFrameIdRef.current = requestAnimationFrame(loop);
      } else {
        // Idle: draw final clean static frame and sleep
        drawFrame(now, 16);
        isLoopRunningRef.current = false;
        animFrameIdRef.current = null;
      }
    };

    animFrameIdRef.current = requestAnimationFrame(loop);
  }, [drawFrame]);

  // Drop Ball imperative method triggered by parent
  useImperativeHandle(ref, () => ({
    dropBall: (ballData) => {
      const path = ballData.path || [];
      const numRows = rows;
      const rowHeight = (HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (numRows - 1);

      const pinRadius = Math.max(3.6, 6.0 - numRows * 0.15);
      const ballRadius = Math.max(11, 16.5 - numRows * 0.35);
      const collRadius = pinRadius + ballRadius;

      const segments = [];

      // 1. Initial drop segment from chute to apex pin (0, 1)
      const apexPin = getPinPos(0, 1, numRows);
      const startX = apexPin.x + (Math.random() - 0.5) * 4;
      const startY = 6;
      const firstStep = path[0] ?? (Math.random() < 0.5 ? 0 : 1);
      const firstDir = firstStep === 1 ? 1 : -1;

      const apexAngle = -firstDir * 0.52;
      const apexContact = {
        x: apexPin.x + Math.sin(apexAngle) * collRadius,
        y: apexPin.y - Math.cos(apexAngle) * collRadius,
      };

      segments.push({
        p0: { x: startX, y: startY },
        p1: { x: startX, y: startY + 14 },
        p2: { x: apexContact.x, y: apexContact.y - 18 },
        p3: apexContact,
        pin: { r: 0, c: 1, pos: apexPin },
        isApex: true,
      });

      // 2. Peg to Peg Parabolic Bounces
      let curCol = 1;
      let prevContact = apexContact;

      const lastRowPinCount = 3 + numRows - 1;
      const pinDistX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);

      for (let r = 0; r < numRows; r++) {
        const step = path[r] ?? (Math.random() < 0.5 ? 0 : 1);
        const dir = step === 1 ? 1 : -1;
        const currentPin = getPinPos(r, curCol, numRows);

        if (step === 1) {
          curCol += 1;
        }

        if (r < numRows - 1) {
          const nextPin = getPinPos(r + 1, curCol, numRows);
          const strikeAngle = -dir * 0.55;
          const nextContact = {
            x: nextPin.x + Math.sin(strikeAngle) * collRadius,
            y: nextPin.y - Math.cos(strikeAngle) * collRadius,
          };

          const bounceApex = {
            x: currentPin.x + dir * (collRadius * 0.85 + pinDistX * 0.22),
            y: currentPin.y - collRadius * 0.55 - rowHeight * 0.35,
          };
          const gravityDescent = {
            x: nextPin.x - dir * (collRadius * 0.25),
            y: nextPin.y - collRadius * 1.25,
          };

          segments.push({
            p0: prevContact,
            p1: bounceApex,
            p2: gravityDescent,
            p3: nextContact,
            pin: { r: r + 1, c: curCol, pos: nextPin },
          });

          prevContact = nextContact;
        } else {
          // 3. Final drop segment into multiplier bin
          const landedSlot = curCol;
          const lastRowPinPad = PADDING_X;
          const binCenterX = lastRowPinPad + (landedSlot + 0.5) * pinDistX;
          const binCenterY = HEIGHT - PADDING_BOTTOM + 22;

          const exitApex = {
            x: currentPin.x + dir * (collRadius * 0.75),
            y: currentPin.y - collRadius * 0.35 - rowHeight * 0.25,
          };
          const binEntry = {
            x: binCenterX,
            y: binCenterY - 14,
          };

          segments.push({
            p0: prevContact,
            p1: exitApex,
            p2: binEntry,
            p3: { x: binCenterX, y: binCenterY },
            isFinal: true,
            slot: landedSlot,
          });
        }
      }

      const ballColors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];
      const chosenColor = ballColors[Math.floor(Math.random() * ballColors.length)];

      const stepDuration = turbo ? 70 : 130;

      const newBall = {
        id: ballData.id || `ball_${Date.now()}_${Math.random()}`,
        segments,
        curSegIndex: 0,
        segProgress: 0,
        stepDuration,
        radius: ballRadius,
        color: chosenColor,
        data: ballData,
        slot: ballData.slot ?? 0,
        x: startX,
        y: startY,
      };

      activeBallsRef.current.push(newBall);
      setActiveBallCount(activeBallsRef.current.length);

      // Wake up animation loop immediately
      startAnimationLoop();
    },
    getActiveCount: () => activeBallsRef.current.length,
  }));

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, []);

  // ResizeObserver: track rendered canvas size to align bins smoothly
  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const update = () => {
      const vRect = viewport.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      const bottomOffset = vRect.bottom - cRect.bottom;
      const scale = cRect.width / WIDTH;
      setCanvasRect({ scale, bottomOffset, canvasWidth: cRect.width });
    };

    const ro = new ResizeObserver(update);
    ro.observe(canvas);
    ro.observe(viewport);
    update();
    return () => ro.disconnect();
  }, [rows]);

  // Width ratio of bins to perfectly align with bottom pegs
  const lastRowPinCount = 3 + rows - 1;
  const pinDistanceX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
  const totalBinsWidth = (rows + 1) * pinDistanceX;
  const binsWidthPercent = (totalBinsWidth / WIDTH) * 100;

  const binsStyle = canvasRect
    ? {
        bottom: canvasRect.bottomOffset,
        height: Math.max(18, PADDING_BOTTOM * canvasRect.scale),
        width: `${binsWidthPercent}%`,
        left: "50%",
        transform: "translateX(-50%)",
      }
    : { width: `${binsWidthPercent}%` };

  return (
    <div className="plinko-stake-wrapper">
      {/* Recent Landed Multipliers History Bar */}
      {recentHits.length > 0 && (
        <div className="plinko-recent-history">
          {recentHits.map((hit) => {
            const isHigh = hit.mult >= 3;
            const isMid = hit.mult >= 1 && hit.mult < 3;
            return (
              <span
                key={hit.id}
                className={`plinko-history-badge ${
                  isHigh ? "high" : isMid ? "mid" : "low"
                }`}
              >
                {hit.mult >= 10 ? hit.mult : `${hit.mult}×`}
              </span>
            );
          })}
        </div>
      )}

      {/* Plinko Physics Canvas */}
      <div className="plinko-viewport" ref={viewportRef}>
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="plinko-matter-canvas"
        />

        {/* Multiplier Bins Row */}
        <div
          className="plinko-bins-container"
          style={binsStyle}
        >
          {currentMults.map((mult, idx) => {
            const isBounced = bouncedBin === idx;
            const bg = binColors.backgrounds[idx];
            const shadow = binColors.shadows[idx];

            return (
              <div
                key={idx}
                className={`plinko-stake-bin ${isBounced ? "bounced" : ""}`}
                style={{
                  backgroundColor: bg,
                  boxShadow: `0 3px 0 ${shadow}, 0 0 12px ${isBounced ? bg : "transparent"}`,
                }}
              >
                <span className="plinko-bin-text">
                  {mult >= 100 ? mult : mult >= 10 ? mult : `${mult}×`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row & Risk Selection Controls */}
      <div className="plinko-config-panel">
        <div className="plinko-config-group">
          <span className="config-label">Liczba rzędów:</span>
          <div className="config-pill-row">
            {[14, 16].map((r) => {
              const isSelected = Number(rows) === r;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={activeBallCount > 0}
                  aria-pressed={isSelected}
                  className={`config-pill-btn ${isSelected ? "active" : ""}`}
                  onClick={() => setRows && setRows(r)}
                  title={activeBallCount > 0 ? "Poczekaj na zakończenie spadania kulek" : undefined}
                >
                  {r} Rows
                </button>
              );
            })}
          </div>
        </div>

        <div className="plinko-config-group">
          <span className="config-label">Poziom ryzyka:</span>
          <div className="config-pill-row">
            {[
              { id: "low", label: "Niskie" },
              { id: "medium", label: "Średnie" },
              { id: "high", label: "Wysokie" },
            ].map((rk) => {
              const isSelected = risk === rk.id;
              return (
                <button
                  key={rk.id}
                  type="button"
                  disabled={activeBallCount > 0}
                  aria-pressed={isSelected}
                  className={`config-pill-btn ${isSelected ? "active" : ""}`}
                  onClick={() => setRisk && setRisk(rk.id)}
                  title={activeBallCount > 0 ? "Poczekaj na zakończenie spadania kulek" : undefined}
                >
                  {rk.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
