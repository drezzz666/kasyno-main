import React from "react";
import { money, format } from "../lib/formatters";
import { Flame, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";

// Gem SVG with crisp faceted cuts
export function GemIcon({ className = "w-7 h-7" }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="gem-top" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="gem-side" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="gem-center" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      {/* Top Facet */}
      <polygon points="12,5 24,5 31,13 5,13" fill="url(#gem-top)" />
      {/* Center Main Facet */}
      <polygon points="12,5 24,5 28,13 8,13" fill="#a7f3d0" fillOpacity="0.6" />
      {/* Left Bottom */}
      <polygon points="5,13 18,31 8,13" fill="url(#gem-side)" />
      {/* Right Bottom */}
      <polygon points="31,13 18,31 28,13" fill="url(#gem-side)" />
      {/* Center Bottom Point */}
      <polygon points="8,13 28,13 18,31" fill="url(#gem-center)" />
      {/* Specular Glint */}
      <polygon points="14,7 18,7 16,11 12,11" fill="#ffffff" fillOpacity="0.75" />
    </svg>
  );
}

// Realistic Naval Mine SVG with metallic spikes & warning diode
export function MineIcon({ className = "w-7 h-7" }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <radialGradient id="mine-sphere" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <radialGradient id="mine-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="40%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#991b1b" />
        </radialGradient>
      </defs>
      {/* Spikes / Horns */}
      <rect x="16.5" y="2" width="3" height="6" rx="1.5" fill="#334155" />
      <rect x="16.5" y="28" width="3" height="6" rx="1.5" fill="#334155" />
      <rect x="2" y="16.5" width="6" height="3" rx="1.5" fill="#334155" />
      <rect x="28" y="16.5" width="6" height="3" rx="1.5" fill="#334155" />
      <rect x="6.5" y="6.5" width="3" height="6" rx="1.5" transform="rotate(-45 8 9.5)" fill="#334155" />
      <rect x="26.5" y="26.5" width="3" height="6" rx="1.5" transform="rotate(-45 28 29.5)" fill="#334155" />
      <rect x="26.5" y="6.5" width="3" height="6" rx="1.5" transform="rotate(45 28 9.5)" fill="#334155" />
      <rect x="6.5" y="26.5" width="3" height="6" rx="1.5" transform="rotate(45 8 29.5)" fill="#334155" />
      {/* Main Mine Body */}
      <circle cx="18" cy="18" r="11" fill="url(#mine-sphere)" stroke="#0f172a" strokeWidth="1.5" />
      {/* Rivet studs */}
      <circle cx="12" cy="14" r="1" fill="#64748b" />
      <circle cx="24" cy="14" r="1" fill="#64748b" />
      <circle cx="12" cy="22" r="1" fill="#64748b" />
      <circle cx="24" cy="22" r="1" fill="#64748b" />
      {/* Warning Core Diode */}
      <circle cx="18" cy="18" r="4" fill="url(#mine-core)" />
      <circle cx="16.8" cy="16.8" r="1.2" fill="#ffffff" fillOpacity="0.8" />
    </svg>
  );
}

export function calculateMultiplier(revealedCount, mineCount) {
  if (revealedCount <= 0) return 1.0;
  let chance = 1.0;
  for (let i = 0; i < revealedCount; i++) {
    chance *= (25 - mineCount - i) / (25 - i);
  }
  const mult = Math.floor((0.97 / chance) * 100) / 100;
  return Math.max(1.0, mult);
}

export function MinesTable({
  round,
  last,
  post,
  loading,
  pendingMine,
  onPending,
}) {
  const r = round || last;
  const p = r?.payload || {};
  const revealed = p.revealed || [];
  const allMines = last?.state === "settled" ? p.mines || [] : [];
  const isSettled = !round && Boolean(last);
  const mineCount = p.mineCount || 5;
  const totalGems = 25 - mineCount;
  const remainingGems = Math.max(0, totalGems - revealed.length);

  const currentMultiplier = p.multiplier || 1.0;
  const nextMultiplier = calculateMultiplier(revealed.length + 1, mineCount);
  const currentBet = round?.bet || last?.bet || 10;
  const currentProfit = Math.floor(currentBet * currentMultiplier);

  return (
    <div className="mines-craft-container">
      {/* Authentic Mines HUD Bar */}
      <div className="mines-hud">
        <div className="hud-metric">
          <span className="hud-metric-label">Miny</span>
          <span className="hud-metric-value text-rose-400 font-mono flex items-center gap-1">
            <ShieldAlert size={13} /> {mineCount}
          </span>
        </div>

        <div className="hud-metric">
          <span className="hud-metric-label">Diamenty</span>
          <span className="hud-metric-value text-emerald-400 font-mono flex items-center gap-1">
            <Sparkles size={13} /> {remainingGems}
          </span>
        </div>

        {round && (
          <>
            <div className="hud-metric highlight">
              <span className="hud-metric-label">Mnożnik</span>
              <span className="hud-metric-value text-amber-400 font-mono font-bold">
                ×{currentMultiplier.toFixed(2)}
              </span>
            </div>

            <div className="hud-metric">
              <span className="hud-metric-label">Następny</span>
              <span className="hud-metric-value text-slate-300 font-mono">
                ×{nextMultiplier.toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 5x5 Mines Board */}
      <div className="mines-grid-surface">
        {Array.from({ length: 25 }, (_, i) => {
          const isMineHit = allMines.includes(i);
          const isRevealedGem = revealed.includes(i);
          const isPending = pendingMine === i;

          // End of game reveal for unpicked tiles
          const isUnrevealedSettledMine = isSettled && isMineHit && !isRevealedGem;
          const isUnrevealedSettledGem = isSettled && !isMineHit && !isRevealedGem;

          let tileStateClass = "tile-idle";
          if (isRevealedGem) tileStateClass = "tile-gem";
          else if (isMineHit && !isSettled) tileStateClass = "tile-mine-hit";
          else if (isUnrevealedSettledMine) tileStateClass = "tile-mine-ghost";
          else if (isUnrevealedSettledGem) tileStateClass = "tile-gem-ghost";

          return (
            <button
              key={i}
              type="button"
              disabled={!round || loading || isRevealedGem || isPending}
              className={`mines-cell ${tileStateClass} ${isPending ? "tile-pending" : ""}`}
              onClick={() => {
                onPending(i);
                void post({
                  action: "mines",
                  roundId: round.id,
                  move: "reveal",
                  tile: i,
                }).then(() => onPending(null));
              }}
              aria-label={`Pole ${i + 1}`}
            >
              {isRevealedGem ? (
                <div className="tile-content flip-in">
                  <GemIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
              ) : isMineHit ? (
                <div className="tile-content explode-in">
                  <MineIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
              ) : isUnrevealedSettledMine ? (
                <div className="tile-content ghost-mine">
                  <MineIcon className="w-5 h-5 sm:w-6 sm:h-6 opacity-60" />
                </div>
              ) : isUnrevealedSettledGem ? (
                <div className="tile-content ghost-gem">
                  <GemIcon className="w-5 h-5 sm:w-6 sm:h-6 opacity-35" />
                </div>
              ) : isPending ? (
                <div className="tile-spinner" />
              ) : (
                <div className="tile-idle-bevel" />
              )}
            </button>
          );
        })}
      </div>

      {/* In-Game Cashout Banner during Active Round */}
      {round && (
        <div className="mines-active-action-bar">
          <button
            type="button"
            disabled={loading || revealed.length === 0}
            className={`btn-mines-cashout ${revealed.length > 0 ? "active" : "disabled"}`}
            onClick={() =>
              post({ action: "mines", roundId: round.id, move: "cashout" })
            }
          >
            {revealed.length === 0 ? (
              <span>Wybierz pierwsze pole</span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle2 size={16} />
                WYPŁAĆ {money(currentProfit)} (×{currentMultiplier.toFixed(2)})
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
