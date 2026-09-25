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
import { FgtChip } from "./BetControls";
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
  const chickenRef = useRef(null);

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
            <div className="balance-chip" title="Stan Twojego portfela">
              <FgtChip small />
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
          <div className={`flex-1 w-full min-h-0 relative flex ${game === "chicken" ? "items-stretch overflow-hidden" : "items-center justify-center overflow-y-auto overflow-x-hidden"} bg-[#0c131e] p-2 sm:p-4`}>
            <div
              className={`absolute inset-0 transition-opacity duration-700 pointer-events-none z-10 ${
                isBusy ? "bg-amber-500/10 animate-pulse" : last?.payout > 0 ? "bg-emerald-500/15" : last ? "bg-rose-500/15" : "bg-transparent"
              }`}
            />

            <div className={`table-visual ${game} ${turbo ? "turbo" : ""} w-full h-full flex items-center justify-center relative z-10`}>
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
                <LimboTable target={limboTarget} last={last} animating={limboAnimating} displayMult={limboDisplayMult} />
              )}

              {game === "crash" && (
                <CrashTable bet={bet} isPlaying={crashPlaying} currentMult={crashMult} isCrashed={crashCrashed} isCashedOut={crashCashedOut} graphPoints={crashGraphPoints} last={last} />
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
          </div>

          {/* Docked Bottom Control Bar */}
          <div className="w-full bg-[#0c131f] border-t border-slate-800/90 px-3 sm:px-6 md:px-8 py-3 sm:py-4 z-20 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 shadow-2xl flex-shrink-0">
            {/* Left: Stawka & Quick Bets */}
            <div className="w-full md:w-auto flex-1 flex flex-wrap items-center gap-2 sm:gap-3 max-w-2xl">
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-300">Stawka</span>
                {game !== "chicken" && typeof turbo === "boolean" && (
                  <button
                    type="button"
                    onClick={() => setTurbo(!turbo)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      turbo
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/40"
                    }`}
                  >
                    <Zap size={12} className={turbo ? "fill-amber-400" : ""} />
                    <span>Turbo</span>
                  </button>
                )}
              </div>

              <div className="relative flex-1 flex items-center min-w-[120px] max-w-[180px]">
                <input
                  type="number"
                  min="1"
                  max={data?.player?.balance || 1000000}
                  value={bet}
                  disabled={loading || isBusy}
                  onChange={(e) => setBet(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3.5 py-2 sm:py-2.5 rounded-xl bg-[#131d2e] border border-slate-700/80 text-white font-mono font-black text-sm sm:text-base focus:outline-none focus:border-amber-500 shadow-inner"
                />
                <span className="absolute right-3 text-xs sm:text-sm font-black text-slate-400 pointer-events-none">$FGT</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button type="button" disabled={loading || isBusy} onClick={() => setBet(10)} className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-200 cursor-pointer active:scale-95 shadow-sm">Min</button>
                <button type="button" disabled={loading || isBusy} onClick={() => setBet((b) => Math.max(1, Math.floor(b / 2)))} className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-200 cursor-pointer active:scale-95 shadow-sm">½</button>
                <button type="button" disabled={loading || isBusy} onClick={() => setBet((b) => Math.min(data?.player?.balance || 1000000, Math.floor(b * 2)))} className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-200 cursor-pointer active:scale-95 shadow-sm">2×</button>
                <button type="button" disabled={loading || isBusy} onClick={() => setBet(data?.player?.balance || 100)} className="px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-[#172336] hover:bg-slate-700 text-xs sm:text-sm font-black text-slate-200 cursor-pointer active:scale-95 shadow-sm">Max</button>
              </div>

              <div className="hidden lg:flex items-center gap-1.5">
                {[10, 50, 100, 500].map((inc) => (
                  <button
                    key={inc}
                    type="button"
                    disabled={loading || isBusy}
                    onClick={() => setBet((b) => Math.min(data?.player?.balance || 1000000, b + inc))}
                    className="py-1.5 px-2.5 rounded-lg bg-[#172336]/80 hover:bg-slate-700 text-xs font-mono font-bold text-slate-300 border border-slate-700/50 cursor-pointer active:scale-95 shadow-sm"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>

            {/* Middle: Game-Specific Selectors */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {game === "mines" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 hidden xl:inline">Miny:</span>
                  <div className="flex items-center gap-1.5">
                    {[2, 3, 5, 10, 15, 20].map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={loading || round?.game === "mines"}
                        onClick={() => setMineCount(c)}
                        className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${
                          mineCount === c
                            ? "bg-amber-500 text-slate-950 shadow-md border-2 border-amber-300"
                            : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {game === "coinflip" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading || isFlipping}
                    onClick={() => setChoice("heads")}
                    className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl flex items-center gap-2 font-black transition-all cursor-pointer ${
                      choice === "heads"
                        ? "bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300"
                        : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                    }`}
                  >
                    <span className="text-base sm:text-lg">🦅</span>
                    <span className="text-xs sm:text-sm font-bold">Orzeł</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading || isFlipping}
                    onClick={() => setChoice("tails")}
                    className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl flex items-center gap-2 font-black transition-all cursor-pointer ${
                      choice === "tails"
                        ? "bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300"
                        : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                    }`}
                  >
                    <span className="text-base sm:text-lg">👑</span>
                    <span className="text-xs sm:text-sm font-bold">Reszka</span>
                  </button>
                </div>
              )}

              {game === "rps" && (
                <div className="flex items-center gap-2">
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
                      className={`px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl flex items-center gap-2 font-black transition-all cursor-pointer ${
                        choice === item.id
                          ? "bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300"
                          : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                      }`}
                    >
                      <span className="text-base sm:text-lg">{item.icon}</span>
                      <span className="text-xs sm:text-sm font-bold">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {game === "plinko" && (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1">
                    {[8, 10, 12, 14, 16].map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={loading}
                        onClick={() => setPlinkoRows(r)}
                        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all cursor-pointer ${
                          plinkoRows === r
                            ? "bg-amber-500 text-slate-950 border-2 border-amber-300 shadow-md"
                            : "bg-[#172336] text-slate-300 hover:bg-slate-700 border border-slate-700/60"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
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
                        className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                          plinkoRisk === rk.id
                            ? "bg-amber-500 text-slate-950 border-2 border-amber-300 shadow-md"
                            : "bg-[#172336] text-slate-300 hover:bg-slate-700 border border-slate-700/60"
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
                  <div className="hidden sm:flex items-center gap-1">
                    {[1.5, 2.0, 3.0, 5.0, 10.0, 100.0].map((val) => (
                      <button
                        key={val}
                        type="button"
                        disabled={loading || limboAnimating}
                        onClick={() => setLimboTarget(val)}
                        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${
                          Math.abs(limboTarget - val) < 0.01
                            ? "bg-amber-500 text-slate-950 shadow-md border-2 border-amber-300"
                            : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                        }`}
                      >
                        {val}×
                      </button>
                    ))}
                  </div>
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
                        if (!isNaN(v) && v >= 1.5 && v <= 10000) setLimboTarget(v);
                      }}
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#131d2e] border border-slate-700 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-amber-500"
                      placeholder="Mnożnik"
                    />
                    <span className="absolute right-2.5 text-xs font-black text-slate-400 pointer-events-none">×</span>
                  </div>
                </div>
              )}

              {game === "crash" && (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1">
                    {[1.2, 1.5, 2.0, 3.0, 5.0, 10.0].map((val) => (
                      <button
                        key={val}
                        type="button"
                        disabled={crashPlaying || loading}
                        onClick={() => setCrashAutoCashout(val)}
                        className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs sm:text-sm font-black font-mono transition-all cursor-pointer ${
                          Math.abs(crashAutoCashout - val) < 0.01
                            ? "bg-amber-500 text-slate-950 shadow-md border-2 border-amber-300"
                            : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                        }`}
                      >
                        {val}×
                      </button>
                    ))}
                  </div>
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
                        if (!isNaN(v) && v >= 0.8 && v <= 1000) setCrashAutoCashout(v);
                      }}
                      className="w-full px-3 py-1.5 sm:py-2 rounded-xl bg-[#131d2e] border border-slate-700 text-white font-mono text-xs sm:text-sm font-black focus:outline-none focus:border-amber-500"
                    />
                    <span className="absolute right-2.5 text-xs font-black text-slate-400 pointer-events-none">× cel</span>
                  </div>
                </div>
              )}

              {game === "upgrader" && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-[#131d2e] p-1 rounded-xl border border-slate-700/80">
                    <button
                      type="button"
                      disabled={loading || upgraderBusy}
                      onClick={() => setUpgraderRollType("under")}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        upgraderRollType === "under" ? "bg-amber-500 text-slate-950 shadow-md" : "text-slate-400 hover:text-white"
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
                        upgraderRollType === "over" ? "bg-amber-500 text-slate-950 shadow-md" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <ArrowUp size={14} />
                      <span>Over</span>
                    </button>
                  </div>

                  <div className="hidden sm:flex items-center gap-1">
                    {[1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0].map((val) => (
                      <button
                        key={val}
                        type="button"
                        disabled={loading || upgraderBusy}
                        onClick={() => setUpgraderTarget(val)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-black font-mono transition-all cursor-pointer ${
                          Math.abs(upgraderTarget - val) < 0.01
                            ? "bg-amber-500 text-slate-950 shadow-md border border-amber-300"
                            : "bg-[#172336] hover:bg-slate-700 text-slate-300 border border-slate-700/60"
                        }`}
                      >
                        {val}×
                      </button>
                    ))}
                  </div>

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
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#131d2e] border border-slate-700 text-white font-mono text-xs font-black focus:outline-none focus:border-amber-500"
                      placeholder="Mnożnik"
                    />
                    <span className="absolute right-2 text-xs font-black text-slate-400 pointer-events-none">×</span>
                  </div>
                </div>
              )}

              {game === "roulette" && (
                <div className="flex items-center gap-3">
                  <div className="text-xs sm:text-sm font-black text-slate-300">
                    Zakłady ({rouletteSelected.size}): <strong className="text-amber-400 font-mono">{rouletteTotalBet} $FGT</strong>
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
                        className="py-3 sm:py-3.5 px-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer active:scale-95 shadow-md"
                        disabled={loading}
                        onClick={() => showSettledBlackjack("stand")}
                      >
                        Pas
                      </button>
                      <button
                        type="button"
                        className="py-3 sm:py-3.5 px-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer active:scale-95 shadow-md"
                        disabled={loading || round.payload?.cards?.length !== 2}
                        onClick={() => showSettledBlackjack("double")}
                      >
                        Podwój
                      </button>
                      <button
                        type="button"
                        className="py-3 sm:py-3.5 px-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 text-slate-950 border-2 border-amber-300 cursor-pointer active:scale-95 shadow-lg shadow-amber-500/30"
                        disabled={loading}
                        onClick={() => showSettledBlackjack("hit")}
                      >
                        Dobierz
                      </button>
                    </div>
                  );
                }

                if (game === "crash" && crashPlaying && !crashCrashed && !crashCashedOut) {
                  return (
                    <button
                      type="button"
                      className="w-full py-3 sm:py-3.5 px-6 sm:px-8 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-2xl cursor-pointer active:scale-98 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 hover:from-emerald-400 text-slate-950 border-2 border-emerald-300 shadow-emerald-500/40"
                      onClick={handleManualCrashCashout}
                    >
                      <CheckCircle2 size={22} />
                      <span>WYPŁAĆ ({crashMult.toFixed(2)}×)</span>
                    </button>
                  );
                }

                if (round?.game === "mines") {
                  const p = round.payload || {};
                  const revealed = p.revealed || [];
                  const currentMult = p.multiplier !== undefined ? p.multiplier : 1.00;
                  const currentProfit = Math.floor(bet * currentMult);
                  const canCashout = revealed.length > 0 && !loading;

                  return (
                    <button
                      type="button"
                      disabled={!canCashout}
                      onClick={handleMinesCashout}
                      className={`w-full py-3 sm:py-3.5 px-6 sm:px-8 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-2xl transition-all ${
                        canCashout
                          ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 hover:from-emerald-400 text-slate-950 border-2 border-emerald-300 shadow-emerald-500/40 cursor-pointer active:scale-98"
                          : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                      }`}
                    >
                      <CheckCircle2 size={22} />
                      <span>
                        {revealed.length === 0
                          ? "Wybierz pole na planszy"
                          : `WYPŁAĆ ${money(currentProfit)} (×${currentMult.toFixed(2)})`}
                      </span>
                    </button>
                  );
                }

                if (game === "chicken" && round) {
                  const currentLane = round.payload?.currentLane || 0;
                  const currentMult = round.payload?.multiplier ?? 1.00;
                  const currentProfit = Math.floor(bet * currentMult);
                  const isCashoutDisabled = currentLane < 1 || loading || chickenBusy;

                  return (
                    <button
                      type="button"
                      disabled={isCashoutDisabled}
                      onClick={handleChickenCashout}
                      className={`w-full py-3 sm:py-3.5 px-6 sm:px-8 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-2xl transition-all ${
                        !isCashoutDisabled
                          ? "bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 hover:from-emerald-400 text-slate-950 shadow-emerald-500/40 border-2 border-emerald-300 cursor-pointer active:scale-98"
                          : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                      }`}
                    >
                      <CheckCircle2 size={22} />
                      <span>
                        {currentLane === 0
                          ? "Kliknij na drogę, aby skoczyć"
                          : `WYPŁAĆ ${money(currentProfit)} (×${currentMult.toFixed(2)})`}
                      </span>
                    </button>
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
                    className={`w-full py-3 sm:py-3.5 px-6 sm:px-8 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-2 sm:gap-3 shadow-2xl cursor-pointer active:scale-98 ${
                      isButtonDisabled
                        ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                        : "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 text-slate-950 shadow-amber-500/40 border-2 border-amber-300"
                    }`}
                  >
                    {isBusy || loading ? (
                      <>
                        <RotateCw size={22} className="animate-spin" />
                        <span>{getPlayButtonText()}</span>
                      </>
                    ) : (
                      <>
                        <Zap size={22} className="fill-slate-950" />
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
