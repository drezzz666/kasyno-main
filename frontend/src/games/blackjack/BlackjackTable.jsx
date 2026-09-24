import React, { useEffect, useRef } from "react";
import { money } from "../../lib/formatters";
import { sounds } from "../../lib/sounds";

export function BlackjackTable({ round, last, revealDealer = false }) {
  const r = round || last;
  const p = r?.payload;
  const prevCardCount = useRef(0);
  const prevDealerCount = useRef(0);
  const prevSettled = useRef(false);

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

  const playerTotal = p ? val(p.cards) : 0;
  const natural = !!p?.cards?.length && p.cards.length === 2 && playerTotal === 21;
  const isBust = playerTotal > 21;
  const isPlayerWin = settled && (r?.payout || 0) > (r?.bet || 0);

  // Sound effects on card dealing & reveal
  useEffect(() => {
    const totalCards = (p?.cards?.length || 0) + (p?.dealer?.length || 0);
    if (totalCards > 0 && totalCards !== prevCardCount.current) {
      sounds.playCardDeal();
      prevCardCount.current = totalCards;
    }
  }, [p?.cards?.length, p?.dealer?.length]);

  useEffect(() => {
    if (shouldRevealDealer && !prevSettled.current && p?.dealer?.length > 1) {
      sounds.playCardFlip();
    }
    prevSettled.current = shouldRevealDealer;
  }, [shouldRevealDealer, p?.dealer?.length]);

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
            const isRevealedCard = i === 1 && shouldRevealDealer && !isBack;
            return (
              <div
                key={`dealer-${c.rank}-${c.suit}-${i}`}
                className={`playing-card dealer ${isBack ? "card-back" : ""} ${isRevealedCard ? "card-revealed" : ""} ${red ? "card-red" : "card-black"}`}
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
            {playerTotal}{" "}
            {natural && <span className="bj-badge">BLACKJACK 3:2</span>}
            {isBust && <span className="bj-badge bust">FURA (&gt;21)</span>}
          </span>
        </div>
        <div className="cards-row">
          {p?.cards?.map((c, i) => {
            const red = isRedSuit(c.suit);
            return (
              <div
                key={`player-${c.rank}-${c.suit}-${i}`}
                className={`playing-card player ${red ? "card-red" : "card-black"} ${isBust ? "card-bust" : ""} ${natural || (isPlayerWin && playerTotal === 21) ? "card-blackjack-win" : ""}`}
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
