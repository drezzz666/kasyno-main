import { addBreadcrumb } from "./telemetry.js";

class WSClient {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.pendingRequests = new Map();
    this.listeners = new Set();
    this.isConnected = false;
    this.reqCounter = 0;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        addBreadcrumb("ws_event", "WebSocket client connected");
        this.notifyListeners({ type: "connection_change", connected: true });
      };

      this.ws.onmessage = (event) => {
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
        this.isConnected = false;
        this.notifyListeners({ type: "connection_change", connected: false });
        this.rejectAllPending(new Error("Połączenie WebSocket zostało przerwane"));
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 2500);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        try {
          this.ws.close();
        } catch {}
      };
    } catch {
      this.isConnected = false;
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 4000);
      }
    }
  }

  handleIncomingMessage(data) {
    if (!data) return;

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
    return this.ws && this.ws.readyState === WebSocket.OPEN;
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
