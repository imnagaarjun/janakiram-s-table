import { useState } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { mergeUnits } from "@/lib/units";

// Purchase lines have no unit column, so one-off items carry their unit in `note` behind this prefix.
export const ADHOC = "adhoc|";

export function num(s: string): number {
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Whole rupees without ".00" keeps narrow phone columns readable.
export const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; active: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden bg-surface">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-2 sm:py-1.5 text-xs font-medium flex items-center gap-1",
            i > 0 && "border-l border-border",
            value === o.value ? o.active : "hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumInput({
  value,
  onChange,
  readOnly,
  locked,
  label,
  placeholder = "0",
  suffix,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  locked?: boolean;
  label: string;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <Input
        data-entry
        type="number"
        inputMode="decimal"
        enterKeyHint="next"
        step="0.01"
        min="0"
        value={value}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
        aria-label={label}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={(e) => e.target.select()}
        onWheel={(e) => e.currentTarget.blur()}
        placeholder={placeholder}
        style={
          suffix && !locked ? { paddingRight: Math.min(suffix.length * 6 + 14, 54) } : undefined
        }
        className={cn(
          "h-11 sm:h-9 px-2 text-right text-base sm:text-sm tabular-nums placeholder:text-muted-foreground/40",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          readOnly && "bg-muted/60 text-muted-foreground",
          locked && "pr-7",
        )}
      />
      {locked && (
        <Lock className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      )}
      {suffix && !locked && (
        <span className="pointer-events-none absolute right-1.5 top-1/2 max-w-[3rem] truncate -translate-y-1/2 text-[10px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

// Unit dropdown with a built-in "+ New unit…" so custom units can be typed on the spot.
export function UnitSelect({
  value,
  options,
  onChange,
  className,
}: {
  value: string;
  options: string[];
  onChange: (u: string) => void;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const opts = mergeUnits([...options, value]);

  function commit() {
    const u = text.trim().slice(0, 20);
    setAdding(false);
    setText("");
    if (!u) return;
    onChange(opts.find((x) => x.toLowerCase() === u.toLowerCase()) ?? u);
  }

  if (adding) {
    return (
      <Input
        autoFocus
        value={text}
        maxLength={20}
        placeholder="New unit"
        aria-label="New unit name"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commit();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setAdding(false);
          }
        }}
        onBlur={commit}
        className={cn("h-11 sm:h-9", className)}
      />
    );
  }
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === "__new") setAdding(true);
        else onChange(v);
      }}
    >
      <SelectTrigger className={cn("h-11 sm:h-9 px-2", className)} aria-label="Unit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opts.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
        <SelectItem value="__new" className="text-primary font-medium">
          + New unit…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
