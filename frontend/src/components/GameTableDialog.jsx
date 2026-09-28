import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Target, Zap, RotateCw, Trash2, CheckCircle2, ArrowDown, ArrowUp } from "lucide-react";
import { sounds } from "../lib/sounds";
import { toast } from "sonner";
import { gameNames, money } from "../lib/formatters";
import {
  BlackjackTable,
  ChickenTable,
  CHICKEN_MULTIPLIERS,
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
  UpgraderTable,
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
  activeEvent: propActiveEvent,
}) {
  const dialogRef = useRef(null);
  const lastActionTimeRef = useRef(0);
  const crashAnimRef = useRef(null);
  const outcomeTimerRef = useRef(null);
  const plinkoRef = useRef(null);
  const chickenRef = useRef(null);

  const [currentEvent, setCurrentEvent] = useState(() => {
    return propActiveEvent || data?.activeEvent || null;
  });

  useEffect(() => {
    if (propActiveEvent) {
      setCurrentEvent(propActiveEvent);
    } else if (data?.activeEvent) {
      setCurrentEvent(data.activeEvent);
    }
  }, [propActiveEvent, data?.activeEvent]);

  useEffect(() => {
    const handleStart = (e) => {
      const p = e.detail || {};
      setCurrentEvent({
        name: p.event || "money-rain",
        multiplier: p.multiplier || 1.25,
        duration: p.duration || 60,
      });
    };
    const handleStop = () => {
      setCurrentEvent(null);
    };

    window.addEventListener("casino:start_money_rain", handleStart);
    window.addEventListener("casino:stop_money_rain", handleStop);
    return () => {
      window.removeEventListener("casino:start_money_rain", handleStart);
      window.removeEventListener("casino:stop_money_rain", handleStop);
    };
  }, []);

  const round = data?.active?.game === game ? data.active : null;

  // Game states
  const [spinning, setSpinning] = useState(false);
  const [slotsSpinning, setSlotsSpinning] = useState(false);
  const [pendingSlotsRound, setPendingSlotsRound] = useState(null);
  const [rouletteWaiting, setRouletteWaiting] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [pendingSpin, setPendingSpin] = useState(null);
  const [pendingTiles, setPendingTiles] = useState(() => new Set());
  const [blackjackPreview, setBlackjackPreview] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [coinflipTarget, setCoinflipTarget] = useState(null);
  const [isShootingRPS, setIsShootingRPS] = useState(false);
  const [plinkoRows, setPlinkoRows] = useState(14);
  const [plinkoRisk, setPlinkoRisk] = useState("medium");
  const [rouletteSelected, setRouletteSelected] = useState(() => new Set());
  const [limboTarget, setLimboTarget] = useState(2.0);
  const [limboAnimating, setLimboAnimating] = useState(false);
  const [limboDisplayMult, setLimboDisplayMult] = useState(1.0);
  const [crashAutoCashout, setCrashAutoCashout] = useState(2.0);
  const [crashPlaying, setCrashPlaying] = useState(false);
  const [crashMult, setCrashMult] = useState(0.8);
  const [crashCrashed, setCrashCrashed] = useState(false);
  const [crashCashedOut, setCrashCashedOut] = useState(false);
  const [crashGraphPoints, setCrashGraphPoints] = useState([{ x: 0, y: 0.8 }]);
  const [chickenBusy, setChickenBusy] = useState(false);
  const [upgraderTarget, setUpgraderTarget] = useState(2.0);
  const [upgraderRollType, setUpgraderRollType] = useState("under");
  const [upgraderBusy, setUpgraderBusy] = useState(false);
  const [outcomeData, setOutcomeData] = useState(null);
  const [outcomePending, setOutcomePending] = useState(false);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (game) addBreadcrumb("ui", `Opened Game Table Modal: ${game}`, { game, bet });
    return () => {
      document.body.style.overflow = originalOverflow;
      if (game) addBreadcrumb("ui", `Closed Game Table Modal: ${game}`);
      if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current);
      if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
    };
  }, [game]);

  const triggerOutcome = useCallback((r, explicitDelay) => {
    if (!r) return;
    const payout = r.payout || 0;
    const betVal = r.bet || 10;
    const multiplier = r.payload?.multiplier || payout / Math.max(1, betVal);

    if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current);
    setOutcomePending(true);

    const delay = typeof explicitDelay === "number" ? explicitDelay : turbo ? 100 : 500;
    outcomeTimerRef.current = setTimeout(() => {
      setOutcomePending(false);
      setOutcomeData({ payout, bet: betVal, multiplier, resultText: r.result });
      if (animatingRef) animatingRef.current = false;
    }, delay);
  }, [turbo, animatingRef]);

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
    upgraderBusy ||
    outcomePending ||
    outcomeData ||
    animatingRef?.current
  );

  // Keyboard navigation & Focus trap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.repeat) e.preventDefault();
      if (e.key === "Escape" && !isBusy) {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"])'
          )
        );
        if (!focusable.length) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isBusy, onClose]);

  // Realtime crash round settled
  useEffect(() => {
    const handleRoundSettled = (e) => {
      const d = e.detail;
      if (d?.game === "crash" && d?.crashed) {
        if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
        const cp = Number(d.crash_point) || 0.8;
        setCrashMult(cp);
        setCrashPlaying(false);
        setCrashCrashed(true);
        if (d.round) {
          setLast(d.round);
          triggerOutcome(d.round);
        }
        if (typeof d.balance === "number") syncBalance(d.balance);
        if (animatingRef) animatingRef.current = false;
        void load();
      }
    };
    window.addEventListener("casino:round_settled", handleRoundSettled);
    return () => window.removeEventListener("casino:round_settled", handleRoundSettled);
  }, [load, syncBalance, triggerOutcome]);

  const handleTilePending = (tile, isPending) => {
    setPendingTiles((prev) => {
      const next = new Set(prev);
      if (isPending) next.add(tile);
      else next.delete(tile);
      return next;
    });
  };

  const handleRouletteToggle = (spot) => {
    setSpinResult(null);
    const isCategory = ["red", "black", "even", "odd", "low", "high", "dozen1", "dozen2", "dozen3", "col1", "col2", "col3"].includes(spot);
    setRouletteSelected((prev) => {
      const next = new Set(prev);
      if (isCategory) return next.has(spot) && next.size === 1 ? new Set() : new Set([spot]);
      ["red", "black", "even", "odd", "low", "high", "dozen1", "dozen2", "dozen3", "col1", "col2", "col3"].forEach((c) => next.delete(c));
      if (next.has(spot)) next.delete(spot);
      else next.add(spot);
      return next;
    });
  };

  const handleRouletteClear = () => {
    setSpinResult(null);
    setRouletteSelected(new Set());
  };

  const rouletteTotalBet = rouletteSelected.size === 0 ? 0 : rouletteSelected.size === 1 ? bet : bet * rouletteSelected.size;

  const showSettledBlackjack = async (move) => {
    if (!round || loading) return;
    if (animatingRef) animatingRef.current = true;
    const j = await post({ action: "blackjack", roundId: round.id, move }, { deferRefresh: true, deferBalance: true });
    if (j?.round?.state === "settled") {
      const apply = () => {
        setBlackjackPreview(null);
        setLast(j.round);
        if (typeof j.balance === "number") syncBalance(j.balance);
        if (animatingRef) animatingRef.current = false;
        triggerOutcome(j.round);
        void load();
      };
      if (turbo) apply();
      else {
        setBlackjackPreview({ ...j.round, state: "settled" });
        setTimeout(apply, 750);
      }
    } else if (animatingRef) animatingRef.current = false;
  };

  const handleManualCrashCashout = async () => {
    if (!crashPlaying || crashCrashed || crashCashedOut) return;
    if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
    const targetMult = crashMult;
    try {
      const j = await post({ game: "crash", action: "cashout_crash", mult: targetMult }, { deferBalance: true, deferRefresh: true });
      if (j?.round) {
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

  const handlePostMines = async (body, opts) => {
    const res = await post(body, { ...opts, silent: body?.move === "reveal" });
    if (res?.round?.state === "settled") triggerOutcome(res.round);
    return res;
  };

  const handleMinesCashout = async () => {
    if (!round || round.game !== "mines" || loading) return;
    const revealed = round.payload?.revealed || [];
    if (revealed.length === 0) return;
    sounds.playCoins();
    if (animatingRef) animatingRef.current = true;
    try {
      const res = await post({ action: "mines", roundId: round.id, move: "cashout" });
      if (res?.round) {
        setLast(res.round);
        if (typeof res.balance === "number") syncBalance(res.balance);
        triggerOutcome(res.round);
        void load();
      }
    } finally {
      if (animatingRef) animatingRef.current = false;
    }
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

  const handleChickenStep = () => {
    if (chickenRef.current?.step) {
      chickenRef.current.step();
    }
  };

  const handlePlinkoBallFinish = (ball) => {
    if (typeof ball.balance === "number") syncBalance(ball.balance);
    setLast(ball.round);
  };

  const start = async () => {
    if (isBusy || outcomeData || chickenBusy) return;

    const now = Date.now();
    const cooldown = game === "plinko" ? 250 : 1000;
    if (now - lastActionTimeRef.current < cooldown) return;
    lastActionTimeRef.current = now;

    if (!tosAccepted) {
      if (onOpenTosModal) onOpenTosModal();
      toast.error("Musisz zaakceptować regulamin, aby zagrać.");
      return;
    }

    if (game === "coinflip" && !choice) return toast.error("Wybierz stronę (Orła lub Reszkę) przed rzutem!");
    if (game === "rps" && !choice) return toast.error("Wybierz swój gest przed pojedynkiem!");
    if (game === "roulette" && rouletteTotalBet <= 0) return toast.error("Postaw żetony na stole ruletki przed zakręceniem!");

    setOutcomeData(null);

    if (game === "plinko") {
      const j = await post({ game, bet, rows: plinkoRows, risk: plinkoRisk }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round?.payload && plinkoRef.current) {
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
      const j = await post({ game, bet, target_multiplier: limboTarget }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round?.payload) {
        const finalMult = j.round.payload.result_multiplier;
        const finalize = () => {
          setLimboDisplayMult(finalMult);
          setLimboAnimating(false);
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        };
        if (turbo) finalize();
        else {
          const duration = 700;
          const startTime = Date.now();
          const rollStep = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            if (progress < 0.75) {
              setLimboDisplayMult(1.0 + Math.random() * Math.max(6, limboTarget * 1.8));
              requestAnimationFrame(rollStep);
            } else if (progress < 1) {
              setLimboDisplayMult(1.0 + (finalMult - 1.0) * ((progress - 0.75) / 0.25));
              requestAnimationFrame(rollStep);
            } else finalize();
          };
          requestAnimationFrame(rollStep);
        }
      } else {
        setLimboAnimating(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "upgrader") {
      if (animatingRef) animatingRef.current = true;
      setUpgraderBusy(true);
      const j = await post({ game: "upgrader", bet, target_multiplier: upgraderTarget, roll_type: upgraderRollType }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round) {
        setLast(j.round);
        if (typeof j.balance === "number") syncBalance(j.balance);
        void load();
      } else {
        setUpgraderBusy(false);
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
      const j = await post({ game: "crash", action: "start_crash", bet, auto_cashout: targetCashout, turbo: Boolean(turbo) }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round) {
        const flightSpeed = j.round.payload?.flight_speed || (turbo ? 0.225 : 0.09);
        const startTime = performance.now();
        const animateFlight = async (currentTime) => {
          try {
            const elapsed = Math.max(0, ((typeof currentTime === "number" ? currentTime : performance.now()) - startTime) / 1000);
            const currentM = Math.max(0.8, 0.8 * Math.pow(Math.E, flightSpeed * elapsed));
            if (targetCashout >= 0.80 && currentM >= targetCashout) {
              if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
              setCrashPlaying(false);
              try {
                const res = await post({ game: "crash", action: "cashout_crash", mult: targetCashout }, { deferBalance: true, deferRefresh: true });
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
                console.warn("[Crash] Auto cashout settled:", e.message);
              } finally {
                if (animatingRef) animatingRef.current = false;
                void load();
              }
              return;
            }
            setCrashMult(currentM);
            setCrashGraphPoints((prev) => [...prev, { x: elapsed, y: currentM }]);
            crashAnimRef.current = requestAnimationFrame(animateFlight);
          } catch (err) {
            reportClientError({ error: err, errorType: "GAME_ACTION_ERROR", message: err.message || "Crash flight error", game: "crash", sourceFile: "GameTableDialog.jsx" });
            setCrashPlaying(false);
            if (animatingRef) animatingRef.current = false;
          }
        };
        crashAnimRef.current = requestAnimationFrame(animateFlight);
      } else {
        setCrashPlaying(false);
        if (animatingRef) animatingRef.current = false;
        void load();
      }
      return;
    }

    if (game === "slots") {
      if (animatingRef) animatingRef.current = true;
      const j = await post({ game, bet }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round) {
        setPendingSlotsRound(j.round);
        if (!turbo) {
          setSlotsSpinning(true);
        }
        const finalize = () => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setSlotsSpinning(false);
          setPendingSlotsRound(null);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        };
        if (turbo) finalize();
        else {
          setTimeout(finalize, 1950);
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
      const j = await post({ game, bet, choice: choice === "tails" ? "tails" : "heads" }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round) {
        setCoinflipTarget(j.round.payload?.outcome || "heads");
        const finalize = () => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setIsFlipping(false);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        };
        if (turbo) finalize();
        else {
          setIsFlipping(true);
          setTimeout(finalize, 820);
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
      const j = await post({ game, bet, choice: choice || "rock" }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j) {
        const finalize = () => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setIsShootingRPS(false);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        };
        if (turbo) finalize();
        else setTimeout(finalize, 900);
      } else {
        setIsShootingRPS(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "blackjack") {
      const j = await post({ action: "deal_blackjack", bet });
      if (j?.round?.state === "settled") {
        const finalize = () => {
          setBlackjackPreview(null);
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          triggerOutcome(j.round);
          void load();
        };
        if (turbo) finalize();
        else {
          setBlackjackPreview({ ...j.round, state: "settled" });
          setTimeout(finalize, 950);
        }
      }
      return;
    }

    if (game === "mines") return post({ action: "start_mines", bet, mines: [2, 5, 10, 15].includes(Number(mineCount)) ? Number(mineCount) : 5 });
    if (game === "chicken") return post({ action: "start_chicken", bet });

    if (game === "roulette") {
      const betsMap = {};
      rouletteSelected.forEach((s) => { betsMap[s] = bet; });
      if (animatingRef) animatingRef.current = true;
      setRouletteWaiting(true);
      const j = await post({ game, bet: rouletteTotalBet, bets: betsMap }, { deferBalance: true, deferRefresh: true, deductBet: rouletteTotalBet });
      if (j) {
        setSpinResult(j.round);
        setPendingSpin({ round: j.round, balance: j.balance });
        setRouletteWaiting(false);
        setSpinning(true);
      } else {
        setRouletteWaiting(false);
        if (animatingRef) animatingRef.current = false;
      }
    }
  };

  const hasSettledSpin = Boolean(spinResult && !spinning && !rouletteWaiting);
  const rawWinningNumber = spinResult?.payload?.number ?? 0;
  const prize = Math.max(0, wheelOrder.indexOf(rawWinningNumber));



  const getPlayButtonText = () => {
    if (!tosAccepted) return "Zaakceptuj regulamin";
    if (outcomeData) return "Wynik rundy…";
    if (chickenBusy) return "Koniec rundy…";
    if (spinning) return "Koło się kręci…";
    if (slotsSpinning) return "Bębny w ruchu…";
    if (isFlipping) return "Moneta w locie…";
    if (isShootingRPS) return "Pojedynek w toku…";
    if (limboAnimating) return "Losowanie…";
    if (crashPlaying) return "Lot rakiety…";
    if (game === "plinko") return "Upuść kulę";
    if (loading) return "Rozliczanie…";
    if (game === "coinflip") return choice ? `Rzuć monetą (${choice === "heads" ? "Orzeł 🦅" : "Reszka 👑"})` : "Wybierz Orła lub Reszkę";
    if (game === "rps") return choice ? `Zagraj (${{ rock: "Kamień ✊", paper: "Papier ✋", scissors: "Nożyce ✌️" }[choice] || choice})` : "Wybierz swój gest";
    if (game === "roulette") return rouletteTotalBet > 0 ? `Zakręć kołem (${rouletteTotalBet} ₽)` : "Wybierz pole lub kolor";
    if (game === "upgrader") return upgraderBusy ? "Ulepszanie…" : `UPGRADE (×${(Number(upgraderTarget) || 2.0).toFixed(2)})`;
    if (game === "limbo") return `ZAGRAJ (×${(Number(limboTarget) || 2.0).toFixed(2)})`;
    if (game === "slots") return "ZAKRĘĆ BĘBNAMI";
    if (game === "blackjack") return "ROZDAJ KARTY";
    return last ? "Zagraj ponownie" : "Rozpocznij rundę";
  };

  return (
    <div className="modal-backdrop game-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="modal-dialog game-dialog-box is-chicken-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 id="game-dialog-title">{gameNames[game] || "Gra"}</h3>
            <p>Stolik do gry</p>
          </div>
          <div className="flex items-center gap-2">
            {currentEvent?.multiplier > 1.0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono text-xs font-black animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                <span>🌧️ EVENT ×{currentEvent.multiplier.toFixed(2)}</span>
                <span className="text-[10px] text-amber-200/80 font-bold hidden sm:inline">(+{Math.round((currentEvent.multiplier - 1) * 100)}%)</span>
              </div>
            )}
            <div className="balance-chip" title="Stan Twojego portfela">
              <span className="balance-val">{data?.player ? money(data.player.balance) : "—"}</span>
            </div>
            <span className="hidden sm:inline-block text-[10px] font-mono text-slate-500 bg-slate-800/80 border border-slate-700/60 px-1.5 py-0.5 rounded">
              ESC
            </span>
            <button
              className="btn-close"
              disabled={isBusy}
              onClick={() => { if (!isBusy) onClose(); }}
              aria-label="Zamknij okno gry"
              autoFocus
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex flex-col w-full h-full flex-1 min-h-0 overflow-hidden bg-[#0a0f18] select-none">
          {/* Full-size Game Arena taking all available space */}
          <div className={`flex-1 w-full min-h-0 relative flex items-center justify-center overflow-y-auto overflow-x-hidden ${game === "chicken" ? "p-0" : "p-2 sm:p-4"} bg-[#0c131e]`}>
            {game === "chicken" && (
              <ChickenTable
                ref={chickenRef}
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

            {game === "roulette" && (
              <div className="flex flex-col xl:flex-row items-center justify-center gap-4 sm:gap-6 w-full max-w-5xl py-2">
                <div className={`roulette-live ${spinning ? "is-spinning" : ""} ${rouletteWaiting ? "waiting" : ""}`}>
                  <RouletteWheelVisual
                    mustStartSpinning={spinning}
                    prizeNumber={prize}
                    turbo={turbo}
                    onStopSpinning={() => {
                      setSpinning(false);
                      if (pendingSpin) {
                        setLast(pendingSpin.round);
                        if (typeof pendingSpin.balance === "number") syncBalance(pendingSpin.balance);
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
              </div>
            )}

            {game === "slots" && (
              <SlotsTable last={pendingSlotsRound || last} loading={loading} slotsSpinning={slotsSpinning} turbo={turbo} />
            )}

            {game === "blackjack" && (
              <BlackjackTable round={blackjackPreview || round} last={last} />
            )}

            {game === "mines" && (
              <MinesTable round={round} last={last} post={handlePostMines} loading={loading} pendingTiles={pendingTiles} onPending={handleTilePending} />
            )}

            {game === "coinflip" && (
              <CoinflipTable choice={choice} setChoice={setChoice} last={last} loading={loading} isFlipping={isFlipping} targetOutcome={coinflipTarget} />
            )}

            {game === "rps" && (
              <RPSTable choice={choice} setChoice={setChoice} last={last} loading={loading} isShooting={isShootingRPS} />
            )}

            {game === "plinko" && (
              <PlinkoTable ref={plinkoRef} rows={plinkoRows} setRows={setPlinkoRows} risk={plinkoRisk} setRisk={setPlinkoRisk} onBallFinish={handlePlinkoBallFinish} loading={loading} turbo={turbo} />
            )}

            {game === "limbo" && (
              <LimboTable
                target={limboTarget}
                setTarget={setLimboTarget}
                last={last}
                animating={limboAnimating}
                displayMult={limboDisplayMult}
                loading={loading}
                bet={bet}
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
                autoCashout={crashAutoCashout}
                setAutoCashout={setCrashAutoCashout}
                loading={loading}
              />
            )}

            {game === "upgrader" && (
              <UpgraderTable
                arenaOnly
                bet={bet}
                setBet={setBet}
                maxBalance={data?.player?.balance ?? 0}
                target={upgraderTarget}
                setTarget={setUpgraderTarget}
                rollType={upgraderRollType}
                setRollType={setUpgraderRollType}
                last={last}
                loading={loading}
                animatingRef={animatingRef}
                onBusyChange={setUpgraderBusy}
                triggerOutcome={triggerOutcome}
                turbo={turbo}
              />
            )}
          </div>

            {/* Docked Bottom Control Bar */}
            <div className="w-full bg-[#0c131f] border-t border-slate-800/90 p-3 sm:p-4 z-20 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 sm:gap-4 shadow-2xl flex-shrink-0">
              {/* Left: Stawka & Quick Bets */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
                {/* Input & Turbo Row */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-300">Stawka</span>
                    {game !== "chicken" && typeof turbo === "boolean" && (
                      <button
                        type="button"
                        onClick={() => setTurbo(!turbo)}
                        className={`h-11 sm:h-10 flex items-center gap-1 px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                          turbo
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                            : "bg-[#141b27] text-slate-400 hover:text-slate-200 border-slate-700/80 shadow-[0_2px_0_#090d15]"
                        }`}
                      >
                        <Zap size={12} className={turbo ? "fill-blue-400" : ""} />
                        <span>Turbo</span>
                      </button>
                    )}
                  </div>

                  <div className="relative flex-1 flex items-center">
                    <input
                      type="number"
                      min="1"
                      max={data?.player?.balance || 1000000}
                      value={bet}
                      disabled={loading || isBusy}
                      onChange={(e) => setBet(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full h-11 sm:h-10 px-3.5 rounded-lg bg-[#131d2e] border border-slate-700/80 text-white font-mono font-black text-sm focus:outline-none focus:border-blue-500 shadow-inner"
                    />
                    <span className="absolute right-3 text-xs font-black text-slate-400 pointer-events-none">₽</span>
                  </div>
                </div>

                {/* Quick Multipliers Grid: equal 4 columns on mobile */}
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center">
                  <button type="button" disabled={loading || isBusy} onClick={() => setBet(10)} className="h-11 sm:h-10 px-3 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-xs font-mono font-bold text-slate-200 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center">Min</button>
                  <button type="button" disabled={loading || isBusy} onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))} className="h-11 sm:h-10 px-3 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-xs font-mono font-bold text-slate-200 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center">½</button>
                  <button type="button" disabled={loading || isBusy} onClick={() => setBet((b) => Math.min(data?.player?.balance || 1000000, Math.floor(b * 2)))} className="h-11 sm:h-10 px-3 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-xs font-mono font-bold text-slate-200 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center">2×</button>
                  <button type="button" disabled={loading || isBusy} onClick={() => setBet(data?.player?.balance || 100)} className="h-11 sm:h-10 px-3 rounded-lg bg-[#141b27] hover:bg-[#1e293b] text-xs font-mono font-bold text-slate-200 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center justify-center">Max</button>
                </div>

                <div className="hidden lg:flex items-center gap-1.5">
                  {[10, 50, 100, 500].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      disabled={loading || isBusy}
                      onClick={() => setBet((b) => Math.min(data?.player?.balance || 1000000, b + inc))}
                      className="h-10 px-2.5 rounded-md bg-[#141b27] hover:bg-[#1e293b] text-xs font-mono font-bold text-slate-300 border border-slate-700/60 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none cursor-pointer"
                    >
                      +{inc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Middle: Game-Specific Selectors */}
              <div className="w-full md:w-auto flex items-center justify-center gap-2 flex-wrap">
                {game === "mines" && (
                  <div className="w-full md:w-auto flex items-center justify-center gap-2">
                    <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-300 flex-shrink-0">
                      <span className="hidden min-[400px]:inline">Liczba min:</span>
                      <span className="min-[400px]:hidden">Miny:</span>
                    </span>
                    <div className="grid grid-cols-4 gap-1.5 flex-1 md:flex-initial md:flex md:items-center">
                      {[2, 5, 10, 15].map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={loading || round?.game === "mines"}
                          onClick={() => setMineCount(c)}
                          className={`h-11 sm:h-10 px-3 sm:px-4 rounded-lg text-xs font-black font-mono transition-all cursor-pointer flex items-center justify-center ${
                            Number(mineCount) === c
                              ? "bg-[#2563eb] text-white border border-[#1d4ed8] shadow-[0_2px_0_#1e40af]"
                              : "bg-[#141b27] hover:bg-[#1e293b] text-slate-300 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "coinflip" && (
                  <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:items-center">
                    <button
                      type="button"
                      disabled={loading || isFlipping}
                      onClick={() => setChoice("heads")}
                      className={`h-11 sm:h-10 px-4 rounded-lg flex items-center justify-center gap-2 font-mono font-black text-xs sm:text-sm tracking-wider uppercase transition-all cursor-pointer ${
                        choice === "heads"
                          ? "bg-[#2563eb] text-white border border-[#1d4ed8] shadow-[0_2px_0_#1e40af]"
                          : "bg-[#141b27] hover:bg-[#1e293b] text-slate-300 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none"
                      }`}
                    >
                      <span className="text-base">🦅</span>
                      <span>Orzeł</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading || isFlipping}
                      onClick={() => setChoice("tails")}
                      className={`h-11 sm:h-10 px-4 rounded-lg flex items-center justify-center gap-2 font-mono font-black text-xs sm:text-sm tracking-wider uppercase transition-all cursor-pointer ${
                        choice === "tails"
                          ? "bg-[#2563eb] text-white border border-[#1d4ed8] shadow-[0_2px_0_#1e40af]"
                          : "bg-[#141b27] hover:bg-[#1e293b] text-slate-300 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none"
                      }`}
                    >
                      <span className="text-base">👑</span>
                      <span>Reszka</span>
                    </button>
                  </div>
                )}

                {game === "rps" && (
                  <div className="grid grid-cols-3 gap-1.5 w-full md:w-auto md:flex md:items-center">
                    {[
                      { id: "rock", icon: "✊", name: "Kamień" },
                      { id: "paper", icon: "✋", name: "Papier" },
                      { id: "scissors", icon: "✌️", name: "Nożyce" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={loading || isShootingRPS}
                        onClick={() => setChoice(item.id)}
                        className={`h-12 sm:h-10 px-2 sm:px-3 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 font-mono font-black text-xs tracking-wider uppercase transition-all cursor-pointer ${
                          choice === item.id
                            ? "bg-[#2563eb] text-white border border-[#1d4ed8] shadow-[0_2px_0_#1e40af]"
                            : "bg-[#141b27] hover:bg-[#1e293b] text-slate-300 border border-slate-700/80 shadow-[0_2px_0_#090d15] active:translate-y-0.5 active:shadow-none"
                        }`}
                      >
                        <span className="text-lg sm:text-base leading-none">{item.icon}</span>
                        <span className="text-[11px] sm:text-xs leading-none">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {game === "plinko" && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5 bg-[#131d2e] p-1 rounded-xl border border-slate-700/80">
                      {[14, 16].map((r) => (
                        <button
                          key={r}
                          type="button"
                          disabled={loading}
                          onClick={() => setPlinkoRows(r)}
                          className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-mono font-black transition-all cursor-pointer ${
                            plinkoRows === r
                              ? "bg-[#2563eb] text-white border border-[#1d4ed8] shadow-[0_2px_0_#1e40af]"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-0.5 bg-[#131d2e] p-1 rounded-xl border border-slate-700/80">
                      {[
                        { id: "low", label: "Niskie" },
                        { id: "medium", label: "Średnie" },
                        { id: "high", label: "Wysokie" },
                      ].map((rk) => (
                        <button
                          key={rk.id}
                          type="button"
                          disabled={loading}
                          onClick={() => setPlinkoRisk(rk.id)}
                          className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            plinkoRisk === rk.id
                              ? "bg-[#2563eb] text-white border border-[#1d4ed8] shadow-[0_2px_0_#1e40af]"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {rk.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "limbo" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-400">Cel:</span>
                    <div className="relative flex items-center w-28 sm:w-32">
                      <input
                        type="number"
                        step="0.05"
                        min="1.5"
                        max="10000"
                        value={limboTarget}
                        disabled={loading || limboAnimating}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setLimboTarget(isNaN(v) ? "" : v);
                        }}
                        onBlur={() => {
                          setLimboTarget((t) => Math.max(1.5, Math.min(10000, Number(t) || 2.0)));
                        }}
                        className="w-full h-11 sm:h-10 px-3 pr-7 rounded-lg bg-[#131d2e] border border-slate-700 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-blue-500 shadow-inner"
                        placeholder="Mnożnik"
                      />
                      <span className="absolute right-2.5 text-xs font-black text-slate-400 pointer-events-none">×</span>
                    </div>
                  </div>
                )}

                {game === "crash" && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-400">Cel:</span>
                    <div className="relative flex items-center w-28 sm:w-32">
                      <input
                        type="number"
                        step="0.05"
                        min="0.8"
                        max="1000"
                        disabled={crashPlaying || loading}
                        value={crashAutoCashout}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setCrashAutoCashout(isNaN(v) ? "" : v);
                        }}
                        onBlur={() => {
                          setCrashAutoCashout((t) => Math.max(0.8, Math.min(1000, Number(t) || 2.0)));
                        }}
                        className="w-full h-11 sm:h-10 px-3 pr-7 rounded-lg bg-[#131d2e] border border-slate-700 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-blue-500 shadow-inner"
                      />
                      <span className="absolute right-2.5 text-xs font-black text-slate-400 pointer-events-none">× cel</span>
                    </div>
                  </div>
                )}

                {game === "upgrader" && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-[#131d2e] p-1 rounded-xl border border-slate-700/80">
                      <button
                        type="button"
                        disabled={loading || upgraderBusy}
                        onClick={() => setUpgraderRollType("under")}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          upgraderRollType === "under" ? "bg-[#2563eb] text-white shadow-md" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ArrowDown size={14} />
                        <span>Under</span>
                      </button>
                      <button
                        type="button"
                        disabled={loading || upgraderBusy}
                        onClick={() => setUpgraderRollType("over")}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          upgraderRollType === "over" ? "bg-[#2563eb] text-white shadow-md" : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <ArrowUp size={14} />
                        <span>Over</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-black uppercase tracking-wider text-slate-400">Cel:</span>
                      <div className="relative flex items-center w-24 sm:w-28">
                        <input
                          type="number"
                          step="0.05"
                          min="1.5"
                          max="10000"
                          value={upgraderTarget}
                          disabled={loading || upgraderBusy}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setUpgraderTarget(isNaN(v) ? "" : v);
                          }}
                          onBlur={() => {
                            setUpgraderTarget((t) => Math.max(1.5, Math.min(10000, Number(t) || 2.0)));
                          }}
                          className="w-full h-11 sm:h-10 px-2.5 pr-6 rounded-lg bg-[#131d2e] border border-slate-700 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-blue-500 shadow-inner"
                          placeholder="Mnożnik"
                        />
                        <span className="absolute right-2 text-xs font-black text-slate-400 pointer-events-none">×</span>
                      </div>
                    </div>
                  </div>
                )}

                {game === "roulette" && (
                  <div className="flex items-center gap-3">
                    <div className="text-xs sm:text-sm font-black text-slate-300">
                      Zakłady ({rouletteSelected.size}): <strong className="text-blue-400 font-mono">{rouletteTotalBet} ₽</strong>
                    </div>
                    {rouletteSelected.size > 0 && (
                      <button
                        type="button"
                        disabled={spinning || rouletteWaiting}
                        onClick={handleRouletteClear}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-rose-500/30"
                      >
                        <Trash2 size={13} />
                        <span>Wyczyść</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Main Action Buttons */}
              <div className="w-full md:w-auto md:min-w-[280px] lg:min-w-[320px]">
                {(() => {
                  if (round?.game === "blackjack" && !blackjackPreview) {
                    return (
                      <div className="grid grid-cols-3 gap-2 w-full">
                        <button
                          type="button"
                          className="py-2.5 sm:py-3 px-2 sm:px-3 rounded-lg font-mono font-black text-xs sm:text-sm uppercase tracking-wider bg-[#1e293b] hover:bg-[#334155] text-slate-200 border border-slate-600 shadow-[0_3px_0_#0f172a] active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                          disabled={loading}
                          onClick={() => showSettledBlackjack("stand")}
                        >
                          Pas
                        </button>
                        <button
                          type="button"
                          className="py-2.5 sm:py-3 px-2 sm:px-3 rounded-lg font-mono font-black text-xs sm:text-sm uppercase tracking-wider bg-[#1e293b] hover:bg-[#334155] text-blue-300 border border-blue-500/50 shadow-[0_3px_0_#0f172a] active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                          disabled={loading || round.payload?.cards?.length !== 2}
                          onClick={() => showSettledBlackjack("double")}
                        >
                          Podwój
                        </button>
                        <button
                          type="button"
                          className="py-2.5 sm:py-3 px-2 sm:px-3 rounded-lg font-mono font-black text-xs sm:text-sm uppercase tracking-wider bg-[#2563eb] hover:bg-[#3b82f6] text-white border border-[#1d4ed8] shadow-[0_3px_0_#1e40af] active:translate-y-0.5 active:shadow-none cursor-pointer transition-all"
                          disabled={loading}
                          onClick={() => showSettledBlackjack("hit")}
                        >
                          Dobierz
                        </button>
                      </div>
                    );
                  }

                  if (game === "crash" && crashPlaying && !crashCrashed && !crashCashedOut) {
                    const currentMultiplier = Number(crashMult) || 1.0;
                    const eventMult = currentEvent?.multiplier || 1.0;
                    const basePayout = Math.floor(bet * currentMultiplier);
                    const finalPayout = Math.floor(basePayout * eventMult);
                    const profit = finalPayout - bet;
                    const eventBonus = finalPayout - basePayout;

                    return (
                      <button
                        type="button"
                        className="w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg font-mono font-black text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-2 bg-[#10b981] hover:bg-[#34d399] text-slate-950 border border-[#059669] shadow-[0_4px_0_#047857,0_6px_12px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_0_0_#047857] transition-all cursor-pointer"
                        onClick={handleManualCrashCashout}
                      >
                        <CheckCircle2 size={18} />
                        <span>WYPŁAĆ {money(finalPayout)} ({currentMultiplier.toFixed(2)}×)</span>
                        {eventBonus > 0 && (
                          <span className="text-[11px] sm:text-xs bg-amber-400 text-slate-950 border border-amber-300 px-1.5 py-0.5 rounded font-mono font-black animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                            +{money(eventBonus)}
                          </span>
                        )}
                      </button>
                    );
                  }

                  if (round?.game === "mines") {
                    const p = round.payload || {};
                    const revealed = p.revealed || [];
                    const currentMult = p.multiplier !== undefined ? p.multiplier : 1.00;
                    const eventMult = currentEvent?.multiplier || 1.0;
                    const basePayout = Math.floor(bet * currentMult);
                    const finalPayout = Math.floor(basePayout * eventMult);
                    const profit = finalPayout - bet;
                    const eventBonus = finalPayout - basePayout;
                    const canCashout = revealed.length > 0 && !loading;

                    return (
                      <button
                        type="button"
                        disabled={!canCashout}
                        onClick={handleMinesCashout}
                        className={`w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg font-mono font-black text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-2 transition-all ${
                          canCashout
                            ? "bg-[#10b981] hover:bg-[#34d399] text-slate-950 border border-[#059669] shadow-[0_4px_0_#047857,0_6px_12px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_0_0_#047857] cursor-pointer"
                            : "bg-[#151a24] text-slate-500 border border-slate-800 cursor-not-allowed shadow-none"
                        }`}
                      >
                        <CheckCircle2 size={18} />
                        <span>
                          {revealed.length === 0
                            ? "Wybierz pole na planszy"
                            : `WYPŁAĆ ${money(finalPayout)} (×${(Number(currentMult) || 1.0).toFixed(2)})`}
                        </span>
                        {canCashout && eventBonus > 0 && (
                          <span className="text-[11px] sm:text-xs bg-amber-400 text-slate-950 border border-amber-300 px-1.5 py-0.5 rounded font-mono font-black animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                            +{money(eventBonus)}
                          </span>
                        )}
                      </button>
                    );
                  }

                  if (round?.game === "chicken") {
                    const currentLane = round.payload?.currentLane || 0;
                    const currentMult = round.payload?.multiplier ?? 1.00;
                    const eventMult = currentEvent?.multiplier || 1.0;
                    const basePayout = Math.floor(bet * currentMult);
                    const finalPayout = Math.floor(basePayout * eventMult);
                    const profit = finalPayout - bet;
                    const eventBonus = finalPayout - basePayout;
                    const isCashoutDisabled = currentLane < 1 || loading || chickenBusy;
                    const isStepDisabled = loading || chickenBusy || currentLane >= 17;

                    if (currentLane === 0) {
                      return (
                        <button
                          type="button"
                          disabled={isStepDisabled}
                          onClick={handleChickenStep}
                          className="w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg font-mono font-black text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-2 bg-[#2563eb] hover:bg-[#3b82f6] text-white border border-[#1d4ed8] shadow-[0_4px_0_#1e40af,0_6px_12px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_0_0_#1e40af] cursor-pointer transition-all"
                        >
                          <Zap size={18} className="fill-white text-white" />
                          <span>SKOCZ NA DROGĘ (KROK 1)</span>
                        </button>
                      );
                    }

                    return (
                      <div className="grid grid-cols-2 gap-2 w-full">
                        <button
                          type="button"
                          disabled={isStepDisabled}
                          onClick={handleChickenStep}
                          className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg font-mono font-black text-xs sm:text-sm md:text-base tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all ${
                            !isStepDisabled
                              ? "bg-[#2563eb] hover:bg-[#3b82f6] text-white border border-[#1d4ed8] shadow-[0_4px_0_#1e40af,0_6px_12px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_0_0_#1e40af] cursor-pointer"
                              : "bg-[#151a24] text-slate-500 border border-slate-800 cursor-not-allowed shadow-none"
                          }`}
                        >
                          <Zap size={16} className="fill-white text-white" />
                          <span>SKOCZ ({currentLane + 1}/17)</span>
                        </button>

                        <button
                          type="button"
                          disabled={isCashoutDisabled}
                          onClick={handleChickenCashout}
                          className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg font-mono font-black text-xs sm:text-sm md:text-base tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all ${
                            !isCashoutDisabled
                              ? "bg-[#10b981] hover:bg-[#34d399] text-slate-950 border border-[#059669] shadow-[0_4px_0_#047857,0_6px_12px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_0_0_#047857] cursor-pointer"
                              : "bg-[#151a24] text-slate-500 border border-slate-800 cursor-not-allowed shadow-none"
                          }`}
                        >
                          <CheckCircle2 size={16} />
                          <span className="truncate">
                            WYPŁAĆ {money(finalPayout)} (×{(Number(currentMult) || 1.0).toFixed(2)})
                          </span>
                          {!isCashoutDisabled && eventBonus > 0 && (
                            <span className="text-[10px] sm:text-xs bg-amber-400 text-slate-950 border border-amber-300 px-1 py-0.5 rounded font-mono font-black animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]">
                              +{money(eventBonus)}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  }

                  const isChoiceMissing =
                    (game === "coinflip" && !choice) ||
                    (game === "rps" && !choice) ||
                    (game === "roulette" && rouletteTotalBet <= 0);

                  const isButtonDisabled =
                    !tosAccepted ||
                    isChoiceMissing ||
                    (game !== "plinko" && (loading || isBusy));

                  return (
                    <button
                      type="button"
                      disabled={isButtonDisabled}
                      onClick={start}
                      className={`w-full py-2.5 sm:py-3 px-5 sm:px-6 rounded-lg font-mono font-black text-sm sm:text-base tracking-wider uppercase flex items-center justify-center gap-2 transition-all ${
                        isButtonDisabled
                          ? "bg-[#151a24] text-slate-500 border border-slate-800 cursor-not-allowed shadow-none"
                          : "bg-[#2563eb] hover:bg-[#3b82f6] text-white border border-[#1d4ed8] shadow-[0_4px_0_#1e40af,0_6px_12px_rgba(0,0,0,0.4)] active:translate-y-1 active:shadow-[0_0_0_#1e40af] cursor-pointer"
                      }`}
                    >
                      {isBusy || loading ? (
                        <>
                          <RotateCw size={18} className="animate-spin text-white" />
                          <span>{getPlayButtonText()}</span>
                        </>
                      ) : (
                        <>
                          <Zap size={18} className="fill-white text-white" />
                          <span>{getPlayButtonText()}</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
      </div>

      {outcomeData && <RoundOutcomeModal outcomeData={outcomeData} onClose={() => setOutcomeData(null)} />}
    </div>
  );
}
