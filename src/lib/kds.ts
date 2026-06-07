// KDS timer helpers + audio/vibration utilities.

export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 60000);
}

export type TimerLevel = "fresh" | "warn" | "late";

export function timerLevel(minutes: number): TimerLevel {
  if (minutes >= 15) return "late";
  if (minutes >= 8) return "warn";
  return "fresh";
}

export function timerClasses(level: TimerLevel) {
  switch (level) {
    case "late":
      return { card: "border-red-500 ring-2 ring-red-500/40", chip: "bg-red-600 text-white" };
    case "warn":
      return { card: "border-amber-500 ring-2 ring-amber-500/30", chip: "bg-amber-500 text-white" };
    default:
      return { card: "border-emerald-500", chip: "bg-emerald-600 text-white" };
  }
}

export function fmtElapsed(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.floor((minutes - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- Sound ----
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _ctx;
}

export function beep(opts: { freq?: number; duration?: number; type?: OscillatorType; gain?: number } = {}) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.value = opts.freq ?? 880;
    g.gain.value = opts.gain ?? 0.15;
    osc.connect(g);
    g.connect(ctx.destination);
    const dur = opts.duration ?? 0.18;
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch {
    // ignore
  }
}

export function dingNewTicket() {
  beep({ freq: 880, duration: 0.16 });
  setTimeout(() => beep({ freq: 1320, duration: 0.18 }), 140);
}

export function dingWaiterAlert() {
  beep({ freq: 660, duration: 0.14, type: "triangle" });
  setTimeout(() => beep({ freq: 990, duration: 0.16, type: "triangle" }), 130);
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.([80, 40, 80]);
    } catch {
      // ignore
    }
  }
}
