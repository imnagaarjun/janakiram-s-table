import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const RequestSchema = z.object({ userId: z.string().uuid(), contactEmail: z.string().email() });
const VerifySchema = z.object({ userId: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) });

export const requestAdminOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RequestSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: code, error } = await supabaseAdmin.rpc("request_admin_otp", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);

    // Send email via Resend (set RESEND_API_KEY env var)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Hotel Sri Janakiram POS <noreply@hotelsrijanakiram.com>",
          to: [data.contactEmail],
          subject: "Your admin login OTP",
          text: `Your 6-digit OTP is: ${code}\n\nThis code is valid for 10 minutes. Do not share it with anyone.`,
        }),
      });
    } else {
      // Development fallback: log OTP to server console
      console.info(`[DEV] Admin OTP for ${data.contactEmail}: ${code}`);
    }

    return { sent: true };
  });

export const verifyAdminOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifySchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: valid, error } = await supabaseAdmin.rpc("verify_admin_otp", {
      _user_id: data.userId,
      _otp: data.otp,
    });
    if (error) throw new Error(error.message);
    if (!valid) throw new Error("Invalid or expired OTP");

    return { verified: true };
  });
