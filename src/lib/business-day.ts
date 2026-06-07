// Client-side mirror of public.business_day_start (Asia/Kolkata).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function businessDayStart(): Date {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();
  return new Date(Date.UTC(y, m, d) - IST_OFFSET_MS);
}

export function formatBusinessDay(): string {
  const start = businessDayStart();
  return start.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
