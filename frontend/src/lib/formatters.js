export const formatPLN = (n) => {
  const val = (n || 0) / 100;
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
};

export const format = formatPLN;
export const money = (n) => `${formatPLN(n)} zł`;

export const dailyBonus = (streak) => Math.min(100 + (streak || 0) * 20, 500);

export const gameNames = {
  roulette: "Ruletka",
  blackjack: "Blackjack",
  mines: "Mines",
  slots: "Sloty",
  coinflip: "Coinflip",
  rps: "KPN",
  plinko: "Plinko",
  limbo: "Limbo",
  crash: "Crash",
  chicken: "Chicken Cross",
};

export const gameName = (g) => gameNames[g] || (g ? g.toUpperCase() : "Gra");

export function getHistoryDetails(item) {
  if (item.type === "daily_bonus") {
    return {
      title: "Bonus dzienny",
      subtitle: "Nagroda za logowanie",
    };
  }
  if (item.type === "daily_mission") {
    return {
      title: "Misja dzienna",
      subtitle: item.result || "Nagroda za wykonanie misji",
    };
  }
  if (item.type === "welcome_bonus" || item.type === "starter_bonus") {
    return {
      title: "Bonus powitalny",
      subtitle: "Pakiet startowy (10,00 zł)",
    };
  }
  if (item.type === "grant") {
    return {
      title: "Konto / Doładowanie",
      subtitle: item.result || "Doładowanie administratora",
    };
  }
  if (item.type === "bankruptcy_relief" || item.type === "faucet") {
    return {
      title: "Pakiet ratunkowy",
      subtitle: "Zapomoga kryzysowa (+1,00 zł)",
    };
  }
  if (item.type === "captcha_reward") {
    return {
      title: "Mini-gra Captcha",
      subtitle: "Nagroda za rozwiązanie (+0,20 zł)",
    };
  }
  const gName = (item.game && gameNames[item.game]) || (item.game ? item.game.toUpperCase() : "Gra");
  if (item.type === "round") {
    return {
      title: gName,
      subtitle: item.result || "Wynik rundy",
    };
  }
  if (item.type === "bet") {
    return {
      title: `${gName} · Zakład`,
      subtitle: "Postawiona stawka",
    };
  }
  if (item.type === "double") {
    return {
      title: `${gName} · Podwojenie`,
      subtitle: "Podwojenie stawki",
    };
  }
  if (item.type === "payout") {
    return {
      title: `${gName} · Wypłata`,
      subtitle: item.result || "Rozliczenie wygranej",
    };
  }
  return {
    title: "Operacja",
    subtitle: item.result || item.type,
  };
}

export function formatHistoryTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
