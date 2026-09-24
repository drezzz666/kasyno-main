import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Target } from "lucide-react";
import { toast } from "sonner";
import { gameNames, money } from "../lib/formatters";
import { BetControl } from "./BetControls";
import {
  BlackjackTable,
  ChickenTable,
  CoinflipTable,
  CrashTable,
  LimboTable,
  MinesTable,
  PlinkoTable,
  RouletteWheelVisual,
  RouletteBets,
  wheelOrder,
  RPSTable,
  SlotsTable,
} from "../games";
import { RoundOutcomeModal } from "./RoundOutcomeModal";
import { reportClientError } from "../lib/reporter";
import { addBreadcrumb } from "../lib/telemetry.js";

export function GameTableDialog({
  game,
  onClose,
  data,
  bet,
  setBet,
  choice,
  setChoice,
  mineCount,
  setMineCount,
  post,
  load,
  syncBalance,
  animatingRef,
  last,
  setLast,
  loading,
  turbo,
  setTurbo,
  tosAccepted = true,
  onOpenTosModal,
}) {
  useEffect(() => {
    if (game) {
      addBreadcrumb("ui", `Opened Game Table Modal: ${game}`, { game, bet });
    }
    return () => {
      if (game) {
        addBreadcrumb("ui", `Closed Game Table Modal: ${game}`);
      }
    };
  }, [game]);

  const round = data?.active?.game === game ? data.active : null;
  const [spinning, setSpinning] = useState(false);
  const [slotsSpinning, setSlotsSpinning] = useState(false);
  const [pendingSlotsRound, setPendingSlotsRound] = useState(null);
  const [rouletteWaiting, setRouletteWaiting] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [pendingSpin, setPendingSpin] = useState(null);
  const [pendingTiles, setPendingTiles] = useState(() => new Set());
  const [blackjackPreview, setBlackjackPreview] = useState(null);
  const lastActionTimeRef = useRef(0);
  const dialogRef = useRef(null);

  const handleTilePending = (tile, isPending) => {
    setPendingTiles((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(tile);
      } else {
        next.delete(tile);
      }
      return next;
    });
  };

  // New games states
  const [isFlipping, setIsFlipping] = useState(false);
  const [coinflipTarget, setCoinflipTarget] = useState(null);
  const [isShootingRPS, setIsShootingRPS] = useState(false);
  const [plinkoRows, setPlinkoRows] = useState(14);
  const [plinkoRisk, setPlinkoRisk] = useState("medium");
  const plinkoRef = useRef(null);

  // Simplified Roulette selection state (Set of chosen spots)
  const [rouletteSelected, setRouletteSelected] = useState(() => new Set());

  const handleRouletteToggle = (spot) => {
    setSpinResult(null);
    const isCategory = ["red", "black", "even", "odd", "low", "high", "dozen1", "dozen2", "dozen3", "col1", "col2", "col3"].includes(spot);
    setRouletteSelected((prev) => {
      const next = new Set(prev);
      if (isCategory) {
        if (next.has(spot) && next.size === 1) {
          return new Set();
        }
        return new Set([spot]);
      } else {
        for (const cat of ["red", "black", "even", "odd", "low", "high", "dozen1", "dozen2", "dozen3", "col1", "col2", "col3"]) {
          next.delete(cat);
        }
        if (next.has(spot)) {
          next.delete(spot);
        } else {
          next.add(spot);
        }
        return next;
      }
    });
  };

  const handleRouletteClear = () => {
    setSpinResult(null);
    setRouletteSelected(new Set());
  };

  const rouletteTotalBet = rouletteSelected.size === 0 ? 0 : (rouletteSelected.size === 1 ? bet : bet * rouletteSelected.size);

  // Limbo states
  const [limboTarget, setLimboTarget] = useState(2.0);
  const [limboAnimating, setLimboAnimating] = useState(false);
  const [limboDisplayMult, setLimboDisplayMult] = useState(1.0);

  // Crash states
  const [crashAutoCashout, setCrashAutoCashout] = useState(2.0);
  const [crashPlaying, setCrashPlaying] = useState(false);
  const [crashMult, setCrashMult] = useState(0.8);
  const [crashCrashed, setCrashCrashed] = useState(false);
  const [crashCashedOut, setCrashCashedOut] = useState(false);
  const [crashGraphPoints, setCrashGraphPoints] = useState([{ x: 0, y: 0.8 }]);
  const crashAnimRef = useRef(null);
  // Chicken states
  const [chickenBusy, setChickenBusy] = useState(false);

  // Unified Round Outcome Modal (Win, Push, Loss)
  const [outcomeData, setOutcomeData] = useState(null);
  const [outcomePending, setOutcomePending] = useState(false);
  const outcomeTimerRef = useRef(null);

  const triggerOutcome = useCallback((r, explicitDelay) => {
    if (!r) return;
    const payout = r.payout || 0;
    const betVal = r.bet || 10;
    const multiplier = r.payload?.multiplier || (payout / Math.max(1, betVal));

    if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current);
    setOutcomePending(true);

    // Provide 0.5s (500ms) delay across all games so player can observe table result first
    const delay = typeof explicitDelay === "number" ? explicitDelay : (turbo ? 100 : 500);

    outcomeTimerRef.current = setTimeout(() => {
      setOutcomePending(false);
      setOutcomeData({
        payout,
        bet: betVal,
        multiplier,
        resultText: r.result,
      });
      if (animatingRef) animatingRef.current = false;
    }, delay);
  }, [turbo, animatingRef]);

  useEffect(() => {
    return () => {
      if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current);
    };
  }, []);

  const isBusy = Boolean(
    loading ||
    round ||
    spinning ||
    slotsSpinning ||
    rouletteWaiting ||
    blackjackPreview ||
    pendingTiles.size > 0 ||
    pendingSpin ||
    isFlipping ||
    isShootingRPS ||
    limboAnimating ||
    crashPlaying ||
    chickenBusy ||
    outcomePending ||
    outcomeData ||
    animatingRef?.current
  );

  // Modal Keyboard handler: Focus Trap for Tab, Escape to close, prevent key repeat on Enter/Space
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Enter/Space repeat suppression
      if (e.key === "Enter" || e.key === " ") {
        if (e.repeat) {
          e.preventDefault();
        }
      }

      // 2. Escape closes modal when not busy
      if (e.key === "Escape") {
        if (!isBusy) {
          onClose();
        }
        return;
      }

      // 3. Focus Trap: constrain Tab navigation exclusively inside the open game modal
      if (e.key === "Tab") {
        if (!dialogRef.current) return;

        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"]):not([disabled])'
          )
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element or outside, wrap to last
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element or outside, wrap to first
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isBusy, onClose]);

  // Listen for realtime crash settlement from server
  useEffect(() => {
    const handleRoundSettled = (e) => {
      const data = e.detail;
      if (data?.game === "crash" && data?.crashed) {
        if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
        const cp = Number(data.crash_point) || 0.8;
        setCrashMult(cp);
        setCrashPlaying(false);
        setCrashCrashed(true);
        if (data.round) {
          setLast(data.round);
          triggerOutcome(data.round);
        }
        if (typeof data.balance === "number") syncBalance(data.balance);
        if (animatingRef) animatingRef.current = false;
        void load();
      }
    };
    window.addEventListener("casino:round_settled", handleRoundSettled);
    return () => window.removeEventListener("casino:round_settled", handleRoundSettled);
  }, [load, syncBalance, triggerOutcome]);

  const shownRound = blackjackPreview || round;

  const showSettledBlackjack = async (move) => {
    if (!round || loading) return;
    if (animatingRef) animatingRef.current = true;
    const j = await post(
      { action: "blackjack", roundId: round.id, move },
      { deferRefresh: true, deferBalance: true }
    );
    if (j?.round?.state === "settled") {
      if (turbo) {
        setBlackjackPreview(null);
        setLast(j.round);
        if (typeof j.balance === "number") syncBalance(j.balance);
        if (animatingRef) animatingRef.current = false;
        triggerOutcome(j.round);
        void load();
      } else {
        setBlackjackPreview({ ...j.round, state: "settled" });
        setTimeout(() => {
          setBlackjackPreview(null);
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        }, 750);
      }
    } else {
      if (animatingRef) animatingRef.current = false;
    }
  };

  const handleManualCrashCashout = async () => {
    if (!crashPlaying || crashCrashed || crashCashedOut) return;
    if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);

    const targetMult = crashMult;
    try {
      const j = await post(
        { game: "crash", action: "cashout_crash", mult: targetMult },
        { deferBalance: true, deferRefresh: true }
      );
      if (j && j.round) {
        setCrashPlaying(false);
        const won = Boolean(j.round.payload?.won);
        if (won) {
          setCrashCashedOut(true);
          setCrashMult(j.round.payload.cashed_at || targetMult);
        } else {
          setCrashCrashed(true);
          setCrashMult(j.round.payload?.crash_point || targetMult);
        }
        setLast(j.round);
        if (typeof j.balance === "number") syncBalance(j.balance);
        if (animatingRef) animatingRef.current = false;
        triggerOutcome(j.round);
        void load();
      }
    } catch (e) {
      setCrashPlaying(false);
      if (animatingRef) animatingRef.current = false;
      void load();
      if (!e.message?.toLowerCase().includes("brak aktywnej gry")) {
        toast.error(e.message || "Błąd podczas wypłaty Crash");
      }
    }
  };

  const start = async () => {
    if (isBusy || outcomeData || chickenBusy) {
      return;
    }

    const now = Date.now();
    const cooldown = game === "plinko" ? 250 : 1000;
    if (now - lastActionTimeRef.current < cooldown) {
      return;
    }
    lastActionTimeRef.current = now;

    if (!tosAccepted) {
      if (onOpenTosModal) onOpenTosModal();
      toast.error("Musisz zaakceptować regulamin, aby zagrać.");
      return;
    }

    if (game === "coinflip" && !choice) {
      toast.error("Wybierz stronę (Orła lub Reszkę) przed rzutem!");
      return;
    }

    if (game === "rps" && !choice) {
      toast.error("Wybierz swój gest (Kamień, Papier lub Nożyce) przed pojedynkiem!");
      return;
    }

    if (game === "roulette" && rouletteTotalBet <= 0) {
      toast.error("Postaw żetony na stole ruletki przed zakręceniem!");
      return;
    }

    setOutcomeData(null);

    // Continuous multi-ball drop in Plinko
    if (game === "plinko") {
      const j = await post(
        { game, bet, rows: plinkoRows, risk: plinkoRisk },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round?.payload && plinkoRef.current) {
        plinkoRef.current.dropBall({
          path: j.round.payload.path,
          slot: j.round.payload.slot,
          multiplier: j.round.payload.multiplier,
          payout: j.round.payout,
          round: j.round,
          balance: j.balance,
        });
      }
      return;
    }

    if (game === "limbo") {
      if (animatingRef) animatingRef.current = true;
      setLimboAnimating(true);
      const j = await post(
        { game, bet, target_multiplier: limboTarget },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round?.payload) {
        const finalMult = j.round.payload.result_multiplier;
        if (turbo) {
          setLimboDisplayMult(finalMult);
          setLimboAnimating(false);
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        } else {
          const duration = 700;
          const startTime = Date.now();

          const rollStep = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            if (progress < 0.75) {
              setLimboDisplayMult(1.0 + Math.random() * Math.max(6, limboTarget * 1.8));
              requestAnimationFrame(rollStep);
            } else if (progress < 1) {
              const ease = (progress - 0.75) / 0.25;
              setLimboDisplayMult(1.0 + (finalMult - 1.0) * ease);
              requestAnimationFrame(rollStep);
            } else {
              setLimboDisplayMult(finalMult);
              setLimboAnimating(false);
              setLast(j.round);
              if (typeof j.balance === "number") syncBalance(j.balance);
              if (animatingRef) animatingRef.current = false;
              triggerOutcome(j.round);
              void load();
            }
          };

          requestAnimationFrame(rollStep);
        }
      } else {
        setLimboAnimating(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "crash") {
      if (animatingRef) animatingRef.current = true;
      setCrashPlaying(true);
      setCrashCrashed(false);
      setCrashCashedOut(false);
      setCrashMult(0.8);
      setCrashGraphPoints([{ x: 0, y: 0.8 }]);

      const targetCashout = crashAutoCashout >= 0.8 ? crashAutoCashout : 1000.0;

      const j = await post(
        { game: "crash", action: "start_crash", bet, auto_cashout: targetCashout, turbo: Boolean(turbo) },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round) {
        const flightSpeed = j.round.payload?.flight_speed || (turbo ? 0.225 : 0.09);
        const startTime = performance.now();

        const animateFlight = async (currentTime) => {
          try {
            const now = typeof currentTime === "number" ? currentTime : performance.now();
            const elapsed = Math.max(0, (now - startTime) / 1000);
            const currentM = Math.max(0.8, 0.8 * Math.pow(Math.E, flightSpeed * elapsed));

            // Auto-cashout target reached before crash (Win)
            if (targetCashout >= 0.80 && currentM >= targetCashout) {
              if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
              setCrashPlaying(false);

              try {
                const res = await post(
                  { game: "crash", action: "cashout_crash", mult: targetCashout },
                  { deferBalance: true, deferRefresh: true }
                );
                if (res?.round) {
                  setLast(res.round);
                  if (typeof res.balance === "number") syncBalance(res.balance);
                  const won = Boolean(res.round.payload?.won);
                  if (won) {
                    setCrashCashedOut(true);
                    setCrashMult(res.round.payload.cashed_at || targetCashout);
                  } else {
                    setCrashCrashed(true);
                    setCrashMult(res.round.payload?.crash_point || targetCashout);
                  }
                  triggerOutcome(res.round);
                }
              } catch (e) {
                console.warn("[Crash] Auto cashout race/settled:", e.message);
              } finally {
                if (animatingRef) animatingRef.current = false;
                void load();
              }
              return;
            }

            // Normal in-flight frame
            setCrashMult(currentM);
            setCrashGraphPoints((prev) => [...prev, { x: elapsed, y: currentM }]);
            crashAnimRef.current = requestAnimationFrame(animateFlight);
          } catch (err) {
            reportClientError({
              error: err,
              errorType: "GAME_ACTION_ERROR",
              message: err.message || "Błąd podczas animacji lotu Crash",
              game: "crash",
              sourceFile: "frontend/src/components/GameTableDialog.jsx:animateFlight",
            });
            setCrashPlaying(false);
            if (animatingRef) animatingRef.current = false;
          }
        };

        crashAnimRef.current = requestAnimationFrame(animateFlight);
      } else {
        setCrashPlaying(false);
        setCrashMult(0.8);
        setCrashGraphPoints([]);
        if (animatingRef) animatingRef.current = false;
        void load();
      }
      return;
    }

    if (game === "slots") {
      if (animatingRef) animatingRef.current = true;
      setSlotsSpinning(!turbo);
      const j = await post(
        { game, bet },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round) {
        if (turbo) {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setSlotsSpinning(false);
          setPendingSlotsRound(null);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        } else {
          setPendingSlotsRound(j.round);
          setTimeout(() => {
            setLast(j.round);
            if (typeof j.balance === "number") syncBalance(j.balance);
            setSlotsSpinning(false);
            setPendingSlotsRound(null);
            if (animatingRef) animatingRef.current = false;
            triggerOutcome(j.round);
            void load();
          }, 1200);
        }
      } else {
        setSlotsSpinning(false);
        setPendingSlotsRound(null);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "coinflip") {
      if (animatingRef) animatingRef.current = true;
      const coinPick = choice === "tails" ? "tails" : "heads";
      const j = await post(
        { game, bet, choice: coinPick },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round) {
        const outSide = j.round.payload?.outcome || "heads";
        setCoinflipTarget(outSide);
        if (turbo) {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setIsFlipping(false);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        } else {
          setIsFlipping(true);
          setTimeout(() => {
            // Coin finishes toss and lands on table - user sees the result!
            setLast(j.round);
            if (typeof j.balance === "number") syncBalance(j.balance);
            setIsFlipping(false);
            triggerOutcome(j.round);
            void load();
          }, 820);
        }
      } else {
        setIsFlipping(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "rps") {
      if (animatingRef) animatingRef.current = true;
      setIsShootingRPS(!turbo);
      const rpsPick = choice || "rock";
      const j = await post(
        { game, bet, choice: rpsPick },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j) {
        if (turbo) {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setIsShootingRPS(false);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        } else {
          setTimeout(() => {
            setLast(j.round);
            if (typeof j.balance === "number") syncBalance(j.balance);
            setIsShootingRPS(false);
            if (animatingRef) animatingRef.current = false;
            triggerOutcome(j.round);
            void load();
          }, 900);
        }
      } else {
        setIsShootingRPS(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }


    if (game === "blackjack") {
      const j = await post({ action: "deal_blackjack", bet });
      if (j?.round?.state === "settled") {
        if (turbo) {
          setBlackjackPreview(null);
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          triggerOutcome(j.round);
          void load();
        } else {
          setBlackjackPreview({ ...j.round, state: "settled" });
          setTimeout(() => {
            setBlackjackPreview(null);
            setLast(j.round);
            if (typeof j.balance === "number") syncBalance(j.balance);
            triggerOutcome(j.round);
            void load();
          }, 950);
        }
      }
      return;
    }

    if (game === "mines") {
      await post({ action: "start_mines", bet, mines: mineCount });
      return;
    }

    if (game === "chicken") {
      await post({ action: "start_chicken", bet });
      return;
    }

    if (game === "roulette") {
      if (rouletteSelected.size === 0) {
        toast.error("Wybierz pole lub kolor na stole ruletki przed zakręceniem!");
        return;
      }
      const betsMap = {};
      for (const s of rouletteSelected) {
        betsMap[s] = bet;
      }
      if (animatingRef) animatingRef.current = true;
      setRouletteWaiting(true);
      const j = await post(
        { game, bet: rouletteTotalBet, bets: betsMap },
        { deferBalance: true, deferRefresh: true, deductBet: rouletteTotalBet }
      );
      if (j) {
        setSpinResult(j.round);
        setPendingSpin({ round: j.round, balance: j.balance });
        setRouletteWaiting(false);
        setSpinning(true);
      } else {
        setRouletteWaiting(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }
  };

  const handlePlinkoBallFinish = (ball) => {
    if (typeof ball.balance === "number") {
      syncBalance(ball.balance);
    }
    setLast(ball.round);
  };

  const handlePostMines = async (body, opts) => {
    const res = await post(body, { ...opts, silent: body?.move === "reveal" });
    if (res?.round?.state === "settled") {
      triggerOutcome(res.round);
    }
    return res;
  };

  const handleChickenCashout = async () => {
    if (!round || loading) return;
    const res = await post({ action: "chicken", roundId: round.id, move: "cashout" });
    if (res?.round) {
      if (animatingRef) animatingRef.current = true;
      setChickenBusy(true);
      setTimeout(() => {
        if (animatingRef) animatingRef.current = false;
        setChickenBusy(false);
        triggerOutcome(res.round, 0);
      }, turbo ? 100 : 500);
    }
  };

  const hasSettledSpin = Boolean(spinResult && !spinning && !rouletteWaiting);
  const rawWinningNumber = spinResult?.payload?.number ?? 0;
  const prize = Math.max(0, wheelOrder.indexOf(rawWinningNumber));

  return (
    <div className="modal-backdrop game-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="modal-dialog game-dialog-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 id="game-dialog-title">{gameNames[game] || "Gra"}</h3>
            <p>Stolik klubowy $FGT</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block text-[10px] font-mono text-slate-500 bg-slate-800/80 border border-slate-700/60 px-1.5 py-0.5 rounded">
              ESC
            </span>
            <button
              className="btn-close"
              disabled={isBusy}
              onClick={() => {
                if (!isBusy) onClose();
              }}
              aria-label="Zamknij okno gry"
              autoFocus
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="game-table-body horizontal-layout">
          {/* Left Side: Game Visual / Board Surface */}
          <div className="game-visual-column">
            <div className={`table-visual ${game} ${turbo ? "turbo" : ""}`}>
              {game === "roulette" && (
                <>
                  <div
                    className={`roulette-live ${spinning ? "is-spinning" : ""} ${rouletteWaiting ? "waiting" : ""}`}
                  >
                    <RouletteWheelVisual
                      mustStartSpinning={spinning}
                      prizeNumber={prize}
                      turbo={turbo}
                      onStopSpinning={() => {
                        setSpinning(false);
                        if (pendingSpin) {
                          setLast(pendingSpin.round);
                          if (typeof pendingSpin.balance === "number") {
                            syncBalance(pendingSpin.balance);
                          }
                          triggerOutcome(pendingSpin.round);
                          setPendingSpin(null);
                          void load();
                        }
                        if (animatingRef) animatingRef.current = false;
                      }}
                    />
                    {hasSettledSpin && (
                      <div className="roulette-result" aria-live="polite">
                        <strong>{rawWinningNumber}</strong>
                      </div>
                    )}
                  </div>
                  <RouletteBets
                    selectedBets={rouletteSelected}
                    onToggleBet={handleRouletteToggle}
                    onClearBets={handleRouletteClear}
                    winningNumber={hasSettledSpin ? rawWinningNumber : null}
                    disabled={spinning || rouletteWaiting}
                  />
                </>
              )}

              {game === "slots" && (
                <SlotsTable
                  last={pendingSlotsRound || last}
                  loading={loading}
                  slotsSpinning={slotsSpinning}
                  turbo={turbo}
                />
              )}

              {game === "blackjack" && (
                <BlackjackTable round={shownRound} last={last} />
              )}

              {game === "mines" && (
                <MinesTable
                  round={round}
                  last={last}
                  post={handlePostMines}
                  loading={loading}
                  pendingTiles={pendingTiles}
                  onPending={handleTilePending}
                />
              )}

              {game === "chicken" && (
                <ChickenTable
                  round={round}
                  last={last}
                  post={post}
                  loading={loading}
                  turbo={turbo}
                  triggerOutcome={triggerOutcome}
                  animatingRef={animatingRef}
                  onBusyChange={setChickenBusy}
                />
              )}

              {game === "coinflip" && (
                <CoinflipTable
                  choice={choice}
                  setChoice={setChoice}
                  last={last}
                  loading={loading}
                  isFlipping={isFlipping}
                  targetOutcome={coinflipTarget}
                />
              )}

              {game === "rps" && (
                <RPSTable
                  choice={choice}
                  setChoice={setChoice}
                  last={last}
                  loading={loading}
                  isShooting={isShootingRPS}
                />
              )}

              {game === "plinko" && (
                <PlinkoTable
                  ref={plinkoRef}
                  rows={plinkoRows}
                  setRows={setPlinkoRows}
                  risk={plinkoRisk}
                  setRisk={setPlinkoRisk}
                  onBallFinish={handlePlinkoBallFinish}
                  loading={loading}
                  turbo={turbo}
                />
              )}

              {game === "limbo" && (
                <LimboTable
                  target={limboTarget}
                  setTarget={setLimboTarget}
                  last={last}
                  loading={loading}
                  animating={limboAnimating}
                  displayMult={limboDisplayMult}
                />
              )}

              {game === "crash" && (
                <CrashTable
                  bet={bet}
                  isPlaying={crashPlaying}
                  currentMult={crashMult}
                  isCrashed={crashCrashed}
                  isCashedOut={crashCashedOut}
                  graphPoints={crashGraphPoints}
                  last={last}
                />
              )}
            </div>
          </div>

          {/* Right Side: Betting Controls & Play Action */}
          <div className="game-controls-column">
            {(!round || round.game === "crash") && !blackjackPreview && (
              <div className="table-controls-panel">
                <BetControl
                  bet={bet}
                  setBet={setBet}
                  maxBalance={data?.player?.balance ?? 0}
                  turbo={turbo}
                  setTurbo={setTurbo}
                />

                {game === "crash" && (
                  <div className="crash-auto-cashout-box">
                    <div className="crash-auto-header flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Target size={14} className="text-amber-400" />
                        <span>Docelowy Cashout</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">Min: 0.80× | Max: 1,000×</span>
                    </div>

                    <div className="crash-auto-input-wrap">
                      <input
                        type="number"
                        step="0.05"
                        min="0.8"
                        max="1000"
                        disabled={crashPlaying || loading}
                        value={crashAutoCashout}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0.8 && v <= 1000) {
                            setCrashAutoCashout(v);
                          }
                        }}
                        className="crash-auto-input"
                      />
                      <span className="crash-auto-suffix">×</span>
                    </div>

                    <div className="crash-presets-row mt-2">
                      {[1.1, 1.2, 1.5, 2.0, 3.0, 5.0].map((val) => (
                        <button
                          key={val}
                          type="button"
                          disabled={crashPlaying || loading}
                          className={`crash-preset-btn ${crashAutoCashout === val ? "active" : ""}`}
                          onClick={() => setCrashAutoCashout(val)}
                        >
                          {val}×
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "roulette" && (
                  <div className="roulette-bet-summary-box">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Wybrane zakłady:</span>
                      <strong className="text-amber-400 font-mono font-bold">
                        {rouletteSelected.size === 0
                          ? "Brak (wybierz na stole)"
                          : `${rouletteSelected.size} ${rouletteSelected.size === 1 ? "zakład" : "zakłady"}`}
                      </strong>
                    </div>
                    {rouletteSelected.size > 1 && (
                      <div className="flex items-center justify-between text-xs text-slate-300 mt-1.5 pt-1.5 border-t border-white/10">
                        <span>Łączny zakład:</span>
                        <strong className="text-amber-400 font-mono font-bold">
                          {rouletteTotalBet} $FGT
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {game === "mines" && (
                  <div className="mines-count-selector">
                    <div className="mines-count-header">
                      <span className="mines-count-title">Liczba min na planszy:</span>
                      <span className="mines-count-current">{mineCount} / 24</span>
                    </div>
                    <div className="mines-presets-row">
                      {[2, 3, 5, 10, 15, 20].map((count) => (
                        <button
                          key={count}
                          type="button"
                          className={`mines-preset-btn ${mineCount === count ? "active" : ""}`}
                          onClick={() => setMineCount(count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                )}



                {(() => {
                  const isChoiceMissing =
                    (game === "coinflip" && !choice) ||
                    (game === "rps" && !choice) ||
                    (game === "roulette" && rouletteTotalBet <= 0);

                  const isButtonDisabled =
                    !tosAccepted ||
                    isChoiceMissing ||
                    (game !== "plinko" && (loading || isBusy));

                  const getPlayButtonText = () => {
                    if (!tosAccepted) return "Zaakceptuj regulamin, aby zagrać";
                    if (outcomeData) return "Wynik rundy…";
                    if (chickenBusy) return "Koniec rundy…";
                    if (spinning) return "Koło się kręci…";
                    if (slotsSpinning) return "Bębny w ruchu…";
                    if (isFlipping) return "Moneta w locie…";
                    if (isShootingRPS) return "Pojedynek w toku…";
                    if (limboAnimating) return "Losowanie mnożnika…";
                    if (crashPlaying) return "Lot rakiety w toku…";
                    if (game === "plinko") return "Upuść kulę";
                    if (loading) return "Rozliczanie…";

                    if (game === "coinflip") {
                      if (!choice) return "Wybierz Orła lub Reszkę";
                      return `Rzuć monetą (${choice === "heads" ? "Orzeł 🦅" : "Reszka 👑"})`;
                    }

                    if (game === "rps") {
                      if (!choice) return "Wybierz swój gest";
                      const names = { rock: "Kamień ✊", paper: "Papier ✋", scissors: "Nożyce ✌️" };
                      return `Zagraj (${names[choice] || choice})`;
                    }

                    if (game === "roulette") {
                      if (rouletteTotalBet <= 0) return "Wybierz pole lub kolor";
                      return `Zakręć kołem (${rouletteTotalBet} $FGT)`;
                    }

                    if (last) return "Zagraj ponownie";
                    return "Rozpocznij rundę";
                  };

                  if (game === "crash" && crashPlaying && !crashCrashed && !crashCashedOut) {
                    return (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="btn-crash-cashout w-full"
                        onClick={handleManualCrashCashout}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if (e.repeat) e.preventDefault();
                          }
                        }}
                      >
                        <span className="btn-crash-cashout-main">WYPŁAĆ ({crashMult.toFixed(2)}×)</span>
                        <span className="btn-crash-cashout-sub">Wypłata: {money(Math.floor(bet * crashMult))}</span>
                      </button>
                    );
                  }

                  if (game === "chicken" && round) {
                    const p = round.payload || {};
                    const currentLane = p.currentLane || 0;
                    const currentMult = p.multiplier !== undefined ? p.multiplier : 1.00;
                    const currentProfit = Math.floor(bet * currentMult);

                    return (
                      <button
                        type="button"
                        tabIndex={-1}
                        className={`btn-play-action ${
                          currentLane >= 1 && !chickenBusy && !loading
                            ? "bg-[#00e701] hover:bg-[#00c801] text-slate-950 font-black shadow-lg shadow-emerald-500/25 cursor-pointer"
                            : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                        }`}
                        disabled={currentLane < 1 || loading || chickenBusy}
                        onClick={handleChickenCashout}
                      >
                        <div className="flex flex-col items-center">
                          <span>WYPŁAĆ {currentLane >= 1 ? money(currentProfit) : ""}</span>
                          {currentLane >= 1 && (
                            <span className="text-[11px] opacity-90 font-mono font-bold">
                              Mnożnik: ×{currentMult.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      tabIndex={-1}
                      className="btn-play-action primary"
                      disabled={isButtonDisabled}
                      onClick={start}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (e.repeat) e.preventDefault();
                        }
                      }}
                    >
                      {getPlayButtonText()}
                    </button>
                  );
                })()}
              </div>
            )}

            {/* Blackjack active actions */}
            {round?.game === "blackjack" && !blackjackPreview && (
              <div className="table-actions-row three">
                <button
                  type="button"
                  tabIndex={-1}
                  className="btn-play-action secondary"
                  disabled={loading}
                  onClick={() => showSettledBlackjack("stand")}
                >
                  Pas
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className="btn-play-action secondary"
                  disabled={loading || round.payload.cards.length !== 2}
                  onClick={() => showSettledBlackjack("double")}
                >
                  Podwój
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  className="btn-play-action primary"
                  disabled={loading}
                  onClick={() => showSettledBlackjack("hit")}
                >
                  Dobierz
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unified High-Impact Round Outcome Screen (Win / Tie / Loss) */}
      {outcomeData && (
        <RoundOutcomeModal
          outcomeData={outcomeData}
          onClose={() => setOutcomeData(null)}
        />
      )}
    </div>
  );
}
