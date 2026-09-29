export function calcPlayerLevel(player) {
  const xpTotal = player?.xp || 0;
  const calculatedLevel = Math.max(1, 1 + Math.floor(Math.sqrt(xpTotal / 200)));
  const storedLevel = player?.level || 1;
  return (storedLevel - 1) * (storedLevel - 1) * 200 <= xpTotal ? storedLevel : calculatedLevel;
}

export function calcPlayerLevelProgress(player) {
  const xpTotal = player?.xp || 0;
  const userLevel = calcPlayerLevel(player);
  const xpForCurrent = (userLevel - 1) * (userLevel - 1) * 200;
  const xpForNext = userLevel * userLevel * 200;
  const xpCurrent = Math.max(0, xpTotal - xpForCurrent);
  const xpNeeded = Math.max(1, xpForNext - xpForCurrent);
  const xpProgress = Math.min(100, Math.max(0, (xpCurrent / xpNeeded) * 100));

  return {
    userLevel,
    xpTotal,
    xpForCurrent,
    xpForNext,
    xpCurrent,
    xpNeeded,
    xpProgress,
  };
}
