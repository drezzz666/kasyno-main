import { useState, useEffect, useRef } from "react";
import { addBreadcrumb } from "../lib/telemetry.js";

export function useWebSocket({ onBalanceUpdate, onGlobalWin }) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const callbacksRef = useRef({ onBalanceUpdate, onGlobalWin });
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    callbacksRef.current = { onBalanceUpdate, onGlobalWin };
  }, [onBalanceUpdate, onGlobalWin]);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!unmounted) {
            setConnected(true);
            addBreadcrumb("ws_event", "WebSocket connected");
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            addBreadcrumb("ws_event", `WS message received: ${data.type}`, data.type === "global_win" ? { nick: data.payload?.nick, game: data.payload?.game, payout: data.payload?.payout } : null);
            if (data.type === "balance_update" && callbacksRef.current.onBalanceUpdate) {
              callbacksRef.current.onBalanceUpdate(data.payload);
            } else if (data.type === "global_win" && callbacksRef.current.onGlobalWin) {
              callbacksRef.current.onGlobalWin(data.payload);
            } else if (data.type === "round_settled") {
              window.dispatchEvent(new CustomEvent("casino:round_settled", { detail: data.payload }));
              if (callbacksRef.current.onRoundSettled) {
                callbacksRef.current.onRoundSettled(data.payload);
              }
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!unmounted) {
            setConnected(false);
            addBreadcrumb("ws_event", "WebSocket disconnected, scheduling reconnect");
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          if (!unmounted) {
            setConnected(false);
            addBreadcrumb("ws_event", "WebSocket transport error");
          }
          try {
            ws.close();
          } catch {}
        };
      } catch {
        if (!unmounted) {
          setConnected(false);
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { wsRef, connected };
}

