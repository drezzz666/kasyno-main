import React, { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { gameNames, money } from "../lib/formatters";
import { BetControl } from "./BetControls";
import { RouletteWheelVisual, RouletteBets, wheelOrder } from "./RouletteTable";
import { BlackjackTable } from "./BlackjackTable";
import { MinesTable } from "./MinesTable";
import { SlotsTable } from "./SlotsTable";
import { CoinflipTable } from "./CoinflipTable";
import { RPSTable } from "./RPSTable";
import { PlinkoTable } from "./PlinkoTable";
import { LimboTable } from "./LimboTable";
import { CrashTable } from "./CrashTable";
import { RoundOutcomeModal } from "./RoundOutcomeModal";
import { reportClientError } from "../lib/reporter";

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

  const round = data?.active?.game === game ? data.active : null;
  const [spinning, setSpinning] = useState(false);
  const [slotsSpinning, setSlotsSpinning] = useState(false);
  const [pendingSlotsRound, setPendingSlotsRound] = useState(null);
  const [rouletteWaiting, setRouletteWaiting] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [pendingSpin, setPendingSpin] = useState(null);
  const [pendingTiles, setPendingTiles] = useState(() => new Set());
  const [blackjackPreview, setBlackjackPreview] = useState(null);

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
  const [isShootingRPS, setIsShootingRPS] = useState(false);
  const [plinkoRows, setPlinkoRows] = useState(10);
  const [plinkoRisk, setPlinkoRisk] = useState("medium");
  const plinkoRef = useRef(null);

  // Simplified Roulette selection state (Set of chosen spots)
  const [rouletteSelected, setRouletteSelected] = useState(() => new Set());

  const handleRouletteToggle = (spot) => {
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

  const handleRouletteSelectAll = () => {
    const all = new Set();
    for (let i = 0; i <= 36; i++) {
      all.add(String(i));
    }
    setRouletteSelected(all);
  };

  const handleRouletteClear = () => {
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
  const [crashMult, setCrashMult] = useState(1.0);
  const [crashCrashed, setCrashCrashed] = useState(false);
  const [crashCashedOut, setCrashCashedOut] = useState(false);
  const [crashGraphPoints, setCrashGraphPoints] = useState([]);
  const crashAnimRef = useRef(null);
  const crashRoundRef = useRef(null);

  // Unified Round Outcome Modal (Win, Push, Loss)
  const [outcomeData, setOutcomeData] = useState(null);

  const triggerOutcome = (r) => {
    if (!r) return;
    const payout = r.payout || 0;
    const betVal = r.bet || 10;
    const multiplier = r.payload?.multiplier || (payout / Math.max(1, betVal));

    setOutcomeData({
      payout,
      bet: betVal,
      multiplier,
      resultText: r.result,
    });
  };

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
      animatingRef?.current
  );

  // Escape key handler: close game only when NOT busy
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (!isBusy) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBusy, onClose]);

  const shownRound = blackjackPreview || round;

  const showSettledBlackjack = async (move) => {
    if (!round || loading) return;
    if (animatingRef) animatingRef.current = true;
    const j = await post(
      { action: "blackjack", roundId: round.id, move },
      { deferRefresh: true, deferBalance: true }
    );
    if (j?.round?.state === "settled") {
      setBlackjackPreview({ ...j.round, state: "settled" });
      setTimeout(() => {
        setBlackjackPreview(null);
        setLast(j.round);
        if (typeof j.balance === "number") syncBalance(j.balance);
        if (animatingRef) animatingRef.current = false;
        triggerOutcome(j.round);
        void load();
      }, 350);
    } else {
      if (animatingRef) animatingRef.current = false;
    }
  };

  const handleManualCrashCashout = () => {
    if (!crashPlaying || crashCrashed || crashCashedOut) return;
    if (crashAnimRef.current) cancelAnimationFrame(crashAnimRef.current);
    const roundData = crashRoundRef.current;
    if (!roundData) return;

    const cashedAt = crashMult;
    if (cashedAt <= roundData.crashPoint) {
      const actualPayout = Math.floor(bet * cashedAt);
      const settledRound = {
        ...roundData.round,
        payout: actualPayout,
        result: `Wypłacono przy ${cashedAt.toFixed(2)}x (Rozbicie: ${roundData.crashPoint.toFixed(2)}x)`,
        payload: {
          ...roundData.round.payload,
          cashed_at: cashedAt,
          multiplier: cashedAt,
          won: true,
        },
      };
      setCrashPlaying(false);
      setCrashCashedOut(true);
      setLast(settledRound);
      if (typeof roundData.balance === "number") {
        syncBalance(roundData.balance + actualPayout);
      }
      if (animatingRef) animatingRef.current = false;
      triggerOutcome(settledRound);
      void load();
    } else {
      setCrashPlaying(false);
      setCrashCrashed(true);
      setLast(roundData.round);
      if (typeof roundData.balance === "number") syncBalance(roundData.balance);
      if (animatingRef) animatingRef.current = false;
      triggerOutcome(roundData.round);
      void load();
    }
  };

  const start = async () => {
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
        const duration = turbo ? 200 : 850;
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
      setCrashMult(1.0);
      setCrashGraphPoints([{ x: 0, y: 1.0 }]);

      const targetCashout = crashAutoCashout > 1.0 ? crashAutoCashout : 2.0;

      const j = await post(
        { game, bet, target_multiplier: targetCashout },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round?.payload) {
        const crashPoint = j.round.payload.crash_point;
        const won = j.round.payload.won;
        const cashedAt = j.round.payload.cashed_at;
        crashRoundRef.current = { ...j, crashPoint, won, cashedAt };

        const startTime = Date.now();
        const flightSpeed = 0.09;

        const animateFlight = () => {
          try {
            const elapsed = (Date.now() - startTime) / 1000;
            const currentM = Math.pow(Math.E, flightSpeed * elapsed);
            setCrashMult(currentM);
            setCrashGraphPoints((prev) => [...prev, { x: elapsed, y: currentM }]);

            if (won && currentM >= cashedAt) {
              setCrashPlaying(false);
              setCrashCashedOut(true);
              setCrashMult(cashedAt);
              setLast(j.round);
              if (typeof j.balance === "number") syncBalance(j.balance);
              if (animatingRef) animatingRef.current = false;
              triggerOutcome(j.round);
              void load();
            } else if (currentM >= crashPoint) {
              setCrashPlaying(false);
              setCrashCrashed(true);
              setCrashMult(crashPoint);
              setLast(j.round);
              if (typeof j.balance === "number") syncBalance(j.balance);
              if (animatingRef) animatingRef.current = false;
              triggerOutcome(j.round);
              void load();
            } else {
              crashAnimRef.current = requestAnimationFrame(animateFlight);
            }
          } catch (err) {
            reportClientError({
              error: err,
              errorType: "GAME_ACTION_ERROR",
              message: err.message || "Błąd podczas animacji lotu Crash",
              game: "crash",
              actionPayload: { bet, targetCashout, crashPoint },
              sourceFile: "frontend/src/components/GameTableDialog.jsx:animateFlight",
            });
            setCrashPlaying(false);
            if (animatingRef) animatingRef.current = false;
          }
        };

        crashAnimRef.current = requestAnimationFrame(animateFlight);
      } else {
        setCrashPlaying(false);
        setCrashMult(1.0);
        setCrashGraphPoints([]);
        if (animatingRef) animatingRef.current = false;
        void load();
      }
      return;
    }

    if (game === "slots") {
      if (animatingRef) animatingRef.current = true;
      setSlotsSpinning(true);
      const j = await post(
        { game, bet },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j && j.round) {
        setPendingSlotsRound(j.round);
        setTimeout(() => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setSlotsSpinning(false);
          setPendingSlotsRound(null);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        }, turbo ? 400 : 1600);
      } else {
        setSlotsSpinning(false);
        setPendingSlotsRound(null);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "coinflip") {
      if (animatingRef) animatingRef.current = true;
      setIsFlipping(true);
      const coinPick = choice === "tails" ? "tails" : "heads";
      const j = await post(
        { game, bet, choice: coinPick },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j) {
        setTimeout(() => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setIsFlipping(false);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        }, turbo ? 250 : 1300);
      } else {
        setIsFlipping(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }

    if (game === "rps") {
      if (animatingRef) animatingRef.current = true;
      setIsShootingRPS(true);
      const rpsPick = choice || "rock";
      const j = await post(
        { game, bet, choice: rpsPick },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
      );
      if (j) {
        setTimeout(() => {
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          setIsShootingRPS(false);
          if (animatingRef) animatingRef.current = false;
          triggerOutcome(j.round);
          void load();
        }, turbo ? 250 : 1000);
      } else {
        setIsShootingRPS(false);
        if (animatingRef) animatingRef.current = false;
      }
      return;
    }


    if (game === "blackjack") {
      const j = await post({ action: "deal_blackjack", bet });
      if (j?.round?.state === "settled") {
        setBlackjackPreview({ ...j.round, state: "settled" });
        setTimeout(() => {
          setBlackjackPreview(null);
          setLast(j.round);
          if (typeof j.balance === "number") syncBalance(j.balance);
          triggerOutcome(j.round);
          void load();
        }, 350);
      }
      return;
    }

    if (game === "mines") {
      await post({ action: "start_mines", bet, mines: mineCount });
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

    // If high multiplier, show celebration overlay
    if (ball.multiplier >= 3.0) {
      triggerOutcome(ball.round);
    }
  };

  const handlePostMines = async (body, opts) => {
    const res = await post(body, { ...opts, silent: body?.move === "reveal" });
    if (res?.round?.state === "settled") {
      triggerOutcome(res.round);
    }
    return res;
  };

  const winningNumber =
    spinResult?.payload?.number ?? last?.payload?.number ?? 0;
  const prize = Math.max(0, wheelOrder.indexOf(winningNumber));

  return (
    <div className="modal-backdrop game-modal-backdrop" role="presentation">
      <div
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
            <div className={`table-visual ${game}`}>
              {game === "roulette" && (
                <>
                  <div
                    className={`roulette-live ${spinning ? "is-spinning" : ""} ${rouletteWaiting ? "waiting" : ""}`}
                  >
                    <RouletteWheelVisual
                      mustStartSpinning={spinning}
                      prizeNumber={prize}
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
                    {spinResult && !spinning && !rouletteWaiting && (
                      <div className="roulette-result" aria-live="polite">
                        <strong>{winningNumber}</strong>
                      </div>
                    )}
                  </div>
                  <RouletteBets
                    selectedBets={rouletteSelected}
                    onToggleBet={handleRouletteToggle}
                    onSelectAllNumbers={handleRouletteSelectAll}
                    onClearBets={handleRouletteClear}
                    winningNumber={spinning ? null : winningNumber}
                    disabled={spinning || rouletteWaiting}
                  />
                </>
              )}

              {game === "slots" && (
                <SlotsTable last={pendingSlotsRound || last} loading={loading} slotsSpinning={slotsSpinning} />
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

              {game === "coinflip" && (
                <CoinflipTable
                  choice={choice}
                  setChoice={setChoice}
                  last={last}
                  loading={loading}
                  isFlipping={isFlipping}
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
                  autoCashout={crashAutoCashout}
                  setAutoCashout={setCrashAutoCashout}
                  isPlaying={crashPlaying}
                  currentMult={crashMult}
                  isCrashed={crashCrashed}
                  isCashedOut={crashCashedOut}
                  onCashout={handleManualCrashCashout}
                  graphPoints={crashGraphPoints}
                  last={last}
                  loading={loading}
                />
              )}
            </div>

            {/* Outcome notification if settled */}
            {last && !shownRound && !blackjackPreview && !spinning && !slotsSpinning && !isFlipping && !isShootingRPS && !limboAnimating && !crashPlaying && (
              <div className={`result-box ${last.payout && last.payout > last.bet ? "winner" : ""}`}>
                <b>{last.result}</b>
                <span>
                  {last.payout ? `Wypłata: ${money(last.payout)}` : "Bez wygranej"}
                </span>
              </div>
            )}
          </div>

          {/* Right Side: Betting Controls & Play Action */}
          <div className="game-controls-column">
            {!round && !blackjackPreview && (
              <div className="table-controls-panel">
                <BetControl
                  bet={bet}
                  setBet={setBet}
                  maxBalance={data?.player?.balance || 1000000}
                  turbo={turbo}
                  setTurbo={setTurbo}
                />

                {game === "roulette" && (
                  <div className="roulette-bet-summary-box">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>Wybrane pola:</span>
                      <strong className="text-amber-400 font-mono font-bold">
                        {rouletteSelected.size === 0
                          ? "Brak (wybierz na stole)"
                          : rouletteSelected.size === 37
                          ? "Całe koło (37 pól)"
                          : `${rouletteSelected.size} ${rouletteSelected.size === 1 ? "pole" : "pól"}`}
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

                  return (
                    <button
                      type="button"
                      className="btn-play-action primary"
                      disabled={isButtonDisabled}
                      onClick={start}
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
                  className="btn-play-action secondary"
                  disabled={loading}
                  onClick={() => showSettledBlackjack("stand")}
                >
                  Pas
                </button>
                <button
                  type="button"
                  className="btn-play-action secondary"
                  disabled={loading || round.payload.cards.length !== 2}
                  onClick={() => showSettledBlackjack("double")}
                >
                  Podwój
                </button>
                <button
                  type="button"
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
