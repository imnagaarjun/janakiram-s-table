import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/gst";
import { CheckCircle2, Printer } from "lucide-react";

interface Result {
  invoice_no: string;
  total: number;
  tendered: number;
  change: number;
  base: number;
  cgst: number;
  sgst: number;
  service_charge: number;
  discount: number;
  round_off: number;
}

export function SettlementDialog({
  open,
  result,
  onClose,
  onPrint,
}: {
  open: boolean;
  result: Result | null;
  onClose: () => void;
  onPrint: () => void;
}) {
  if (!result) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" /> Bill settled
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Invoice</div>
          <div className="text-xl font-bold tabular-nums">{result.invoice_no}</div>
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <Row k="Subtotal" v={inr(result.base + result.cgst + result.sgst - result.service_charge)} />
            {result.service_charge > 0 && <Row k="Service" v={inr(result.service_charge)} />}
            <Row k="CGST" v={inr(result.cgst)} />
            <Row k="SGST" v={inr(result.sgst)} />
            {result.discount > 0 && <Row k="Discount" v={`− ${inr(result.discount)}`} />}
            <Row k="Round off" v={inr(result.round_off)} />
            <div className="border-t border-border pt-1 mt-1">
              <Row k={<span className="font-bold">Total</span>} v={<span className="font-bold text-lg">{inr(result.total)}</span>} />
            </div>
          </div>
          {result.tendered > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1 text-sm">
              <Row k="Tendered" v={inr(result.tendered)} />
              <Row k={<span className="font-semibold">Change due</span>} v={<span className="font-bold text-lg text-emerald-700">{inr(result.change)}</span>} />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onPrint} className="flex-1">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button onClick={onClose} className="flex-1">Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between tabular-nums">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
