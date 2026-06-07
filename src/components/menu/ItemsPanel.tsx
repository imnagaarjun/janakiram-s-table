import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Star,
  StarOff,
  EyeOff,
  Search,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { MenuImage } from "./MenuImage";
import { ItemEditor } from "./ItemEditor";
import { inr } from "@/lib/gst";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Category } from "./CategoriesPanel";

export interface MenuItem {
  id: string;
  restaurant_id: string;
  item_code: string;
  name: string;
  kot_short_name: string;
  category_id: string | null;
  image_url: string | null;
  is_favorite: boolean;
  is_active: boolean;
  is_86: boolean;
  stock_mode: "counted" | "unlimited";
  gst_rate: number;
  display_order: number;
}

export interface MenuPrice {
  id: string;
  menu_item_id: string;
  channel_key: string;
  inclusive_price: number;
  base_price: number;
  gst_rate: number;
}

export interface Channel {
  id: string;
  key: string;
  label: string;
  display_order: number;
}

export function ItemsPanel() {
  const { profile } = useAuth();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [prices, setPrices] = useState<MenuPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [a, b, c, p] = await Promise.all([
      db.from("menu_items").select("*").order("display_order").order("name"),
      db.from("categories").select("*").order("display_order"),
      db.from("price_channels").select("*").eq("is_active", true).order("display_order"),
      db.from("menu_prices").select("*"),
    ]);
    if (a.error) toast.error(a.error.message);
    setItems(a.data ?? []);
    setCats(b.data ?? []);
    setChannels(c.data ?? []);
    setPrices(p.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const filt = q.trim()
      ? items.filter(
          (i) =>
            i.name.toLowerCase().includes(q.toLowerCase()) ||
            i.item_code.toLowerCase().includes(q.toLowerCase()),
        )
      : items;
    const map = new Map<string | null, MenuItem[]>();
    for (const it of filt) {
      const k = it.category_id ?? null;
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return map;
  }, [items, q]);

  const priceByItem = useMemo(() => {
    const m = new Map<string, MenuPrice[]>();
    for (const p of prices) {
      const arr = m.get(p.menu_item_id) ?? [];
      arr.push(p);
      m.set(p.menu_item_id, arr);
    }
    return m;
  }, [prices]);

  if (!profile) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreating(true)} className="min-h-[44px]">
          <Plus className="h-4 w-4 mr-2" />
          New item
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No menu items yet. Create your first one.
        </div>
      ) : (
        <div className="space-y-6">
          {cats.map((c) => {
            const rows = grouped.get(c.id) ?? [];
            if (rows.length === 0 && q.trim()) return null;
            return (
              <Section
                key={c.id}
                title={c.name}
                items={rows}
                priceByItem={priceByItem}
                channels={channels}
                onEdit={setEditing}
              />
            );
          })}
          {(grouped.get(null) ?? []).length > 0 && (
            <Section
              title="Uncategorised"
              items={grouped.get(null) ?? []}
              priceByItem={priceByItem}
              channels={channels}
              onEdit={setEditing}
            />
          )}
        </div>
      )}

      {(creating || editing) && (
        <ItemEditor
          restaurantId={profile.restaurant_id}
          existing={editing}
          categories={cats}
          channels={channels}
          existingPrices={editing ? priceByItem.get(editing.id) ?? [] : []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  items,
  priceByItem,
  channels,
  onEdit,
}: {
  title: string;
  items: MenuItem[];
  priceByItem: Map<string, MenuPrice[]>;
  channels: Channel[];
  onEdit: (i: MenuItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}{" "}
        <span className="text-muted-foreground/70 font-normal normal-case">({items.length})</span>
      </h3>
      <div className="rounded-2xl border border-border bg-surface overflow-hidden divide-y">
        {items.map((it) => {
          const px = priceByItem.get(it.id) ?? [];
          return (
            <button
              key={it.id}
              onClick={() => onEdit(it)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
            >
              <MenuImage path={it.image_url} alt={it.name} className="h-14 w-14 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{it.name}</span>
                  {it.is_favorite && <Star className="h-3.5 w-3.5 text-warning fill-warning" />}
                  {!it.is_active && (
                    <Badge variant="outline" className="text-xs">
                      <EyeOff className="h-3 w-3 mr-1" />
                      hidden
                    </Badge>
                  )}
                  {it.is_86 && (
                    <Badge variant="destructive" className="text-xs">
                      <Ban className="h-3 w-3 mr-1" />
                      86
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {it.stock_mode}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {it.item_code} · KOT: {it.kot_short_name}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0 hidden sm:block">
                {channels.map((ch) => {
                  const p = px.find((x) => x.channel_key === ch.key);
                  return (
                    <div key={ch.key}>
                      <span className="opacity-70">{ch.label}:</span>{" "}
                      <span className="text-foreground font-medium">
                        {p ? inr(p.inclusive_price) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export { StarOff };
