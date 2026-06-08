import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MenuImage } from "@/components/menu/MenuImage";
import { cn } from "@/lib/utils";
import { UNLIMITED, type MenuItem } from "@/lib/order";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: MenuItem | null;
  available: number;
  tableLabel?: string;
  onAdd: (qty: number, note?: string) => void;
}

export function ItemQtyDialog({ open, onOpenChange, item, available, tableLabel, onAdd }: Props) {
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");
  const typedRef = useRef(false);

  const cap = useMemo(() => {
    if (!item) return 0;
    if (item.stock_mode === "unlimited") return UNLIMITED;
    return Math.max(0, available);
  }, [item, available]);

  useEffect(() => {
    if (open) {
      setQty(0);
      setNote("");
      typedRef.current = false;
    }
  }, [open]);

  if (!item) return null;
  const blocked = cap <= 0;

  function setQ(n: number) {
    const v = Math.max(0, Math.min(cap, Math.floor(n)));
    setQty(v);
  }

  function pushDigit(d: number) {
    if (blocked) return;
    if (!typedRef.current) {
      typedRef.current = true;
      setQ(d);
    } else {
      setQ(qty * 10 + d);
    }
  }

  function submit() {
    if (blocked || qty <= 0) return;
    onAdd(qty, note.trim() || undefined);
    onOpenChange(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type === "text") {
      // allow typing in note field
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pushDigit(parseInt(e.key, 10)); }
    else if (e.key === "Backspace") { e.preventDefault(); setQ(Math.floor(qty / 10)); }
    else if (e.key === "+" || e.key === "ArrowUp") { e.preventDefault(); typedRef.current = true; setQ(qty + 1); }
    else if (e.key === "-" || e.key === "ArrowDown") { e.preventDefault(); typedRef.current = true; setQ(qty - 1); }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
          )}
        >
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2"
          >
            <X className="h-6 w-6" strokeWidth={3} />
          </DialogPrimitive.Close>

          <DialogHeader>
            {tableLabel && (
              <div className="inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                {tableLabel}
              </div>
            )}
            <DialogTitle className="flex items-center gap-3 pr-12">
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
              <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => { typedRef.current = true; setQ(qty - 1); }} disabled={blocked}>
                <Minus className="h-5 w-5" />
              </Button>
              <Input
                type="number"
                value={qty}
                onChange={(e) => { typedRef.current = true; setQ(parseInt(e.target.value || "0", 10)); }}
                className="text-center text-4xl font-extrabold h-14"
                disabled={blocked}
                autoFocus
              />
              <Button variant="outline" size="icon" className="h-14 w-14" onClick={() => { typedRef.current = true; setQ(qty + 1); }} disabled={blocked || qty >= cap}>
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {keys.map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant="secondary"
                  className="h-12 text-lg font-semibold"
                  disabled={blocked}
                  onClick={() => {
                    if (k === "C") { typedRef.current = false; setQty(0); }
                    else if (k === "⌫") { setQ(Math.floor(qty / 10)); }
                    else { pushDigit(parseInt(k, 10)); }
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

          <div className="flex justify-center pt-2">
            <Button
              disabled={blocked || qty <= 0}
              onClick={submit}
              className="h-14 w-full max-w-xs text-lg font-bold"
            >
              Add to KOT
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
