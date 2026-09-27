import React from "react";
import { money, gameName } from "../lib/formatters";

export function LiveTicker({ wins = [] }) {
  if (!wins || wins.length === 0) return null;

  return (
    <div className="live-ticker-wrap" role="region" aria-label="Ostatnie wygrane">
      <div className="live-ticker-label">
        <span className="ticker-label-text">Ostatnie wygrane</span>
        <span className="ticker-label-text-mobile">Live</span>
      </div>
      <div className="live-ticker-list">
        {wins.map((w, idx) => {
          const isBig = w.payout >= (w.bet ? w.bet * 4 : 500);
          const gName = gameName(w.game) || w.game;
          const nick = w.nick || "Gracz";

          return (
            <div
              key={w.id || `${nick}-${w.payout}-${idx}`}
              className={`ticker-item ${isBig ? "big-win" : ""}`}
            >
              {w.avatar && (
                <img src={w.avatar} alt={nick} className="ticker-avatar" />
              )}
              <span className="ticker-nick" title={nick}>{nick}</span>
              <span className="ticker-game">{gName}</span>
              <span className="ticker-win">+{money(w.payout)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

