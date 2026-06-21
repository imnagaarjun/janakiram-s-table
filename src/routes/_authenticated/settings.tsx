import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Upload, Printer, Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { AccessGuard } from "@/components/AccessGuard";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import type { Restaurant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODULES = [
  { key: "tables", label: "Tables & Ordering" },
  { key: "menu", label: "Menu Management" },
  { key: "kds", label: "Kitchen Display (KDS)" },
  { key: "reports", label: "Reports" },
  { key: "stock", label: "Daily Stock" },
  { key: "waiters", label: "Waiter Management" },
  { key: "vendors", label: "Vendors" },
  { key: "purchases", label: "Purchases" },
  { key: "cash_recon", label: "Cash Reconciliation" },
  { key: "users", label: "User Management" },
];

export const Route = createFileRoute("/_authenticated/settings")({ component: Page });

function Page() {
  return (
    <AccessGuard perm="settings:view">
      <SettingsInner />
    </AccessGuard>
  );
}

function SettingsInner() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rest, setRest] = useState<Restaurant | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [moduleMap, setModuleMap] = useState<Map<string, boolean>>(new Map());
  const [savingModules, setSavingModules] = useState(false);

  const loadModules = useCallback(async () => {
    if (!profile) return;
    const { data } = await db
      .from("module_settings")
      .select("module,enabled")
      .eq("restaurant_id", profile.restaurant_id);
    const m = new Map<string, boolean>();
    (data ?? []).forEach((r: { module: string; enabled: boolean }) => m.set(r.module, r.enabled));
    setModuleMap(m);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile) return;
      const { data, error } = await db
        .from("restaurants")
        .select("*")
        .eq("id", profile.restaurant_id)
        .maybeSingle();
      if (cancelled) return;
      if (error) toast.error(error.message);
      else {
        setRest(data);
        if (data?.logo_url) await refreshLogo(data.logo_url);
      }
      await loadModules();
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, loadModules]);

  async function toggleModule(key: string) {
    if (!profile) return;
    const current = moduleMap.get(key) !== false;
    const next = !current;
    setModuleMap((m) => new Map(m).set(key, next));
    setSavingModules(true);
    const { error } = await db
      .from("module_settings")
      .upsert({ restaurant_id: profile.restaurant_id, module: key, enabled: next }, { onConflict: "restaurant_id,module" });
    setSavingModules(false);
    if (error) {
      toast.error(error.message);
      setModuleMap((m) => new Map(m).set(key, current));
    }
  }

  async function refreshLogo(path: string) {
    const { data } = await supabase.storage.from("logos").createSignedUrl(path, 3600);
    if (data?.signedUrl) setLogoUrl(data.signedUrl);
  }

  function update<K extends keyof Restaurant>(key: K, value: Restaurant[K]) {
    setRest((r) => (r ? { ...r, [key]: value } : r));
  }

  async function save() {
    if (!rest) return;
    setSaving(true);
    const { error } = await db
      .from("restaurants")
      .update({
        name: rest.name,
        address: rest.address,
        gstin: rest.gstin,
        fssai: rest.fssai,
        phone: rest.phone,
        business_day_close_time: rest.business_day_close_time,
        bill_retention_until: rest.bill_retention_until || null,
      })
      .eq("id", rest.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  }

  async function onLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !rest) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `${rest.id}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: updErr } = await db
        .from("restaurants")
        .update({ logo_url: path })
        .eq("id", rest.id);
      if (updErr) throw updErr;
      update("logo_url", path);
      await refreshLogo(path);
      toast.success("Logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!rest) {
    return <div className="p-6 text-danger">Restaurant not found.</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Restaurant settings</h1>

      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-xl border border-border bg-accent overflow-hidden flex items-center justify-center text-muted-foreground text-xs">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              "No logo"
            )}
          </div>
          <div>
            <Label htmlFor="logo" className="block mb-2">
              Logo
            </Label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-accent cursor-pointer text-sm font-medium min-h-[44px]">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>{uploading ? "Uploading…" : "Upload image"}</span>
              <input
                id="logo"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onLogoSelect}
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        <Field label="Name" required>
          <Input value={rest.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label="Address">
          <Textarea
            value={rest.address ?? ""}
            onChange={(e) => update("address", e.target.value)}
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="GSTIN">
            <Input value={rest.gstin ?? ""} onChange={(e) => update("gstin", e.target.value)} />
          </Field>
          <Field label="FSSAI">
            <Input value={rest.fssai ?? ""} onChange={(e) => update("fssai", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={rest.phone ?? ""} onChange={(e) => update("phone", e.target.value)} />
          </Field>
          <Field label="Business-day close time">
            <Input
              type="time"
              value={(rest.business_day_close_time ?? "00:00:00").slice(0, 5)}
              onChange={(e) => update("business_day_close_time", e.target.value)}
            />
          </Field>
          <Field label="Keep bill records until">
            <Input
              type="date"
              value={rest.bill_retention_until ?? ""}
              onChange={(e) => update("bill_retention_until", e.target.value || null)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Bill records browser won't go earlier than this date. Leave blank to keep everything.
            </p>
          </Field>
        </div>

        <Button onClick={save} disabled={saving} className="min-h-[48px] w-full md:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save changes
        </Button>
      </div>

      {/* Printers */}
      {rest && <PrintersPanel restaurantId={rest.id} />}

      {/* Modules */}
      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6 shadow-sm space-y-4 mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Modules</h2>
          {savingModules && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">Toggle modules on or off for all staff. Disabled modules are hidden from the navigation.</p>
        <div className="divide-y divide-border">
          {MODULES.map(({ key, label }) => {
            const on = moduleMap.get(key) !== false;
            return (
              <div key={key} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium">{label}</span>
                <button
                  onClick={() => toggleModule(key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${on ? "bg-primary" : "bg-muted"}`}
                  role="switch"
                  aria-checked={on}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Printers panel
// ──────────────────────────────────────────────────────────────────────────────

const JOB_TYPES = [
  { key: "dining_kot",    label: "Dining — KOT (kitchen)" },
  { key: "takeaway_kot",  label: "Takeaway — KOT (kitchen)" },
  { key: "dining_bill",   label: "Dining — Bill (counter)" },
  { key: "takeaway_bill", label: "Takeaway — Bill (counter)" },
  { key: "report",        label: "Reports" },
] as const;

interface PrinterDevice {
  id: string;
  name: string;
  type: "usb_thermal" | "network_thermal";
  usb_name: string | null;
  net_host: string | null;
  net_port: number | null;
  paper_width: number;
  is_active: boolean;
  hub_id: string | null;
}

interface PrinterAssignment {
  job_type: string;
  device_id: string | null;
  copies: number;
}

const BLANK_DEVICE: Omit<PrinterDevice, "id"> = { name: "", type: "usb_thermal", usb_name: "", net_host: "", net_port: 9100, paper_width: 80, is_active: true, hub_id: "" };

function PrintersPanel({ restaurantId }: { restaurantId: string }) {
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [assignments, setAssignments] = useState<PrinterAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingDevice, setAddingDevice] = useState(false);
  const [newDevice, setNewDevice] = useState<Omit<PrinterDevice, "id">>(BLANK_DEVICE);
  const [saving, setSaving] = useState(false);
  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<Omit<PrinterDevice, "id">>(BLANK_DEVICE);

  const load = useCallback(async () => {
    const [{ data: devs }, { data: asgns }] = await Promise.all([
      db.from("printer_devices").select("*").eq("restaurant_id", restaurantId).order("name"),
      db.from("printer_assignments").select("job_type,device_id,copies").eq("restaurant_id", restaurantId),
    ]);
    setDevices((devs ?? []) as PrinterDevice[]);
    setAssignments((asgns ?? []) as PrinterAssignment[]);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  async function addDevice() {
    if (!newDevice.name.trim()) { toast.error("Name required"); return; }
    if (newDevice.type === "usb_thermal" && !newDevice.usb_name?.trim()) { toast.error("Windows printer name required"); return; }
    if (newDevice.type === "network_thermal" && !newDevice.net_host?.trim()) { toast.error("IP address required"); return; }
    setSaving(true);
    const { error } = await db.from("printer_devices").insert({ ...newDevice, restaurant_id: restaurantId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Printer added");
    setAddingDevice(false);
    setNewDevice(BLANK_DEVICE);
    load();
  }

  async function saveDevice(id: string) {
    setSaving(true);
    const { error } = await (db.from("printer_devices") as any).update(editDevice).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Printer updated");
    setEditDeviceId(null);
    load();
  }

  async function deleteDevice(id: string) {
    const { error } = await db.from("printer_devices").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Printer removed");
    load();
  }

  async function setAssignment(jobType: string, deviceId: string | null, copies: number) {
    const { error } = await (db.from("printer_assignments") as any).upsert(
      { restaurant_id: restaurantId, job_type: jobType, device_id: deviceId || null, copies },
      { onConflict: "restaurant_id,job_type" },
    );
    if (error) toast.error(error.message);
    else load();
  }

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 md:p-6 shadow-sm space-y-5 mt-6">
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Printers</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Register USB or network thermal printers connected to the Windows hub PC, then assign each print type to a printer.
        The hub agent automatically picks up jobs and prints without opening a browser dialog on any device.
      </p>

      {/* Device list */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Registered printers</h3>
        {devices.length === 0 && !addingDevice && (
          <p className="text-sm text-muted-foreground">No printers registered yet.</p>
        )}
        <div className="space-y-2">
          {devices.map((d) => editDeviceId === d.id ? (
            <DeviceForm key={d.id} value={editDevice} onChange={setEditDevice}
              footer={
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveDevice(d.id)} disabled={saving}>{saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditDeviceId(null)}><X className="h-3 w-3 mr-1" />Cancel</Button>
                </div>
              }
            />
          ) : (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-background">
              <Printer className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm">{d.name}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {d.type === "usb_thermal" ? `USB · ${d.usb_name}` : `Network · ${d.net_host}:${d.net_port}`}
                  {" · "}{d.paper_width}mm
                  {d.hub_id ? <span className="ml-2 px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-mono">{d.hub_id}</span> : null}
                </span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditDeviceId(d.id); setEditDevice({ name: d.name, type: d.type, usb_name: d.usb_name, net_host: d.net_host, net_port: d.net_port, paper_width: d.paper_width, is_active: d.is_active, hub_id: d.hub_id }); }}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={() => deleteDevice(d.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {addingDevice ? (
          <div className="mt-3">
            <DeviceForm value={newDevice} onChange={setNewDevice}
              footer={
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={addDevice} disabled={saving}>{saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}Add printer</Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddingDevice(false); setNewDevice(BLANK_DEVICE); }}>Cancel</Button>
                </div>
              }
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAddingDevice(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add printer
          </Button>
        )}
      </div>

      {/* Assignments */}
      {devices.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Print type assignments</h3>
          <p className="text-xs text-muted-foreground mb-3">Choose which printer handles each print type. "Browser" falls back to the device's own print dialog.</p>
          <div className="space-y-2">
            {JOB_TYPES.map(({ key, label }) => {
              const asgn = assignments.find((a) => a.job_type === key);
              return (
                <div key={key} className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm w-52 shrink-0">{label}</span>
                  <Select
                    value={asgn?.device_id ?? "browser"}
                    onValueChange={(v) => setAssignment(key, v === "browser" ? null : v, asgn?.copies ?? 1)}
                  >
                    <SelectTrigger className="w-48 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="browser">Browser (no hub)</SelectItem>
                      {devices.filter((d) => d.is_active).map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Copies:</span>
                    <Input
                      type="number" min={1} max={5}
                      value={asgn?.copies ?? 1}
                      onChange={(e) => setAssignment(key, asgn?.device_id ?? null, Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-8 w-16 text-xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DeviceForm({ value, onChange, footer }: {
  value: Omit<PrinterDevice, "id">;
  onChange: (v: Omit<PrinterDevice, "id">) => void;
  footer: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-3 bg-background">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block">Printer name</Label>
          <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="e.g. Kitchen Printer" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs mb-1 block">Type</Label>
          <Select value={value.type} onValueChange={(v) => onChange({ ...value, type: v as "usb_thermal" | "network_thermal" })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="usb_thermal">USB Thermal</SelectItem>
              <SelectItem value="network_thermal">Network / IP Thermal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value.type === "usb_thermal" ? (
          <div className="sm:col-span-2">
            <Label className="text-xs mb-1 block">Windows printer name</Label>
            <Input value={value.usb_name ?? ""} onChange={(e) => onChange({ ...value, usb_name: e.target.value })} placeholder='e.g. "TVS-E RP3200 Star" — from Devices & Printers' className="h-8 text-sm" />
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs mb-1 block">IP address</Label>
              <Input value={value.net_host ?? ""} onChange={(e) => onChange({ ...value, net_host: e.target.value })} placeholder="192.168.1.100" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Port</Label>
              <Input type="number" value={value.net_port ?? 9100} onChange={(e) => onChange({ ...value, net_port: parseInt(e.target.value) || 9100 })} className="h-8 text-sm" />
            </div>
          </>
        )}
        <div>
          <Label className="text-xs mb-1 block">Paper width (mm)</Label>
          <Select value={String(value.paper_width)} onValueChange={(v) => onChange({ ...value, paper_width: parseInt(v) })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58mm</SelectItem>
              <SelectItem value="80">80mm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">Hub label <span className="text-muted-foreground font-normal">(optional — for multiple PCs)</span></Label>
          <Input value={value.hub_id ?? ""} onChange={(e) => onChange({ ...value, hub_id: e.target.value || null })} placeholder="e.g. counter-pc or kitchen-pc" className="h-8 text-sm" />
        </div>
      </div>
      {footer}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="block mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
