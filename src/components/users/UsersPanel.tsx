import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus, Pencil, Check, X, Power } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { createStaffUser, updateStaffUser, toggleUserActive } from "@/lib/user-management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["admin", "manager", "cashier", "waiter", "kitchen"];

interface StaffRow {
  id: string;
  name: string;
  auth_email: string;
  contact_email: string | null;
  is_active: boolean;
  last_active_at: string | null;
  can_edit_payment: boolean;
  role: AppRole;
}

interface FormState {
  name: string;
  role: AppRole;
  pin: string;
  contactEmail: string;
  canEditPayment?: boolean;
}

const BLANK: FormState = { name: "", role: "waiter", pin: "", contactEmail: "" };

export function UsersPanel() {
  const { profile } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FormState>>({});

  const callCreate = useServerFn(createStaffUser);
  const callUpdate = useServerFn(updateStaffUser);
  const callToggle = useServerFn(toggleUserActive);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: profiles } = await db
      .from("profiles")
      .select("id,name,auth_email,contact_email,is_active,last_active_at,can_edit_payment")
      .eq("restaurant_id", profile.restaurant_id)
      .order("name");
    const { data: roles } = await db
      .from("user_roles")
      .select("user_id,role")
      .eq("restaurant_id", profile.restaurant_id);

    const roleMap = new Map<string, AppRole>();
    (roles ?? []).forEach((r: { user_id: string; role: AppRole }) => roleMap.set(r.user_id, r.role));

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
    if (!form.name || !form.pin) { toast.error("Name and PIN are required"); return; }
    const minPin = form.role === "admin" ? 8 : 4;
    if (form.pin.length < minPin) { toast.error(`${form.role === "admin" ? "Admin" : "Staff"} PIN must be at least ${minPin} digits`); return; }
    if (form.role === "admin" && !form.contactEmail) { toast.error("Admin requires a contact email for OTP verification"); return; }
    setSaving(true);
    try {
      await callCreate({
        data: {
          name: form.name,
          role: form.role,
          pin: form.pin,
          contactEmail: form.contactEmail || undefined,
          restaurantId: profile.restaurant_id,
        },
      });
      toast.success("User created");
      setShowAdd(false);
      setForm(BLANK);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(userId: string) {
    setSaving(true);
    try {
      await callUpdate({
        data: {
          userId,
          name: editForm.name,
          role: editForm.role,
          pin: editForm.pin || undefined,
          contactEmail: editForm.contactEmail ?? undefined,
          canEditPayment: editForm.canEditPayment,
        },
      });
      toast.success("Updated");
      setEditId(null);
      setEditForm({});
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
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

  function fmtDate(s: string | null) {
    if (!s) return "Never";
    return new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  if (loading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="block mb-1.5">Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Staff name" />
            </div>
            <div>
              <Label className="block mb-1.5">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as AppRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block mb-1.5">
                PIN {form.role === "admin" ? "(8 digits)" : "(4+ digits)"}
              </Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
                placeholder={form.role === "admin" ? "8-digit PIN" : "4-digit PIN"}
              />
            </div>
            <div>
              <Label className="block mb-1.5">
                Contact Email {form.role === "admin" ? "(required for OTP)" : "(optional)"}
              </Label>
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="block mb-1 text-xs">Name</Label>
                      <Input value={editForm.name ?? s.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="block mb-1 text-xs">Role</Label>
                      <Select value={editForm.role ?? s.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as AppRole }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="block mb-1 text-xs">New PIN (leave blank to keep)</Label>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={editForm.pin ?? ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
                        placeholder="New PIN"
                      />
                    </div>
                    <div>
                      <Label className="block mb-1 text-xs">Contact Email</Label>
                      <Input
                        type="email"
                        value={editForm.contactEmail ?? s.contact_email ?? ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, contactEmail: e.target.value }))}
                        placeholder="Email for OTP"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <div>
                        <Label className="text-xs">Can change payment mode</Label>
                        <p className="text-[11px] text-muted-foreground">Lets this user change a settled bill's payment once (cashiers can always do this).</p>
                      </div>
                      <Switch
                        checked={editForm.canEditPayment ?? s.can_edit_payment}
                        onCheckedChange={(v) => setEditForm((f) => ({ ...f, canEditPayment: v }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(s.id)} disabled={saving} className="min-h-[40px]">
                      {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditId(null); setEditForm({}); }} className="min-h-[40px]">
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium capitalize">{s.role}</span>
                      {!s.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.contact_email ?? "No contact email"} · Last active: {fmtDate(s.last_active_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setEditId(s.id); setEditForm({ name: s.name, role: s.role, contactEmail: s.contact_email ?? "", canEditPayment: s.can_edit_payment }); }}>
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
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
