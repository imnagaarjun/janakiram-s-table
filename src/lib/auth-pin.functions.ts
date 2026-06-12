import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PinSchema = z.object({ pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4–8 digits") });

/**
 * Validates a PIN (4 digits for staff, 8 for admin) and returns a one-time
 * magic-link token_hash + OTP requirement flag.
 */
export const pinLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PinSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authEmail, error } = await supabaseAdmin.rpc("pin_login_lookup", {
      _pin: data.pin,
    });
    if (error) {
      if (error.message.includes("PIN_LOCKED")) {
        throw new Error("Too many failed attempts. Try again in 5 minutes.");
      }
      throw new Error(error.message);
    }
    if (!authEmail) throw new Error("Invalid PIN");

    const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: authEmail as string,
    });
    if (lErr || !link?.properties?.hashed_token) {
      throw new Error(lErr?.message ?? "Could not start session");
    }

    // Check if admin OTP is required (admin + last active > 12h ago or never)
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, contact_email, last_active_at")
      .eq("auth_email", authEmail as string)
      .maybeSingle();

    let needsOtp = false;
    let userId: string | null = null;
    let contactEmail: string | null = null;

    if (prof) {
      userId = prof.id;
      contactEmail = prof.contact_email ?? null;
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", prof.id);
      const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
      if (isAdmin) {
        const lastActive = prof.last_active_at ? new Date(prof.last_active_at) : null;
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        needsOtp = !lastActive || lastActive < twelveHoursAgo;
      }
      // Update last_active_at for non-admin or admin who doesn't need OTP
      if (!needsOtp) {
        await supabaseAdmin
          .from("profiles")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", prof.id);
      }
    }

    return { token_hash: link.properties.hashed_token, needsOtp, userId, contactEmail };
  });
