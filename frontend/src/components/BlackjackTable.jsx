import React from "react";
import { money } from "../lib/formatters";

export function BlackjackTable({ round, last, revealDealer = false }) {
  const r = round || last;
  const p = r?.payload;

  const val = (cards = []) => {
    let n = 0;
    let a = 0;
    cards.forEach((c) => {
      if (c.rank === "A") {
        n += 11;
        a++;
      } else if (["J", "Q", "K"].includes(c.rank)) {
        n += 10;
      } else {
        n += Number(c.rank);
      }
    });
    while (n > 21 && a > 0) {
      n -= 10;
      a--;
    }
    return n;
  };

  const settled = r?.state === "settled";
  const shouldRevealDealer = revealDealer || settled;
  const dealerCards =
    !shouldRevealDealer && p?.dealer?.length > 1
      ? [p.dealer[0], { rank: "?", suit: "" }]
      : p?.dealer || [];

  const dealerTotal = p
    ? shouldRevealDealer
      ? val(p.dealer)
      : val([p.dealer[0]])
    : 0;

  const natural =
    !!p?.cards?.length && p.cards.length === 2 && val(p.cards) === 21;

  const outcomeClass = settled
    ? (r?.payout || 0) > (r?.bet || 0)
      ? "winner"
      : (r?.payout || 0) === (r?.bet || 0)
        ? "push"
        : "loser"
    : "";

  const payoutText = settled
    ? r?.payout
      ? `Wypłata: ${money(r.payout)}`
      : "Przegrana stawka"
    : "";

  const isRedSuit = (suit) => suit === "♥" || suit === "♦";

  return (
    <div className="hands">
      {/* Dealer Hand */}
      <div className="hand-container dealer-hand">
        <div className="hand-header">
          <span className="hand-label">KRUPIER</span>
          <span className="hand-score">
            {round && !shouldRevealDealer ? `${dealerTotal} + ?` : dealerTotal}
          </span>
        </div>
        <div className="cards-row">
          {dealerCards.map((c, i) => {
            const isBack = c.rank === "?";
            const red = isRedSuit(c.suit);
            return (
              <div
                key={`dealer-${c.rank}-${c.suit}-${i}`}
                className={`playing-card dealer ${isBack ? "card-back" : ""} ${red ? "card-red" : "card-black"}`}
                style={{ "--card-index": i }}
              >
                {!isBack && (
                  <>
                    <span className="card-corner top-left">{c.rank}</span>
                    <span className="card-center-suit">{c.suit}</span>
                    <span className="card-corner bottom-right">{c.rank}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Player Hand */}
      <div className="hand-container player-hand">
        <div className="hand-header">
          <span className="hand-label">TWÓJ UKŁAD</span>
          <span className="hand-score">
            {p ? val(p.cards) : 0}{" "}
            {natural && <span className="bj-badge">BLACKJACK 3:2</span>}
            {p && val(p.cards) > 21 && <span className="bj-badge bust">FURA (&gt;21)</span>}
          </span>
        </div>
        <div className="cards-row">
          {p?.cards?.map((c, i) => {
            const red = isRedSuit(c.suit);
            return (
              <div
                key={`player-${c.rank}-${c.suit}-${i}`}
                className={`playing-card player ${red ? "card-red" : "card-black"}`}
                style={{ "--card-index": i }}
              >
                <span className="card-corner top-left">{c.rank}</span>
                <span className="card-center-suit">{c.suit}</span>
                <span className="card-corner bottom-right">{c.rank}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
