import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MenuImage } from "@/components/menu/MenuImage";
import { UNLIMITED, type MenuItem } from "@/lib/order";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: MenuItem | null;
  available: number; // already reflects current draft
  onAdd: (qty: number, note?: string) => void;
}

export function ItemQtyDialog({ open, onOpenChange, item, available, onAdd }: Props) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const cap = useMemo(() => {
    if (!item) return 0;
    if (item.stock_mode === "unlimited") return UNLIMITED;
    return Math.max(0, available);
  }, [item, available]);

  useEffect(() => {
    if (open) {
      setQty(cap === 0 ? 0 : 1);
      setNote("");
    }
  }, [open, cap]);

  if (!item) return null;
  const blocked = cap <= 0;

  function setQ(n: number) {
    const v = Math.max(0, Math.min(cap, Math.floor(n)));
    setQty(v);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <MenuImage path={item.image_url} alt={item.name} className="h-12 w-12 rounded-lg" />
            <div>
              <div className="text-base font-semibold">{item.name}</div>
              <div className="text-xs text-muted-foreground">
                {item.stock_mode === "unlimited"
                  ? "Unlimited"
                  : blocked
                    ? "Out of stock"
                    : `${available} available in kitchen`}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => setQ(qty - 1)} disabled={blocked}>
              <Minus className="h-5 w-5" />
            </Button>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQ(parseInt(e.target.value || "0", 10))}
              className="text-center text-4xl font-extrabold h-14"
              disabled={blocked}
            />
            <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => setQ(qty + 1)} disabled={blocked || qty >= cap}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {keys.map((k) => (
              <Button
                key={k}
                variant="secondary"
                className="h-12 text-lg font-semibold"
                disabled={blocked}
                onClick={() => {
                  if (k === "C") setQty(0);
                  else if (k === "⌫") setQty(Math.floor(qty / 10));
                  else setQ(qty * 10 + parseInt(k, 10));
                }}
              >
                {k}
              </Button>
            ))}
          </div>

          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. less spicy" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button
            disabled={blocked || qty <= 0}
            onClick={() => {
              onAdd(qty, note.trim() || undefined);
              onOpenChange(false);
            }}
          >
            Add to KOT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
