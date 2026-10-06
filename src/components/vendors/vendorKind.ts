import { Package, Banknote, Store } from "lucide-react";

// Vendor "kind" drives the shared colour language: accent bar, icon tile, tint and rail of the product tree.
export function vendorKind(v: { is_multi_product: boolean; is_fixed_amount: boolean }) {
  if (v.is_multi_product)
    return {
      label: "Multi-product",
      Icon: Package,
      bar: "bg-primary",
      tile: "bg-primary/10 text-primary",
      tint: "bg-primary/[0.09]",
      rail: "border-primary/40",
      soft: "bg-primary/10 text-primary hover:bg-primary/20",
    };
  if (v.is_fixed_amount)
    return {
      label: "Fixed amount",
      Icon: Banknote,
      bar: "bg-warning",
      tile: "bg-warning/20 text-warning-foreground",
      tint: "bg-warning/[0.10]",
      rail: "border-warning/50",
      soft: "bg-warning/20 text-warning-foreground hover:bg-warning/30",
    };
  return {
    label: "Single item",
    Icon: Store,
    bar: "bg-muted-foreground/40",
    tile: "bg-muted text-muted-foreground",
    tint: "bg-muted/50",
    rail: "border-border",
    soft: "bg-muted text-foreground hover:bg-muted/80",
  };
}

export type VendorKind = ReturnType<typeof vendorKind>;
