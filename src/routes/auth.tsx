import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Delete, LogIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { pinLogin } from "@/lib/auth-pin.functions";
import { ensureSeed } from "@/lib/seed.functions";
import { StatusPill } from "@/components/StatusPill";
import { AdminOtpDialog } from "@/components/auth/AdminOtpDialog";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { userId, loading, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [seedHint, setSeedHint] = useState<string | null>(null);
  const [otpState, setOtpState] = useState<{ userId: string; contactEmail: string | null } | null>(null);
  const callPinLogin = useServerFn(pinLogin);
  const callSeed = useServerFn(ensureSeed);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!loading && userId && !otpState) navigate({ to: "/", replace: true });
  }, [loading, userId, otpState, navigate]);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    callSeed()
      .then((r) => {
        if (r.seeded) setSeedHint("First-time setup complete. Default Admin PIN: 12345678");
      })
      .catch((e) => console.error("seed failed", e));
  }, [callSeed]);

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await callPinLogin({ data: { pin: value } });
      const { error } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: "magiclink" });
      if (error) throw error;
      await refresh();

      if (result.needsOtp && result.userId) {
        setOtpState({ userId: result.userId, contactEmail: result.contactEmail });
        return;
      }

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
    const next = (pin + d).slice(0, 8);
    setPin(next);
    if (next.length === 8) submit(next);
  }

  function back() {
    if (busy) return;
    setPin((p) => p.slice(0, -1));
  }

  const pinDots = Math.max(4, pin.length + (pin.length < 8 ? 0 : 0));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <StatusPill />

      {otpState && (
        <AdminOtpDialog
          userId={otpState.userId}
          contactEmail={otpState.contactEmail}
          onVerified={() => {
            setOtpState(null);
            toast.success("Signed in");
            navigate({ to: "/", replace: true });
          }}
          onCancel={async () => {
            setOtpState(null);
            await signOut();
            setPin("");
          }}
        />
      )}

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Hotel Sri Janakiram</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your PIN</p>
        </div>

        {/* PIN dots — 4 to 8 */}
        <div className="flex justify-center gap-2 mb-8" aria-label="PIN entry">
          {Array.from({ length: Math.max(4, pin.length === 8 ? 8 : pin.length < 4 ? 4 : pin.length) }, (_, i) => (
            <div
              key={i}
              className={`h-12 w-10 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
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
            onClick={back}
            disabled={busy || pin.length === 0}
            className="h-16 rounded-xl bg-surface border border-border flex items-center justify-center text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-50"
            aria-label="Delete"
          >
            <Delete className="h-6 w-6" />
          </button>
          <button
            onClick={() => press("0")}
            disabled={busy}
            className="h-16 rounded-xl bg-surface border border-border text-2xl font-semibold text-foreground hover:bg-accent active:scale-95 transition disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={() => pin.length >= 4 && submit(pin)}
            disabled={busy || pin.length < 4}
            className="h-16 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition disabled:opacity-40"
            aria-label="Login"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Staff: 4-digit PIN · Admin: 8-digit PIN
        </p>

        {seedHint && (
          <div className="mt-4 text-center text-xs text-muted-foreground bg-accent rounded-lg p-3">
            {seedHint}
          </div>
        )}
      </div>
    </div>
  );
}
