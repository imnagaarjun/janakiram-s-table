import { useEffect, useState } from "react";

export type ConnState = "online" | "offline" | "syncing";

export function useOnlineStatus(): ConnState {
  const [state, setState] = useState<ConnState>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  );
  useEffect(() => {
    const onUp = () => {
      setState("syncing");
      // brief syncing flash, then online
      const t = setTimeout(() => setState("online"), 600);
      return () => clearTimeout(t);
    };
    const onDown = () => setState("offline");
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);
  return state;
}
