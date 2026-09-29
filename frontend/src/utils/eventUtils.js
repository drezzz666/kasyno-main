export function getEventEndsAt(ev) {
  if (!ev) return null;
  const raw = ev.ends_at || ev.endsAt;
  return raw ? new Date(raw).getTime() : null;
}

export function getEventRemainingMs(ev) {
  const endsAt = getEventEndsAt(ev);
  return endsAt ? Math.max(0, endsAt - Date.now()) : null;
}

export function calcEventPayout(bet, multiplier, eventMult = 1.0) {
  const mult = Number(multiplier) || 0;
  const evMult = Number(eventMult) || 1.0;
  const basePayout = Math.floor(bet * mult);

  // Event bonus applies proportionally to net profit on winning outcomes (> 1.0x)
  if (mult > 1.0 && evMult > 1.0) {
    const netProfit = basePayout - bet;
    const eventBonus = Math.floor(netProfit * (evMult - 1.0));
    const finalPayout = basePayout + eventBonus;
    const profit = finalPayout - bet;
    return { basePayout, finalPayout, profit, eventBonus };
  }

  const profit = basePayout - bet;
  return { basePayout, finalPayout: basePayout, profit, eventBonus: 0 };
}
