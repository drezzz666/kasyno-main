import React, { useEffect, useRef, useState } from "react";
import { sounds } from "../../lib/sounds";

// SVG Vector Awers: Orzeł Rzeczypospolitej Polskiej
export function PolishEagleAwers({ className = "" }) {
  return (
    <svg viewBox="0 0 200 200" className={`w-full h-full select-none ${className}`} fill="none">
      <defs>
        {/* Metallic Silver-Nickel Radial Gradient */}
        <radialGradient id="silverPlate" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#cbd5e1" />
          <stop offset="75%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </radialGradient>

        {/* Outer Rim Specular Gradient */}
        <linearGradient id="silverRim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#94a3b8" />
          <stop offset="50%" stopColor="#f8fafc" />
          <stop offset="75%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>

        {/* Inner Field Sunburst Texture */}
        <radialGradient id="innerField" cx="50%" cy="48%" r="45%">
          <stop offset="0%" stopColor="#f1f5f9" />
          <stop offset="70%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>

        {/* Emblem Gold / Bright Silver Relief Filter */}
        <filter id="reliefShadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0.8" dy="1.2" stdDeviation="0.8" floodColor="#1e293b" floodOpacity="0.75" />
          <feDropShadow dx="-0.5" dy="-0.5" stdDeviation="0.4" floodColor="#ffffff" floodOpacity="0.9" />
        </filter>
      </defs>

      {/* Outer Coin Rim */}
      <circle cx="100" cy="100" r="97" fill="url(#silverRim)" stroke="#475569" strokeWidth="2.5" />
      <circle cx="100" cy="100" r="91.5" fill="url(#silverPlate)" />

      {/* Decorative Beaded Denticles (Perełkowanie otoku) */}
      <circle cx="100" cy="100" r="88" fill="none" stroke="#475569" strokeWidth="1.2" strokeDasharray="2.5 3" />
      <circle cx="100" cy="100" r="84.5" fill="url(#innerField)" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Arching Text: RZECZPOSPOLITA POLSKA */}
      <path id="awersTextArc" d="M 30 100 A 70 70 0 0 1 170 100" fill="none" />
      <text font-family="'Cinzel', 'Trajan Pro', 'Georgia', serif" font-size="11.5" font-weight="900" fill="#1e293b" letter-spacing="2.8" filter="url(#reliefShadow)">
        <textPath href="#awersTextArc" startOffset="50%" text-anchor="middle">
          RZECZPOSPOLITA POLSKA
        </textPath>
      </text>

      {/* Polish Eagle Emblem (Godło RP) */}
      <g filter="url(#reliefShadow)" fill="#1e293b" stroke="#334155" strokeWidth="0.4">
        {/* Crown (Korona) */}
        <path d="M94 48 L96 42 L100 45 L104 42 L106 48 L104 50 L96 50 Z" fill="#d97706" stroke="#b45309" strokeWidth="0.8" />
        <circle cx="96" cy="41" r="1" fill="#fbbf24" />
        <circle cx="100" cy="44" r="1.2" fill="#fbbf24" />
        <circle cx="104" cy="41" r="1" fill="#fbbf24" />

        {/* Eagle Head & Beak */}
        <path d="M97 50 C95 47 101 46 104 49 C107 51 108 55 106 58 C108 55 113 56 110 60 C107 60 104 60 103 62 C101 64 97 64 96 61 C95 57 96 53 97 50 Z" />
        {/* Eye */}
        <circle cx="101.5" cy="52.5" r="1" fill="#ffffff" />
        <circle cx="101.8" cy="52.5" r="0.5" fill="#0f172a" />

        {/* Left Wing (Rozpostarte lewe skrzydło) */}
        <path d="M95 62 C82 56 68 62 54 78 C59 78 66 74 72 72 C63 80 57 91 50 105 C57 102 64 98 70 94 C60 104 58 116 54 130 C62 124 71 116 78 108 C74 118 73 128 72 138 C79 129 86 120 90 110 C88 120 89 130 90 140 C94 130 97 120 98 108 Z" />

        {/* Right Wing (Rozpostarte prawe skrzydło) */}
        <path d="M105 62 C118 56 132 62 146 78 C141 78 134 74 128 72 C137 80 143 91 150 105 C143 102 136 98 130 94 C140 104 142 116 146 130 C138 124 129 116 122 108 C126 118 127 128 128 138 C121 129 114 120 110 110 C112 120 111 130 110 140 C106 130 103 120 102 108 Z" />

        {/* Breast & Torso (Pierś i tułów) */}
        <path d="M96 62 C94 72 93 88 95 106 C97 114 103 114 105 106 C107 88 106 72 104 62 Z" />

        {/* Claws & Talons (Szpony) */}
        <path d="M88 128 C85 132 82 138 84 142 C87 142 90 137 92 134 C90 138 90 144 93 145 C95 143 96 138 96 134" stroke="#0f172a" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M112 128 C115 132 118 138 116 142 C113 142 110 137 108 134 C110 138 110 144 107 145 C105 143 104 138 104 134" stroke="#0f172a" strokeWidth="1.6" strokeLinecap="round" />

        {/* Tail Feathers (Ogon) */}
        <path d="M95 118 C92 128 90 142 88 152 C94 148 98 144 100 140 C102 144 106 148 112 152 C110 142 108 128 105 118 Z" />
      </g>

      {/* Year & Stars at bottom: ★ 2026 ★ */}
      <path id="awersYearArc" d="M 60 158 A 70 70 0 0 0 140 158" fill="none" />
      <text font-family="'Cinzel', 'Georgia', serif" font-size="12" font-weight="900" fill="#1e293b" letter-spacing="3" filter="url(#reliefShadow)">
        <textPath href="#awersYearArc" startOffset="50%" text-anchor="middle">
          ★ 2026 ★
        </textPath>
      </text>
    </svg>
  );
}

// SVG Vector Rewers: 1 ZŁOTY z gałązkami dębu
export function PolishZlotyRewers({ className = "" }) {
  return (
    <svg viewBox="0 0 200 200" className={`w-full h-full select-none ${className}`} fill="none">
      <defs>
        {/* Metallic Radial Palette */}
        <radialGradient id="silverPlateRev" cx="42%" cy="36%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#e2e8f0" />
          <stop offset="50%" stopColor="#cbd5e1" />
          <stop offset="75%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </radialGradient>

        <radialGradient id="innerFieldRev" cx="50%" cy="48%" r="46%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="65%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </radialGradient>

        <linearGradient id="numeralGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#1e293b" />
          <stop offset="70%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>

      {/* Outer Coin Rim */}
      <circle cx="100" cy="100" r="97" fill="url(#silverRim)" stroke="#475569" strokeWidth="2.5" />
      <circle cx="100" cy="100" r="91.5" fill="url(#silverPlateRev)" />

      {/* Decorative Beaded Denticles */}
      <circle cx="100" cy="100" r="88" fill="none" stroke="#475569" strokeWidth="1.2" strokeDasharray="2.5 3" />
      <circle cx="100" cy="100" r="84.5" fill="url(#innerFieldRev)" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Oak Wreath Garland on Left & Bottom (Gałązka dębu z żołędziami) */}
      <g filter="url(#reliefShadow)" fill="#334155" stroke="#1e293b" strokeWidth="0.5">
        {/* Oak Leaves Left */}
        <path d="M42 90 C34 78 44 68 52 74 C58 64 72 68 70 80 C78 84 76 96 66 98 C72 108 62 118 52 114 C44 122 34 114 38 104 C30 100 32 90 42 90 Z" opacity="0.9" />
        <path d="M38 118 C32 128 42 138 50 134 C54 144 68 142 68 132 C76 132 78 122 70 118 C64 120 54 116 50 110 Z" opacity="0.85" />
        {/* Oak Leaves Bottom Right */}
        <path d="M110 156 C122 162 134 154 130 144 C142 142 144 128 134 124 C140 116 132 106 122 112 C116 122 118 134 110 138 Z" opacity="0.85" />
        {/* Acorns (Żołędzie) */}
        <ellipse cx="46" cy="70" rx="4" ry="6" fill="#1e293b" />
        <path d="M42 66 Q46 63 50 66" stroke="#0f172a" strokeWidth="2" fill="none" />
        <ellipse cx="140" cy="140" rx="4.5" ry="6.5" fill="#1e293b" />
      </g>

      {/* Center Giant Numeral "1" */}
      <g filter="url(#reliefShadow)">
        {/* 1 Numeral 3D Relief */}
        <path
          d="M86 52 L106 36 L120 36 L120 120 L136 120 L136 134 L76 134 L76 120 L94 120 L94 54 L84 62 Z"
          fill="url(#numeralGradient)"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
        {/* 1 Bevel Highlight Line */}
        <path d="M106 38 L118 38 L118 122 M96 56 L96 122" stroke="#ffffff" strokeWidth="1.2" fill="none" opacity="0.8" />
      </g>

      {/* Inscription: ZŁOTY */}
      <text
        x="100"
        y="158"
        font-family="'Cinzel', 'Trajan Pro', 'Georgia', serif"
        font-size="20"
        font-weight="900"
        letter-spacing="4"
        fill="#0f172a"
        text-anchor="middle"
        filter="url(#reliefShadow)"
      >
        ZŁOTY
      </text>
    </svg>
  );
}

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

