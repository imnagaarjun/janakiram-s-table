import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus, Pencil, Check, X, Power, Upload, Trash2, Plus, Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { uploadMenuImage } from "@/lib/menu-storage";
import { MenuImage } from "@/components/menu/MenuImage";
import { createStaffUser, updateStaffUser, toggleUserActive, deleteStaffUser, resetStaffPassword, updateStaffEmail } from "@/lib/user-management.functions";
import { PERMISSION_AREAS, resolvePermissions } from "@/lib/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const DEFAULT_ROLES: string[] = ["admin", "manager", "cashier", "waiter", "kitchen"];

interface StaffRow {
  id: string;
  name: string;
  auth_email: string;
  contact_email: string | null;
  is_active: boolean;
  last_active_at: string | null;
  can_edit_payment: boolean;
  photo_url: string | null;
  notify_stock: boolean;
  role: string;
  permissions: Record<string, boolean> | null;
  section_id: string | null;
}

interface FormState {
  name: string;
  role: string;
  email: string;
  password: string;
  contactEmail: string;
  canEditPayment?: boolean;
  photoUrl?: string | null;
  notifyStock?: boolean;
  sectionId?: string | null;
}

const BLANK: FormState = { name: "", role: "waiter", email: "", password: "", contactEmail: "" };

function pwStrength(pw: string) {
  return [pw.length >= 8, /[A-Z]/.test(pw), /[0-9]/.test(pw)].filter(Boolean).length;
}
const STRENGTH_LABEL = ["", "Weak", "Fair", "Strong"];
const STRENGTH_COLOR = ["", "bg-danger", "bg-warning", "bg-success"];

function PasswordField({
  value,
  onChange,
  placeholder,
  showStrength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showStrength?: boolean;
}) {
  const [show, setShow] = useState(false);
  const sc = pwStrength(value);
  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Password"}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="flex gap-1 mt-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${sc >= i ? STRENGTH_COLOR[sc] : "bg-border"}`} />
          ))}
          <span className="text-[10px] text-muted-foreground ml-1">{STRENGTH_LABEL[sc]}</span>
        </div>
      )}
    </div>
  );
}

/** Square portrait uploader (reuses the menu storage bucket, "staff" scope). */
function PhotoPicker({
  restaurantId,
  value,
  onChange,
}: {
  restaurantId: string;
  value: string | null | undefined;
  onChange: (path: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const path = await uploadMenuImage(restaurantId, "staff", crypto.randomUUID(), f);
      onChange(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-full border border-border overflow-hidden shrink-0">
        <MenuImage path={value} alt="Portrait" className="h-full w-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-accent cursor-pointer text-sm font-medium">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{uploading ? "Uploading…" : value ? "Replace photo" : "Add photo"}</span>
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={onPick} disabled={uploading} />
        </label>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} className="self-start text-muted-foreground h-7">
            <X className="h-3.5 w-3.5 mr-1" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function UsersPanel() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FormState>>({});
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [emailChanges, setEmailChanges] = useState<Record<string, string>>({});
  const [emailSaving, setEmailSaving] = useState<string | null>(null);
  const [permsOverride, setPermsOverride] = useState<Record<string, boolean>>({});
  const [permsReset, setPermsReset] = useState(false);
  const [roles, setRoles] = useState<string[]>(DEFAULT_ROLES);
  const [newRole, setNewRole] = useState("");
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);

  const callCreate = useServerFn(createStaffUser);
  const callUpdate = useServerFn(updateStaffUser);
  const callToggle = useServerFn(toggleUserActive);
  const callDelete = useServerFn(deleteStaffUser);
  const callReset = useServerFn(resetStaffPassword);
  const callUpdateEmail = useServerFn(updateStaffEmail);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: profiles } = await db
      .from("profiles")
      .select("id,name,auth_email,contact_email,is_active,last_active_at,can_edit_payment,photo_url,notify_stock,permissions,section_id")
      .eq("restaurant_id", profile.restaurant_id)
      .order("name");
    const { data: rolesData } = await db
      .from("user_roles")
      .select("user_id,role")
      .eq("restaurant_id", profile.restaurant_id);
    const { data: sectionRows } = await db
      .from("print_sections")
      .select("id,name")
      .eq("restaurant_id", profile.restaurant_id)
      .order("name");
    setSections((sectionRows ?? []) as { id: string; name: string }[]);

    const roleMap = new Map<string, string>();
    (rolesData ?? []).forEach((r: { user_id: string; role: string }) => roleMap.set(r.user_id, r.role));

    const usedRoles = new Set(roleMap.values());
    setRoles(Array.from(new Set([...DEFAULT_ROLES, ...usedRoles])));

    setStaff(
      ((profiles ?? []) as Omit<StaffRow, "role">[]).map((p) => ({
        ...p,
        role: roleMap.get(p.id) ?? "waiter",
      })),
    );
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function addUser() {
    if (!profile) return;
    if (!form.name || !form.email || !form.password) {
      toast.error("Name, email, and password are required");
      return;
    }
    if (pwStrength(form.password) < 3) {
      toast.error("Password must be at least 8 characters with uppercase and a number");
      return;
    }
    if (form.role === "admin" && !form.contactEmail) {
      toast.error("Admin requires a contact email for OTP verification");
      return;
    }
    setSaving(true);
    try {
      const res = await callCreate({
        data: {
          name: form.name,
          role: form.role,
          email: form.email,
          password: form.password,
          contactEmail: form.contactEmail || undefined,
          photoUrl: form.photoUrl ?? null,
          notifyStock: form.notifyStock ?? false,
          restaurantId: profile.restaurant_id,
        },
      });
      toast.success(`${res.name} added as ${res.role}`);
      setShowAdd(false);
      setForm(BLANK);
      await load();
    } catch (e) {
      let msg = "Failed to create user";
      if (e instanceof Error) {
        try { const p = JSON.parse(e.message); msg = Array.isArray(p) ? (p[0]?.message ?? e.message) : e.message; }
        catch { msg = e.message; }
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(userId: string) {
    if (editForm.password && pwStrength(editForm.password) < 3) {
      toast.error("New password must be at least 8 characters with uppercase and a number");
      return;
    }
    setSaving(true);
    try {
      await callUpdate({
        data: {
          userId,
          name: editForm.name,
          role: editForm.role,
          password: editForm.password || undefined,
          contactEmail: editForm.contactEmail ?? undefined,
          canEditPayment: editForm.canEditPayment,
          photoUrl: editForm.photoUrl,
          notifyStock: editForm.notifyStock,
          permissions: permsReset ? null : (Object.keys(permsOverride).length > 0 ? permsOverride : undefined),
          sectionId: editForm.sectionId === undefined ? undefined : editForm.sectionId,
        },
      });
      toast.success("Updated");
      setEditId(null);
      setEditForm({});
      setPermsOverride({});
      setPermsReset(false);
      await load();
    } catch (e) {
      let msg = "Failed to update";
      if (e instanceof Error) {
        try { const p = JSON.parse(e.message); msg = Array.isArray(p) ? (p[0]?.message ?? e.message) : e.message; }
        catch { msg = e.message; }
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(userId: string, current: boolean) {
    try {
      await callToggle({ data: { userId, isActive: !current } });
      toast.success(!current ? "User activated" : "User deactivated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeUser(userId: string) {
    try {
      await callDelete({ data: { userId } });
      toast.success("User deleted");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function sendPasswordReset(userId: string) {
    setSaving(true);
    try {
      const res = await callReset({ data: { userId } });
      if (res.sent) {
        toast.success(`Reset email sent to ${res.email}`);
        setResetTarget(null);
      } else {
        // Dev mode: show link
        setResetLink(res.link ?? null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send reset");
    } finally {
      setSaving(false);
    }
  }

  async function changeLoginEmail(userId: string, currentEmail: string) {
    const newEmail = (emailChanges[userId] ?? "").trim().toLowerCase();
    if (!newEmail || newEmail === currentEmail.toLowerCase()) return;
    setEmailSaving(userId);
    try {
      await callUpdateEmail({ data: { userId, email: newEmail } });
      toast.success("Login email updated");
      setEmailChanges((m) => { const n = { ...m }; delete n[userId]; return n; });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update email");
    } finally {
      setEmailSaving(null);
    }
  }

  function addCustomRole() {
    const r = newRole.trim().toLowerCase();
    if (!r) return;
    if (roles.includes(r)) { toast.error("Role already exists"); return; }
    setRoles((prev) => [...prev, r]);
    setNewRole("");
    toast.success(`Role "${r}" added`);
  }

  function fmtDate(s: string | null) {
    if (!s) return "Never";
    return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  if (loading || !profile) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Staff Users</h1>
        <Button onClick={() => { setShowAdd(true); setForm(BLANK); }} className="min-h-[44px]">
          <UserPlus className="h-4 w-4 mr-2" /> Add User
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-2xl border border-border bg-surface p-4 mb-6 space-y-4">
          <h2 className="font-semibold text-base">New Staff User</h2>
          <PhotoPicker
            restaurantId={profile.restaurant_id}
            value={form.photoUrl}
            onChange={(p) => setForm((f) => ({ ...f, photoUrl: p }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="block mb-1.5">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Staff name" />
            </div>
            <div>
              <Label className="block mb-1.5">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as string }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block mb-1.5">Login email</Label>
              <Input
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="staff@example.com"
              />
            </div>
            <div>
              <Label className="block mb-1.5">Password</Label>
              <PasswordField
                value={form.password}
                onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                placeholder="Min 8 chars, uppercase, number"
                showStrength
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="block mb-1.5">
                Contact email {form.role === "admin" ? "(required — for OTP & password reset)" : "(optional — for password reset)"}
              </Label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="personal@example.com"
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label className="text-xs">Receive stock alerts</Label>
              <p className="text-[11px] text-muted-foreground">Gets low-stock and out-of-stock notifications.</p>
            </div>
            <Switch
              checked={form.notifyStock ?? false}
              onCheckedChange={(v) => setForm((f) => ({ ...f, notifyStock: v }))}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={addUser} disabled={saving} className="min-h-[44px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create User
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="min-h-[44px]">Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {staff.map((s) => {
          const isEditing = editId === s.id;
          return (
            <div key={s.id} className={`rounded-2xl border border-border bg-surface p-4 ${!s.is_active ? "opacity-60" : ""}`}>
              {isEditing ? (
                <div className="space-y-3">
                  <PhotoPicker
                    restaurantId={profile.restaurant_id}
                    value={editForm.photoUrl ?? s.photo_url}
                    onChange={(p) => setEditForm((f) => ({ ...f, photoUrl: p }))}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="block mb-1 text-xs">Name</Label>
                      <Input value={editForm.name ?? s.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="block mb-1 text-xs">Role</Label>
                      <Select value={editForm.role ?? s.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as string }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {sections.length > 0 && (
                      <div>
                        <Label className="block mb-1 text-xs">Section <span className="text-muted-foreground">(for printer routing)</span></Label>
                        <Select
                          value={(editForm.sectionId ?? s.section_id) ?? "__none__"}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, sectionId: v === "__none__" ? null : v }))}
                        >
                          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None (default printers)</SelectItem>
                            {sections.map((sec) => <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="block mb-1 text-xs">New password <span className="text-muted-foreground">(leave blank to keep)</span></Label>
                      <PasswordField
                        value={editForm.password ?? ""}
                        onChange={(v) => setEditForm((f) => ({ ...f, password: v }))}
                        placeholder="New password"
                        showStrength
                      />
                    </div>
                    <div>
                      <Label className="block mb-1 text-xs">Contact email</Label>
                      <Input
                        type="email"
                        value={editForm.contactEmail ?? s.contact_email ?? ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))}
                        placeholder="For OTP & password reset"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="block mb-1 text-xs">Login email <span className="text-muted-foreground">(used to sign in)</span></Label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          value={emailChanges[s.id] ?? s.auth_email}
                          onChange={(e) => setEmailChanges((m) => ({ ...m, [s.id]: e.target.value }))}
                          placeholder={s.auth_email}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            emailSaving === s.id ||
                            !(emailChanges[s.id] ?? "").trim() ||
                            (emailChanges[s.id] ?? "").toLowerCase() === s.auth_email.toLowerCase()
                          }
                          onClick={() => changeLoginEmail(s.id, s.auth_email)}
                          className="shrink-0"
                        >
                          {emailSaving === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update"}
                        </Button>
                      </div>
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div>
                        <Label className="text-xs">Can change payment mode</Label>
                        <p className="text-[11px] text-muted-foreground">Lets this user change a settled bill's payment once.</p>
                      </div>
                      <Switch
                        checked={editForm.canEditPayment ?? s.can_edit_payment}
                        onCheckedChange={(v) => setEditForm((f) => ({ ...f, canEditPayment: v }))}
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div>
                        <Label className="text-xs">Receive stock alerts</Label>
                        <p className="text-[11px] text-muted-foreground">Gets low-stock and out-of-stock notifications.</p>
                      </div>
                      <Switch
                        checked={editForm.notifyStock ?? s.notify_stock}
                        onCheckedChange={(v) => setEditForm((f) => ({ ...f, notifyStock: v }))}
                      />
                    </div>
                  </div>
                  {/* Permission matrix — not shown for admins (always full access) */}
                  {(editForm.role ?? s.role) !== "admin" && (() => {
                    const effectiveRole = editForm.role ?? s.role;
                    const effectivePerms = resolvePermissions([effectiveRole], permsReset ? null : permsOverride);
                    return (
                      <div className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">Access permissions</span>
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline"
                            onClick={() => { setPermsOverride({}); setPermsReset(true); }}
                          >
                            Reset to role defaults
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {PERMISSION_AREAS.map((area) => {
                            const viewKey = `${area.key}:view`;
                            const editKey = `${area.key}:edit`;
                            const canView = effectivePerms.has(viewKey);
                            const canEdit = area.hasEdit && effectivePerms.has(editKey);
                            return (
                              <div key={area.key} className="flex items-center gap-3 py-1 border-b border-border/50 last:border-0">
                                <span className="text-xs flex-1 text-foreground">{area.label}</span>
                                <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
                                  <Switch
                                    checked={canView}
                                    onCheckedChange={(v) => {
                                      setPermsReset(false);
                                      setPermsOverride((prev) => {
                                        const next = { ...prev, [viewKey]: v };
                                        if (!v && area.hasEdit) next[editKey] = false;
                                        return next;
                                      });
                                    }}
                                    className="scale-75"
                                  />
                                  View
                                </label>
                                {area.hasEdit && (
                                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
                                    <Switch
                                      checked={canEdit}
                                      disabled={!canView}
                                      onCheckedChange={(v) => {
                                        setPermsReset(false);
                                        setPermsOverride((prev) => ({ ...prev, [editKey]: v }));
                                      }}
                                      className="scale-75"
                                    />
                                    Edit
                                  </label>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => saveEdit(s.id)} disabled={saving} className="min-h-[40px]">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditId(null); setEditForm({}); setPermsOverride({}); setPermsReset(false); }} className="min-h-[40px]">
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full border border-border overflow-hidden shrink-0">
                    <MenuImage path={s.photo_url} alt={s.name} className="h-full w-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium capitalize">{s.role}</span>
                      {s.section_id && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600">{sections.find((sec) => sec.id === s.section_id)?.name ?? "section"}</span>}
                      {s.notify_stock && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">stock alerts</span>}
                      {!s.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {s.auth_email} · Last active: {fmtDate(s.last_active_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      title="Send password reset"
                      onClick={() => setResetTarget(s)}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => {
                      setEditId(s.id);
                      setEditForm({ name: s.name, role: s.role, password: "", contactEmail: s.contact_email ?? "", canEditPayment: s.can_edit_payment, photoUrl: s.photo_url, notifyStock: s.notify_stock, sectionId: s.section_id });
                      setPermsOverride(s.permissions ?? {});
                      setPermsReset(false);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-9 w-9 ${s.is_active ? "text-warning" : "text-emerald-600"}`}
                      onClick={() => toggle(s.id, s.is_active)}
                      title={s.is_active ? "Deactivate" : "Activate"}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                    {s.id !== profile?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-danger"
                        onClick={() => setDeleteTarget(s)}
                        title="Delete user"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add custom role */}
      <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold text-sm mb-2">Custom roles</h2>
        <p className="text-xs text-muted-foreground mb-3">Add roles beyond the defaults. Custom roles have the same access as "waiter" by default.</p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. supervisor"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value.toLowerCase().replace(/[^a-z_]/g, ""))}
            className="max-w-[200px]"
          />
          <Button variant="outline" onClick={addCustomRole} disabled={!newRole.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add role
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {roles.map((r) => (
            <span key={r} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">{r}</span>
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account, login, and all associated data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && removeUser(deleteTarget.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password reset confirmation */}
      <AlertDialog open={!!resetTarget} onOpenChange={(v) => { if (!v) { setResetTarget(null); setResetLink(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send password reset — {resetTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {resetTarget?.contact_email
                ? `A reset link will be sent to ${resetTarget.contact_email}.`
                : "No contact email set. A reset link will be generated for you to share manually."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetLink && (
            <div className="text-xs bg-accent rounded p-3 break-all select-all font-mono">{resetLink}</div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!resetLink && (
              <AlertDialogAction onClick={() => resetTarget && sendPasswordReset(resetTarget.id)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {resetTarget?.contact_email ? "Send reset email" : "Generate link"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
