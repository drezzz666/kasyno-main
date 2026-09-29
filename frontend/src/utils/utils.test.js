import { describe, it, expect } from "vitest";
import { getEventEndsAt, getEventRemainingMs, calcEventPayout } from "./eventUtils";
import { calcPlayerLevel, calcPlayerLevelProgress } from "./levelUtils";
import { adjustBet } from "./betUtils";
import { getInitials } from "../lib/formatters";

describe("eventUtils", () => {
  it("extracts endsAt timestamp correctly", () => {
    const future = new Date(Date.now() + 10000).toISOString();
    expect(getEventEndsAt({ ends_at: future })).toBe(new Date(future).getTime());
    expect(getEventEndsAt({ endsAt: future })).toBe(new Date(future).getTime());
    expect(getEventEndsAt(null)).toBeNull();
  });

  it("calculates payout with event multiplier correctly", () => {
    const res = calcEventPayout(100, 2.0, 1.5);
    expect(res.basePayout).toBe(200);
    expect(res.finalPayout).toBe(300);
    expect(res.profit).toBe(200);
    expect(res.eventBonus).toBe(100);
  });
});

describe("levelUtils", () => {
  it("calculates level and progress correctly", () => {
    const player = { xp: 800, level: 3 };
    const level = calcPlayerLevel(player);
    expect(level).toBe(3);

    const progress = calcPlayerLevelProgress(player);
    expect(progress.userLevel).toBe(3);
    expect(progress.xpForCurrent).toBe(800);
    expect(progress.xpForNext).toBe(1800);
    expect(progress.xpProgress).toBe(0);
  });
});

describe("betUtils", () => {
  it("adjusts bet correctly", () => {
    expect(adjustBet(100, "min")).toBe(10);
    expect(adjustBet(100, "half")).toBe(50);
    expect(adjustBet(100, "double", 500)).toBe(200);
    expect(adjustBet(100, "double", 150)).toBe(150);
    expect(adjustBet(100, "max", 1000)).toBe(1000);
  });
});

describe("formatters - getInitials", () => {
  it("formats initials correctly", () => {
    expect(getInitials("PlayerOne")).toBe("PL");
    expect(getInitials("a")).toBe("A");
    expect(getInitials("")).toBe("GR");
  });
});
