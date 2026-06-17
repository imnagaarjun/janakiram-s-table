import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureSeed } from "@/lib/seed.functions";
import { StatusPill } from "@/components/StatusPill";
import { AdminOtpDialog } from "@/components/auth/AdminOtpDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { userId, loading, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seedHint, setSeedHint] = useState<string | null>(null);
  const [otpState, setOtpState] = useState<{ userId: string; contactEmail: string | null } | null>(null);
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
        if (r.seeded) setSeedHint("First-time setup complete. Admin email: imnagaarjun@gmail.com · Password: Admin@12345678");
      })
      .catch((e) => console.error("seed failed", e));
  }, [callSeed]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      await refresh();

      // Check if admin OTP is needed (admin + inactive 12h+)
      const userId = data.user?.id;
      if (userId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("contact_email,last_active_at")
          .eq("id", userId)
          .single();
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        const isAdmin = (rolesData ?? []).some((r: { role: string }) => r.role === "admin");
        const lastActive = prof?.last_active_at ? new Date(prof.last_active_at) : null;
        const inactiveTooLong = !lastActive || Date.now() - lastActive.getTime() > 12 * 60 * 60 * 1000;
        if (isAdmin && inactiveTooLong) {
          setOtpState({ userId, contactEmail: prof?.contact_email ?? null });
          setBusy(false);
          return;
        }
      }

      toast.success("Signed in");
      navigate({ to: "/", replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      // Normalise Supabase error message for users
      toast.error(msg.includes("Invalid login") ? "Invalid email or password" : msg);
    } finally {
      setBusy(false);
    }
  }

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
            setEmail("");
            setPassword("");
          }}
        />
      )}

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Hotel Sri Janakiram</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="block mb-1.5">Email</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>

          <div>
            <Label className="block mb-1.5">Password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/auth/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full min-h-[48px] text-base" disabled={busy || !email.trim() || !password}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
            Sign in
          </Button>
        </form>

        {seedHint && (
          <div className="mt-6 text-center text-xs text-muted-foreground bg-accent rounded-lg p-3">
            {seedHint}
          </div>
        )}
      </div>
    </div>
  );
}
