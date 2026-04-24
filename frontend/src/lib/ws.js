import { useEffect, useRef } from "react";
import { getWsUrl } from "./api";

export function useWebSocket(onMessage) {
  const ref = useRef(null);
  // Keep the latest callback in a ref so the effect below doesn't need to
  // re-subscribe every render. This avoids the "stale closure" problem where
  // handlers receive outdated state (e.g. the previously selected chat).
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    const url = getWsUrl();
    if (!url) return;
    let stopped = false;
    let retry;
    const connect = () => {
      const ws = new WebSocket(url);
      ref.current = ws;
      ws.onopen = () => {
        ws.send("ping");
      };
      ws.onmessage = (e) => {
        try { cbRef.current?.(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      ws.onclose = () => {
        if (!stopped) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ref.current?.close();
    };
  }, []);
  return ref;
}
