// High-performance client-side telemetry and breadcrumbs tracker for 2FGT Casino

const MAX_BREADCRUMBS = 30;
const breadcrumbsBuffer = [];
const latencyHistory = [];

/**
 * Adds a breadcrumb event to the in-memory ring buffer.
 * Categories: 'navigation', 'game_action', 'bet_change', 'ws_event', 'api_call', 'ui', 'audio'
 */
export function addBreadcrumb(category, message, data = null) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      category: category || "general",
      message: String(message || ""),
      data: data ? sanitizeData(data) : undefined,
    };

    breadcrumbsBuffer.push(entry);
    if (breadcrumbsBuffer.length > MAX_BREADCRUMBS) {
      breadcrumbsBuffer.shift();
    }
  } catch (err) {
    // Ignore breadcrumb errors
  }
}

/**
 * Returns a copy of the breadcrumb trail.
 */
export function getBreadcrumbs() {
  return [...breadcrumbsBuffer];
}

/**
 * Records an API / action round-trip time in milliseconds.
 */
export function recordActionLatency(name, durationMs) {
  try {
    if (typeof durationMs === "number" && !isNaN(durationMs)) {
      latencyHistory.push({ name, durationMs, time: Date.now() });
      if (latencyHistory.length > 20) {
        latencyHistory.shift();
      }
    }
  } catch (err) {
    // Ignore
  }
}

/**
 * Calculates average latency of recent API operations.
 */
export function getAverageLatency() {
  if (latencyHistory.length === 0) return 0;
  const sum = latencyHistory.reduce((acc, curr) => acc + curr.durationMs, 0);
  return Math.round((sum / latencyHistory.length) * 10) / 10;
}

/**
 * Extracts comprehensive client hardware, performance, network, localization, and memory diagnostics.
 */
export function getClientDiagnostics() {
  const diag = {
    network_info: "",
    memory_mb: "",
    navigation_timing: "",
    latency_ms: getAverageLatency(),
    page_visibility: "",
    referrer: "",
    session_duration_sec: 0,
  };

  try {
    // 1. Session & Timing
    if (typeof performance !== "undefined") {
      diag.session_duration_sec = Math.round(performance.now() / 1000);
    }
    if (typeof document !== "undefined") {
      diag.page_visibility = document.visibilityState || "";
      diag.referrer = document.referrer || "";
    }

    // 2. Network Information API
    if (typeof navigator !== "undefined" && navigator.connection) {
      const conn = navigator.connection;
      const parts = [];
      if (conn.effectiveType) parts.push(conn.effectiveType.toUpperCase());
      if (conn.downlink) parts.push(`${conn.downlink} Mbps`);
      if (conn.rtt) parts.push(`${conn.rtt}ms RTT`);
      if (conn.saveData) parts.push("Data-Saver: ON");
      diag.network_info = parts.join(" • ");
    }

    // 3. JavaScript Heap Memory
    if (typeof performance !== "undefined" && performance.memory) {
      const mem = performance.memory;
      const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const totalMB = (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
      const limitMB = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
      diag.memory_mb = `${usedMB}MB used / ${totalMB}MB total (limit: ${limitMB}MB)`;
    }

    // 4. Navigation Timing
    if (typeof performance !== "undefined" && performance.getEntriesByType) {
      const navEntries = performance.getEntriesByType("navigation");
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        const ttfb = Math.round(nav.responseStart - nav.requestStart);
        const domReady = Math.round(nav.domContentLoadedEventEnd);
        const load = Math.round(nav.loadEventEnd || nav.duration);
        diag.navigation_timing = `TTFB: ${ttfb}ms • DOM: ${domReady}ms • Total: ${load}ms`;
      }
    }
  } catch (err) {
    // Ignore diagnostic extraction errors
  }

  return diag;
}

function sanitizeData(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") return data;
  try {
    // Clone and sanitize nested sensitive info if any
    const copy = Array.isArray(data) ? [...data] : { ...data };
    for (const key of Object.keys(copy)) {
      if (/token|password|secret|key/i.test(key)) {
        copy[key] = "[REDACTED]";
      }
    }
    return copy;
  } catch (err) {
    return "[Complex Object]";
  }
}

/**
 * Client telemetry pings removed.
 */
export async function sendClientTelemetry() {
  // No-op
}

