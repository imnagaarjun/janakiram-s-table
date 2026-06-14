import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AppRoleEnum = z.enum(["admin", "manager", "cashier", "waiter", "kitchen"]);

const CreateSchema = z.object({
  name: z.string().min(1),
  role: AppRoleEnum,
  pin: z.string().regex(/^\d{4,8}$/),
  contactEmail: z.string().email().optional(),
  restaurantId: z.string().uuid(),
});

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).optional(),
  role: AppRoleEnum.optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  contactEmail: z.string().email().nullable().optional(),
  canEditPayment: z.boolean().optional(),
});

const ToggleSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export const createStaffUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const randomPwd = `pwd-${crypto.randomUUID()}`;
    const authEmail = data.contactEmail ?? `u-${crypto.randomUUID()}@hsj.local`;

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: randomPwd,
      email_confirm: true,
    });
    if (uErr || !created.user) throw new Error(uErr?.message ?? "Failed to create auth user");
    const userId = created.user.id;

    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      restaurant_id: data.restaurantId,
      name: data.name,
      auth_email: authEmail,
      contact_email: data.contactEmail ?? null,
      is_active: true,
    });
    if (pErr) throw new Error(pErr.message);

    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      restaurant_id: data.restaurantId,
      role: data.role,
    });
    if (rErr) throw new Error(rErr.message);

    const { error: pinErr } = await supabaseAdmin.rpc("set_staff_pin", {
      _user_id: userId,
      _pin: data.pin,
    });
    if (pinErr) throw new Error(pinErr.message);

    return { userId };
  });

export const updateStaffUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.name !== undefined || data.contactEmail !== undefined || data.canEditPayment !== undefined) {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.contactEmail !== undefined) updates.contact_email = data.contactEmail;
      if (data.canEditPayment !== undefined) updates.can_edit_payment = data.canEditPayment;
      const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.role !== undefined) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("restaurant_id")
        .eq("id", data.userId)
        .single();
      if (prof) {
        const { error } = await supabaseAdmin.from("user_roles").insert({
          user_id: data.userId,
          restaurant_id: prof.restaurant_id,
          role: data.role,
        });
        if (error) throw new Error(error.message);
      }
    }

    if (data.pin !== undefined) {
      const { error } = await supabaseAdmin.rpc("set_staff_pin", {
        _user_id: data.userId,
        _pin: data.pin,
      });
      if (error) throw new Error(error.message);
    }

    return { updated: true };
  });

export const toggleUserActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ToggleSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { updated: true };
  });
