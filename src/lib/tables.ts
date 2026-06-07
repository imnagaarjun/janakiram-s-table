export type TableStatus = "free" | "seated_no_kot" | "occupied" | "bill_requested" | "inactive";

export interface DiningTable {
  id: string;
  code: string;
  section: string | null;
  seats: number;
  status: TableStatus;
  display_order: number;
}

export const STATUS_LABEL: Record<TableStatus, string> = {
  free: "Free",
  seated_no_kot: "Seated",
  occupied: "Running",
  bill_requested: "Bill",
  inactive: "Inactive",
};

// Per Knowledge: 🟩 occupied · 🔵 free · 🟡 seated-no-KOT · 🔴 bill · ⚪ inactive
export const STATUS_CLASSES: Record<TableStatus, string> = {
  occupied: "bg-[var(--status-occupied)] text-white border-transparent",
  free: "bg-[var(--status-free)] text-white border-transparent",
  seated_no_kot: "bg-[var(--status-seated)] text-[var(--warning-foreground)] border-transparent",
  bill_requested: "bg-[var(--status-bill)] text-white border-transparent",
  inactive: "bg-[var(--status-inactive)] text-white border-transparent",
};

// Sort like 11A, 11B ... 20D
export function compareCodes(a: string, b: string): number {
  const ma = /^(\d+)(.*)$/.exec(a);
  const mb = /^(\d+)(.*)$/.exec(b);
  if (ma && mb) {
    const na = parseInt(ma[1], 10);
    const nb = parseInt(mb[1], 10);
    if (na !== nb) return na - nb;
    return ma[2].localeCompare(mb[2]);
  }
  return a.localeCompare(b);
}

export function todayIsoDate(): string {
  // Use Asia/Kolkata business day
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}
