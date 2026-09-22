import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { sounds } from "../lib/sounds";

export const PLINKO_MULTIPLIERS = {
  low: {
    8: [5.3, 2.0, 1.05, 0.95, 0.45, 0.95, 1.05, 2.0, 5.3],
    9: [5.3, 1.9, 1.5, 0.95, 0.65, 0.65, 0.95, 1.5, 1.9, 5.3],
    10: [8.5, 2.8, 1.3, 1.05, 0.95, 0.45, 0.95, 1.05, 1.3, 2.8, 8.5],
    11: [8.0, 2.8, 1.8, 1.2, 0.95, 0.65, 0.65, 0.95, 1.2, 1.8, 2.8, 8.0],
    12: [9.5, 2.8, 1.5, 1.3, 1.05, 0.95, 0.45, 0.95, 1.05, 1.3, 1.5, 2.8, 9.5],
    13: [7.7, 3.8, 2.8, 1.8, 1.15, 0.85, 0.65, 0.65, 0.85, 1.15, 1.8, 2.8, 3.8, 7.7],
    14: [6.8, 3.8, 1.8, 1.3, 1.2, 1.05, 0.95, 0.45, 0.95, 1.05, 1.2, 1.3, 1.8, 3.8, 6.8],
    15: [14.2, 7.6, 2.8, 1.9, 1.4, 1.05, 0.95, 0.65, 0.65, 0.95, 1.05, 1.4, 1.9, 2.8, 7.6, 14.2],
    16: [15.2, 8.5, 1.9, 1.3, 1.3, 1.15, 1.05, 0.95, 0.45, 0.95, 1.05, 1.15, 1.3, 1.3, 1.9, 8.5, 15.2],
  },
  medium: {
    8: [12.5, 2.8, 1.2, 0.65, 0.35, 0.65, 1.2, 2.8, 12.5],
    9: [17.0, 3.8, 1.6, 0.85, 0.45, 0.45, 0.85, 1.6, 3.8, 17.0],
    10: [21.0, 4.7, 1.9, 1.3, 0.55, 0.35, 0.55, 1.3, 1.9, 4.7, 21.0],
    11: [23.0, 5.7, 2.8, 1.7, 0.65, 0.45, 0.45, 0.65, 1.7, 2.8, 5.7, 23.0],
    12: [31.5, 10.5, 3.8, 1.9, 1.05, 0.55, 0.25, 0.55, 1.05, 1.9, 3.8, 10.5, 31.5],
    13: [41.0, 12.5, 5.7, 2.8, 1.2, 0.65, 0.35, 0.35, 0.65, 1.2, 2.8, 5.7, 12.5, 41.0],
    14: [55.0, 14.2, 6.6, 3.8, 1.8, 0.95, 0.45, 0.18, 0.45, 0.95, 1.8, 3.8, 6.6, 14.2, 55.0],
    15: [84.0, 17.0, 10.5, 4.7, 2.8, 1.2, 0.45, 0.25, 0.25, 0.45, 1.2, 2.8, 4.7, 10.5, 17.0, 84.0],
    16: [105.0, 39.0, 9.5, 4.7, 2.8, 1.4, 0.95, 0.45, 0.25, 0.45, 0.95, 1.4, 2.8, 4.7, 9.5, 39.0, 105.0],
  },
  high: {
    8: [27.5, 3.8, 1.4, 0.25, 0.15, 0.25, 1.4, 3.8, 27.5],
    9: [41.0, 6.6, 1.9, 0.55, 0.18, 0.18, 0.55, 1.9, 6.6, 41.0],
    10: [72.0, 9.5, 2.8, 0.85, 0.25, 0.18, 0.25, 0.85, 2.8, 9.5, 72.0],
    11: [114.0, 13.3, 4.9, 1.3, 0.35, 0.18, 0.18, 0.35, 1.3, 4.9, 13.3, 114.0],
    12: [162.0, 22.8, 7.7, 1.9, 0.65, 0.18, 0.18, 0.18, 0.65, 1.9, 7.7, 22.8, 162.0],
    13: [248.0, 35.0, 10.5, 3.8, 0.95, 0.18, 0.18, 0.18, 0.18, 0.95, 3.8, 10.5, 35.0, 248.0],
    14: [400.0, 53.0, 17.0, 4.7, 1.8, 0.25, 0.18, 0.18, 0.18, 0.25, 1.8, 4.7, 17.0, 53.0, 400.0],
    15: [590.0, 79.0, 25.8, 7.6, 2.8, 0.45, 0.18, 0.18, 0.18, 0.18, 0.45, 2.8, 7.6, 25.8, 79.0, 590.0],
    16: [950.0, 124.0, 24.8, 8.5, 3.8, 1.9, 0.18, 0.18, 0.18, 0.18, 0.18, 1.9, 3.8, 8.5, 24.8, 124.0, 950.0],
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
  { rows = 10, setRows, risk = "medium", setRisk, onBallFinish, loading },
  ref
) {
  const canvasRef = useRef(null);
  const activeBallsRef = useRef([]);
  const pinHitsRef = useRef(new Map());
  const animFrameIdRef = useRef(null);

  const onBallFinishRef = useRef(onBallFinish);
  onBallFinishRef.current = onBallFinish;

  const currentMults = PLINKO_MULTIPLIERS[risk]?.[rows] || PLINKO_MULTIPLIERS.medium[10];
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

      // Peg radius & Larger Prominent 3D Ball Radius
      const pinRadius = Math.max(4.2, (24 - numRows) / 1.8);
      const ballRadius = Math.max(13, 20 - numRows * 0.45);
      const collRadius = pinRadius + ballRadius;

      const segments = [];

      // 1. Initial drop segment from top chute down to apex pin (0, 1)
      const apexPin = getPinPos(0, 1, numRows);
      const startX = apexPin.x + (Math.random() - 0.5) * 4;
      const startY = 8;
      const firstStep = path[0] ?? (Math.random() < 0.5 ? 0 : 1);
      const firstDir = firstStep === 1 ? 1 : -1;

      // Contact point on apex pin
      const apexContact = {
        x: apexPin.x - firstDir * collRadius * 0.35,
        y: apexPin.y - collRadius * 0.88,
      };

      segments.push({
        p0: { x: startX, y: startY },
        p1: { x: startX, y: startY + 12 },
        p2: { x: apexContact.x, y: apexContact.y - 18 },
        p3: apexContact,
        pin: { r: 0, c: 1, pos: apexPin },
        isApex: true,
      });

      // 2. Peg to Peg Parabolic Bounces
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

          // Exaggerated, visible spring bounce upwards & outwards over peg flank
          const bounceApex = {
            x: currentPin.x + dir * collRadius * 1.35,
            y: currentPin.y - collRadius * 0.4 - 26, // high visible arc!
          };
          const gravityDescent = {
            x: nextPin.x - dir * collRadius * 0.3,
            y: nextPin.y - collRadius * 1.45,
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
            x: currentPin.x + dir * collRadius * 1.3,
            y: currentPin.y - collRadius * 0.3 - 22,
          };
          const binDescent = {
            x: slotCenterX,
            y: HEIGHT - 42,
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
        stepDuration: 135, // Clear, well-paced bounce timing (135ms per hop)
        color: ballColor,
        radius: ballRadius,
        slot: ballData.slot ?? 0,
        x: startX,
        y: startY,
        trail: [],
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
            sounds.playWin();

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

          if (t < 0.18) {
            // Impact squash against the pin
            const squash = Math.sin((t / 0.18) * Math.PI);
            scaleX = 1.0 + squash * 0.22;
            scaleY = 1.0 - squash * 0.22;
          } else if (t > 0.3 && t < 0.85) {
            // Airborne vertical stretch
            scaleX = 0.92;
            scaleY = 1.1;
          }

          // Trail
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 8) {
            b.trail.shift();
          }

          // Draw Glowing Ball Trail
          b.trail.forEach((tr, trIdx) => {
            const trAlpha = (trIdx / b.trail.length) * 0.35;
            ctx.fillStyle = b.color;
            ctx.globalAlpha = trAlpha;
            ctx.beginPath();
            ctx.arc(tr.x, tr.y, b.radius * (0.35 + 0.65 * (trIdx / b.trail.length)), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          });

          // Draw Ball with 3D Glossy Finish & Glow
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(scaleX, scaleY);

          ctx.shadowColor = b.color;
          ctx.shadowBlur = 14;

          // Ball Base Shadow
          ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          ctx.beginPath();
          ctx.arc(1, 3, b.radius * 0.95, 0, Math.PI * 2);
          ctx.fill();

          // 3D Sphere Radial Gradient
          const grad = ctx.createRadialGradient(
            -b.radius * 0.35,
            -b.radius * 0.35,
            b.radius * 0.1,
            0,
            0,
            b.radius
          );
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.25, b.color);
          grad.addColorStop(0.85, b.color);
          grad.addColorStop(1, "#0a0a0a");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
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
          <span className="config-label">Liczba rzędów (8–16):</span>
          <div className="config-pill-row">
            {[8, 9, 10, 11, 12, 13, 14, 15, 16].map((r) => (
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
