import { useEffect, useState } from "react";

export type DeviceMode = "phone" | "tablet";

function detect(): DeviceMode {
  if (typeof window === "undefined") return "phone";
  // Tablet: width >= 768 (md breakpoint). Otherwise phone.
  return window.innerWidth >= 768 ? "tablet" : "phone";
}

export function useDeviceMode(): DeviceMode {
  const [mode, setMode] = useState<DeviceMode>(detect);
  useEffect(() => {
    const onResize = () => setMode(detect());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return mode;
}
