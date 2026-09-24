import React, { useEffect, useRef, useState } from "react";
import { sounds } from "../../lib/sounds";

export function CoinflipTable({
  choice,
  setChoice,
  last,
  loading,
  isFlipping,
  targetOutcome,
}) {
  const [restingSide, setRestingSide] = useState(choice || "heads");
  const [animClass, setAnimClass] = useState("idle-heads");
  const [animKey, setAnimKey] = useState(0);

  // When user clicks choice when idle, smoothly rotate to preview that face
  useEffect(() => {
    if (!isFlipping) {
      const side = choice || "heads";
      setRestingSide(side);
      setAnimClass(`idle-${side}`);
    }
  }, [choice, isFlipping]);

  // When flip starts, compute the exact toss keyframe animation from restingSide to targetOutcome
  useEffect(() => {
    if (isFlipping && targetOutcome) {
      const fromSide = restingSide || choice || "heads";
      const toSide = targetOutcome;
      const tossName = `toss-${toSide}-from-${fromSide}`;

      setAnimKey((k) => k + 1);
      setAnimClass(tossName);
      sounds.playCoinToss();

      const landTimer = setTimeout(() => {
        sounds.playCoinLand();
      }, 680);

      return () => clearTimeout(landTimer);
    } else if (!isFlipping && targetOutcome) {
      setRestingSide(targetOutcome);
      setAnimClass(`idle-${targetOutcome}`);
    }
  }, [isFlipping, targetOutcome]);

  return (
    <div className="coinflip-container">
      {/* 3D Coin Arena */}
      <div className="coin-arena">
        <div className="coin-stage-perspective">
          {/* Real 3D Polish 1 ZŁ Coin */}
          <div
            key={animKey}
            className={`coin-3d-polish ${animClass}`}
          >
            {/* Front Face: Awers (Orzeł RP) */}
            <div className="coin-face-polish coin-front">
              <img
                src="/images/coin_1zl_awers.png"
                alt="1 ZŁ Awers - Orzeł"
                className="w-full h-full object-cover select-none pointer-events-none rounded-full"
                draggable={false}
              />
              <div className="coin-metallic-sheen" />
            </div>

            {/* 3D Reeded Cylinder Edge (Ząbkowany rant boczny) */}
            <div className="coin-edge-layer coin-edge-1" />
            <div className="coin-edge-layer coin-edge-2" />
            <div className="coin-edge-layer coin-edge-3" />
            <div className="coin-edge-layer coin-edge-4" />

            {/* Back Face: Rewers (1 ZŁOTY) */}
            <div className="coin-face-polish coin-back">
              <img
                src="/images/coin_1zl_rewers.png"
                alt="1 ZŁ Rewers - 1 Złoty"
                className="w-full h-full object-cover select-none pointer-events-none rounded-full"
                draggable={false}
              />
              <div className="coin-metallic-sheen" />
            </div>
          </div>

          {/* Dynamic 3D Floor Shadow */}
          <div className={`coin-floor-shadow ${isFlipping ? "flipping" : "landed"}`} />
        </div>
      </div>

      {/* Choice Selector */}
      <div className="coinflip-controls">
        <span className="text-xs sm:text-sm uppercase tracking-wider font-bold text-slate-400 text-center">
          Wybierz stronę monety (1 ZŁOTY):
        </span>

        <div className="coin-choices-row">
          <button
            type="button"
            disabled={loading || isFlipping}
            className={`coin-choice-btn polish-btn ${choice === "heads" ? "active" : ""}`}
            onClick={() => {
              sounds.playTileClick();
              setChoice("heads");
            }}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 drop-shadow-md rounded-full overflow-hidden border border-slate-600/50">
              <img
                src="/images/coin_1zl_awers.png"
                alt="Orzeł"
                className="w-full h-full object-cover select-none pointer-events-none"
                draggable={false}
              />
            </div>
            <div className="flex flex-col text-left">
              <strong className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5">
                Orzeł (Awers)
              </strong>
              <span className="text-[11px] sm:text-xs text-amber-400 font-mono font-semibold">Mnożnik ×1.98</span>
            </div>
          </button>

          <button
            type="button"
            disabled={loading || isFlipping}
            className={`coin-choice-btn polish-btn ${choice === "tails" ? "active" : ""}`}
            onClick={() => {
              sounds.playTileClick();
              setChoice("tails");
            }}
          >
            <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 drop-shadow-md rounded-full overflow-hidden border border-slate-600/50">
              <img
                src="/images/coin_1zl_rewers.png"
                alt="Reszka"
                className="w-full h-full object-cover select-none pointer-events-none"
                draggable={false}
              />
            </div>
            <div className="flex flex-col text-left">
              <strong className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5">
                Reszka (1 ZŁOTY)
              </strong>
              <span className="text-[11px] sm:text-xs text-amber-400 font-mono font-semibold">Mnożnik ×1.98</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

