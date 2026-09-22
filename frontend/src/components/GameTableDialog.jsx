import React, { useState, useRef } from "react";
import { X } from "lucide-react";
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
}) {
  const round = data?.active?.game === game ? data.active : null;
  const [spinning, setSpinning] = useState(false);
  const [slotsSpinning, setSlotsSpinning] = useState(false);
  const [pendingSlotsRound, setPendingSlotsRound] = useState(null);
  const [rouletteWaiting, setRouletteWaiting] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [pendingSpin, setPendingSpin] = useState(null);
  const [pendingMine, setPendingMine] = useState(null);
  const [blackjackPreview, setBlackjackPreview] = useState(null);

  // New games states
  const [isFlipping, setIsFlipping] = useState(false);
  const [isShootingRPS, setIsShootingRPS] = useState(false);
  const [plinkoRows, setPlinkoRows] = useState(10);
  const [plinkoRisk, setPlinkoRisk] = useState("medium");
  const plinkoRef = useRef(null);

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
      pendingMine !== null ||
      pendingSpin ||
      isFlipping ||
      isShootingRPS ||
      limboAnimating ||
      crashPlaying ||
      animatingRef?.current
  );

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
        const duration = 850;
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
        };

        crashAnimRef.current = requestAnimationFrame(animateFlight);
      } else {
        setCrashPlaying(false);
        if (animatingRef) animatingRef.current = false;
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
        }, 1600);
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
        }, 1300);
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
        }, 1000);
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
      if (animatingRef) animatingRef.current = true;
      setRouletteWaiting(true);
      const j = await post(
        { game, bet, choice },
        { deferBalance: true, deferRefresh: true, deductBet: bet }
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
    const res = await post(body, opts);
    if (res?.round?.state === "settled") {
      triggerOutcome(res.round);
    }
    return res;
  };

  const winningNumber =
    spinResult?.payload?.number ?? last?.payload?.number ?? 0;
  const prize = Math.max(0, wheelOrder.indexOf(winningNumber));

  return (
    <div className="modal-backdrop game-modal-backdrop">
      <div className="modal-dialog game-dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{gameNames[game] || "Gra"}</h3>
            <p>Stolik klubowy $FGT</p>
          </div>
          <button
            className="btn-close"
            disabled={isBusy}
            onClick={() => {
              if (!isBusy) onClose();
            }}
            aria-label="Zamknij"
          >
            <X size={18} />
          </button>
        </div>

        <div className="game-table-body">
          {/* Game Visual Surface */}
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
                <RouletteBets choice={choice} setChoice={setChoice} disabled={spinning || rouletteWaiting} />
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
                pendingMine={pendingMine}
                onPending={setPendingMine}
              />
            )}

            {game === "coinflip" && (
              <CoinflipTable
                choice={choice || "heads"}
                setChoice={setChoice}
                last={last}
                loading={loading}
                isFlipping={isFlipping}
              />
            )}

            {game === "rps" && (
              <RPSTable
                choice={choice || "rock"}
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

          {/* Controls */}
          {!round && !blackjackPreview && (
            <div className="table-controls-panel">
              <BetControl bet={bet} setBet={setBet} maxBalance={data?.player?.balance || 1000000} />

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

              <button
                type="button"
                className="btn-play-action primary"
                disabled={game !== "plinko" && (loading || isBusy)}
                onClick={start}
              >
                {spinning
                  ? "Koło się kręci…"
                  : slotsSpinning
                    ? "Bębny w ruchu…"
                    : isFlipping
                      ? "Moneta w locie…"
                      : isShootingRPS
                        ? "Pojedynek w toku…"
                        : limboAnimating
                          ? "Losowanie mnożnika…"
                          : crashPlaying
                            ? "Lot rakiety w toku…"
                            : game === "plinko"
                              ? "Upuść kulę"
                              : loading
                                ? "Rozliczanie…"
                                : last
                                  ? "Zagraj ponownie"
                                  : "Rozpocznij rundę"}
              </button>
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
