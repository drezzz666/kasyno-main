import { getBreadcrumbs, getClientDiagnostics } from "./telemetry.js";

const recentErrors = new Map();

function getClientEnv() {
  return {
    url: typeof window !== "undefined" ? window.location.href : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    screen:
      typeof window !== "undefined"
        ? `${window.innerWidth}x${window.innerHeight} (ratio: ${window.devicePixelRatio || 1})`
        : "",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Dispatches a rich error report to the backend error logging endpoint (/api/report-error)
 */
export function reportClientError({
  error = null,
  errorType = "UNHANDLED_EXCEPTION",
  message = "",
  stack = "",
  sourceFile = "",
  context = "",
  game = "",
  actionPayload = null,
  componentStack = "",
} = {}) {
  try {
    const errorMsg =
      message || (error && (error.message || String(error))) || "Nieznany błąd";
    const errorStack =
      stack || (error && error.stack) || "";
    
    // Ignore routine client-side offline drops
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    const lower = `${errorMsg} ${context}`.toLowerCase();
    // Ignore routine user balance / insufficient funds errors
    if (
      lower.includes("niewystarczające saldo") ||
      lower.includes("brak wystarczających środków") ||
      lower.includes("insufficient_funds") ||
      lower.includes("insufficient_balance") ||
      lower.includes("niewystarczające środki") ||
      lower.includes("brak środków")
    ) {
      return;
    }

    // Deduplication check: ignore exact same error occurring within 5 seconds
    const key = `${errorType}:${sourceFile}:${errorMsg}`;
    const now = Date.now();
    const lastSent = recentErrors.get(key);
    if (lastSent && now - lastSent < 5000) {
      return;
    }
    recentErrors.set(key, now);

    // Clean up old entries
    for (const [k, time] of recentErrors.entries()) {
      if (now - time > 30000) recentErrors.delete(k);
    }

    const env = getClientEnv();
    const diag = getClientDiagnostics();
    const breadcrumbs = getBreadcrumbs();

    const payload = {
      error_type: errorType,
      message: errorMsg,
      stack: errorStack,
      source_file: sourceFile,
      context,
      game,
      action_payload: actionPayload,
      component_stack: componentStack,
      breadcrumbs,
      network_info: diag.network_info,
      memory_mb: diag.memory_mb,
      navigation_timing: diag.navigation_timing,
      latency_ms: diag.latency_ms,
      url: env.url,
      user_agent: env.user_agent,
      screen: env.screen,
      timestamp: env.timestamp,
    };

    const payloadStr = JSON.stringify(payload);

    // Send via sendBeacon for maximum reliability, fallback to fetch
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payloadStr], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/report-error", blob);
      if (!sent) {
        fetch("/api/report-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payloadStr,
          keepalive: true,
        }).catch(() => {});
      }
    } else {
      fetch("/api/report-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadStr,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("[Reporter] Failed to send error report:", err);
  }
}

/**
 * Initializes global browser error listeners for window.onerror and unhandled promise rejections.
 */
export function initGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  // 1. Uncaught runtime JavaScript exceptions
  window.addEventListener("error", (event) => {
    // Ignore benign browser extension or resize observer errors
    if (
      event.message &&
      (event.message.includes("ResizeObserver") ||
        event.message.includes("Script error.") ||
        event.filename?.startsWith("chrome-extension://"))
    ) {
      return;
    }

    const source = event.filename
      ? `${event.filename.split("/").slice(-2).join("/")}:${event.lineno}:${event.colno}`
      : "";

    reportClientError({
      error: event.error,
      errorType: "UNHANDLED_EXCEPTION",
      message: event.message || "Uncaught JS Exception",
      stack: event.error?.stack || "",
      sourceFile: source,
      context: "Global window.onerror",
    });
  });

  // 2. Unhandled Promise Rejections (e.g. async fetch / audio / animation failures)
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
        ? reason
        : JSON.stringify(reason);

    reportClientError({
      error: reason instanceof Error ? reason : null,
      errorType: "PROMISE_REJECTION",
      message: msg || "Unhandled Promise Rejection",
      stack: reason instanceof Error ? reason.stack : "",
      context: "Global window.onunhandledrejection",
    });
  });
}
