import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCasinoState } from "./api.js";

describe("Frontend API Service QA Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchCasinoState: handles successful fetch response", async () => {
    const mockState = {
      player: { user_id: "u123", nick: "TestPlayer", balance: 5000, level: 3 },
      active_round: null,
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockState),
      })
    );

    const state = await fetchCasinoState();
    expect(state).toEqual(mockState);
    expect(state.player.balance).toBe(5000);
  });

  it("fetchCasinoState: handles server 500 error gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "INTERNAL_SERVER_ERROR" }),
      })
    );

    await expect(fetchCasinoState()).rejects.toThrow("INTERNAL_SERVER_ERROR");
  });
});
