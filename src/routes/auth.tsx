import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Delete } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { pinLogin } from "@/lib/auth-pin.functions";
import { ensureSeed } from "@/lib/seed.functions";
import { StatusPill } from "@/components/StatusPill";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { userId, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [seedHint, setSeedHint] = useState<string | null>(null);
  const callPinLogin = useServerFn(pinLogin);
  const callSeed = useServerFn(ensureSeed);
  const seededRef = useRef(false);

  // Redirect when authenticated
  useEffect(() => {
    if (!loading && userId) navigate({ to: "/", replace: true });
  }, [loading, userId, navigate]);

  // Ensure initial seed exists (idempotent)
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    callSeed()
      .then((r) => {
        if (r.seeded) setSeedHint("First-time setup complete. Default Admin PIN: 1234");
      })
      .catch((e) => console.error("seed failed", e));
  }, [callSeed]);

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { token_hash } = await callPinLogin({ data: { pin: value } });
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
      if (error) throw error;
      await refresh();
      toast.success("Signed in");
      navigate({ to: "/", replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      toast.error(msg);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function press(d: string) {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  }
  function back() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <StatusPill />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Hotel Sri Janakiram</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your 4-digit PIN</p>
        </div>

        <div className="flex justify-center gap-3 mb-8" aria-label="PIN entry">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-14 w-12 rounded-xl border-2 flex items-center justify-center text-2xl font-bold ${
                pin.length > i
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-surface text-muted-foreground"
              }`}
            >
              {pin.length > i ? "•" : ""}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => press(d)}
              disabled={busy}
              className="h-16 rounded-xl bg-surface border border-border text-2xl font-semibold text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            disabled
            className="h-16 rounded-xl invisible"
            aria-hidden
          />
          <button
            onClick={() => press("0")}
            disabled={busy}
            className="h-16 rounded-xl bg-surface border border-border text-2xl font-semibold text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={back}
            disabled={busy || pin.length === 0}
            className="h-16 rounded-xl bg-surface border border-border flex items-center justify-center text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-50"
            aria-label="Delete"
          >
            <Delete className="h-6 w-6" />
          </button>
        </div>

        {busy && (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in…
          </div>
        )}
        {seedHint && (
          <div className="mt-6 text-center text-xs text-muted-foreground bg-accent rounded-lg p-3">
            {seedHint}
          </div>
        )}
      </div>
    </div>
  );
}
