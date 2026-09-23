import { getBrowserProof, invalidateBrowserProof, queueChallenge } from "./challenge";
import { reportClientError } from "./reporter";
import { addBreadcrumb, recordActionLatency } from "./telemetry.js";

export async function fetchCasinoState() {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    addBreadcrumb("api_call", "GET /api/casino started");
    const res = await fetch("/api/casino", { cache: "no-store" });
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino", duration);

    if (res.status === 401) {
      addBreadcrumb("navigation", "Redirecting to /api/auth/login due to 401 Unauthorized");
      window.location.href = "/api/auth/login";
      return null;
    }
    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.error || `HTTP error ${res.status}`;
      addBreadcrumb("api_call", `GET /api/casino failed: ${errorMsg}`, { status: res.status });
      reportClientError({
        errorType: "API_ERROR",
        message: errorMsg,
        context: `GET /api/casino (HTTP ${res.status})`,
        sourceFile: "frontend/src/lib/api.js:fetchCasinoState",
      });
      throw new Error(errorMsg);
    }

    addBreadcrumb("api_call", "GET /api/casino succeeded", { balance: data.player?.balance, level: data.player?.level });

    // Pre-solve single-use challenge for next request
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
  const actionLabel = `POST /api/casino [${body?.game || "action"}:${body?.action || "play"}]`;
  addBreadcrumb("game_action", actionLabel, { bet: body?.bet, action: body?.action, game: body?.game });
  try {
    // Retrieves a single-use proof token (consumes from queue or solves on demand)
    proof = await getBrowserProof();
  } catch (e) {
    console.warn("Nie udało się pobrać wyzwania antybotowego:", e);
  }

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
    addBreadcrumb("navigation", "Redirecting to /api/auth/login due to 401 Unauthorized");
    window.location.href = "/api/auth/login";
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    addBreadcrumb("api_call", `${actionLabel} JSON parse error (HTTP ${res.status})`);
    if (!isSilent) {
      reportClientError({
        error: e,
        errorType: "API_JSON_PARSE_ERROR",
        message: `Niepoprawna odpowiedź JSON serwera (HTTP ${res.status})`,
        context: `POST /api/casino response JSON parse`,
        game: body?.game || "",
        actionPayload: body,
        sourceFile: "frontend/src/lib/api.js:postCasinoAction",
      });
    }
    throw new Error(`Błąd odpowiedzi serwera (HTTP ${res.status})`);
  }

  // If server returned a fresh challenge in response, queue it for next action immediately
  if (data.next_challenge) {
    queueChallenge(data.next_challenge);
  } else if (data.challenge) {
    queueChallenge(data.challenge);
  }

  // If server returned 403 with a challenge (expired/missing/replayed PoW), retry transparently with new proof
  if (res.status === 403 && data.challenge && retryCount < 2) {
    addBreadcrumb("security", `Received challenge refresh on 403 (attempt ${retryCount + 1}), retrying action transparently`);
    invalidateBrowserProof();
    queueChallenge(data.challenge);
    const nextOptions = isOptionsObj ? { ...optionsOrRetry, _retryCount: retryCount + 1 } : retryCount + 1;
    return postCasinoAction(body, nextOptions);
  }

  if (!res.ok) {
    const errorMsg = data.error || `Błąd wykonywania akcji (HTTP ${res.status})`;
    const lower = errorMsg.toLowerCase();
    const isBenignError =
      lower.includes("niewystarczające saldo") ||
      lower.includes("brak wystarczających środków") ||
      lower.includes("insufficient") ||
      lower.includes("brak aktywnej gry") ||
      lower.includes("masz już aktywną grę") ||
      lower.includes("nieprawidłowa stawka") ||
      lower.includes("captcha") ||
      lower.includes("niepoprawny kod") ||
      lower.includes("nieprawidłowy kod") ||
      lower.includes("kod został już") ||
      lower.includes("wygasł") ||
      body?.action === "solve_captcha" ||
      body?.action === "claim_captcha";
    const isRateLimit = res.status === 429 || lower.includes("rate_limit") || lower.includes("zbyt wiele akcji");

    addBreadcrumb("game_action", `${actionLabel} rejected: ${errorMsg}`, { status: res.status, error: errorMsg });

    if (!isBenignError && !isSilent) {
      reportClientError({
        errorType: isRateLimit ? "RATE_LIMIT" : "API_ERROR",
        message: errorMsg,
        context: `POST /api/casino (HTTP ${res.status})`,
        game: body?.game || "",
        actionPayload: body,
        sourceFile: "frontend/src/lib/api.js:postCasinoAction",
      });
    }
    throw new Error(errorMsg);
  }

  addBreadcrumb("game_action", `${actionLabel} OK`, {
    round_id: data.round?.id,
    payout: data.round?.payout,
    balance: data.balance,
    duration_ms: Math.round(duration),
  });

  return data;
}

export async function fetchHistoryEntries(offset = 0, limit = 10) {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    addBreadcrumb("api_call", `GET /api/casino/history (offset=${offset}, limit=${limit})`);
    const res = await fetch(`/api/casino/history?offset=${offset}&limit=${limit}`, {
      cache: "no-store",
    });
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino/history", duration);

    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      return null;
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Błąd pobierania historii");
    }
    return data;
  } catch (e) {
    const duration = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime;
    recordActionLatency("GET /api/casino/history", duration);
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
