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
    <div className="coinflip-container w-full flex items-center justify-center">
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
    </div>
  );
}

