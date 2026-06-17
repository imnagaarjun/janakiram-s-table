import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const AppRoleEnum = z.string().min(1);

const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const CreateSchema = z.object({
  name: z.string().min(1),
  role: AppRoleEnum,
  email: z.string().email(),
  password: PasswordSchema,
  contactEmail: z.string().email().optional(),
  photoUrl: z.string().nullable().optional(),
  notifyStock: z.boolean().optional(),
  restaurantId: z.string().uuid(),
});

const UpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).optional(),
  role: AppRoleEnum.optional(),
  password: PasswordSchema.optional(),
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

const ResetPasswordSchema = z.object({
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

    // Prevent duplicate name within this restaurant
    const { data: dupName } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .ilike("name", data.name.trim())
      .maybeSingle();
    if (dupName) throw new Error(`A user named "${data.name.trim()}" already exists`);

    // Prevent duplicate login email
    const { data: dupEmail } = await supabaseAdmin.auth.admin.listUsers();
    const emailTaken = (dupEmail?.users ?? []).some(
      (u: { email?: string }) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (emailTaken) throw new Error("That email is already in use");

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
    });
    if (uErr || !created.user) throw new Error(uErr?.message ?? "Failed to create auth user");
    const userId = created.user.id;

    const { error: pErr } = await (supabaseAdmin.from("profiles") as any).insert({
      id: userId,
      restaurant_id: data.restaurantId,
      name: data.name,
      auth_email: data.email.toLowerCase(),
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

    if (data.password !== undefined) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
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

/** Sends a password reset email to the user's contact_email (admin action). */
export const resetStaffPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResetPasswordSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const callerRestaurantId = await getCallerRestaurantId(supabaseAdmin as any);
    const { data: targetProf } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id,auth_email,contact_email")
      .eq("id", data.userId)
      .single();
    if (!targetProf || (targetProf as any).restaurant_id !== callerRestaurantId) throw new Error("Forbidden");

    const prof = targetProf as { auth_email: string; contact_email: string | null };
    const deliverTo = prof.contact_email ?? prof.auth_email;

    // Generate a recovery link and return it (admin can share manually, or Resend delivers it)
    const origin = process.env.VITE_APP_URL ?? "https://janakiram-s-table.vercel.app";
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: prof.auth_email,
      options: { redirectTo: `${origin}/auth/reset-password` },
    });
    if (error) throw new Error(error.message);

    // If Resend is configured, send the email; otherwise return the link for manual sharing
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Hotel Sri Janakiram <noreply@hsj.local>",
          to: [deliverTo],
          subject: "Reset your password",
          html: `<p>Click the link below to reset your password. The link expires in 1 hour.</p>
                 <p><a href="${(link as any).properties?.action_link}">Reset password</a></p>`,
        }),
      });
      return { sent: true, email: deliverTo };
    }

    // Dev fallback: return the link so admin can share it
    return { sent: false, link: (link as any).properties?.action_link, email: deliverTo };
  });

const UpdateEmailSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
});

/** Admin-only: update a staff member's login email in both auth.users and profiles. */
export const updateStaffEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => UpdateEmailSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const callerRestaurantId = await getCallerRestaurantId(supabaseAdmin as any);
    const { data: targetProf } = await supabaseAdmin
      .from("profiles")
      .select("restaurant_id")
      .eq("id", data.userId)
      .single();
    if (!targetProf || (targetProf as any).restaurant_id !== callerRestaurantId) throw new Error("Forbidden");

    // Ensure the new email isn't already used by another profile
    const { data: dup } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("auth_email", data.email.toLowerCase())
      .maybeSingle();
    if (dup && (dup as any).id !== data.userId) throw new Error("That email is already in use by another account");

    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email.toLowerCase(),
      email_confirm: true,
    });
    if (authErr) throw new Error(authErr.message);

    const { error: profErr } = await (supabaseAdmin.from("profiles") as any)
      .update({ auth_email: data.email.toLowerCase() })
      .eq("id", data.userId);
    if (profErr) throw new Error(profErr.message);

    return { updated: true };
  });

