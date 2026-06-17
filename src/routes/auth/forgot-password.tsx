import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    // Always show "check your email" — prevents email enumeration
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Hotel Sri Janakiram</h1>
          <p className="text-sm text-muted-foreground mt-1">Reset your password</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center space-y-3">
            <Mail className="h-10 w-10 text-primary mx-auto" />
            <p className="font-semibold">Check your email</p>
            <p className="text-sm text-muted-foreground">
              If that address is registered, we've sent a password reset link. Check your inbox and spam folder.
            </p>
            <Link to="/auth" className="block mt-4">
              <Button variant="outline" className="w-full">Back to login</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="block mb-1.5">Email address</Label>
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
            <Button type="submit" className="w-full min-h-[44px]" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send reset link
            </Button>
            <Link to="/auth" className="block">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to login
              </Button>
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
