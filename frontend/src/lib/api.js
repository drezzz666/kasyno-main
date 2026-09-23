import { getBrowserProof, invalidateBrowserProof, queueChallenge } from "./challenge";
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
        // Fall back to HTTP if WS request fails
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

    if (data.challenge) {
      queueChallenge(data.challenge);
    }

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

export async function postCasinoAction(body, optionsOrRetry = 0) {
  const isOptionsObj = typeof optionsOrRetry === "object" && optionsOrRetry !== null;
  const retryCount = typeof optionsOrRetry === "number" ? optionsOrRetry : (optionsOrRetry?._retryCount || 0);
  const isSilent = isOptionsObj && optionsOrRetry.silent === true;

  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  let proof = "";
  const actionLabel = `WS/POST [${body?.game || "action"}:${body?.action || "play"}]`;
  addBreadcrumb("game_action", actionLabel, { bet: body?.bet, action: body?.action, game: body?.game });

  try {
    proof = await getBrowserProof();
  } catch (e) {
    console.warn("Nie udało się pobrać wyzwania antybotowego:", e);
  }

  let data;
  let usedWS = false;

  // 1. Prefer WebSocket RPC (Zero HTTP requests in network tab)
  if (wsClient.isReady()) {
    try {
      usedWS = true;
      data = await wsClient.sendRequest("action", body, proof);
    } catch (wsErr) {
      if (wsErr.status === 401) {
        window.location.href = "/api/auth/login";
        return null;
      }
      if (wsErr.status === 403 && wsErr.data?.challenge && retryCount < 2) {
        invalidateBrowserProof();
        queueChallenge(wsErr.data.challenge);
        const nextOptions = isOptionsObj ? { ...optionsOrRetry, _retryCount: retryCount + 1 } : retryCount + 1;
        return postCasinoAction(body, nextOptions);
      }
      if (wsErr.message === "WS_NOT_CONNECTED" || wsErr.message.includes("przerwane")) {
        // Fall back to HTTP below
        data = null;
      } else {
        // Genuine business or game validation error from server
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
          ...(proof ? { "X-Browser-Proof": proof } : {}),
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
    } catch (e) {
      throw new Error(`Błąd odpowiedzi serwera (HTTP ${res.status})`);
    }

    if (res.status === 403 && data.challenge && retryCount < 2) {
      invalidateBrowserProof();
      queueChallenge(data.challenge);
      const nextOptions = isOptionsObj ? { ...optionsOrRetry, _retryCount: retryCount + 1 } : retryCount + 1;
      return postCasinoAction(body, nextOptions);
    }

    if (!res.ok) {
      const errorMsg = data.error || `Błąd wykonywania akcji (HTTP ${res.status})`;
      throw new Error(errorMsg);
    }
  }

  const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
  recordActionLatency(actionLabel, duration);

  if (data?.next_challenge) {
    queueChallenge(data.next_challenge);
  } else if (data?.challenge) {
    queueChallenge(data.challenge);
  }

  addBreadcrumb("game_action", `${actionLabel} OK`, {
    round_id: data?.round?.id,
    payout: data?.round?.payout,
    balance: data?.balance,
    duration_ms: Math.round(duration),
  });

  return data;
}

export async function fetchHistoryEntries(offset = 0, limit = 10) {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    addBreadcrumb("api_call", `GET history (offset=${offset}, limit=${limit})`);
    let data;

    if (wsClient.isReady()) {
      try {
        data = await wsClient.sendRequest("get_history", { offset, limit });
      } catch (wsErr) {
        data = null;
      }
    }

    if (!data) {
      const res = await fetch(`/api/casino/history?offset=${offset}&limit=${limit}`, {
        cache: "no-store",
      });
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
    recordActionLatency("GET history", duration);
    return data;
  } catch (e) {
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET history", duration);
    reportClientError({
      error: e,
      errorType: "API_ERROR",
      message: e.message || "Błąd pobierania historii",
      context: `GET /api/casino/history`,
      sourceFile: "frontend/src/lib/api.js:fetchHistoryEntries",
    });
    throw e;
  }
}
