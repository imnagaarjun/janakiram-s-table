import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { requestAdminOtp, verifyAdminOtp } from "@/lib/admin-otp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  userId: string;
  contactEmail: string | null;
  onVerified: () => void;
  onCancel: () => void;
}

export function AdminOtpDialog({ userId, contactEmail, onVerified, onCancel }: Props) {
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const callRequest = useServerFn(requestAdminOtp);
  const callVerify = useServerFn(verifyAdminOtp);
  const inputRef = useRef<HTMLInputElement>(null);

  async function sendOtp() {
    if (!contactEmail) {
      toast.error("No contact email set. Go to Settings → Users to add one.");
      return;
    }
    setSending(true);
    try {
      await callRequest({ data: { userId, contactEmail } });
      setSent(true);
      toast.success(`OTP sent to ${contactEmail}`);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send OTP");
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (otp.length !== 6) return;
    setVerifying(true);
    try {
      await callVerify({ data: { userId, otp } });
      toast.success("Identity verified");
      onVerified();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid OTP");
      setOtp("");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="text-lg font-bold">Admin verification required</h2>
          <p className="text-sm text-muted-foreground">
            {contactEmail
              ? `Your session has been inactive for over 12 hours. Enter the 6-digit OTP sent to ${contactEmail}.`
              : "No contact email configured. Please set one in Settings → Users before you can receive OTPs."}
          </p>
        </div>

        {!sent && contactEmail && (
          <Button onClick={sendOtp} disabled={sending} className="w-full min-h-[48px]">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
            Send OTP to email
          </Button>
        )}

        {sent && (
          <div className="space-y-3">
            <Input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              className="text-center text-2xl tracking-[0.5em] font-mono h-14"
            />
            <Button onClick={verify} disabled={otp.length !== 6 || verifying} className="w-full min-h-[48px]">
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Verify
            </Button>
            <button
              onClick={sendOtp}
              disabled={sending}
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1"
            >
              Resend OTP
            </button>
          </div>
        )}

        <Button variant="outline" onClick={onCancel} className="w-full min-h-[44px]">
          Sign out
        </Button>
      </div>
    </div>
  );
}
