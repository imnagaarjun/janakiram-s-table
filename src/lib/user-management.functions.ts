import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const AppRoleEnum = z.string().min(1);

const CreateSchema = z.object({
  name: z.string().min(1),
  role: AppRoleEnum,
  pin: z.string().regex(/^\d{4,8}$/),
  contactEmail: z.string().email().optional(),
  photoUrl: z.string().nullable().optional(),
  notifyStock: z.boolean().optional(),
  restaurantId: z.string().uuid(),
});

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).optional(),
  role: AppRoleEnum.optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  contactEmail: z.string().email().nullable().optional(),
  canEditPayment: z.boolean().optional(),
  photoUrl: z.string().nullable().optional(),
  notifyStock: z.boolean().optional(),
});

const ToggleSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

const DeleteSchema = z.object({
  userId: z.string().uuid(),
});

/** Returns the caller's restaurant_id by validating the Bearer token and looking up their profile. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCallerRestaurantId(supabaseAdmin: any): Promise<string> {
  const req = getRequest();
  const token = req?.headers?.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!token) throw new Error("Unauthorized");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  const { data: prof } = await supabaseAdmin.from("profiles").select("restaurant_id").eq("id", user.id).single();
  if (!prof) throw new Error("Caller profile not found");
  return prof.restaurant_id as string;
}

export const createStaffUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const callerRestaurantId = await getCallerRestaurantId(supabaseAdmin as any);
    if (data.restaurantId !== callerRestaurantId) throw new Error("Forbidden");

    // Prevent duplicate staff: same name (case-insensitive) within this
    // restaurant, or a reused contact email.
    const { data: dupName } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .ilike("name", data.name.trim())
      .maybeSingle();
    if (dupName) throw new Error(`A user named "${data.name.trim()}" already exists`);

    if (data.contactEmail) {
      const { data: dupEmail } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("contact_email", data.contactEmail)
        .maybeSingle();
      if (dupEmail) throw new Error("That contact email is already in use");
    }

    const randomPwd = `pwd-${crypto.randomUUID()}`;
    const authEmail = data.contactEmail ?? `u-${crypto.randomUUID()}@hsj.local`;

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: randomPwd,
      email_confirm: true,
    });
    if (uErr || !created.user) throw new Error(uErr?.message ?? "Failed to create auth user");
    const userId = created.user.id;

    const { error: pErr } = await (supabaseAdmin.from("profiles") as any).insert({
      id: userId,
      restaurant_id: data.restaurantId,
      name: data.name,
      auth_email: authEmail,
      contact_email: data.contactEmail ?? null,
      photo_url: data.photoUrl ?? null,
      notify_stock: data.notifyStock ?? false,
      is_active: true,
    });
    if (pErr) throw new Error(pErr.message);

    const { error: rErr } = await (supabaseAdmin.from("user_roles") as any).insert({
      user_id: userId,
      restaurant_id: data.restaurantId,
      role: data.role,
    });
    if (rErr) throw new Error(rErr.message);

    const { error: pinErr } = await (supabaseAdmin as any).rpc("set_staff_pin", {
      _user_id: userId,
      _pin: data.pin,
    });
    if (pinErr) throw new Error(pinErr.message);

    return { userId, name: data.name, role: data.role };
  });

export const updateStaffUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const callerRestaurantId = await getCallerRestaurantId(supabaseAdmin as any);
    const { data: targetProf } = await supabaseAdmin
      .from("profiles").select("restaurant_id").eq("id", data.userId).single();
    if (!targetProf || (targetProf as any).restaurant_id !== callerRestaurantId) throw new Error("Forbidden");

    if (
      data.name !== undefined || data.contactEmail !== undefined ||
      data.canEditPayment !== undefined || data.photoUrl !== undefined ||
      data.notifyStock !== undefined
    ) {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.contactEmail !== undefined) updates.contact_email = data.contactEmail;
      if (data.canEditPayment !== undefined) updates.can_edit_payment = data.canEditPayment;
      if (data.photoUrl !== undefined) updates.photo_url = data.photoUrl;
      if (data.notifyStock !== undefined) updates.notify_stock = data.notifyStock;
      const { error } = await (supabaseAdmin.from("profiles") as any).update(updates).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.role !== undefined) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await (supabaseAdmin.from("user_roles") as any).insert({
        user_id: data.userId,
        restaurant_id: callerRestaurantId,
        role: data.role,
      });
      if (error) throw new Error(error.message);
    }

    if (data.pin !== undefined) {
      const { error } = await (supabaseAdmin as any).rpc("set_staff_pin", {
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

    const callerRestaurantId = await getCallerRestaurantId(supabaseAdmin as any);
    const { data: targetProf } = await supabaseAdmin
      .from("profiles").select("restaurant_id").eq("id", data.userId).single();
    if (!targetProf || (targetProf as any).restaurant_id !== callerRestaurantId) throw new Error("Forbidden");

    const { error } = await (supabaseAdmin.from("profiles") as any)
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { updated: true };
  });

export const deleteStaffUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DeleteSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const callerRestaurantId = await getCallerRestaurantId(supabaseAdmin as any);
    const { data: targetProf } = await supabaseAdmin
      .from("profiles").select("restaurant_id").eq("id", data.userId).single();
    if (!targetProf || (targetProf as any).restaurant_id !== callerRestaurantId) throw new Error("Forbidden");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { deleted: true };
  });
