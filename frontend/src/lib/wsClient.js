import { addBreadcrumb } from "./telemetry.js";

class WSClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.connectTimeoutTimer = null;
    this.heartbeatInterval = null;
    this.heartbeatWatchdog = null;
    this.pendingRequests = new Map();
    this.listeners = new Set();
    this.isConnected = false;
    this.reqCounter = 0;
    this.reconnectAttempts = 0;
    this.lifecycleBound = false;

    this.bindLifecycleEvents();
  }

  bindLifecycleEvents() {
    if (typeof window === "undefined" || this.lifecycleBound) return;
    this.lifecycleBound = true;

    // Fast reconnect when browser goes online
    window.addEventListener("online", () => {
      addBreadcrumb("network", "Browser back online, triggering instant WS reconnect");
      this.reconnectNow();
    });

    // Reconnect when tab becomes active / device wakes up from sleep
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (!this.isReady()) {
          addBreadcrumb("network", "Tab became visible and WS is not ready, reconnecting");
          this.reconnectNow();
        }
      }
    });

    // Reconnect when window gets focused
    window.addEventListener("focus", () => {
      if (!this.isReady()) {
        this.reconnectNow();
      }
    });

    // Reconnect when page is shown (e.g. back-forward cache restore)
    window.addEventListener("pageshow", () => {
      if (!this.isReady()) {
        this.reconnectNow();
      }
    });
  }

  connect() {
    // If already fully connected and open, nothing to do
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // If currently connecting and watchdog is running, avoid duplicate instance
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      if (this.connectTimeoutTimer) return;
    }

    // Clean up any stale or half-open socket
    this.cleanupSocket(true);

    if (typeof window === "undefined") return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      // Connection watchdog: if connection does not open within 3.5s, force close and retry
      this.clearConnectTimeout();
      this.connectTimeoutTimer = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          addBreadcrumb("ws_event", "WebSocket connection attempt timed out after 3500ms");
          this.handleDisconnect(false);
        }
      }, 3500);

      this.ws.onopen = () => {
        this.clearConnectTimeout();
        this.isConnected = true;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        this.startHeartbeat();
        addBreadcrumb("ws_event", "WebSocket client connected");
        this.notifyListeners({ type: "connection_change", connected: true });
      };

      this.ws.onmessage = (event) => {
        this.resetHeartbeatWatchdog();
        if (!event.data) return;

        const raw = typeof event.data === "string" ? event.data : "";
        const lines = raw.includes("\n") ? raw.split("\n") : [raw];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            this.handleIncomingMessage(data);
          } catch {
            // Ignore non-JSON or malformed lines
          }
        }
      };

      this.ws.onclose = () => {
        this.handleDisconnect(true);
      };

      this.ws.onerror = () => {
        this.handleDisconnect(false);
      };
    } catch (err) {
      addBreadcrumb("ws_event", `WebSocket instantiation error: ${err?.message || err}`);
      this.handleDisconnect(false);
    }
  }

  handleDisconnect(wasClean) {
    this.clearConnectTimeout();
    this.stopHeartbeat();

    const wasConnected = this.isConnected;
    this.isConnected = false;

    if (wasConnected) {
      this.notifyListeners({ type: "connection_change", connected: false });
    }

    this.rejectAllPending(new Error("Połączenie WebSocket zostało przerwane"));
    this.cleanupSocket(true);
    this.scheduleReconnect();
  }

  scheduleReconnect(immediate = false) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    let delay;
    if (immediate) {
      delay = 0;
    } else {
      const attempt = this.reconnectAttempts;
      if (attempt === 0) {
        // Instant first auto-retry: 200ms - 350ms
        delay = 200 + Math.floor(Math.random() * 150);
      } else if (attempt === 1) {
        // Second auto-retry: 500ms - 700ms
        delay = 500 + Math.floor(Math.random() * 200);
      } else if (attempt === 2) {
        // Third auto-retry: 900ms - 1200ms
        delay = 900 + Math.floor(Math.random() * 300);
      } else {
        // Continuous auto-retry: max 1500ms + small jitter (fast and self-healing)
        delay = 1400 + Math.floor(Math.random() * 300);
      }
      this.reconnectAttempts++;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  reconnectNow() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.cleanupSocket(true);
    this.isConnected = false;
    this.connect();
  }

  clearConnectTimeout() {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    // Send lightweight application ping every 10 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.isReady()) {
        try {
          this.ws.send(JSON.stringify({ type: "ping", id: `ping_${Date.now()}` }));
          // If no pong or data received in 5s, reconnect
          this.resetHeartbeatWatchdog();
          this.heartbeatWatchdog = setTimeout(() => {
            addBreadcrumb("ws_event", "WebSocket heartbeat timeout - reconnecting");
            this.handleDisconnect(false);
          }, 5000);
        } catch {
          this.handleDisconnect(false);
        }
      }
    }, 10000);
  }

  resetHeartbeatWatchdog() {
    if (this.heartbeatWatchdog) {
      clearTimeout(this.heartbeatWatchdog);
      this.heartbeatWatchdog = null;
    }
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.resetHeartbeatWatchdog();
  }

  cleanupSocket(suppressEvents = true) {
    this.clearConnectTimeout();
    if (this.ws) {
      if (suppressEvents) {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
      }
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // Ignore errors closing stale socket
      }
      this.ws = null;
    }
  }

  handleIncomingMessage(data) {
    if (!data) return;

    // Ignore heartbeat pong messages from triggering game listeners
    if (data.type === "pong") {
      return;
    }

    // 1. Handle RPC responses with matching request ID
    if (data.type === "response" && data.id) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        this.pendingRequests.delete(data.id);
        clearTimeout(pending.timer);
        if (data.status >= 200 && data.status < 300) {
          pending.resolve(data.data);
        } else {
          const errorMsg = data.data?.error || `Błąd serwera (HTTP ${data.status})`;
          const err = new Error(errorMsg);
          err.status = data.status;
          err.data = data.data;
          pending.reject(err);
        }
        return;
      }
    }

    // 2. Handle Server-to-Client broadcast and event pushes
    this.notifyListeners(data);
  }

  isReady() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  sendRequest(type, payload = {}, proof = "", timeoutMs = 12000) {
    if (!this.isReady()) {
      return Promise.reject(new Error("WS_NOT_CONNECTED"));
    }

    const id = `req_${Date.now()}_${++this.reqCounter}`;
    const message = {
      type,
      id,
      proof: proof || undefined,
      payload: type === "action" ? payload : undefined,
      offset: payload?.offset,
      limit: payload?.limit,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Przekroczono czas oczekiwania na odpowiedź"));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.ws.send(JSON.stringify(message));
      } catch (e) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(e);
      }
    });
  }

  rejectAllPending(err) {
    for (const [, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error("Error in WS subscriber:", err);
      }
    }
  }
}

export const wsClient = new WSClient();
