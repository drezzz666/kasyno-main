export function adjustBet(currentBet, action, maxBalance = 1000000, minBet = 10) {
  const b = Number(currentBet) || minBet;
  const max = Number(maxBalance) || minBet;
  switch (action) {
    case "min":
      return minBet;
    case "half":
      return Math.max(1, Math.floor(b / 2));
    case "double":
      return Math.min(max, Math.floor(b * 2));
    case "max":
      return Math.max(1, max);
    default:
      return b;
  }
}
