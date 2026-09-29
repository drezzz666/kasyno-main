import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from "react";
import confetti from "canvas-confetti";
import { sounds } from "../../lib/sounds";

export const PLINKO_MULTIPLIERS = {
  low: {
    8: [5.6, 2.2, 1.3, 0.8, 0.5, 0.8, 1.3, 2.2, 5.6],
    9: [5.6, 2.2, 1.5, 0.9, 0.6, 0.6, 0.9, 1.5, 2.2, 5.6],
    10: [8.9, 3.2, 1.6, 1.1, 0.8, 0.5, 0.8, 1.1, 1.6, 3.2, 8.9],
    11: [8.4, 3.0, 1.8, 1.2, 0.9, 0.6, 0.6, 0.9, 1.2, 1.8, 3.0, 8.4],
    12: [10.0, 3.5, 1.8, 1.3, 1.0, 0.8, 0.5, 0.8, 1.0, 1.3, 1.8, 3.5, 10.0],
    13: [8.5, 3.8, 2.2, 1.5, 1.1, 0.8, 0.6, 0.6, 0.8, 1.1, 1.5, 2.2, 3.8, 8.5],
    14: [8.0, 4.5, 2.2, 1.5, 1.2, 1.0, 0.8, 0.5, 0.8, 1.0, 1.2, 1.5, 2.2, 4.5, 8.0],
    15: [15.0, 6.5, 3.0, 2.0, 1.4, 1.1, 0.9, 0.6, 0.6, 0.9, 1.1, 1.4, 2.0, 3.0, 6.5, 15.0],
    16: [16.0, 9.0, 3.0, 1.8, 1.4, 1.2, 1.0, 0.8, 0.5, 0.8, 1.0, 1.2, 1.4, 1.8, 3.0, 9.0, 16.0],
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
    8: [29.0, 4.0, 1.5, 0.3, 0.0, 0.3, 1.5, 4.0, 29.0],
    9: [43.0, 7.0, 2.0, 0.6, 0.1, 0.1, 0.6, 2.0, 7.0, 43.0],
    10: [76.0, 10.0, 3.0, 0.9, 0.2, 0.0, 0.2, 0.9, 3.0, 10.0, 76.0],
    11: [120.0, 14.0, 5.2, 1.4, 0.3, 0.1, 0.1, 0.3, 1.4, 5.2, 14.0, 120.0],
    12: [170.0, 24.0, 8.1, 2.0, 0.6, 0.2, 0.0, 0.2, 0.6, 2.0, 8.1, 24.0, 170.0],
    13: [260.0, 37.0, 11.0, 4.0, 1.0, 0.2, 0.1, 0.1, 0.2, 1.0, 4.0, 11.0, 37.0, 260.0],
    14: [420.0, 70.0, 18.0, 5.0, 1.9, 0.3, 0.2, 0.0, 0.2, 0.3, 1.9, 5.0, 18.0, 70.0, 420.0],
    15: [620.0, 83.0, 27.0, 8.0, 3.0, 0.5, 0.2, 0.1, 0.1, 0.2, 0.5, 3.0, 8.0, 27.0, 83.0, 620.0],
    16: [1000.0, 172.0, 33.0, 9.5, 4.0, 2.0, 0.2, 0.1, 0.0, 0.1, 0.2, 2.0, 4.0, 9.5, 33.0, 172.0, 1000.0],
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

// Physical sizing helpers (proportional radius to ensure realistic spacing and clear clearance between pins)
const getPinRadius = (r) => Math.max(3.2, 4.8 - r * 0.08);
const getBallRadius = (r) => Math.max(6.4, 9.2 - r * 0.16);

// Render 3D solid sphere ball with shadow, glow, trail and lighting
function drawBall(ctx, b) {
  ctx.save();
  ctx.globalAlpha = b.alpha !== undefined ? b.alpha : 1;

  // 1. Motion Trail (fading ghost trail of past positions)
  if (b.trail && b.trail.length > 1) {
    for (let i = 0; i < b.trail.length; i++) {
      const pt = b.trail[i];
      const trailAlpha = ((i + 1) / b.trail.length) * 0.28 * (b.alpha !== undefined ? b.alpha : 1);
      const trailRadius = b.radius * (0.6 + 0.4 * ((i + 1) / b.trail.length));
      ctx.fillStyle = b.color;
      ctx.globalAlpha = trailAlpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, trailRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = b.alpha !== undefined ? b.alpha : 1;

  // 2. Drop shadow beneath the ball on the backboard
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.ellipse(b.x, b.y + b.radius * 0.95, b.radius * 0.85, b.radius * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Ambient ball outer glow
  const glowGrad = ctx.createRadialGradient(b.x, b.y, b.radius * 0.6, b.x, b.y, b.radius * 1.5);
  glowGrad.addColorStop(0, b.color);
  glowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowGrad;
  ctx.globalAlpha = (b.alpha !== undefined ? b.alpha : 1) * 0.35;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = b.alpha !== undefined ? b.alpha : 1;

  // 4. Ball body with rich 3D sphere gradient
  ctx.translate(b.x, b.y);
  if (b.squashX && b.squashY) {
    ctx.scale(b.squashX, b.squashY);
  }

  const grad = ctx.createRadialGradient(
    -b.radius * 0.35,
    -b.radius * 0.35,
    b.radius * 0.05,
    0,
    0,
    b.radius
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.22, b.color);
  grad.addColorStop(0.85, b.color);
  grad.addColorStop(1, "#070a12");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
  ctx.fill();

  // 5. Crisp outer rim
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
  ctx.stroke();

  // 6. Specular gloss highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.beginPath();
  ctx.arc(-b.radius * 0.32, -b.radius * 0.32, b.radius * 0.28, 0, Math.PI * 2);
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
  const particlesRef = useRef([]);
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
    }, 320);
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
    ctx.ellipse(chuteX, 16, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Funnel metallic body
    const funnelGrad = ctx.createLinearGradient(chuteX - 24, 0, chuteX + 24, 16);
    funnelGrad.addColorStop(0, "#1e293b");
    funnelGrad.addColorStop(0.5, "#475569");
    funnelGrad.addColorStop(1, "#1e293b");
    ctx.fillStyle = funnelGrad;
    ctx.beginPath();
    ctx.moveTo(chuteX - 24, 0);
    ctx.lineTo(chuteX + 24, 0);
    ctx.lineTo(chuteX + 12, 16);
    ctx.lineTo(chuteX - 12, 16);
    ctx.closePath();
    ctx.fill();

    // Funnel glowing nozzle ring
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(chuteX, 16, 12, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // D. All metallic pins rendered with high precision
    const pinRadius = getPinRadius(rows);

    for (let r = 0; r < rows; ++r) {
      const cols = 3 + r;
      for (let c = 0; c < cols; ++c) {
        const pin = getPinPos(r, c, rows);

        // Pin shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
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
        pinGrad.addColorStop(0.5, "#cbd5e1");
        pinGrad.addColorStop(1, "#334155");

        ctx.fillStyle = pinGrad;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, pinRadius, 0, Math.PI * 2);
        ctx.fill();

        // Pin highlight rim
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(pin.x, pin.y, pinRadius, 0, Math.PI * 2);
        ctx.stroke();
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
    const pinRadius = getPinRadius(rows);
    if (pinHitsRef.current.size > 0) {
      pinHitsRef.current.forEach((hitInfo, pinKey) => {
        const elapsed = now - hitInfo.startTime;
        if (elapsed < 240) {
          const p = elapsed / 240;
          const hitAlpha = 1 - p;
          const currentRadius = pinRadius * (1 + (1 - p) * 0.7);
          const hitColor = hitInfo.color || "#ffffff";
          const [rStr, cStr] = pinKey.split("_");
          const pin = getPinPos(parseInt(rStr, 10), parseInt(cStr, 10), rows);

          // Fast concentric ripple
          ctx.save();
          ctx.strokeStyle = hitColor;
          ctx.globalAlpha = hitAlpha * 0.9;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(pin.x, pin.y, pinRadius + p * 18, 0, Math.PI * 2);
          ctx.stroke();

          // Highlighted Pin Head Glow
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

    // 3. Draw & update collision spark particles
    if (particlesRef.current.length > 0) {
      const aliveParticles = [];
      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.vy += 0.22 * (dt / 16); // Particle gravity
        p.life -= dt / p.maxLife;

        if (p.life > 0) {
          aliveParticles.push(p);
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      particlesRef.current = aliveParticles;
    }

    // 4. Update and Draw Active Balls
    const aliveBalls = [];
    const activeBalls = activeBallsRef.current;

    for (let i = 0; i < activeBalls.length; i++) {
      const b = activeBalls[i];

      // Handle landing settle phase (soft natural double bounce in container)
      if (b.settling) {
        b.settleProgress += dt / 340;
        if (b.settleProgress >= 1) {
          // Ball has finished settling into the hopper
          continue;
        }
        const p = b.settleProgress;
        // Damped physical bouncing in container (bounce 1: 7px, bounce 2: 2.5px)
        const bounceHeight = Math.sin(p * Math.PI * 2) * Math.exp(-p * 3.2) * 7.5;
        b.y = b.finalY - Math.max(0, bounceHeight);
        b.alpha = 1 - Math.max(0, (p - 0.5) * 2.0); // Smooth fade-out in second half
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

          // Spawn realistic physical spark particles bursting outward from collision point
          const pin = getPinPos(seg.hitPin.r, seg.hitPin.c, rows);
          const strikeDir = seg.dir || 1;
          for (let k = 0; k < 6; k++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 + strikeDir * 0.35;
            const speed = 1.4 + Math.random() * 2.6;
            particlesRef.current.push({
              x: pin.x,
              y: pin.y - pinRadius * 0.7,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: 2.0 + Math.random() * 1.5,
              color: b.color,
              life: 1.0,
              maxLife: 220 + Math.random() * 100,
            });
          }
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
          b.finalY = seg.pEnd ? seg.pEnd.y : HEIGHT - PADDING_BOTTOM + 20;
          aliveBalls.push(b);
          continue;
        }
      }

      const curSeg = b.segments[b.curSegIndex];
      if (curSeg) {
        const u = Math.min(1, Math.max(0, b.segProgress));

        let posX, posY;
        if (curSeg.type === "chute") {
          // Free fall gravity drop from top chute
          const tWarp = u * u; // Acceleration under gravity
          posX = curSeg.pStart.x;
          posY = curSeg.pStart.y + (curSeg.pEnd.y - curSeg.pStart.y) * tWarp;
        } else {
          // True ballistic parabola: lifts upwards off the peg upon rebound, arcs in the air, accelerates downwards under gravity
          const uWarped = u < 0.35
            ? u * 0.88
            : 0.35 * 0.88 + (u - 0.35) * (1 - 0.35 * 0.88) / 0.65;

          const dx = curSeg.pEnd.x - curSeg.pStart.x;
          const dy = curSeg.pEnd.y - curSeg.pStart.y;
          const apexH = curSeg.bounceHeight || 10;

          posX = curSeg.pStart.x + dx * uWarped;
          // Ballistic trajectory: y(u) = y0 + dy*u - 4*H*u*(1-u)
          posY = curSeg.pStart.y + dy * uWarped - 4 * apexH * uWarped * (1 - uWarped);
        }

        // Hard Anti-Clipping Hitbox Protection:
        // Strictly prevent ball from penetrating inside Pin A or Pin B
        if (curSeg.pinA && curSeg.collRadius) {
          const dxa = posX - curSeg.pinA.x;
          const dya = posY - curSeg.pinA.y;
          const distA = Math.sqrt(dxa * dxa + dya * dya);
          if (distA < curSeg.collRadius && distA > 0.001) {
            posX = curSeg.pinA.x + (dxa / distA) * curSeg.collRadius;
            posY = curSeg.pinA.y + (dya / distA) * curSeg.collRadius;
          }
        }
        if (curSeg.pinB && curSeg.collRadius) {
          const dxb = posX - curSeg.pinB.x;
          const dyb = posY - curSeg.pinB.y;
          const distB = Math.sqrt(dxb * dxb + dyb * dyb);
          if (distB < curSeg.collRadius && distB > 0.001) {
            posX = curSeg.pinB.x + (dxb / distB) * curSeg.collRadius;
            posY = curSeg.pinB.y + (dyb / distB) * curSeg.collRadius;
          }
        }

        b.x = posX;
        b.y = posY;
        b.alpha = 1;

        // Subtle elastic squash/stretch right after impact
        if (u < 0.18) {
          const factor = 1 - u / 0.18;
          b.squashX = 1 + factor * 0.18;
          b.squashY = 1 - factor * 0.18;
        } else {
          b.squashX = 1;
          b.squashY = 1;
        }

        // Maintain short smooth trail buffer
        if (!b.trail) b.trail = [];
        b.trail.push({ x: posX, y: posY });
        if (b.trail.length > 4) b.trail.shift();

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

      // Keep running if there are active balls, active pin ripples, or sparks
      if (activeBallsRef.current.length > 0 || pinHitsRef.current.size > 0 || particlesRef.current.length > 0) {
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
      const pinRadius = getPinRadius(numRows);
      const ballRadius = getBallRadius(numRows);
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
      const startY = 4;
      const apexContact = {
        x: apexPin.x,
        y: apexPin.y - collRadius,
      };

      segments.push({
        type: "chute",
        pStart: { x: startX, y: startY },
        pEnd: apexContact,
        duration: turbo ? 75 : 180,
        hitPin: { r: 0, c: 1 },
        pinA: null,
        pinB: apexPin,
        collRadius,
      });

      // 2. Continuous peg-to-peg ballistic trajectory with physics bounce & gravitational acceleration
      let curCol = 1;
      let prevContactPoint = apexContact;

      for (let r = 0; r < numRows - 1; r++) {
        const step = path[r];
        const dir = step === 1 ? 1 : -1;
        const nextCol = curCol + (step === 1 ? 1 : 0);

        const pinA = getPinPos(r, curCol, numRows);
        const pinB = getPinPos(r + 1, nextCol, numRows);

        // Landing contact point on pinB's upper incoming shoulder
        const strikeAngle = -dir * 0.52;
        const nextContact = {
          x: pinB.x + Math.sin(strikeAngle) * collRadius,
          y: pinB.y - Math.cos(strikeAngle) * collRadius,
        };

        // Realistic bounce apex height
        const bounceHeight = Math.max(9.0, rowHeight * 0.38);
        const duration = turbo ? (65 + (1 - r / numRows) * 15) : (160 + (1 - r / numRows) * 45);

        segments.push({
          type: "bounce",
          pStart: prevContactPoint,
          pEnd: nextContact,
          bounceHeight,
          duration,
          dir,
          pinA,
          pinB,
          collRadius,
          hitPin: { r: r + 1, c: nextCol },
        });

        curCol = nextCol;
        prevContactPoint = nextContact;
      }

      // 3. Final drop from last pin into multiplier container (lands dead-center)
      const finalStep = path[numRows - 1];
      const finalDir = finalStep === 1 ? 1 : -1;
      const lastPin = getPinPos(numRows - 1, curCol, numRows);

      const binCenterX = PADDING_X + (targetSlot + 0.5) * pinDistX;
      const binCenterY = HEIGHT - PADDING_BOTTOM + 20;
      const finalBounceHeight = Math.max(7.5, rowHeight * 0.32);

      segments.push({
        type: "final",
        pStart: prevContactPoint,
        pEnd: { x: binCenterX, y: binCenterY },
        bounceHeight: finalBounceHeight,
        duration: turbo ? 70 : 180,
        dir: finalDir,
        pinA: lastPin,
        pinB: null,
        collRadius,
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
        trail: [],
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
