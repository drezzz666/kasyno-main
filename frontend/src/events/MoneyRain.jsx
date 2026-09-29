import React, { useState, useEffect, useRef, useCallback } from "react";
import { BanknoteSvg } from "./BanknoteSvg";
import { sounds } from "../lib/sounds";
import { getEventEndsAt } from "../utils";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import "./MoneyRain.css";

const FALL_ANIMATIONS = ["flutterFallA", "flutterFallB", "flutterFallC"];
const SWAY_ANIMATIONS = ["swayPhysicsA", "swayPhysicsB"];

// Detect low-end device: small screen width or few CPU cores
const isLowEndDevice = () => {
  try {
    const smallScreen = window.screen.width <= 480 || window.screen.height <= 700;
    const fewCores = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 4;
    return smallScreen || fewCores;
  } catch {
    return false;
  }
};
const LOW_END = isLowEndDevice();

export function MoneyRain({
  activeEvent,
  onClose,
}) {
  const [running, setRunning] = useState(false);
  const [banknotes, setBanknotes] = useState([]);

  const nextIdRef = useRef(1);
  const spawnTimerRef = useRef(null);
  const notifiedEventKeyRef = useRef(null);
  const activeEventRef = useRef(activeEvent);
  activeEventRef.current = activeEvent;

  const notifyRainOnce = useCallback((ev) => {
    const eventKey = ev?.id || ev?.ends_at || ev?.endsAt || (ev ? `${ev.multiplier}-${ev.ends_at || ev.endsAt}` : null);
    if (!eventKey) return;

    try {
      if (sessionStorage.getItem("cash_rain_notified_key") === String(eventKey)) {
        return;
      }
      sessionStorage.setItem("cash_rain_notified_key", String(eventKey));
    } catch {}

    if (notifiedEventKeyRef.current === eventKey) {
      return;
    }
    notifiedEventKeyRef.current = eventKey;

    const mult = ev?.multiplier || 1.25;
    toast.success("🌧️ Cash Rain jest aktywny!", {
      id: "cash-rain-active-toast",
      description: `Mnożnik wygranych ×${Number(mult).toFixed(2)} jest teraz włączony!`,
      duration: 2000,
    });

    try {
      confetti({
        particleCount: LOW_END ? 15 : 35,
        spread: 80,
        origin: { y: 0.1 },
        colors: ["#fef08a", "#eab308", "#10b981", "#34d399", "#86efac"],
      });
    } catch {}
  }, []);

  const stopRain = useCallback(() => {
    setRunning(false);
    clearInterval(spawnTimerRef.current);
    setBanknotes([]);
    sounds.stopMoneyRainMusic();
    if (onClose) onClose();
  }, [onClose]);

  const startRain = useCallback((event) => {
    setRunning(true);
    sounds.playMoneyRainMusic();

    const ev = event || activeEventRef.current;
    if (ev) {
      notifyRainOnce(ev);
    }
  }, [notifyRainOnce]);

  // Continuous rain and music as long as activeEvent is active and not expired
  useEffect(() => {
    if (!activeEvent || !activeEvent.multiplier || activeEvent.multiplier <= 1.0) {
      if (running) stopRain();
      return;
    }

    const endsAtMs = getEventEndsAt(activeEvent);

    if (endsAtMs && Date.now() >= endsAtMs) {
      if (running) stopRain();
      return;
    }

    if (!running) {
      startRain(activeEvent);
    }

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
  }, [activeEvent, running, startRain, stopRain]);

  // Liveness heartbeat to kill rain & music the second event expiration time is reached
  useEffect(() => {
    if (!running) return;
    const watcher = setInterval(() => {
      if (!activeEvent) {
        stopRain();
        return;
      }
      const endsAtMs = getEventEndsAt(activeEvent);
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
      startRain(e.detail);
    };
    const handleStopEvent = () => {
      stopRain();
    };

    window.addEventListener("casino:start_money_rain", handleStartEvent);
    window.addEventListener("casino:stop_money_rain", handleStopEvent);
    return () => {
      window.removeEventListener("casino:start_money_rain", handleStartEvent);
      window.removeEventListener("casino:stop_money_rain", handleStopEvent);
    };
  }, [startRain, stopRain]);

  // Spawning loop for Fluttering Banknotes
  useEffect(() => {
    if (!running) return;

    // Low-end: spawn half as often, keep max 2 notes on screen
    const interval = LOW_END ? 5200 : 2600;
    const maxNotes = LOW_END ? 2 : 3;

    spawnTimerRef.current = setInterval(() => {
      const id = nextIdRef.current++;
      const left = Math.random() * 84 + 8; // 8% to 92% screen width

      // Depth layering — skip CSS blur on low-end
      const depthTier = Math.random();
      let scale = 0.8;
      let blur = "none";
      let zIndex = 9998;
      let width = 62;

      if (depthTier < 0.4) {
        // Far background
        width = 48;
        scale = 0.7;
        blur = LOW_END ? "none" : "blur(0.8px)";
        zIndex = 9997;
      } else if (depthTier < 0.8) {
        // Midground
        width = 60;
        scale = 0.8;
        zIndex = 9998;
      } else {
        // Foreground
        width = 72;
        scale = 0.9;
        zIndex = 9999;
      }

      const height = (width * 310) / 540;
      const fallDuration = Math.random() * 2.5 + 5.5; // 5.5s to 8.0s
      const swayDuration = Math.random() * 1.5 + 2.2; // 2.2s to 3.7s

      // On low-end: use simplest variant (no 3D rotateY/rotateX), no sway layer
      const animVariant = LOW_END
        ? "flutterFallC"
        : FALL_ANIMATIONS[Math.floor(Math.random() * FALL_ANIMATIONS.length)];
      const swayVariant = LOW_END
        ? null
        : SWAY_ANIMATIONS[Math.floor(Math.random() * SWAY_ANIMATIONS.length)];
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

      setBanknotes((prev) => [...prev.slice(-(maxNotes - 1)), newNote]);
    }, interval);

    return () => clearInterval(spawnTimerRef.current);
  }, [running]);

  // Periodically clean up fallen notes
  useEffect(() => {
    if (!running) return;
    const cleaner = setInterval(() => {
      const now = Date.now();
      setBanknotes((prev) =>
        prev.filter((n) => now - n.bornAt < n.fallDuration * 1000 + 400)
      );
    }, 1000);
    return () => clearInterval(cleaner);
  }, [running]);

  if (!running && banknotes.length === 0) {
    return null;
  }

  return (
    <div className="money-rain-overlay" style={{ pointerEvents: "none" }}>
      {/* Banknotes with Flutter Physics */}
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
            style={
              note.swayVariant
                ? { animation: `${note.swayVariant} ${note.swayDuration}s ease-in-out infinite alternate` }
                : undefined
            }
          >
            <BanknoteSvg />
          </div>
        </div>
      ))}
    </div>
  );
}

export default MoneyRain;
