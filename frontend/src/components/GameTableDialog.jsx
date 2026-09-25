import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Target, Zap, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { gameNames, money } from "../lib/formatters";
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
}) {
  const dialogRef = useRef(null);
  const lastActionTimeRef = useRef(0);
  const crashAnimRef = useRef(null);
  const outcomeTimerRef = useRef(null);
  const plinkoRef = useRef(null);

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
    if (game) addBreadcrumb("ui", `Opened Game Table Modal: ${game}`, { game, bet });
    return () => {
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
      setSlotsSpinning(!turbo);
      const j = await post({ game, bet }, { deferBalance: true, deferRefresh: true, deductBet: bet });
      if (j?.round) {
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
          setPendingSlotsRound(j.round);
          setTimeout(finalize, 1200);
        }
      } else {
        setSlotsSpinning(false);
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

    if (game === "mines") return post({ action: "start_mines", bet, mines: mineCount });
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
  const isWideGame = game === "roulette" || game === "blackjack" || game === "plinko";

  const getPotentialWinInfo = () => {
    if (game === "plinko") return null;
    if (game === "limbo") {
      const payout = Math.floor(bet * Math.max(1.5, limboTarget));
      return { mult: limboTarget.toFixed(2), payout, profit: Math.max(0, payout - bet), label: "Mnożnik docelowy" };
    }
    if (game === "crash") {
      const inFlight = crashPlaying && !crashCrashed && !crashCashedOut;
      const m = inFlight ? crashMult : crashAutoCashout;
      const payout = Math.floor(bet * m);
      return { mult: m.toFixed(2), payout, profit: Math.max(0, payout - bet), label: inFlight ? "Bieżąca wypłata" : "Auto Cashout" };
    }
    if (game === "mines") {
      if (round?.game === "mines") {
        const p = round.payload || {};
        const currentMult = p.multiplier !== undefined ? p.multiplier : 1.0;
        const payout = Math.floor(bet * currentMult);
        return { mult: currentMult.toFixed(2), payout, profit: Math.max(0, payout - bet), label: "Bieżący zysk" };
      }
      const firstMult = Number(((25 / (25 - mineCount)) * 0.96).toFixed(2));
      const payout = Math.floor(bet * firstMult);
      return { mult: firstMult.toFixed(2), payout, profit: Math.max(0, payout - bet), label: "1. diament" };
    }
    if (game === "chicken") {
      if (round?.game === "chicken") {
        const currentMult = round.payload?.multiplier ?? 1.0;
        const payout = Math.floor(bet * currentMult);
        return { mult: currentMult.toFixed(2), payout, profit: Math.max(0, payout - bet), label: "Bieżący zysk" };
      }
      const payout = Math.floor(bet * 1.15);
      return { mult: "1.15", payout, profit: Math.max(0, payout - bet), label: "1. pas ruchu" };
    }
    if (game === "coinflip") {
      const payout = Math.floor(bet * 1.96);
      return { mult: "1.96", payout, profit: Math.max(0, payout - bet), label: "Szansa 50%" };
    }
    if (game === "rps") return { mult: "2.00", payout: bet * 2, profit: bet, label: "Pojedynek" };
    if (game === "slots") return { mult: "100.00", payout: bet * 100, profit: bet * 99, label: "Główny Jackpot" };
    if (game === "blackjack") return { mult: "2.50", payout: Math.floor(bet * 2.5), profit: Math.max(0, Math.floor(bet * 2.5) - bet), label: "Blackjack 3:2" };
    if (game === "roulette") {
      if (rouletteSelected.size === 1) {
        const single = Array.from(rouletteSelected)[0];
        const isNum = typeof single === "number" || (!isNaN(Number(single)) && Number(single) >= 0 && Number(single) <= 36);
        const mult = isNum ? 36 : ["red", "black", "even", "odd", "low", "high"].includes(single) ? 2 : 3;
        return { mult: `${mult}.00`, payout: bet * mult, profit: Math.max(0, bet * mult - bet), label: "Możliwa wygrana" };
      }
      const total = rouletteTotalBet || bet;
      return { mult: "2.00+", payout: total * 2, profit: total, label: "Zakłady łączne" };
    }
    return { mult: "2.00", payout: bet * 2, profit: bet, label: "Wygrana" };
  };

  const winInfo = getPotentialWinInfo();

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
    if (game === "roulette") return rouletteTotalBet > 0 ? `Zakręć kołem (${rouletteTotalBet} $FGT)` : "Wybierz pole lub kolor";
    if (game === "upgrader") return upgraderBusy ? "Ulepszanie…" : `UPGRADE (×${upgraderTarget.toFixed(2)})`;
    if (game === "limbo") return `ZAGRAJ (×${limboTarget.toFixed(2)})`;
    if (game === "slots") return "ZAKRĘĆ BĘBNAMI";
    if (game === "blackjack") return "ROZDAJ KARTY";
    return last ? "Zagraj ponownie" : "Rozpocznij rundę";
  };

  return (
    <div className="modal-backdrop game-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="modal-dialog game-dialog-box is-upgrader-dialog"
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
              onClick={() => { if (!isBusy) onClose(); }}
              aria-label="Zamknij okno gry"
              autoFocus
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {game === "upgrader" ? (
          <div className="table-visual upgrader">
            <UpgraderTable
              bet={bet}
              setBet={setBet}
              maxBalance={data?.player?.balance ?? 0}
              target={upgraderTarget}
              setTarget={setUpgraderTarget}
              rollType={upgraderRollType}
              setRollType={setUpgraderRollType}
              last={last}
              loading={loading}
              onPlay={(opts) => {
                if (opts?.target_multiplier) setUpgraderTarget(opts.target_multiplier);
                if (opts?.roll_type) setUpgraderRollType(opts.roll_type);
                start();
              }}
              animatingRef={animatingRef}
              onBusyChange={setUpgraderBusy}
              triggerOutcome={triggerOutcome}
              turbo={turbo}
            />
          </div>
        ) : (
          <div className="upgrader-container flex flex-col w-full max-w-6xl mx-auto select-none p-1.5 sm:p-4 md:p-6 gap-2 sm:gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-6 items-stretch">
              
              {/* Box 2 (Visual Arena): Mobile Order 1, Desktop Order 2 */}
              <div className={`order-1 lg:order-2 ${isWideGame ? "lg:col-span-6" : "lg:col-span-4"} flex flex-col items-center justify-between p-2 sm:p-6 rounded-xl sm:rounded-2xl bg-[#080d16] border border-slate-800 shadow-2xl relative overflow-hidden sm:min-h-[420px] md:min-h-[460px] gap-1.5 sm:gap-2`}>
                <div
                  className={`absolute inset-0 transition-opacity duration-700 pointer-events-none ${
                    isBusy ? "bg-amber-500/15 animate-pulse" : last?.payout > 0 ? "bg-emerald-500/25" : last ? "bg-rose-500/20" : "bg-transparent"
                  }`}
                />

                <div className="w-full flex-1 flex items-center justify-center relative z-10 my-auto overflow-hidden">
                  <div className={`table-visual ${game} ${turbo ? "turbo" : ""} w-full flex items-center justify-center`}>
                    {game === "roulette" && (
                      <>
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
                      </>
                    )}

                    {game === "slots" && <SlotsTable last={pendingSlotsRound || last} loading={loading} slotsSpinning={slotsSpinning} turbo={turbo} />}
                    {game === "blackjack" && <BlackjackTable round={blackjackPreview || round} last={last} />}
                    {game === "mines" && <MinesTable round={round} last={last} post={handlePostMines} loading={loading} pendingTiles={pendingTiles} onPending={handleTilePending} />}
                    {game === "chicken" && <ChickenTable round={round} last={last} post={post} loading={loading} turbo={turbo} triggerOutcome={triggerOutcome} animatingRef={animatingRef} onBusyChange={setChickenBusy} />}
                    {game === "coinflip" && <CoinflipTable choice={choice} setChoice={setChoice} last={last} loading={loading} isFlipping={isFlipping} targetOutcome={coinflipTarget} />}
                    {game === "rps" && <RPSTable choice={choice} setChoice={setChoice} last={last} loading={loading} isShooting={isShootingRPS} />}
                    {game === "plinko" && <PlinkoTable ref={plinkoRef} rows={plinkoRows} setRows={setPlinkoRows} risk={plinkoRisk} setRisk={setPlinkoRisk} onBallFinish={handlePlinkoBallFinish} loading={loading} turbo={turbo} />}
                    {game === "limbo" && <LimboTable target={limboTarget} last={last} animating={limboAnimating} displayMult={limboDisplayMult} />}
                    {game === "crash" && <CrashTable bet={bet} isPlaying={crashPlaying} currentMult={crashMult} isCrashed={crashCrashed} isCashedOut={crashCashedOut} graphPoints={crashGraphPoints} last={last} />}
                  </div>
                </div>

                <div className="z-10 mt-1 sm:mt-3 px-3 sm:px-4 py-0.5 sm:py-1 rounded-full bg-[#141f30] border border-slate-700/90 shadow-inner flex items-center gap-1.5 sm:gap-2">
                  <span className="text-xs sm:text-sm font-mono font-black text-amber-400">{money(bet)}</span>
                  <span className="text-[9px] sm:text-xs text-slate-400 uppercase font-bold">Stawka</span>
                </div>
              </div>

              {/* Box 3 (Możliwa Wygrana + Action Button): Mobile Order 2, Desktop Order 3 */}
              <div className={`order-2 lg:order-3 ${isWideGame ? "lg:col-span-3" : "lg:col-span-4"} flex flex-col justify-between p-2 sm:p-6 rounded-xl sm:rounded-2xl bg-[#0c131f] border border-slate-800 shadow-xl gap-1.5 sm:gap-5`}>
                {winInfo && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Możliwa Wygrana</span>
                      <span className="sm:hidden text-[11px] font-bold text-slate-400">×{winInfo.mult}</span>
                    </div>

                    <div className="px-3 py-2 sm:p-8 rounded-lg sm:rounded-2xl bg-[#131d2e] border border-slate-700/80 sm:border-2 flex flex-row sm:flex-col items-center justify-between sm:justify-center text-left sm:text-center shadow-inner">
                      <div className="sm:hidden flex flex-col">
                        <span className="text-xs text-slate-400 font-medium">{winInfo.label || "Zysk"}:</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">+{money(winInfo.profit)}</span>
                      </div>
                      <span className="text-xl xs:text-2xl sm:text-4xl md:text-5xl font-black font-mono text-emerald-400 tracking-tight">{money(winInfo.payout)}</span>
                      <span className="hidden sm:inline-block text-xs sm:text-sm font-bold text-slate-400 mt-1 sm:mt-2">
                        Mnożnik: <strong className="text-white">×{winInfo.mult}</strong> • Zysk: +{money(winInfo.profit)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {(() => {
                  if (round?.game === "blackjack" && !blackjackPreview) {
                    return (
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" className="py-3 sm:py-5 rounded-xl font-black text-sm sm:text-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer active:scale-95 shadow-md" disabled={loading} onClick={() => showSettledBlackjack("stand")}>Pas</button>
                        <button type="button" className="py-3 sm:py-5 rounded-xl font-black text-sm sm:text-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer active:scale-95 shadow-md" disabled={loading || round.payload.cards.length !== 2} onClick={() => showSettledBlackjack("double")}>Podwój</button>
                        <button type="button" className="py-3 sm:py-5 rounded-xl font-black text-sm sm:text-lg bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 text-slate-950 border-2 border-amber-300 cursor-pointer active:scale-95 shadow-lg shadow-amber-500/30" disabled={loading} onClick={() => showSettledBlackjack("hit")}>Dobierz</button>
                      </div>
                    );
                  }

                  if (game === "crash" && crashPlaying && !crashCrashed && !crashCashedOut) {
                    return (
                      <button type="button" className="w-full py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-2xl flex items-center justify-center gap-2 shadow-2xl cursor-pointer active:scale-98 bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 border-2 border-emerald-300" onClick={handleManualCrashCashout}>
                        <span>WYPŁAĆ ({crashMult.toFixed(2)}×)</span>
                      </button>
                    );
                  }

                  if (game === "chicken" && round) {
                    const currentLane = round.payload?.currentLane || 0;
                    const currentMult = round.payload?.multiplier ?? 1.00;
                    return (
                      <button
                        type="button"
                        disabled={currentLane < 1 || loading || chickenBusy}
                        onClick={handleChickenCashout}
                        className={`w-full py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-2xl flex items-center justify-center gap-2 shadow-2xl cursor-pointer active:scale-98 ${
                          currentLane >= 1 && !chickenBusy && !loading
                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 border-2 border-emerald-300"
                            : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                        }`}
                      >
                        <span>WYPŁAĆ {currentLane >= 1 ? money(Math.floor(bet * currentMult)) : ""}</span>
                      </button>
                    );
                  }

                  const isChoiceMissing = (game === "coinflip" && !choice) || (game === "rps" && !choice) || (game === "roulette" && rouletteTotalBet <= 0);
                  const isButtonDisabled = !tosAccepted || isChoiceMissing || (game !== "plinko" && (loading || isBusy));

                  return (
                    <button
                      type="button"
                      disabled={isButtonDisabled}
                      onClick={start}
                      className={`w-full py-3 sm:py-5 rounded-xl sm:rounded-2xl font-black text-base sm:text-2xl flex items-center justify-center gap-2 sm:gap-3 shadow-2xl cursor-pointer active:scale-98 ${
                        isButtonDisabled
                          ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                          : "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 text-slate-950 shadow-amber-500/40 border-2 border-amber-300"
                      }`}
                    >
                      {isBusy || loading ? (
                        <>
                          <RotateCw size={20} className="animate-spin sm:w-7 sm:h-7" />
                          <span>{getPlayButtonText()}</span>
                        </>
                      ) : (
                        <>
                          <Zap size={20} className="fill-slate-950 sm:w-7 sm:h-7" />
                          <span>{getPlayButtonText()}</span>
                        </>
                      )}
                    </button>
                  );
                })()}
              </div>

              {/* Box 1 (Stawka & Controls): Mobile Order 3, Desktop Order 1 */}
              <div className={`order-3 lg:order-1 ${isWideGame ? "lg:col-span-3" : "lg:col-span-4"} flex flex-col justify-between p-2 sm:p-6 rounded-xl sm:rounded-2xl bg-[#0c131f] border border-slate-800 shadow-xl gap-2 sm:gap-5`}>
                <div>
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Stawka</span>
                    {typeof turbo === "boolean" && (
                      <button
                        type="button"
                        onClick={() => setTurbo(!turbo)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                          turbo ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Zap size={10} className={turbo ? "fill-amber-400" : ""} />
                        <span>Turbo</span>
                      </button>
                    )}
                  </div>

                  <div className="relative flex items-center mb-1.5 sm:mb-3">
                    <input
                      type="number"
                      min="1"
                      max={data?.player?.balance || 1000000}
                      value={bet}
                      disabled={loading || isBusy}
                      onChange={(e) => setBet(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-1.5 sm:py-3.5 rounded-lg sm:rounded-xl bg-[#131d2e] border border-slate-700/80 sm:border-2 text-white font-mono font-black text-sm sm:text-xl focus:outline-none focus:border-amber-500 shadow-inner"
                    />
                    <span className="absolute right-3 text-xs sm:text-sm font-black text-slate-400 pointer-events-none">$FGT</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 sm:gap-2">
                    <button type="button" disabled={loading || isBusy} onClick={() => setBet(10)} className="py-1 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 cursor-pointer active:scale-95 shadow-sm">Min</button>
                    <button type="button" disabled={loading || isBusy} onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))} className="py-1 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 cursor-pointer active:scale-95 shadow-sm">½</button>
                    <button type="button" disabled={loading || isBusy} onClick={() => setBet((b) => Math.min(data?.player?.balance || 1000000, Math.floor(b * 2)))} className="py-1 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 cursor-pointer active:scale-95 shadow-sm">2×</button>
                    <button type="button" disabled={loading || isBusy} onClick={() => setBet(data?.player?.balance || 100)} className="py-1 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 cursor-pointer active:scale-95 shadow-sm">Max</button>
                  </div>
                </div>

                {/* Specific controls */}
                {game === "crash" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Docelowy Cashout</span>
                      <span className="text-[10px] text-slate-400 font-mono">0.8× - 1000×</span>
                    </div>
                    <div className="relative flex items-center mb-1.5 sm:mb-3">
                      <input
                        type="number"
                        step="0.05"
                        min="0.8"
                        max="1000"
                        disabled={crashPlaying || loading}
                        value={crashAutoCashout}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0.8 && v <= 1000) setCrashAutoCashout(v);
                        }}
                        className="w-full px-3 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#131d2e] border border-slate-700 sm:border-2 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-amber-500"
                      />
                      <span className="absolute right-3 text-xs font-black text-slate-400 pointer-events-none">×</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 sm:gap-2">
                      {[1.2, 1.5, 2.0, 3.0, 5.0, 10.0].map((val) => (
                        <button key={val} type="button" disabled={crashPlaying || loading} onClick={() => setCrashAutoCashout(val)} className={`py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${crashAutoCashout === val ? "bg-amber-500 text-slate-950 shadow-md border-2 border-amber-300" : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"}`}>{val}×</button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "limbo" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Docelowy Mnożnik</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">Szansa: {Math.min(64.0, 96.0 / Math.max(1.5, limboTarget)).toFixed(2)}%</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 sm:gap-2 mb-1.5 sm:mb-3">
                      {[1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0].map((val) => (
                        <button key={val} type="button" disabled={loading || limboAnimating} onClick={() => setLimboTarget(val)} className={`py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${Math.abs(limboTarget - val) < 0.01 ? "bg-amber-500 text-slate-950 shadow-md border-2 border-amber-300" : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"}`}>{val}×</button>
                      ))}
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.05"
                        min="1.5"
                        max="10000"
                        value={limboTarget}
                        disabled={loading || limboAnimating}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 1.5 && v <= 10000) setLimboTarget(v);
                        }}
                        className="w-full px-3 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#131d2e] border border-slate-700 sm:border-2 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-amber-500"
                        placeholder="Własny mnożnik..."
                      />
                      <span className="absolute right-3 text-xs font-black text-slate-400 pointer-events-none">× cel</span>
                    </div>
                  </div>
                )}

                {game === "mines" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Liczba min na planszy</span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">{mineCount} / 24</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 sm:gap-2">
                      {[2, 3, 5, 10, 15, 20].map((c) => (
                        <button key={c} type="button" disabled={loading || round?.game === "mines"} onClick={() => setMineCount(c)} className={`py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${mineCount === c ? "bg-amber-500 text-slate-950 shadow-md border-2 border-amber-300" : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"}`}>{c} min</button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "coinflip" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Wybierz stronę monety</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={loading || isFlipping} onClick={() => setChoice("heads")} className={`py-2.5 sm:py-4 rounded-xl flex flex-col items-center gap-1 font-black transition-all cursor-pointer ${choice === "heads" ? "bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300 scale-102" : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"}`}>
                        <span className="text-xl sm:text-2xl">🦅</span>
                        <span className="text-xs sm:text-sm font-bold">Orzeł</span>
                      </button>
                      <button type="button" disabled={loading || isFlipping} onClick={() => setChoice("tails")} className={`py-2.5 sm:py-4 rounded-xl flex flex-col items-center gap-1 font-black transition-all cursor-pointer ${choice === "tails" ? "bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300 scale-102" : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"}`}>
                        <span className="text-xl sm:text-2xl">👑</span>
                        <span className="text-xs sm:text-sm font-bold">Reszka</span>
                      </button>
                    </div>
                  </div>
                )}

                {game === "rps" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Wybierz swój gest</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                      {[
                        { id: "rock", icon: "✊", name: "Kamień" },
                        { id: "paper", icon: "✋", name: "Papier" },
                        { id: "scissors", icon: "✌️", name: "Nożyce" },
                      ].map((item) => (
                        <button key={item.id} type="button" disabled={loading || isShootingRPS} onClick={() => setChoice(item.id)} className={`py-2 sm:py-3.5 rounded-xl flex flex-col items-center gap-1 font-black transition-all cursor-pointer ${choice === item.id ? "bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300 scale-102" : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"}`}>
                          <span className="text-xl sm:text-2xl">{item.icon}</span>
                          <span className="text-[11px] sm:text-xs font-bold">{item.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "plinko" && (
                  <div className="flex flex-col gap-2 sm:gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-300">Liczba rzędów</span>
                        <span className="text-[10px] text-amber-400 font-mono font-bold">{plinkoRows}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[8, 10, 12, 14, 16].map((r) => (
                          <button key={r} type="button" disabled={loading} onClick={() => setPlinkoRows(r)} className={`py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${plinkoRows === r ? "bg-amber-500 text-slate-950 border border-amber-300" : "bg-[#172336] text-slate-300 hover:bg-slate-700"}`}>{r}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-300">Poziom Ryzyka</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { id: "low", label: "Niskie" },
                          { id: "medium", label: "Średnie" },
                          { id: "high", label: "Wysokie" },
                        ].map((rk) => (
                          <button key={rk.id} type="button" disabled={loading} onClick={() => setPlinkoRisk(rk.id)} className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${plinkoRisk === rk.id ? "bg-amber-500 text-slate-950 border border-amber-300" : "bg-[#172336] text-slate-300 hover:bg-slate-700"}`}>{rk.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {game === "roulette" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Wybrane zakłady</span>
                      {rouletteSelected.size > 0 && (
                        <button type="button" disabled={spinning || rouletteWaiting} onClick={handleRouletteClear} className="text-[10px] text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 cursor-pointer">
                          <Trash2 size={11} />
                          <span>Wyczyść</span>
                        </button>
                      )}
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-[#131d2e] border border-slate-700/80 text-xs text-slate-300 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span>Liczba zakładów:</span>
                        <strong className="text-white font-mono">{rouletteSelected.size}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Łączny zakład:</span>
                        <strong className="text-amber-400 font-mono">{rouletteTotalBet} $FGT</strong>
                      </div>
                    </div>
                  </div>
                )}

                {game === "blackjack" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Dodaj do stawki</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 sm:gap-2">
                      {[5, 10, 25, 50, 100, 500].map((inc) => (
                        <button key={inc} type="button" disabled={loading || round?.game === "blackjack"} onClick={() => setBet((b) => Math.min(data?.player?.balance || 1000000, b + inc))} className="py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-300 border border-slate-700/60 cursor-pointer active:scale-95">+{inc}</button>
                      ))}
                    </div>
                  </div>
                )}

                {game === "slots" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Tabela Wypłat</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[11px] font-mono">
                      <div className="p-1 rounded bg-[#131d2e] border border-slate-700/60 text-center">777: <span className="text-amber-400 font-bold">100×</span></div>
                      <div className="p-1 rounded bg-[#131d2e] border border-slate-700/60 text-center">💎: <span className="text-amber-400 font-bold">50×</span></div>
                      <div className="p-1 rounded bg-[#131d2e] border border-slate-700/60 text-center">👑: <span className="text-amber-400 font-bold">25×</span></div>
                      <div className="p-1 rounded bg-[#131d2e] border border-slate-700/60 text-center">🔔: <span className="text-amber-400 font-bold">10×</span></div>
                      <div className="p-1 rounded bg-[#131d2e] border border-slate-700/60 text-center">🍒: <span className="text-amber-400 font-bold">5×</span></div>
                      <div className="p-1 rounded bg-[#131d2e] border border-slate-700/60 text-center">🍋: <span className="text-amber-400 font-bold">2×</span></div>
                    </div>
                  </div>
                )}

                {game === "chicken" && (
                  <div>
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <span className="text-[11px] sm:text-sm font-black uppercase tracking-wider text-slate-300">Przeprawa Kurczaka</span>
                    </div>
                    <div className="p-2 sm:p-3 rounded-xl bg-[#131d2e] border border-slate-700/80 text-xs text-slate-300 flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span>RTP Gry:</span>
                        <strong className="text-emerald-400 font-mono font-bold">96.0%</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Liczba pasów:</span>
                        <strong className="text-white font-mono font-bold">24</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {outcomeData && <RoundOutcomeModal outcomeData={outcomeData} onClose={() => setOutcomeData(null)} />}
    </div>
  );
}
