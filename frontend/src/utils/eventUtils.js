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
  // Event bonus only applies to winning multipliers (> 1.0x)
  const finalPayout = (mult > 1.0 && evMult > 1.0) ? Math.floor(basePayout * evMult) : basePayout;
  const profit = finalPayout - bet;
  const eventBonus = finalPayout - basePayout;
  return { basePayout, finalPayout, profit, eventBonus };
}
