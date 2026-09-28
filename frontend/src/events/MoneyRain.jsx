import React, { useState, useEffect, useRef, useCallback } from "react";
import { BanknoteSvg } from "./BanknoteSvg";
import { sounds } from "../lib/sounds";
import confetti from "canvas-confetti";
import "./MoneyRain.css";

const FALL_ANIMATIONS = ["flutterFallA", "flutterFallB", "flutterFallC"];
const SWAY_ANIMATIONS = ["swayPhysicsA", "swayPhysicsB"];

export function MoneyRain({
  activeEvent,
  onClose,
}) {
  const [running, setRunning] = useState(false);
  const [banknotes, setBanknotes] = useState([]);
  const [sparkles, setSparkles] = useState([]);

  const nextIdRef = useRef(1);
  const spawnTimerRef = useRef(null);
  const sparkleTimerRef = useRef(null);

  const stopRain = useCallback(() => {
    setRunning(false);
    clearInterval(spawnTimerRef.current);
    clearInterval(sparkleTimerRef.current);
    setBanknotes([]);
    setSparkles([]);
    sounds.stopMoneyRainMusic();
    if (onClose) onClose();
  }, [onClose]);

  const startRain = useCallback(() => {
    setRunning(true);

    // Start event music via sounds engine immediately and loop continuously
    sounds.playMoneyRainMusic();

    // Golden celebratory burst at event onset
    try {
      confetti({
        particleCount: 60,
        spread: 90,
        origin: { y: 0.1 },
        colors: ["#fef08a", "#eab308", "#10b981", "#34d399", "#86efac"],
      });
    } catch {}
  }, []);

  // Continuous rain and music as long as activeEvent is active and not expired
  useEffect(() => {
    if (!activeEvent || !activeEvent.multiplier || activeEvent.multiplier <= 1.0) {
      stopRain();
      return;
    }

    const endsAtMs = activeEvent.ends_at
      ? new Date(activeEvent.ends_at).getTime()
      : activeEvent.endsAt
      ? new Date(activeEvent.endsAt).getTime()
      : null;

    if (endsAtMs && Date.now() >= endsAtMs) {
      stopRain();
      return;
    }

    startRain();

    let endTimer = null;
    if (endsAtMs) {
      const remaining = endsAtMs - Date.now();
      if (remaining > 0) {
        endTimer = setTimeout(() => {
          stopRain();
        }, remaining);
      } else {
        stopRain();
      }
    }

    return () => {
      if (endTimer) clearTimeout(endTimer);
    };
  }, [activeEvent, startRain, stopRain]);

  // Liveness heartbeat to kill rain & music the second event expiration time is reached
  useEffect(() => {
    if (!running) return;
    const watcher = setInterval(() => {
      if (!activeEvent) {
        stopRain();
        return;
      }
      const endsAtMs = activeEvent.ends_at
        ? new Date(activeEvent.ends_at).getTime()
        : activeEvent.endsAt
        ? new Date(activeEvent.endsAt).getTime()
        : null;
      if (endsAtMs && Date.now() >= endsAtMs) {
        stopRain();
      }
    }, 1000);
    return () => clearInterval(watcher);
  }, [running, activeEvent, stopRain]);

  // Synchronize with window events (e.g. when triggered from WebSocket or devtools)
  useEffect(() => {
    const handleStartEvent = (e) => {
      if (e.detail?.action === "stop") {
        stopRain();
        return;
      }
      startRain();
    };
    const handleStopEvent = () => {
      stopRain();
    };

    window.addEventListener("casino:start_money_rain", handleStartEvent);
    window.addEventListener("casino:stop_money_rain", handleStopEvent);
    return () => {
      window.removeEventListener("casino:start_money_rain", handleStartEvent);
      window.removeEventListener("casino:stop_money_rain", handleStopEvent);
      stopRain();
    };
  }, [startRain, stopRain]);

  // Spawning loop for Fluttering 3D Banknotes
  useEffect(() => {
    if (!running) return;

    spawnTimerRef.current = setInterval(() => {
      const id = nextIdRef.current++;
      const left = Math.random() * 88 + 4; // 4% to 92% screen width
      
      // Depth layering: 0 = background, 1 = midground, 2 = foreground
      const depthTier = Math.random();
      let scale = 1;
      let blur = "none";
      let zIndex = 9999;
      let width = 96;

      if (depthTier < 0.25) {
        // Far background
        width = 65;
        scale = 0.72;
        blur = "blur(0.8px)";
        zIndex = 9997;
      } else if (depthTier < 0.75) {
        // Midground
        width = 90;
        scale = 0.95;
        zIndex = 9998;
      } else {
        // Crisp foreground
        width = 115;
        scale = 1.08;
        zIndex = 10000;
      }

      const height = (width * 310) / 540;
      const fallDuration = Math.random() * 2.5 + 3.8; // 3.8s to 6.3s
      const swayDuration = Math.random() * 1.2 + 1.8; // 1.8s to 3.0s
      const animVariant = FALL_ANIMATIONS[Math.floor(Math.random() * FALL_ANIMATIONS.length)];
      const swayVariant = SWAY_ANIMATIONS[Math.floor(Math.random() * SWAY_ANIMATIONS.length)];
      const startDelay = Math.random() * 0.2;

      const newNote = {
        id,
        left,
        width,
        height,
        scale,
        blur,
        zIndex,
        fallDuration,
        swayDuration,
        animVariant,
        swayVariant,
        startDelay,
        bornAt: Date.now(),
      };

      setBanknotes((prev) => [...prev.slice(-55), newNote]);
    }, 240);

    return () => clearInterval(spawnTimerRef.current);
  }, [running]);

  // Spawning loop for subtle Golden Sparkles
  useEffect(() => {
    if (!running) return;

    sparkleTimerRef.current = setInterval(() => {
      const id = nextIdRef.current++;
      const left = Math.random() * 96 + 2;
      const fallDuration = Math.random() * 2 + 2.5;
      const size = Math.random() * 4 + 3;

      const newSparkle = {
        id,
        left,
        size,
        fallDuration,
        bornAt: Date.now(),
      };

      setSparkles((prev) => [...prev.slice(-30), newSparkle]);
    }, 200);

    return () => clearInterval(sparkleTimerRef.current);
  }, [running]);

  // Periodically clean up fallen notes & sparkles
  useEffect(() => {
    if (!running) return;
    const cleaner = setInterval(() => {
      const now = Date.now();
      setBanknotes((prev) =>
        prev.filter((n) => now - n.bornAt < n.fallDuration * 1000 + 400)
      );
      setSparkles((prev) =>
        prev.filter((s) => now - s.bornAt < s.fallDuration * 1000 + 400)
      );
    }, 1000);
    return () => clearInterval(cleaner);
  }, [running]);

  if (!running && banknotes.length === 0 && sparkles.length === 0) {
    return null;
  }

  return (
    <div className="money-rain-overlay" style={{ pointerEvents: "none" }}>

      {/* Golden Sparkles */}
      {sparkles.map((sp) => (
        <div
          key={sp.id}
          className="money-rain-sparkle"
          style={{
            left: `${sp.left}%`,
            width: `${sp.size}px`,
            height: `${sp.size}px`,
            animation: `sparkleFall ${sp.fallDuration}s linear forwards`,
          }}
        />
      ))}

      {/* 3D Banknotes with Realistic Flutter Physics */}
      {banknotes.map((note) => (
        <div
          key={note.id}
          className="falling-banknote"
          style={{
            left: `${note.left}%`,
            width: `${note.width}px`,
            height: `${note.height}px`,
            zIndex: note.zIndex,
            filter: note.blur,
            animation: `${note.animVariant} ${note.fallDuration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
            animationDelay: `${note.startDelay}s`,
          }}
        >
          <div
            className="falling-banknote-inner"
            style={{
              animation: `${note.swayVariant} ${note.swayDuration}s ease-in-out infinite alternate`,
            }}
          >
            <BanknoteSvg />
          </div>
        </div>
      ))}
    </div>
  );
}

export default MoneyRain;
