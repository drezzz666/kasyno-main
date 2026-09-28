import { describe, it, expect } from "vitest";
import { format, money, dailyBonus, gameName, getHistoryDetails, formatHistoryTime, truncateNick } from "./formatters.js";

describe("Frontend Formatters QA Test Suite", () => {
  it("format: formats numbers in pl-PL locale correctly", () => {
    expect(format(0)).toBe("0");
    expect(format(1000)).toMatch(/^(1000|1[ \u00a0\u202f]000)$/);
    expect(format(1000000)).toMatch(/^(1000000|1[ \u00a0\u202f]000[ \u00a0\u202f]000)$/);
    expect(format(null)).toBe("0");
    expect(format(undefined)).toBe("0");
  });

  it("money: appends currency symbol correctly", () => {
    expect(money(0)).toContain("0 ₽");
    expect(money(500)).toContain("500 ₽");
  });

  it("dailyBonus: calculates streak bonus with 2000 cap", () => {
    expect(dailyBonus(0)).toBe(200);
    expect(dailyBonus(1)).toBe(300);
    expect(dailyBonus(5)).toBe(700);
    expect(dailyBonus(18)).toBe(2000);
    expect(dailyBonus(50)).toBe(2000);
    expect(dailyBonus(null)).toBe(200);
  });

  it("gameName: maps canonical identifiers to Polish UI names", () => {
    expect(gameName("roulette")).toBe("Ruletka");
    expect(gameName("blackjack")).toBe("Blackjack");
    expect(gameName("mines")).toBe("Mines");
    expect(gameName("slots")).toBe("Sloty");
    expect(gameName("coinflip")).toBe("Coinflip");
    expect(gameName("rps")).toBe("KPN");
    expect(gameName("plinko")).toBe("Plinko");
    expect(gameName("limbo")).toBe("Limbo");
    expect(gameName("crash")).toBe("Crash");
    expect(gameName("chicken")).toBe("Chicken Cross");
    expect(gameName("upgrader")).toBe("Upgrader");
    expect(gameName("musordrop")).toBe("Musor Drop");
    expect(gameName("unknown_custom")).toBe("UNKNOWN_CUSTOM");
    expect(gameName("")).toBe("Gra");
    expect(gameName(null)).toBe("Gra");
  });

  it("getHistoryDetails: maps ledger entries properly", () => {
    expect(getHistoryDetails({ type: "daily_bonus" })).toEqual({
      title: "Bonus dzienny",
      subtitle: "Nagroda za logowanie",
    });

    expect(getHistoryDetails({ type: "musor_drop_win", description: "Złoty Zegar" })).toEqual({
      title: "Musor Drop · Wygrana",
      subtitle: "Złoty Zegar",
    });

    expect(getHistoryDetails({ type: "grant", amount: 500 })).toEqual({
      title: "Doładowanie administratora",
      subtitle: "Doładowanie administratora",
    });

    expect(getHistoryDetails({ type: "grant", amount: -200 })).toEqual({
      title: "Korekta administratora",
      subtitle: "Korekta salda",
    });

    expect(getHistoryDetails({ type: "bet", game: "roulette" })).toEqual({
      title: "Ruletka · Zakład",
      subtitle: "Postawiona stawka",
    });
  });

  it("formatHistoryTime: formats timestamp cleanly", () => {
    expect(formatHistoryTime(null)).toBe("");
    expect(formatHistoryTime(0)).toBe("");
    const ts = new Date("2026-09-28T12:30:00Z").getTime();
    expect(formatHistoryTime(ts)).toBeTruthy();
  });

  it("truncateNick: cuts nicknames longer than maxLen with ellipsis", () => {
    expect(truncateNick("Kamil")).toBe("Kamil");
    expect(truncateNick("SuperDlugiNickGracza1234567890", 20)).toBe("SuperDlugiNickGracza...");
    expect(truncateNick("DokladnieDwadziecia1", 20)).toBe("DokladnieDwadziecia1");
    expect(truncateNick("", 20)).toBe("Gracz");
    expect(truncateNick(null, 20)).toBe("Gracz");
  });
});
