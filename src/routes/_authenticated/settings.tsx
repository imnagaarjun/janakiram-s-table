import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Upload } from "lucide-react";
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
