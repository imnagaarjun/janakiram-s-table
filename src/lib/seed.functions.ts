import { createServerFn } from "@tanstack/react-start";

const SEED_ADMIN_EMAIL = "admin@hsj.local";
const SEED_ADMIN_PASSWORD = "Admin@12345678";

/**
 * Idempotently seeds one restaurant and one Admin user on first run.
 * Safe to call repeatedly — it only creates if no restaurant exists.
 */
export const ensureSeed = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing, error: exErr } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .limit(1);
  if (exErr) throw new Error(exErr.message);
  if (existing && existing.length > 0) return { seeded: false as const };

  const { data: rest, error: rErr } = await supabaseAdmin
    .from("restaurants")
    .insert({
      name: "Hotel Sri Janakiram",
      address: "49 Tamil Sangam Road, Madurai",
      phone: "",
      business_day_close_time: "00:00",
    })
    .select()
    .single();
  if (rErr || !rest) throw new Error(rErr?.message ?? "Failed to create restaurant");

  const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: SEED_ADMIN_EMAIL,
    password: SEED_ADMIN_PASSWORD,
    email_confirm: true,
  });
  if (uErr || !created.user) throw new Error(uErr?.message ?? "Failed to create user");
  const userId = created.user.id;

  const { error: pErr } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    restaurant_id: rest.id,
    name: "Admin",
    auth_email: SEED_ADMIN_EMAIL,
  });
  if (pErr) throw new Error(pErr.message);

  const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
    user_id: userId,
    restaurant_id: rest.id,
    role: "admin",
  });
  if (roleErr) throw new Error(roleErr.message);

  return { seeded: true as const };
});
