import React from "react";
import { money, format } from "../../lib/formatters";
import { Flame, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";
import { sounds } from "../../lib/sounds";

export function SharedMinesDefs() {
  return (
    <svg className="sr-only" width="0" height="0" aria-hidden="true">
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
    </svg>
  );
}

// Gem SVG with crisp faceted cuts
export function GemIcon({ className = "w-7 h-7" }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
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
  if (revealedCount <= 0) return 1.00;
  let chance = 1.0;
  for (let i = 0; i < revealedCount; i++) {
    chance *= (25 - mineCount - i) / (25 - i);
  }
  let raw = 0.97 / chance;
  const mult = Math.floor(raw * 100) / 100;
  return Math.max(1.00, mult);
}

export function MinesTable({
  round,
  last,
  post,
  loading,
  pendingTiles = new Set(),
  onPending,
}) {
  const [explodedTile, setExplodedTile] = React.useState(null);
  const [inFlightTile, setInFlightTile] = React.useState(null);
  const [isCashingOut, setIsCashingOut] = React.useState(false);
  const busyRef = React.useRef(false);

  // Reset explodedTile and busy lock when a new active round starts
  React.useEffect(() => {
    if (round) {
      setExplodedTile(null);
      setInFlightTile(null);
      setIsCashingOut(false);
      busyRef.current = false;
    }
  }, [round?.id]);

  const r = round || last;
  const p = r?.payload || {};
  const revealed = p.revealed || [];
  const allMines = last?.state === "settled" ? p.mines || [] : [];
  const isSettled = !round && Boolean(last);
  const mineCount = p.mineCount || 5;
  const totalGems = 25 - mineCount;
  const remainingGems = Math.max(0, totalGems - revealed.length);

  const currentMultiplier = p.multiplier !== undefined ? p.multiplier : 1.00;
  const nextMultiplier = calculateMultiplier(revealed.length + 1, mineCount);
  const currentBet = round?.bet || last?.bet || 10;
  const currentProfit = Math.floor(currentBet * currentMultiplier);

  const isTilePending = (tileIdx) => {
    if (inFlightTile === tileIdx) return true;
    if (pendingTiles instanceof Set) return pendingTiles.has(tileIdx);
    if (Array.isArray(pendingTiles)) return pendingTiles.includes(tileIdx);
    return pendingTiles === tileIdx;
  };

  const isBusy = busyRef.current || inFlightTile !== null || isCashingOut || loading;

  const handleTileClick = async (i) => {
    // Synchronous guard against rapid double-clicks / concurrent requests
    if (busyRef.current || isBusy || !round || isSettled || revealed.includes(i)) return;

    busyRef.current = true;
    setInFlightTile(i);
    sounds.playTileClick();
    if (onPending) onPending(i, true);

    try {
      const res = await post(
        {
          action: "mines",
          roundId: round.id,
          move: "reveal",
          tile: i,
        },
        { silent: true }
      );

      if (res?.round) {
        if (res.round.state === "settled") {
          if (res.round.payout && res.round.payout > 0) {
            sounds.playWin();
          } else {
            setExplodedTile(i);
            sounds.playExplosion();
          }
        } else {
          // Gem revealed!
          const newGemsCount = res.round.payload?.revealed?.length || (revealed.length + 1);
          sounds.playGemReveal(1 + (newGemsCount - 1) * 0.08);
        }
      }
    } finally {
      busyRef.current = false;
      setInFlightTile(null);
      if (onPending) onPending(i, false);
    }
  };

  const handleCashoutClick = async () => {
    if (busyRef.current || isBusy || !round || isSettled || revealed.length === 0) return;

    busyRef.current = true;
    setIsCashingOut(true);
    sounds.playCoins();

    try {
      await post({ action: "mines", roundId: round.id, move: "cashout" });
    } finally {
      busyRef.current = false;
      setIsCashingOut(false);
    }
  };

  return (
    <div className="mines-craft-container">
      <SharedMinesDefs />
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
          const isExplodedMine = isSettled && explodedTile === i;
          const isMineHit = allMines.includes(i);
          const isRevealedGem = revealed.includes(i);
          const isPending = isTilePending(i);

          // End of game reveal for unpicked tiles
          const isUnrevealedSettledMine = isSettled && isMineHit && !isRevealedGem && !isExplodedMine;
          const isUnrevealedSettledGem = isSettled && !isMineHit && !isRevealedGem;

          let tileStateClass = "tile-idle";
          if (isRevealedGem) tileStateClass = "tile-gem";
          else if (isExplodedMine) tileStateClass = "tile-mine-hit";
          else if (isUnrevealedSettledMine) tileStateClass = "tile-mine-ghost";
          else if (isUnrevealedSettledGem) tileStateClass = "tile-gem-ghost";

          const isDisabled = !round || isSettled || isRevealedGem || isBusy;

          return (
            <button
              key={i}
              type="button"
              disabled={isDisabled}
              className={`mines-cell ${tileStateClass} ${isPending ? "tile-pending" : ""}`}
              onClick={() => void handleTileClick(i)}
              aria-label={`Pole ${i + 1}`}
            >
              {isRevealedGem ? (
                <div className="tile-content flip-in">
                  <GemIcon className="w-full h-full p-1.5 sm:p-2" />
                </div>
              ) : isExplodedMine ? (
                <div className="tile-content explode-in">
                  <MineIcon className="w-full h-full p-1.5 sm:p-2" />
                </div>
              ) : isUnrevealedSettledMine ? (
                <div className="tile-content ghost-mine">
                  <MineIcon className="w-full h-full p-2 opacity-60" />
                </div>
              ) : isUnrevealedSettledGem ? (
                <div className="tile-content ghost-gem">
                  <GemIcon className="w-full h-full p-2 opacity-35" />
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
            disabled={revealed.length === 0 || isBusy}
            className={`btn-mines-cashout ${revealed.length > 0 && !isBusy ? "active" : "disabled"}`}
            onClick={() => void handleCashoutClick()}
          >
            {revealed.length === 0 ? (
              <span>Wybierz pierwsze pole</span>
            ) : isCashingOut ? (
              <span>Wypłacanie...</span>
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

