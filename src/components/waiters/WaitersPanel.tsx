import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayIsoDate } from "@/lib/tables";

interface Waiter {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  join_date: string | null;
  is_active: boolean;
  payroll_ref: string | null;
}

export function WaitersPanel() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Waiters</h1>
      <Registry />
    </div>
  );
}


function Registry() {
  const { profile } = useAuth();
  const [list, setList] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    role: "waiter",
    join_date: todayIsoDate(),
    payroll_ref: "",
  });

  const load = useCallback(async () => {
    const { data } = await db
      .from("waiters")
      .select("id,name,phone,role,join_date,is_active,payroll_ref")
      .order("is_active", { ascending: false })
      .order("name");
    setList((data ?? []) as Waiter[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!draft.name.trim()) return toast.error("Name required");
    const { error } = await db.from("waiters").insert({
      restaurant_id: profile?.restaurant_id,
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      role: draft.role,
      join_date: draft.join_date || null,
      payroll_ref: draft.payroll_ref.trim() || null,
    });
    if (error) return toast.error(error.message);
    setDraft({ name: "", phone: "", role: "waiter", join_date: todayIsoDate(), payroll_ref: "" });
    toast.success("Added");
    load();
  }

  async function update(w: Waiter, patch: Partial<Waiter>) {
    const { error } = await db.from("waiters").update(patch).eq("id", w.id);
    if (error) return toast.error(error.message);
    load();
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="text-sm font-semibold mb-3">Add waiter</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="waiter">Waiter</SelectItem>
                <SelectItem value="captain">Captain</SelectItem>
                <SelectItem value="runner">Runner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Join date</Label>
            <Input type="date" value={draft.join_date} onChange={(e) => setDraft({ ...draft, join_date: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Payroll ref (optional)</Label>
            <Input value={draft.payroll_ref} onChange={(e) => setDraft({ ...draft, payroll_ref: e.target.value })} />
          </div>
        </div>
        <Button onClick={add} className="mt-3">
          <Plus className="h-4 w-4" /> Add waiter
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border">
        {list.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No waiters yet.</div>
        )}
        {list.map((w) => (
          <div key={w.id} className="p-3 grid grid-cols-12 gap-2 items-center">
            <Input
              className="col-span-12 sm:col-span-3 h-9"
              defaultValue={w.name}
              onBlur={(e) => e.target.value !== w.name && update(w, { name: e.target.value })}
            />
            <Input
              className="col-span-6 sm:col-span-3 h-9"
              placeholder="Phone"
              defaultValue={w.phone ?? ""}
              onBlur={(e) => (e.target.value || null) !== w.phone && update(w, { phone: e.target.value || null })}
            />
            <Select value={w.role} onValueChange={(v) => update(w, { role: v })}>
              <SelectTrigger className="col-span-6 sm:col-span-2 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="waiter">Waiter</SelectItem>
                <SelectItem value="captain">Captain</SelectItem>
                <SelectItem value="runner">Runner</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="col-span-8 sm:col-span-3 h-9"
              type="date"
              defaultValue={w.join_date ?? ""}
              onBlur={(e) =>
                (e.target.value || null) !== w.join_date && update(w, { join_date: e.target.value || null })
              }
            />
            <label className="col-span-4 sm:col-span-1 flex items-center gap-2 justify-end text-xs">
              <Switch checked={w.is_active} onCheckedChange={(v) => update(w, { is_active: v })} />
              {w.is_active ? "Active" : "Off"}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

