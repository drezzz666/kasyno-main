import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import confetti from "canvas-confetti";
import { sounds } from "../lib/sounds";

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
const PADDING_X = 52;
const PADDING_TOP = 46;
const PADDING_BOTTOM = 46;

// Cubic Bezier calculation
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

export const PlinkoTable = forwardRef(function PlinkoTable(
  { rows = 14, setRows, risk = "medium", setRisk, onBallFinish, loading, turbo = false },
  ref
) {
  const canvasRef = useRef(null);
  const activeBallsRef = useRef([]);
  const pinHitsRef = useRef(new Map());
  const animFrameIdRef = useRef(null);

  const onBallFinishRef = useRef(onBallFinish);
  onBallFinishRef.current = onBallFinish;

  const currentMults = PLINKO_MULTIPLIERS[risk]?.[rows] || PLINKO_MULTIPLIERS.medium[14];
  const currentMultsRef = useRef(currentMults);
  currentMultsRef.current = currentMults;

  const [bouncedBin, setBouncedBin] = useState(null);
  const [activeBallCount, setActiveBallCount] = useState(0);
  const [recentHits, setRecentHits] = useState([]);

  const binColors = getBinColors(currentMults.length);

  // Helper to compute pin coordinates
  const getPinPos = (r, c, totalRows) => {
    const lastRowPinCount = 3 + totalRows - 1;
    const pinDistanceX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
    const rowY = PADDING_TOP + ((HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (totalRows - 1)) * r;
    const rowPaddingX = PADDING_X + ((totalRows - 1 - r) * pinDistanceX) / 2;
    const colX = rowPaddingX + c * pinDistanceX;
    return { x: colX, y: rowY };
  };

  // Drop Ball imperative method triggered by parent
  useImperativeHandle(ref, () => ({
    dropBall: (ballData) => {
      const path = ballData.path || [];
      const numRows = rows;
      const rowHeight = (HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (numRows - 1);

      // Peg radius & Larger Solid 3D Ball Radius
      const pinRadius = Math.max(4.5, (25 - numRows) / 2.1);
      const ballRadius = Math.max(16, 24 - numRows * 0.45);
      const collRadius = pinRadius + ballRadius;

      const segments = [];

      // 1. Initial drop segment from top chute down to apex pin (0, 1)
      const apexPin = getPinPos(0, 1, numRows);
      const startX = apexPin.x + (Math.random() - 0.5) * 4;
      const startY = 6;
      const firstStep = path[0] ?? (Math.random() < 0.5 ? 0 : 1);
      const firstDir = firstStep === 1 ? 1 : -1;

      // Contact point on apex pin
      const apexContact = {
        x: apexPin.x - firstDir * collRadius * 0.35,
        y: apexPin.y - collRadius * 0.88,
      };

      segments.push({
        p0: { x: startX, y: startY },
        p1: { x: startX, y: startY + 14 },
        p2: { x: apexContact.x, y: apexContact.y - 18 },
        p3: apexContact,
        pin: { r: 0, c: 1, pos: apexPin },
        isApex: true,
      });

      // 2. Peg to Peg Parabolic Bounces with Realistic Gravity
      let curCol = 1;
      let prevContact = apexContact;

      for (let r = 0; r < numRows; r++) {
        const step = path[r] ?? (Math.random() < 0.5 ? 0 : 1);
        const dir = step === 1 ? 1 : -1;
        const currentPin = getPinPos(r, curCol, numRows);

        if (step === 1) {
          curCol += 1;
        }

        if (r < numRows - 1) {
          // Next pin in row r + 1
          const nextPin = getPinPos(r + 1, curCol, numRows);
          const nextStep = path[r + 1] ?? (Math.random() < 0.5 ? 0 : 1);
          const nextDir = nextStep === 1 ? 1 : -1;

          // Next contact point on next pin
          const nextContact = {
            x: nextPin.x - nextDir * collRadius * 0.35,
            y: nextPin.y - collRadius * 0.88,
          };

          // Parabolic bounce upwards & outwards over peg flank with gravity curve
          const bounceApex = {
            x: currentPin.x + dir * collRadius * 1.1,
            y: currentPin.y - collRadius * 0.7 - rowHeight * 0.42,
          };
          const gravityDescent = {
            x: nextPin.x - dir * collRadius * 0.25,
            y: nextPin.y - collRadius * 1.35,
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
          // 3. Final Drop into Multiplier Bin
          const finalSlot = ballData.slot ?? (curCol - 1);
          const lastRowPinCount = 3 + numRows - 1;
          const pinDistanceX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
          const slotCenterX = PADDING_X + (finalSlot + 0.5) * pinDistanceX;

          const binContact = {
            x: slotCenterX,
            y: HEIGHT - 18,
          };

          const finalApex = {
            x: currentPin.x + dir * collRadius * 1.1,
            y: currentPin.y - collRadius * 0.6 - rowHeight * 0.35,
          };
          const binDescent = {
            x: slotCenterX,
            y: HEIGHT - 40,
          };

          segments.push({
            p0: prevContact,
            p1: finalApex,
            p2: binDescent,
            p3: binContact,
            isFinal: true,
            slot: finalSlot,
          });
        }
      }

      const colors = ["#ef4444", "#f59e0b", "#10b981", "#38bdf8", "#ec4899", "#8b5cf6"];
      const ballColor = colors[Math.floor(Math.random() * colors.length)];

      const newBall = {
        id: Math.random().toString(36).substring(2, 9),
        data: ballData,
        segments,
        curSegIndex: 0,
        segProgress: 0,
        stepDuration: turbo ? 70 : 260, // Smooth, realistic gravity bounce speed
        color: ballColor,
        radius: ballRadius,
        slot: ballData.slot ?? 0,
        x: startX,
        y: startY,
      };

      activeBallsRef.current.push(newBall);
      setActiveBallCount(activeBallsRef.current.length);
    },
    getActiveCount: () => activeBallsRef.current.length,
  }));

  // Canvas 60fps rendering & deterministic trajectory engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let lastTime = performance.now();

    const renderLoop = (now) => {
      const dt = Math.min(now - lastTime, 40);
      lastTime = now;

      // 1. Clear canvas
      ctx.fillStyle = "#0a0d14";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Subtle background grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      for (let x = 0; x < WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }

      // 2. Draw all Pins & Hit Glows
      const pinRadius = Math.max(4.2, (24 - rows) / 1.8);
      for (let r = 0; r < rows; ++r) {
        const cols = 3 + r;
        for (let c = 0; c < cols; ++c) {
          const pin = getPinPos(r, c, rows);
          const pinKey = `${r}_${c}`;
          const hitInfo = pinHitsRef.current.get(pinKey);

          let currentRadius = pinRadius;
          let isHit = false;
          let hitAlpha = 0;
          let hitColor = "#ffffff";

          if (hitInfo) {
            const elapsed = now - hitInfo.startTime;
            if (elapsed < 200) {
              isHit = true;
              const p = elapsed / 200;
              hitAlpha = 1 - p;
              currentRadius = pinRadius * (1 + (1 - p) * 0.6); // Spring pop scale!
              hitColor = hitInfo.color || "#ffffff";

              // Expanding shockwave ripple
              ctx.save();
              ctx.strokeStyle = hitColor;
              ctx.globalAlpha = hitAlpha * 0.85;
              ctx.lineWidth = 2.5;
              ctx.shadowColor = hitColor;
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.arc(pin.x, pin.y, pinRadius + p * 20, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            } else {
              pinHitsRef.current.delete(pinKey);
            }
          }

          // Pin base shadow
          ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
          ctx.beginPath();
          ctx.arc(pin.x, pin.y + 2.5, currentRadius, 0, Math.PI * 2);
          ctx.fill();

          if (isHit) {
            // Bright Hit Glow on Pin
            ctx.save();
            ctx.shadowColor = hitColor;
            ctx.shadowBlur = 14;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            // Normal Metallic Glossy Pin
            const pinGrad = ctx.createRadialGradient(
              pin.x - currentRadius * 0.35,
              pin.y - currentRadius * 0.35,
              currentRadius * 0.1,
              pin.x,
              pin.y,
              currentRadius
            );
            pinGrad.addColorStop(0, "#ffffff");
            pinGrad.addColorStop(0.6, "#cbd5e1");
            pinGrad.addColorStop(1, "#475569");

            ctx.fillStyle = pinGrad;
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 3. Update & Draw Active Balls
      const aliveBalls = [];

      for (let i = 0; i < activeBallsRef.current.length; i++) {
        const b = activeBallsRef.current[i];
        const seg = b.segments[b.curSegIndex];

        if (!seg) {
          continue;
        }

        b.segProgress += dt / b.stepDuration;

        if (b.segProgress >= 1) {
          // Reached end of current segment (Pin Hit or Landing)
          b.curSegIndex += 1;
          b.segProgress = 0;

          // If hit a pin, trigger sound & pin reaction
          if (seg.pin) {
            sounds.playPegTick();
            pinHitsRef.current.set(`${seg.pin.r}_${seg.pin.c}`, {
              startTime: now,
              color: b.color,
            });
          }

          // If reached final multiplier bin
          if (seg.isFinal || b.curSegIndex >= b.segments.length) {
            const mults = currentMultsRef.current;
            const landedSlot = Math.min(Math.max(0, b.slot), mults.length - 1);
            const finalMultiplier = mults[landedSlot] ?? b.data.multiplier;

            setBouncedBin(landedSlot);
            setTimeout(() => setBouncedBin(null), 300);
            sounds.playWin(finalMultiplier);

            if (finalMultiplier >= 10) {
              sounds.playCoins();
              confetti({
                particleCount: finalMultiplier >= 50 ? 100 : 50,
                spread: 70,
                origin: { y: 0.8 },
                colors: ["#f59e0b", "#10b981", "#38bdf8", "#ec4899", "#fbbf24"],
              });
            }

            // Push to recent hits
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

        // Compute smooth position using Cubic Bezier
        const curSeg = b.segments[b.curSegIndex];
        if (curSeg) {
          const t = Math.min(1, Math.max(0, b.segProgress));
          const pos = cubicBezier(t, curSeg.p0, curSeg.p1, curSeg.p2, curSeg.p3);
          b.x = pos.x;
          b.y = pos.y;

          // Squash & Stretch calculation based on bounce phase
          let scaleX = 1.0;
          let scaleY = 1.0;

          if (t < 0.15) {
            // Subtle impact cushion against the pin
            const squash = Math.sin((t / 0.15) * Math.PI);
            scaleX = 1.0 + squash * 0.14;
            scaleY = 1.0 - squash * 0.14;
          } else if (t > 0.25 && t < 0.85) {
            // Natural parabolic motion
            scaleX = 0.96;
            scaleY = 1.04;
          }

          // Draw Clean Solid Physical 3D Ball (No neon glow / no blur / no ghost trail)
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(scaleX, scaleY);

          // 1. Subtle physical ambient shadow underneath
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.beginPath();
          ctx.ellipse(0, b.radius * 0.9, b.radius * 0.7, b.radius * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();

          // 2. Realistic 3D Sphere Radial Gradient
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
          grad.addColorStop(0.82, b.color);
          grad.addColorStop(1, "#0f172a");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
          ctx.fill();

          // 3. Crisp spherical rim contour
          ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
          ctx.stroke();

          // 4. Clean specular gloss highlight
          ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
          ctx.beginPath();
          ctx.arc(-b.radius * 0.34, -b.radius * 0.34, b.radius * 0.24, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          aliveBalls.push(b);
        }
      }

      activeBallsRef.current = aliveBalls;
      setActiveBallCount(aliveBalls.length);

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [rows]);

  // Width ratio of bins to perfectly align with bottom pegs
  const lastRowPinCount = 3 + rows - 1;
  const pinDistanceX = (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
  const totalBinsWidth = (rows + 1) * pinDistanceX;
  const binsWidthPercent = (totalBinsWidth / WIDTH) * 100;

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
      <div className="plinko-viewport">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="plinko-matter-canvas"
        />

        {/* Multiplier Bins Row */}
        <div
          className="plinko-bins-container"
          style={{ width: `${binsWidthPercent}%` }}
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
            {[14, 16].map((r) => (
              <button
                key={r}
                type="button"
                disabled={loading || activeBallCount > 0}
                className={`config-pill-btn ${rows === r ? "active" : ""}`}
                onClick={() => setRows(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="plinko-config-group">
          <span className="config-label">Poziom ryzyka:</span>
          <div className="config-pill-row">
            {[
              { id: "low", label: "Niskie" },
              { id: "medium", label: "Średnie" },
              { id: "high", label: "Wysokie" },
            ].map((rk) => (
              <button
                key={rk.id}
                type="button"
                disabled={loading || activeBallCount > 0}
                className={`config-pill-btn ${risk === rk.id ? "active" : ""}`}
                onClick={() => setRisk(rk.id)}
              >
                {rk.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
