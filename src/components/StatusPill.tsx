import { useOnlineStatus } from "@/hooks/use-online-status";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function StatusPill() {
  const s = useOnlineStatus();
  const label = s === "online" ? "Online" : s === "offline" ? "Offline" : "Syncing";
  const color =
    s === "online"
      ? "bg-success text-success-foreground"
      : s === "offline"
        ? "bg-danger text-danger-foreground"
        : "bg-warning text-warning-foreground";
  const Icon = s === "online" ? Wifi : s === "offline" ? WifiOff : RefreshCw;
  return (
    <div
      className={`fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-sm ${color}`}
      role="status"
      aria-live="polite"
    >
      <Icon className={`h-3.5 w-3.5 ${s === "syncing" ? "animate-spin" : ""}`} />
      <span>{label}</span>
    </div>
  );
}
