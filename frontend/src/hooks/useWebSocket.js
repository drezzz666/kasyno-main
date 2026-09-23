import { useState, useEffect, useRef } from "react";
import { wsClient } from "../lib/wsClient.js";

export function useWebSocket({ onBalanceUpdate, onGlobalWin }) {
  const callbacksRef = useRef({ onBalanceUpdate, onGlobalWin });
  const [connected, setConnected] = useState(wsClient.isReady());

  useEffect(() => {
    callbacksRef.current = { onBalanceUpdate, onGlobalWin };
  }, [onBalanceUpdate, onGlobalWin]);

  useEffect(() => {
    wsClient.connect();
    setConnected(wsClient.isReady());

    const unsubscribe = wsClient.subscribe((data) => {
      if (data.type === "connection_change") {
        setConnected(data.connected);
      } else if (data.type === "balance_update" && callbacksRef.current.onBalanceUpdate) {
        callbacksRef.current.onBalanceUpdate(data.payload);
      } else if (data.type === "global_win" && callbacksRef.current.onGlobalWin) {
        callbacksRef.current.onGlobalWin(data.payload);
      } else if (data.type === "round_settled") {
        window.dispatchEvent(new CustomEvent("casino:round_settled", { detail: data.payload }));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { connected };
}
