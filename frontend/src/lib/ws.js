import { useEffect, useRef } from "react";
import { getWsUrl } from "./api";

export function useWebSocket(onMessage) {
  const ref = useRef(null);
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
        try { onMessage?.(JSON.parse(e.data)); } catch {}
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
