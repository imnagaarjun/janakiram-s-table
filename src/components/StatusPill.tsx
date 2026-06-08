import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/use-online-status";

function formatIST(d: Date): string {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

interface StatusPillProps {
  fixed?: boolean;
}

export function StatusPill({ fixed = true }: StatusPillProps) {
  const s = useOnlineStatus();
  const [now, setNow] = useState<string>(() => formatIST(new Date()));

  useEffect(() => {
    const tick = () => setNow(formatIST(new Date()));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  const color =
    s === "online"
      ? "bg-success"
      : s === "offline"
        ? "bg-danger"
        : "bg-warning animate-pulse";
  const label = s === "online" ? "Online" : s === "offline" ? "Offline" : "Syncing";

  return (
    <div
      className={`${fixed ? "fixed top-2 right-2 z-50" : ""} flex items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 ring-1 ring-border shadow-sm pointer-events-none backdrop-blur`}
      role="status"
      aria-label={`${label} · ${now} IST`}
      title={`${label} · ${now} IST`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-[11px] font-semibold tabular-nums text-foreground leading-none">
        {now} <span className="text-muted-foreground font-normal">IST</span>
      </span>
    </div>
  );
}
