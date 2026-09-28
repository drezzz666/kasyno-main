export const format = (n) => new Intl.NumberFormat("pl-PL").format(n || 0);

export const money = (n) => `${format(n)} ₽`;

export const dailyBonus = (streak) => Math.min(200 + (streak || 0) * 100, 2000);

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
  upgrader: "Upgrader",
  musordrop: "Musor Drop",
};

export const gameName = (g) => gameNames[g] || (g ? g.toUpperCase() : "Gra");

export function getHistoryDetails(item) {
  if (item.type === "musor_drop_win" || item.type === "musor_drop_buy") {
    return {
      title: item.type === "musor_drop_win" ? "Musor Drop · Wygrana" : "Musor Drop · Zakup",
      subtitle: item.description || (item.type === "musor_drop_win" ? "Nagroda ze skrzynki" : "Zakup skrzynki Arystokrackiej"),
    };
  }
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
      subtitle: "Pakiet startowy",
    };
  }
  if (item.type === "scheduled_grant" || item.type === "scheduled" || item.type === "grant_scheduled") {
    return {
      title: "Automatyczny zrzut",
      subtitle: item.result || item.description || "Zaplanowany zrzut rubli",
    };
  }
  if (item.type === "grant" || item.type === "grant_all" || item.type === "admin_grant" || item.type === "admin_create") {
    return {
      title: item.amount < 0 ? "Korekta administratora" : "Doładowanie administratora",
      subtitle: item.result || item.description || (item.amount < 0 ? "Korekta salda" : "Doładowanie administratora"),
    };
  }
  if (item.type === "admin_set" || item.type === "admin_set_all") {
    return {
      title: "Korekta salda",
      subtitle: item.result || item.description || "Ręczna modyfikacja salda",
    };
  }
  if (item.type === "captcha_reward") {
    return {
      title: "Mini-gra Captcha",
      subtitle: item.amount ? `Nagroda za rozwiązanie (+${item.amount} ₽)` : "Nagroda za rozwiązanie (+80 ₽)",
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

export function truncateNick(nick, maxLen = 20) {
  if (!nick) return "Gracz";
  const str = String(nick).trim();
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...`;
}
