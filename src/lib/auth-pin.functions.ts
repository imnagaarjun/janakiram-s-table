import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PinSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits") });

/**
 * Validates a 4-digit PIN and returns a one-time magic-link token_hash
 * that the client exchanges for a Supabase session via verifyOtp.
 */
export const pinLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PinSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("auth_email")
      .eq("pin", data.pin)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Invalid PIN");

    const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: (profile as { auth_email: string }).auth_email,
    });
    if (lErr || !link?.properties?.hashed_token) {
      throw new Error(lErr?.message ?? "Could not start session");
    }
    return { token_hash: link.properties.hashed_token };
  });
