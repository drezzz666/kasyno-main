import { getBrowserProof, invalidateBrowserProof, queueChallenge } from "./challenge";
import { reportClientError } from "./reporter";

export async function fetchCasinoState() {
  try {
    const res = await fetch("/api/casino", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      return null;
    }
    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.error || `HTTP error ${res.status}`;
      reportClientError({
        errorType: "API_ERROR",
        message: errorMsg,
        context: `GET /api/casino (HTTP ${res.status})`,
        sourceFile: "frontend/src/lib/api.js:fetchCasinoState",
      });
      throw new Error(errorMsg);
    }

    // Pre-solve single-use challenge for next request
    if (data.challenge) {
      queueChallenge(data.challenge);
    }

    return data;
  } catch (e) {
    if (e.message && !e.message.includes("401")) {
      reportClientError({
        error: e,
        errorType: "API_NETWORK_ERROR",
        message: e.message || "Błąd pobierania stanu kasyna",
        context: "GET /api/casino",
        sourceFile: "frontend/src/lib/api.js:fetchCasinoState",
      });
    }
    throw e;
  }
}

export async function postCasinoAction(body, retryCount = 0) {
  let proof = "";
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
    reportClientError({
      error: e,
      errorType: "API_NETWORK_ERROR",
      message: e.message || "Brak połączenia z serwerem gier",
      context: `POST /api/casino (Network Error)`,
      game: body?.game || "",
      actionPayload: body,
      sourceFile: "frontend/src/lib/api.js:postCasinoAction",
    });
    throw e;
  }

  if (res.status === 401) {
    window.location.href = "/api/auth/login";
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    reportClientError({
      error: e,
      errorType: "API_JSON_PARSE_ERROR",
      message: `Niepoprawna odpowiedź JSON serwera (HTTP ${res.status})`,
      context: `POST /api/casino response JSON parse`,
      game: body?.game || "",
      actionPayload: body,
      sourceFile: "frontend/src/lib/api.js:postCasinoAction",
    });
    throw new Error(`Błąd odpowiedzi serwera (HTTP ${res.status})`);
  }

  // If server returned a fresh challenge in response, queue it for next action immediately
  if (data.next_challenge) {
    queueChallenge(data.next_challenge);
  } else if (data.challenge) {
    queueChallenge(data.challenge);
  }

  // If server returned 403 with a challenge (expired/missing/replayed), retry transparently
  if (res.status === 403 && data.challenge && retryCount < 2) {
    invalidateBrowserProof();
    queueChallenge(data.challenge);
    return postCasinoAction(body, retryCount + 1);
  }

  if (!res.ok) {
    const errorMsg = data.error || `Błąd wykonywania akcji (HTTP ${res.status})`;
    reportClientError({
      errorType: "API_ERROR",
      message: errorMsg,
      context: `POST /api/casino (HTTP ${res.status})`,
      game: body?.game || "",
      actionPayload: body,
      sourceFile: "frontend/src/lib/api.js:postCasinoAction",
    });
    throw new Error(errorMsg);
  }

  return data;
}

export async function fetchHistoryEntries(offset = 0, limit = 10) {
  try {
    const res = await fetch(`/api/casino/history?offset=${offset}&limit=${limit}`, {
      cache: "no-store",
    });
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
