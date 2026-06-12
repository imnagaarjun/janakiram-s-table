import { createServerFn } from "@tanstack/react-start";

/**
 * Idempotently seeds one restaurant and one Admin user (PIN 12345678) on first run.
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

  const adminEmail = `u-${crypto.randomUUID()}@hsj.local`;
  const adminPassword = `pwd-${crypto.randomUUID()}`;
  const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });
  if (uErr || !created.user) throw new Error(uErr?.message ?? "Failed to create user");
  const userId = created.user.id;

  const { error: pErr } = await supabaseAdmin.from("profiles").insert({
    id: userId,
    restaurant_id: rest.id,
    name: "Admin",
    auth_email: adminEmail,
  });
  if (pErr) throw new Error(pErr.message);

  const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
    user_id: userId,
    restaurant_id: rest.id,
    role: "admin",
  });
  if (roleErr) throw new Error(roleErr.message);

  // Admin PIN must be 8 digits — insert role first so set_staff_pin allows it
  const { error: pinErr } = await supabaseAdmin.rpc("set_staff_pin", {
    _user_id: userId,
    _pin: "12345678",
  });
  if (pinErr) throw new Error(pinErr.message);

  return { seeded: true as const };
});
