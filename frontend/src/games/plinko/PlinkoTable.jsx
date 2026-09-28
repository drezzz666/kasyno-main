import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { sounds } from "../../lib/sounds";

export const PLINKO_MULTIPLIERS = {
  low: {
    8: [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    9: [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
    12: [10.0, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10.0],
    13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    15: [15.0, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.5, 0.5, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15.0],
    16: [16.0, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16.0],
  },
  medium: {
    8: [13.0, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13.0],
    9: [18.0, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18.0],
    10: [22.0, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22.0],
    11: [24.0, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24.0],
    12: [33.0, 11.0, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11.0, 33.0],
    13: [43.0, 13.0, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13.0, 43.0],
    14: [58.0, 15.0, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15.0, 58.0],
    15: [88.0, 18.0, 11.0, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11.0, 18.0, 88.0],
    16: [110.0, 41.0, 10.0, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10.0, 41.0, 110.0],
  },
  high: {
    8: [29.0, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29.0],
    9: [43.0, 7.0, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7.0, 43.0],
    10: [76.0, 10.0, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10.0, 76.0],
    11: [120.0, 14.0, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14.0, 120.0],
    12: [170.0, 24.0, 8.1, 2.0, 0.7, 0.2, 0.1, 0.2, 0.7, 2.0, 8.1, 24.0, 170.0],
    13: [260.0, 37.0, 11.0, 4.0, 1.0, 0.2, 0.1, 0.1, 0.2, 1.0, 4.0, 11.0, 37.0, 260.0],
    14: [420.0, 56.0, 18.0, 5.0, 1.9, 0.3, 0.2, 0.1, 0.2, 0.3, 1.9, 5.0, 18.0, 56.0, 420.0],
    15: [620.0, 83.0, 27.0, 8.0, 3.0, 0.5, 0.2, 0.1, 0.1, 0.2, 0.5, 3.0, 8.0, 27.0, 83.0, 620.0],
    16: [1000.0, 130.0, 26.0, 9.0, 4.0, 2.0, 0.2, 0.2, 0.1, 0.2, 0.2, 2.0, 4.0, 9.0, 26.0, 130.0, 1000.0],
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
const PADDING_TOP = 42;
const PADDING_BOTTOM = 46;

// Fast Cubic Bezier calculation
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

// Compute pin coordinates on the board
const getPinPos = (r, c, totalRows) => {
  const lastRowPinCount = 3 + totalRows - 1;
  const pinDistanceX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
  const rowY = PADDING_TOP + ((HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (totalRows - 1)) * r;
  const rowPaddingX = PADDING_X + ((totalRows - 1 - r) * pinDistanceX) / 2;
  const colX = rowPaddingX + c * pinDistanceX;
  return { x: colX, y: rowY };
};

// Render 3D solid sphere ball with shadow and lighting
function drawBall(ctx, b) {
  ctx.save();
  ctx.globalAlpha = b.alpha !== undefined ? b.alpha : 1;

  // 1. Subtle drop shadow beneath the ball on the backboard
  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y + b.radius * 0.88, b.radius * 0.78, b.radius * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Ball body with rich 3D sphere gradient
  ctx.translate(b.x, b.y);

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
  grad.addColorStop(1, "#0a0e17");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
  ctx.fill();

  // 3. Crisp outer rim
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Specular gloss highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.beginPath();
  ctx.arc(-b.radius * 0.32, -b.radius * 0.32, b.radius * 0.26, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

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

  // Pre-rendered off-screen background & pins canvas cache
  const bgCanvasCacheRef = useRef(null);

  const onBallFinishRef = useRef(onBallFinish);
  onBallFinishRef.current = onBallFinish;

  const currentMults = PLINKO_MULTIPLIERS[risk]?.[rows] || PLINKO_MULTIPLIERS.medium[14];
  const currentMultsRef = useRef(currentMults);
  currentMultsRef.current = currentMults;

  const [bouncedBins, setBouncedBins] = useState({});
  const [activeBallCount, setActiveBallCount] = useState(0);
  const [recentHits, setRecentHits] = useState([]);

  const binColors = getBinColors(currentMults.length);

  const triggerBinBounce = useCallback((slot) => {
    setBouncedBins((prev) => ({ ...prev, [slot]: (prev[slot] || 0) + 1 }));
    setTimeout(() => {
      setBouncedBins((prev) => {
        const count = prev[slot] || 0;
        if (count <= 1) {
          const next = { ...prev };
          delete next[slot];
          return next;
        }
        return { ...prev, [slot]: count - 1 };
      });
    }, 280);
  }, []);

  // 1. Pre-render static background, top dropper chute, and all metallic pins onto offscreen canvas
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

    // A. Dark board background
    ctx.fillStyle = "#0a0d14";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // B. Subtle geometric grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
    }
    ctx.stroke();

    // C. Top Dropper Funnel (where balls emerge)
    const apexPin = getPinPos(0, 1, rows);
    const chuteX = apexPin.x;
    ctx.save();
    // Funnel shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.ellipse(chuteX, 16, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Funnel metallic body
    const funnelGrad = ctx.createLinearGradient(chuteX - 22, 0, chuteX + 22, 14);
    funnelGrad.addColorStop(0, "#1e293b");
    funnelGrad.addColorStop(0.5, "#475569");
    funnelGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = funnelGrad;
    ctx.beginPath();
    ctx.moveTo(chuteX - 22, 0);
    ctx.lineTo(chuteX + 22, 0);
    ctx.lineTo(chuteX + 11, 14);
    ctx.lineTo(chuteX - 11, 14);
    ctx.closePath();
    ctx.fill();

    // Funnel glowing nozzle ring
    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(chuteX, 14, 11, 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // D. All metallic pins rendered with high precision
    const pinRadius = Math.max(3.2, 5.2 - rows * 0.12);

    for (let r = 0; r < rows; ++r) {
      const cols = 3 + r;
      for (let c = 0; c < cols; ++c) {
        const pin = getPinPos(r, c, rows);

        // Pin shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.arc(pin.x, pin.y + 2.2, pinRadius, 0, Math.PI * 2);
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
        pinGrad.addColorStop(0.55, "#cbd5e1");
        pinGrad.addColorStop(1, "#475569");

        ctx.fillStyle = pinGrad;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, pinRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Render single initial frame directly on main canvas
    const mainCanvas = canvasRef.current;
    if (mainCanvas) {
      const mainCtx = mainCanvas.getContext("2d");
      if (mainCtx) {
        mainCtx.drawImage(offscreen, 0, 0);
      }
    }
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

    // 2. Draw active pin hits / spring shockwaves
    const pinRadius = Math.max(3.2, 5.2 - rows * 0.12);
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

          // Fast concentric ripple
          ctx.save();
          ctx.strokeStyle = hitColor;
          ctx.globalAlpha = hitAlpha * 0.85;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, pinRadius + p * 16, 0, Math.PI * 2);
          ctx.stroke();

          // Highlighted Pin Head
          ctx.globalAlpha = hitAlpha;
          ctx.fillStyle = hitColor;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, currentRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, currentRadius * 0.55, 0, Math.PI * 2);
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

      // Handle landing settle phase (soft settle bounce in container)
      if (b.settling) {
        b.settleProgress += dt / 140;
        if (b.settleProgress >= 1) {
          // Ball has finished settling into the hopper
          continue;
        }
        const p = b.settleProgress;
        b.y = b.finalY - Math.sin(p * Math.PI) * 5;
        b.alpha = 1 - p * 0.75;
        aliveBalls.push(b);
        drawBall(ctx, b);
        continue;
      }

      const seg = b.segments[b.curSegIndex];
      if (!seg) continue;

      // Advance segment progress based on this segment's specific duration
      b.segProgress += dt / seg.duration;

      if (b.segProgress >= 1) {
        b.curSegIndex += 1;
        b.segProgress = 0;

        // Trigger pin collision sound & ripple at the EXACT contact moment!
        if (seg.hitPin) {
          sounds.playPegTick(seg.hitPin.r, rows);
          pinHitsRef.current.set(`${seg.hitPin.r}_${seg.hitPin.c}`, {
            startTime: now,
            color: b.color,
          });
        }

        // Landing in multiplier container
        if (seg.isFinal || b.curSegIndex >= b.segments.length) {
          const landedSlot = b.targetSlot;
          const finalMultiplier = b.finalMultiplier;

          triggerBinBounce(landedSlot);
          sounds.playPlinkoBin(finalMultiplier);

          if (finalMultiplier >= 10) {
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

          // Enter smooth container settle
          b.settling = true;
          b.settleProgress = 0;
          b.finalY = seg.p3.y;
          aliveBalls.push(b);
          continue;
        }
      }

      // Compute smooth cubic bezier position with gravitational arc
      const curSeg = b.segments[b.curSegIndex];
      if (curSeg) {
        const t = Math.min(1, Math.max(0, b.segProgress));
        const pos = cubicBezier(t, curSeg.p0, curSeg.p1, curSeg.p2, curSeg.p3);
        b.x = pos.x;
        b.y = pos.y;
        b.alpha = 1;

        aliveBalls.push(b);
        drawBall(ctx, b);
      }
    }

    activeBallsRef.current = aliveBalls;

    // Only update React state when count status changes (avoids rendering thrash)
    setActiveBallCount((prev) => (prev !== aliveBalls.length ? aliveBalls.length : prev));
  }, [rows, triggerBinBounce]);

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
      const numRows = rows;
      const lastRowPinCount = 3 + numRows - 1;
      const pinDistX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
      const rowHeight = (HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (numRows - 1);

      // Proportional physical dimensions
      const pinRadius = Math.max(3.2, 5.2 - numRows * 0.12);
      const ballRadius = Math.max(6.5, 9.2 - numRows * 0.16);
      const collRadius = pinRadius + ballRadius;

      // Extract or compute path with exact targetSlot mapping
      const targetSlot = (typeof ballData.slot === "number" && ballData.slot >= 0 && ballData.slot <= numRows)
        ? ballData.slot
        : (Array.isArray(ballData.path) ? ballData.path.filter((s) => s === 1).length : Math.floor(numRows / 2));

      let path = Array.isArray(ballData.path) && ballData.path.length === numRows ? [...ballData.path] : null;

      if (!path) {
        // Synthesize path with exactly targetSlot rights
        path = new Array(numRows).fill(0);
        const indices = Array.from({ length: numRows }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        for (let i = 0; i < targetSlot; i++) {
          path[indices[i]] = 1;
        }
      }

      const segments = [];

      // 1. Initial chute drop segment onto apex pin (0, 1)
      const apexPin = getPinPos(0, 1, numRows);
      const startX = apexPin.x;
      const startY = 2;
      const firstStep = path[0];
      const firstDir = firstStep === 1 ? 1 : -1;

      // Offset contact point slightly toward deflection direction
      const contactAngle0 = -firstDir * 0.38;
      const contact0 = {
        x: apexPin.x + Math.sin(contactAngle0) * collRadius,
        y: apexPin.y - Math.cos(contactAngle0) * collRadius,
      };

      segments.push({
        p0: { x: startX, y: startY },
        p1: { x: startX, y: startY + (contact0.y - startY) * 0.4 },
        p2: { x: contact0.x, y: contact0.y - (contact0.y - startY) * 0.25 },
        p3: contact0,
        duration: turbo ? 65 : 155,
        hitPin: { r: 0, c: 1 },
      });

      // 2. Peg-to-peg parabolic bounces with Newtonian gravity arc
      let curCol = 1;

      for (let r = 0; r < numRows - 1; r++) {
        const step = path[r];
        const dir = step === 1 ? 1 : -1;
        const nextCol = curCol + (step === 1 ? 1 : 0);

        const currentPin = getPinPos(r, curCol, numRows);
        const nextPin = getPinPos(r + 1, nextCol, numRows);

        // Contact point on current pin shoulder (launching off)
        const launchAngle = dir * 0.42;
        const launchPoint = {
          x: currentPin.x + Math.sin(launchAngle) * collRadius,
          y: currentPin.y - Math.cos(launchAngle) * collRadius,
        };

        // Contact point on next pin shoulder (incoming strike)
        const strikeAngle = -dir * 0.46;
        const strikePoint = {
          x: nextPin.x + Math.sin(strikeAngle) * collRadius,
          y: nextPin.y - Math.cos(strikeAngle) * collRadius,
        };

        // Parabolic arc with apex hang time and downward acceleration
        const apexHeight = Math.max(5.5, rowHeight * 0.22);
        const p1 = {
          x: launchPoint.x + dir * (pinDistX * 0.22),
          y: launchPoint.y - apexHeight * 0.85,
        };
        const p2 = {
          x: strikePoint.x - dir * (pinDistX * 0.08),
          y: strikePoint.y - rowHeight * 0.38,
        };

        // Depth-dependent duration: gravitational acceleration as the ball falls
        const rowProgress = r / (numRows - 1);
        const duration = turbo ? (46 + (1 - rowProgress) * 20) : (115 + (1 - rowProgress) * 55);

        segments.push({
          p0: launchPoint,
          p1,
          p2,
          p3: strikePoint,
          duration,
          hitPin: { r: r + 1, c: nextCol },
        });

        curCol = nextCol;
      }

      // 3. Final drop segment into multiplier container (lands dead-center)
      const finalStep = path[numRows - 1];
      const finalDir = finalStep === 1 ? 1 : -1;
      const lastPin = getPinPos(numRows - 1, curCol, numRows);

      const launchAngle = finalDir * 0.42;
      const launchPoint = {
        x: lastPin.x + Math.sin(launchAngle) * collRadius,
        y: lastPin.y - Math.cos(launchAngle) * collRadius,
      };

      // Exact center of the container box
      const binCenterX = PADDING_X + (targetSlot + 0.5) * pinDistX;
      const binCenterY = HEIGHT - PADDING_BOTTOM + 21;

      const exitApexHeight = Math.max(5.5, rowHeight * 0.20);
      const exitApex = {
        x: launchPoint.x + finalDir * (pinDistX * 0.20),
        y: launchPoint.y - exitApexHeight * 0.70,
      };
      const binEntry = {
        x: binCenterX,
        y: binCenterY - 14,
      };

      segments.push({
        p0: launchPoint,
        p1: exitApex,
        p2: binEntry,
        p3: { x: binCenterX, y: binCenterY },
        duration: turbo ? 65 : 140,
        isFinal: true,
      });

      const ballColors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];
      const chosenColor = ballColors[Math.floor(Math.random() * ballColors.length)];

      const finalMultiplier = ballData.multiplier ?? (currentMultsRef.current[targetSlot] || 1.0);

      const newBall = {
        id: ballData.id || `ball_${Date.now()}_${Math.random()}`,
        segments,
        curSegIndex: 0,
        segProgress: 0,
        radius: ballRadius,
        color: chosenColor,
        data: ballData,
        targetSlot,
        finalMultiplier,
        x: startX,
        y: startY,
        alpha: 1,
        settling: false,
        settleProgress: 0,
        finalY: binCenterY,
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

  // Exact mathematical width and offset of multiplier bins
  const BINS_WIDTH_PERCENT = ((WIDTH - PADDING_X * 2) / WIDTH) * 100; // 90.5263%
  const BINS_HEIGHT_PERCENT = (34 / HEIGHT) * 100; // 5.9649%
  const BINS_BOTTOM_PERCENT = (8 / HEIGHT) * 100; // 1.4035%

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
          style={{
            width: `${BINS_WIDTH_PERCENT}%`,
            height: `${BINS_HEIGHT_PERCENT}%`,
            bottom: `${BINS_BOTTOM_PERCENT}%`,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {currentMults.map((mult, idx) => {
            const isBounced = Boolean(bouncedBins[idx]);
            const bg = binColors.backgrounds[idx];
            const shadow = binColors.shadows[idx];

            return (
              <div
                key={idx}
                className={`plinko-stake-bin ${isBounced ? "bounced" : ""}`}
                style={{
                  backgroundColor: bg,
                  boxShadow: `0 2px 0 ${shadow}, 0 0 10px ${isBounced ? bg : "transparent"}`,
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
    </div>
  );
});
