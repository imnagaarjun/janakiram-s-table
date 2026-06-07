import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import type { Restaurant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/settings")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin"]}>
      <SettingsInner />
    </RoleGuard>
  );
}

function SettingsInner() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rest, setRest] = useState<Restaurant | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

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
        </div>

        <Button onClick={save} disabled={saving} className="min-h-[48px] w-full md:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save changes
        </Button>
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
