import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportClientError } from "./reporter.js";

describe("Frontend Error Reporter QA Test Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("filters out standard user-facing balance and bet validation errors from spamming backend", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve({ ok: true }));

    reportClientError({
      message: "Niewystarczające saldo na koncie",
      errorType: "BALANCE_ERROR",
    });

    reportClientError({
      message: "INSUFFICIENT_FUNDS",
      errorType: "API_ERROR",
    });

    reportClientError({
      message: "Wybierz stronę przed rzutem",
      errorType: "VALIDATION_ERROR",
    });

    // Should not trigger any network requests
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles unexpected critical runtime errors gracefully", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );

    reportClientError({
      message: "Cannot read property of undefined (reading 'calculatePayout')",
      errorType: "UNHANDLED_EXCEPTION",
      sourceFile: "frontend/src/games/roulette/RouletteGame.jsx:42:10",
      context: "Spin resolution crash",
    });

    // Valid runtime crash should attempt dispatch asynchronously
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
