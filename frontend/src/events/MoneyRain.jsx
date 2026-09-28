import React, { useState, useEffect, useRef, useCallback } from "react";
import { BanknoteSvg } from "./BanknoteSvg";
import { CloudRain, Sparkles, X, Trophy, Timer } from "lucide-react";
import confetti from "canvas-confetti";
import "./MoneyRain.css";

// Synthesize pleasant arcade coin/cash sound via Web Audio API (zero external asset dependency)
function playCashChime(audioCtxRef) {
  try {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const now = ctx.currentTime;
    // Arpeggio note frequency sweep (e.g. 880Hz to 1760Hz)
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08); // E6

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Ignore audio autoplay restrictions safely
  }
}

export function MoneyRain({
  isActive = false,
  duration = 30, // seconds
  onClose,
  onAddBalance,
  currency = "₽",
  bgAudioSrc = "/audio/money.m4a",
}) {
  const [running, setRunning] = useState(isActive);
  const [timeLeft, setTimeLeft] = useState(duration);
  const [collectedTotal, setCollectedTotal] = useState(0);
  const [collectedCount, setCollectedCount] = useState(0);
  const [hudVisible, setHudVisible] = useState(true);
  const [banknotes, setBanknotes] = useState([]);
  const [floatingTexts, setFloatingTexts] = useState([]);

  const audioCtxRef = useRef(null);
  const bgAudioRef = useRef(null);
  const nextIdRef = useRef(1);
  const spawnTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Background music for Money Rain event
  useEffect(() => {
    if (running) {
      try {
        if (!bgAudioRef.current) {
          bgAudioRef.current = new Audio(bgAudioSrc);
          bgAudioRef.current.loop = true;
          bgAudioRef.current.volume = 0.6;
        }
        bgAudioRef.current.currentTime = 0;
        bgAudioRef.current.play().catch(() => {});
      } catch {
        // Audio playback safely ignored if file doesn't exist yet
      }
    } else {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current.currentTime = 0;
      }
    }

    return () => {
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
      }
    };
  }, [running, bgAudioSrc]);

  const stopRain = useCallback(() => {
    setRunning(false);
    clearInterval(spawnTimerRef.current);
    clearInterval(countdownTimerRef.current);
    if (onClose) onClose();
  }, [onClose]);

  const startRain = useCallback((sec) => {
    setRunning(true);
    setHudVisible(true);
    setTimeLeft(sec);
    setCollectedTotal(0);
    setCollectedCount(0);
    setBanknotes([]);
    setFloatingTexts([]);

    // Celebrate start
    try {
      confetti({
        particleCount: 50,
        spread: 80,
        origin: { y: 0.15 },
        colors: ["#a3e635", "#22c55e", "#10b981", "#eab308"],
      });
    } catch {
      // Ignore if confetti not available
    }
  }, []);

  // Synchronize with external prop or window events
  useEffect(() => {
    if (isActive) {
      startRain(duration);
    } else {
      stopRain();
    }
  }, [isActive, duration, startRain, stopRain]);

  useEffect(() => {
    const handleStartEvent = (e) => {
      const dur = e.detail?.duration || 30;
      startRain(dur);
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

  // Countdown timer
  useEffect(() => {
    if (!running) return;

    countdownTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopRain();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimerRef.current);
  }, [running, stopRain]);

  // Banknote spawning loop
  useEffect(() => {
    if (!running) return;

    // Spawn banknotes frequently
    spawnTimerRef.current = setInterval(() => {
      const id = nextIdRef.current++;
      const left = Math.random() * 88 + 4; // 4% to 92% screen width
      const width = Math.floor(Math.random() * 35) + 75; // 75px - 110px width
      const height = (width * 320) / 512;
      const fallDuration = Math.random() * 2.8 + 3.2; // 3.2s to 6.0s
      const rotationSpeed = (Math.random() - 0.5) * 720; // 3D spin degrees
      const swayDistance = (Math.random() - 0.5) * 80; // px sway

      // Randomized banknote values
      const values = [5, 10, 20, 50, 100];
      const weights = [0.4, 0.3, 0.18, 0.09, 0.03];
      const r = Math.random();
      let acc = 0;
      let noteValue = 10;
      for (let i = 0; i < values.length; i++) {
        acc += weights[i];
        if (r <= acc) {
          noteValue = values[i];
          break;
        }
      }

      const newNote = {
        id,
        left,
        width,
        height,
        fallDuration,
        rotationSpeed,
        swayDistance,
        value: noteValue,
        bornAt: Date.now(),
      };

      setBanknotes((prev) => [...prev.slice(-45), newNote]); // Limit concurrent notes for 60fps
    }, 280);

    return () => clearInterval(spawnTimerRef.current);
  }, [running]);

  // Clean up notes that reached bottom of screen
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

  // Handle banknote click / capture
  const handleBanknoteClick = useCallback(
    (e, note) => {
      e.stopPropagation();

      // Sound
      playCashChime(audioCtxRef);

      // Increment stats
      setCollectedTotal((prev) => prev + note.value);
      setCollectedCount((prev) => prev + 1);

      if (onAddBalance) {
        onAddBalance(note.value);
      }

      // Remove clicked note
      setBanknotes((prev) => prev.filter((n) => n.id !== note.id));

      // Floating text
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = rect.left + rect.width / 2;
      const clickY = rect.top + rect.height / 2;

      const textId = Date.now() + Math.random();
      setFloatingTexts((prev) => [
        ...prev,
        {
          id: textId,
          x: clickX,
          y: clickY,
          value: `+${note.value} ${currency}`,
        },
      ]);

      setTimeout(() => {
        setFloatingTexts((prev) => prev.filter((t) => t.id !== textId));
      }, 900);
    },
    [currency, onAddBalance]
  );

  if (!running && banknotes.length === 0 && floatingTexts.length === 0) {
    return null;
  }

  return (
    <>
      {/* Event HUD on top - can be hidden without stopping the rain */}
      {running && hudVisible && (
        <aside className="money-rain-hud" aria-label="Status wydarzenia Deszcz Kasy">
          <div className="money-rain-badge">
            <CloudRain size={16} />
            <span>Deszcz Kasy</span>
          </div>

          <div className="money-rain-stats">
            <div className="money-rain-stat">
              <span className="money-rain-stat-label">Status</span>
              <span className="money-rain-stat-value highlight">Na Żywo</span>
            </div>

            <div className="money-rain-timer">
              <Timer size={14} />
              <span>{timeLeft}s</span>
            </div>
          </div>

          <button
            type="button"
            className="money-rain-close-btn"
            onClick={() => setHudVisible(false)}
            title="Ukryj baner informacyjny (deszcz trwa dalej)"
            aria-label="Ukryj baner"
          >
            <X size={16} />
          </button>
        </aside>
      )}

      {/* Falling Banknotes Overlay - 100% click-through */}
      <div className="money-rain-overlay" style={{ pointerEvents: "none" }}>
        {banknotes.map((note) => {
          return (
            <div
              key={note.id}
              className="falling-banknote"
              style={{
                left: `${note.left}%`,
                width: `${note.width}px`,
                height: `${note.height}px`,
                animation: `fallBanknoteDown ${note.fallDuration}s linear forwards`,
                transform: `rotate(${note.rotationSpeed * 0.1}deg)`,
                pointerEvents: "none",
              }}
            >
              <div
                className="falling-banknote-inner"
                style={{
                  animation: `swayBanknote ${note.fallDuration * 0.4}s ease-in-out infinite alternate`,
                  pointerEvents: "none",
                }}
              >
                <BanknoteSvg />
              </div>
            </div>
          );
        })}

        {/* Floating Cash Pickups */}
        {floatingTexts.map((item) => (
          <div
            key={item.id}
            className="cash-pickup-bubble"
            style={{ left: `${item.x}px`, top: `${item.y}px` }}
          >
            {item.value}
          </div>
        ))}
      </div>

      {/* Global Dynamic Keyframes */}
      <style>{`
        @keyframes fallBanknoteDown {
          0% {
            top: -120px;
            opacity: 0;
            transform: translate3d(0, 0, 0) rotateZ(0deg) rotateX(20deg);
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            top: 105vh;
            opacity: 0;
            transform: translate3d(20px, 0, 0) rotateZ(280deg) rotateY(180deg);
          }
        }

        @keyframes swayBanknote {
          0% {
            transform: rotateY(-30deg) rotateZ(-15deg) translateX(-15px);
          }
          100% {
            transform: rotateY(30deg) rotateZ(15deg) translateX(15px);
          }
        }
      `}</style>
    </>
  );
}

export default MoneyRain;
