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
  id?: string;
  job_type: string;
  device_id: string | null;
  copies: number;
  section_id: string | null;
}

interface PrinterHub {
  id: string;
  name: string;
  hub_key: string;
}

interface PrintSection {
  id: string;
  name: string;
}

const BLANK_DEVICE: Omit<PrinterDevice, "id"> = { name: "", type: "usb_thermal", usb_name: "", net_host: "", net_port: 9100, paper_width: 80, is_active: true, hub_id: "" };

function PrintersPanel({ restaurantId }: { restaurantId: string }) {
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [assignments, setAssignments] = useState<PrinterAssignment[]>([]);
  const [hubs, setHubs] = useState<PrinterHub[]>([]);
  const [sections, setSections] = useState<PrintSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingDevice, setAddingDevice] = useState(false);
  const [newDevice, setNewDevice] = useState<Omit<PrinterDevice, "id">>(BLANK_DEVICE);
  const [saving, setSaving] = useState(false);
  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<Omit<PrinterDevice, "id">>(BLANK_DEVICE);
  // "" = Default (all sections); otherwise a section id
  const [assignSection, setAssignSection] = useState<string>("");

  const load = useCallback(async () => {
    const [{ data: devs }, { data: asgns }, { data: hubRows }, { data: secRows }] = await Promise.all([
      db.from("printer_devices").select("*").eq("restaurant_id", restaurantId).order("name"),
      db.from("printer_assignments").select("id,job_type,device_id,copies,section_id").eq("restaurant_id", restaurantId),
      db.from("printer_hubs").select("id,name,hub_key").eq("restaurant_id", restaurantId).order("name"),
      db.from("print_sections").select("id,name").eq("restaurant_id", restaurantId).order("name"),
    ]);
    setDevices((devs ?? []) as PrinterDevice[]);
    setAssignments((asgns ?? []) as PrinterAssignment[]);
    setHubs((hubRows ?? []) as PrinterHub[]);
    setSections((secRows ?? []) as PrintSection[]);
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

  // Explicit upsert keyed on (restaurant, section, job_type). section "" = global default (section_id NULL).
  async function setAssignment(jobType: string, deviceId: string | null, copies: number) {
    const sectionId = assignSection || null;
    const existing = assignments.find(
      (a) => a.job_type === jobType && (a.section_id ?? null) === sectionId,
    );
    if (existing?.id) {
      const { error } = await (db.from("printer_assignments") as any)
        .update({ device_id: deviceId || null, copies }).eq("id", existing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await (db.from("printer_assignments") as any)
        .insert({ restaurant_id: restaurantId, job_type: jobType, device_id: deviceId || null, copies, section_id: sectionId });
      if (error) { toast.error(error.message); return; }
    }
    load();
  }

  // Hubs CRUD
  async function addHub(name: string, hubKey: string) {
    if (!name.trim() || !hubKey.trim()) { toast.error("Hub name and key required"); return; }
    const { error } = await db.from("printer_hubs").insert({ restaurant_id: restaurantId, name: name.trim(), hub_key: hubKey.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Hub added"); load();
  }
  async function deleteHub(id: string) {
    const { error } = await db.from("printer_hubs").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Hub removed"); load();
  }

  // Sections CRUD
  async function addSection(name: string) {
    if (!name.trim()) { toast.error("Section name required"); return; }
    const { error } = await db.from("print_sections").insert({ restaurant_id: restaurantId, name: name.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Section added"); load();
  }
  async function deleteSection(id: string) {
    const { error } = await db.from("print_sections").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Section removed");
    if (assignSection === id) setAssignSection("");
    load();
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

      {/* Hubs */}
      <NamedListEditor
        title="Hubs (Windows PCs)"
        hint='Each hub PC runs the print agent. Put the hub key into that PC&apos;s .env as HUB_ID. Leave blank if you only have one PC.'
        items={hubs.map((h) => ({ id: h.id, primary: h.name, secondary: h.hub_key }))}
        secondaryLabel="Hub key (HUB_ID)"
        primaryPlaceholder="e.g. Counter PC"
        secondaryPlaceholder="e.g. counter-pc"
        onAdd={(name, key) => addHub(name, key ?? "")}
        onDelete={deleteHub}
        addLabel="Add hub"
        requireSecondary
      />

      {/* Sections */}
      <NamedListEditor
        title="Sections"
        hint="Named contexts (e.g. AC Floor, Non-AC Ground). Assign each staff user a section in Staff users; prints route to that section's printers."
        items={sections.map((s) => ({ id: s.id, primary: s.name }))}
        primaryPlaceholder="e.g. AC Floor"
        onAdd={(name) => addSection(name)}
        onDelete={deleteSection}
        addLabel="Add section"
      />

      {/* Device list */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Registered printers</h3>
        {devices.length === 0 && !addingDevice && (
          <p className="text-sm text-muted-foreground">No printers registered yet.</p>
        )}
        <div className="space-y-2">
          {devices.map((d) => editDeviceId === d.id ? (
            <DeviceForm key={d.id} value={editDevice} onChange={setEditDevice} hubs={hubs}
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
                  {d.hub_id ? <span className="ml-2 px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{hubs.find((h) => h.hub_key === d.hub_id)?.name ?? d.hub_id}</span> : null}
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
            <DeviceForm value={newDevice} onChange={setNewDevice} hubs={hubs}
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
          <p className="text-xs text-muted-foreground mb-3">Choose which printer handles each print type. "Browser" falls back to the device's own print dialog. "Default" applies to users with no section, or any section without its own override.</p>
          {sections.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Section:</span>
              <Select value={assignSection || "__default__"} onValueChange={(v) => setAssignSection(v === "__default__" ? "" : v)}>
                <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default — all sections</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            {JOB_TYPES.map(({ key, label }) => {
              const asgn = assignments.find((a) => a.job_type === key && (a.section_id ?? null) === (assignSection || null));
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

function DeviceForm({ value, onChange, footer, hubs }: {
  value: Omit<PrinterDevice, "id">;
  onChange: (v: Omit<PrinterDevice, "id">) => void;
  footer: React.ReactNode;
  hubs: PrinterHub[];
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
          <Label className="text-xs mb-1 block">Hub <span className="text-muted-foreground font-normal">(which PC this printer is on)</span></Label>
          <Select value={value.hub_id || "__none__"} onValueChange={(v) => onChange({ ...value, hub_id: v === "__none__" ? null : v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (single hub)</SelectItem>
              {hubs.map((h) => (
                <SelectItem key={h.id} value={h.hub_key}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {footer}
    </div>
  );
}

function NamedListEditor({
  title, hint, items, primaryPlaceholder, secondaryPlaceholder, secondaryLabel,
  onAdd, onDelete, addLabel, requireSecondary,
}: {
  title: string;
  hint: string;
  items: { id: string; primary: string; secondary?: string }[];
  primaryPlaceholder: string;
  secondaryPlaceholder?: string;
  secondaryLabel?: string;
  onAdd: (primary: string, secondary?: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  addLabel: string;
  requireSecondary?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");

  function submit() {
    onAdd(primary, requireSecondary ? secondary : undefined);
    setPrimary(""); setSecondary(""); setAdding(false);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-2">{hint}</p>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-background">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{it.primary}</span>
              {it.secondary ? <span className="ml-2 text-xs text-muted-foreground font-mono">{it.secondary}</span> : null}
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={() => onDelete(it.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="mt-2 rounded-lg border border-border p-3 bg-background space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder={primaryPlaceholder} className="h-8 text-sm" />
            {requireSecondary && (
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder={secondaryPlaceholder} className="h-8 text-sm" aria-label={secondaryLabel} />
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={submit}><Check className="h-3 w-3 mr-1" />Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setAdding(false); setPrimary(""); setSecondary(""); }}><X className="h-3 w-3 mr-1" />Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {addLabel}
        </Button>
      )}
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
