import { useOnlineStatus } from "@/hooks/use-online-status";

export function StatusPill() {
  const s = useOnlineStatus();
  const color =
    s === "online"
      ? "bg-success"
      : s === "offline"
        ? "bg-danger"
        : "bg-warning animate-pulse";
  const label = s === "online" ? "Online" : s === "offline" ? "Offline" : "Syncing";
  return (
    <div
      className="fixed top-2 right-2 z-50 h-3 w-3 rounded-full ring-2 ring-background shadow-sm pointer-events-none"
      role="status"
      aria-label={label}
      title={label}
    >
      <div className={`h-full w-full rounded-full ${color}`} />
    </div>
  );
}
