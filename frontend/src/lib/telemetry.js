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
    gpu_info: "",
    cpu_cores: "",
    device_ram: "",
    timezone: "",
    language: "",
    platform: "",
    screen_details: "",
    orientation: "",
    touch_points: 0,
    color_scheme: "",
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

    // 2. Hardware: CPU & RAM
    if (typeof navigator !== "undefined") {
      if (navigator.hardwareConcurrency) {
        diag.cpu_cores = `${navigator.hardwareConcurrency} cores`;
      }
      if (navigator.deviceMemory) {
        diag.device_ram = `~${navigator.deviceMemory} GB`;
      }
      diag.platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
      diag.language = Array.isArray(navigator.languages) ? navigator.languages.join(", ") : (navigator.language || "");
      diag.touch_points = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
    }

    // 3. Hardware: GPU / WebGL
    try {
      if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
          const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            if (renderer) {
              diag.gpu_info = vendor ? `${vendor} (${renderer})` : renderer;
            }
          }
        }
      }
    } catch (_) {
      // Ignore WebGL detection issues
    }

    // 4. Localization & Timezone
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const offsetMinutes = -new Date().getTimezoneOffset();
      const offsetSign = offsetMinutes >= 0 ? "+" : "-";
      const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
      const offsetMins = Math.abs(offsetMinutes) % 60;
      const offsetStr = `UTC${offsetSign}${offsetHours}:${offsetMins < 10 ? "0" : ""}${offsetMins}`;
      diag.timezone = tz ? `${tz} (${offsetStr})` : offsetStr;
    } catch (_) {
      // Ignore
    }

    // 5. Screen & Theme
    if (typeof window !== "undefined") {
      const dpr = window.devicePixelRatio || 1;
      const s = window.screen;
      const colDepth = s ? `${s.colorDepth}-bit` : "";
      diag.screen_details = `${s ? s.width : window.innerWidth}x${s ? s.height : window.innerHeight} (viewport: ${window.innerWidth}x${window.innerHeight}, DPR: ${dpr}${colDepth ? `, ${colDepth}` : ""})`;

      if (s && s.orientation && s.orientation.type) {
        diag.orientation = s.orientation.type;
      }

      if (window.matchMedia) {
        diag.color_scheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "Dark mode" : "Light mode";
      }
    }

    // 6. Network Information API
    if (typeof navigator !== "undefined" && navigator.connection) {
      const conn = navigator.connection;
      const parts = [];
      if (conn.effectiveType) parts.push(conn.effectiveType.toUpperCase());
      if (conn.downlink) parts.push(`${conn.downlink} Mbps`);
      if (conn.rtt) parts.push(`${conn.rtt}ms RTT`);
      if (conn.saveData) parts.push("Data-Saver: ON");
      diag.network_info = parts.join(" • ");
    }

    // 7. JavaScript Heap Memory (Chromium/Edge)
    if (typeof performance !== "undefined" && performance.memory) {
      const mem = performance.memory;
      const usedMB = (mem.usedJSHeapSize / (1024 * 1024)).toFixed(1);
      const totalMB = (mem.totalJSHeapSize / (1024 * 1024)).toFixed(1);
      const limitMB = (mem.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
      diag.memory_mb = `${usedMB}MB used / ${totalMB}MB total (limit: ${limitMB}MB)`;
    }

    // 8. Navigation Timing & Web Vitals
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

let lastTelemetrySent = 0;

/**
 * Sends a full diagnostic/hardware telemetry ping to /api/telemetry/client (debounced to max once per 30s)
 */
export async function sendClientTelemetry(player = null) {
  try {
    const now = Date.now();
    if (now - lastTelemetrySent < 30000) {
      return;
    }
    lastTelemetrySent = now;

    const diag = getClientDiagnostics();
    const payload = {
      user_id: player?.user_id || "",
      nick: player?.nick || "",
      email: player?.email || "",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      gpu_info: diag.gpu_info,
      cpu_cores: diag.cpu_cores,
      device_ram: diag.device_ram,
      screen_details: diag.screen_details,
      orientation: diag.orientation,
      touch_points: diag.touch_points,
      color_scheme: diag.color_scheme,
      timezone: diag.timezone,
      language: diag.language,
      platform: diag.platform,
      network_info: diag.network_info,
      memory_mb: diag.memory_mb,
      navigation_timing: diag.navigation_timing,
      latency_ms: diag.latency_ms,
      page_visibility: diag.page_visibility,
      referrer: diag.referrer,
      session_duration_sec: diag.session_duration_sec,
      last_action: "Odwiedzenie kasyna / Aktywność",
    };

    const payloadStr = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payloadStr], { type: "application/json" });
      navigator.sendBeacon("/api/telemetry/client", blob);
    } else {
      fetch("/api/telemetry/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payloadStr,
        keepalive: true,
      }).catch(() => {});
    }
  } catch (err) {
    // Ignore ping errors
  }
}
