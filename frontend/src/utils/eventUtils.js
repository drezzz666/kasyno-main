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
  const mult = Number(multiplier) || 1.0;
  const evMult = Number(eventMult) || 1.0;
  const basePayout = Math.floor(bet * mult);
  const finalPayout = Math.floor(basePayout * evMult);
  const profit = finalPayout - bet;
  const eventBonus = finalPayout - basePayout;
  return { basePayout, finalPayout, profit, eventBonus };
}
