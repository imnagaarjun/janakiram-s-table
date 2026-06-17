import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function strength(pw: string) {
  const checks = [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^A-Za-z0-9]/.test(pw)];
  return checks.filter(Boolean).length; // 0-4
}

const STRENGTH_LABEL = ["Too short", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["bg-danger", "bg-danger", "bg-warning", "bg-warning", "bg-success"];

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  // Supabase rewrites the recovery link to send the user here with a session already set.
  // Wait for PASSWORD_RECOVERY event before allowing the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // If already in a recovery session (page reload), check immediately
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const pw = password;
  const sc = strength(pw);
  const matches = pw === confirm && pw.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || sc < 2) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated — please sign in");
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Hotel Sri Janakiram</h1>
          <p className="text-sm text-muted-foreground mt-1">Set a new password</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="block mb-1.5">New password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${sc >= i ? STRENGTH_COLOR[sc] : "bg-border"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{STRENGTH_LABEL[sc]} — use 8+ chars, uppercase, numbers</p>
              </div>
            )}
          </div>

          <div>
            <Label className="block mb-1.5">Confirm password</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="pr-10"
              />
              {confirm.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {matches
                    ? <CheckCircle2 className="h-4 w-4 text-success" />
                    : <XCircle className="h-4 w-4 text-danger" />}
                </span>
              )}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full min-h-[44px]"
            disabled={busy || !matches || sc < 2}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Update password
          </Button>
        </form>
      </div>
    </div>
  );
}
