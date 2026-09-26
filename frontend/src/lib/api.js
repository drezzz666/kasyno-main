import { reportClientError } from "./reporter";
import { addBreadcrumb, recordActionLatency } from "./telemetry.js";
import { wsClient } from "./wsClient.js";

export async function fetchCasinoState() {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    addBreadcrumb("api_call", "GET casino state started");
    let data;

    // 1. Prefer WebSocket RPC (Zero HTTP requests in network tab)
    if (wsClient.isReady()) {
      try {
        data = await wsClient.sendRequest("get_state");
      } catch (wsErr) {
        if (wsErr.status === 401) {
          window.location.href = "/api/auth/login";
          return null;
        }
        data = null;
      }
    }

    // 2. HTTP Fetch fallback
    if (!data) {
      const res = await fetch("/api/casino", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/api/auth/login";
        return null;
      }
      data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
    }

    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino", duration);
    addBreadcrumb("api_call", "GET casino state succeeded", { balance: data.player?.balance, level: data.player?.level });

    return data;
  } catch (e) {
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino", duration);
    if (e.message && !e.message.includes("401")) {
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      const msg = (e.message || "").toLowerCase();
      const isNetworkBlip =
        isOffline ||
        (e.name === "TypeError" && (
          msg.includes("failed to fetch") ||
          msg.includes("load failed") ||
          msg.includes("networkerror") ||
          msg.includes("network request failed") ||
          msg.includes("connection was lost") ||
          msg.includes("the operation was aborted") ||
          msg.includes("aborted")
        ));
      if (!isNetworkBlip) {
        reportClientError({
          error: e,
          errorType: "API_NETWORK_ERROR",
          message: e.message || "Błąd pobierania stanu kasyna",
          context: "GET /api/casino",
          sourceFile: "frontend/src/lib/api.js:fetchCasinoState",
        });
      }
    }
    throw e;
  }
}

export async function postCasinoAction(body, options = {}) {
  const isSilent = options.silent === true;

  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  const actionLabel = `WS/POST [${body?.game || "action"}:${body?.action || "play"}]`;
  addBreadcrumb("game_action", actionLabel, { bet: body?.bet, action: body?.action, game: body?.game });

  let data;
  let usedWS = false;

  // 1. Prefer WebSocket RPC (Zero HTTP requests in network tab)
  if (wsClient.isReady()) {
    try {
      usedWS = true;
      data = await wsClient.sendRequest("action", body);
    } catch (wsErr) {
      if (wsErr.status === 401) {
        window.location.href = "/api/auth/login";
        return null;
      }
      if (wsErr.message === "WS_NOT_CONNECTED" || wsErr.message.includes("przerwane")) {
        data = null;
      } else {
        const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
        recordActionLatency(actionLabel, duration);
        const errorMsg = wsErr.data?.error || wsErr.message || "Błąd wykonywania akcji";
        throw new Error(errorMsg);
      }
    }
  }

  // 2. HTTP Fetch Fallback if WS was not ready or disconnected
  if (!data && !usedWS) {
    let res;
    try {
      res = await fetch("/api/casino", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
      recordActionLatency(actionLabel, duration);
      addBreadcrumb("api_call", `${actionLabel} network error: ${e.message}`, { duration_ms: Math.round(duration) });
      if (!isSilent) {
        reportClientError({
          error: e,
          errorType: "API_NETWORK_ERROR",
          message: e.message || "Brak połączenia z serwerem gier",
          context: `POST /api/casino (Network Error)`,
          game: body?.game || "",
          actionPayload: body,
          sourceFile: "frontend/src/lib/api.js:postCasinoAction",
        });
      }
      throw e;
    }

    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency(actionLabel, duration);

    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      return null;
    }

    try {
      data = await res.json();
    } catch {
      throw new Error(`Błąd odpowiedzi serwera (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const errorMsg = data.error || `Błąd wykonywania akcji (HTTP ${res.status})`;
      throw new Error(errorMsg);
    }
  }

  addBreadcrumb("game_action", `${actionLabel} succeeded`, {
    won: data.won,
    payout: data.payout,
    balance: data.balance,
  });

  return data;
}

export async function fetchHistory(limit = 10, offset = 0) {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    addBreadcrumb("api_call", `GET history (limit=${limit}, offset=${offset})`);
    let data;

    if (wsClient.isReady()) {
      try {
        data = await wsClient.sendRequest("get_history", { limit, offset });
      } catch {
        data = null;
      }
    }

    if (!data) {
      const res = await fetch(`/api/casino/history?limit=${limit}&offset=${offset}`);
      if (res.status === 401) {
        window.location.href = "/api/auth/login";
        return null;
      }
      data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd pobierania historii");
      }
    }

    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino/history", duration);
    return data;
  } catch (e) {
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino/history", duration);
    reportClientError({
      error: e,
      errorType: "API_NETWORK_ERROR",
      message: e.message || "Błąd pobierania historii gier",
      context: "GET /api/casino/history",
      sourceFile: "frontend/src/lib/api.js:fetchHistory",
    });
    throw e;
  }
}

export const fetchHistoryEntries = fetchHistory;

export async function rotateProvablyFairSeed(clientSeed) {
  const res = await fetch("/api/casino/provably-fair/rotate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientSeed }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Błąd rotacji ziarna");
  return data;
}
