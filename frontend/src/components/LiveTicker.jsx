import React from "react";
import { Sparkles, TrendingUp } from "lucide-react";
import { money, gameName } from "../lib/formatters";

export function LiveTicker({ wins = [] }) {
  if (!wins || wins.length === 0) return null;

  return (
    <div className="live-ticker-wrap">
      <div className="live-ticker-label">
        <span className="live-pulse-dot" />
        <Sparkles size={13} className="text-amber-400" />
        <span>WYGRANE NA ŻYWO</span>
      </div>
      <div className="live-ticker-scroll">
        {wins.map((w, idx) => {
          const isBig = w.payout >= (w.bet ? w.bet * 4 : 500);
          const gName = gameName(w.game) || w.game;

          return (
            <div
              key={w.id || `${w.nick}-${w.payout}-${idx}`}
              className={`ticker-item ${isBig ? "big-win" : ""}`}
            >
              <span className="ticker-nick">{w.nick}</span>
              <span className="ticker-game">{gName}</span>
              <span className="ticker-win">+{money(w.payout)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
