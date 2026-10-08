import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AUTO_SOURCES, sourceInfo, type CashSource } from "@/lib/cash-sources";

// Search box for choosing where an automatic line gets its figure.
export function SourcePicker({
  value,
  onChange,
}: {
  value: Exclude<CashSource, "manual">;
  onChange: (s: Exclude<CashSource, "manual">) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = sourceInfo(value);
  const groups = Array.from(new Set(AUTO_SOURCES.map((s) => s.group)));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between px-2 font-normal"
        >
          <span className="truncate text-left">
            {current ? `${current.group} · ${current.label}` : "Choose source"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search, e.g. cash" />
          <CommandList>
            <CommandEmpty>No source found.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g} heading={g}>
                {AUTO_SOURCES.filter((s) => s.group === g).map((s) => {
                  const enabled = s.available || s.id === value;
                  return (
                    <CommandItem
                      key={s.id}
                      value={`${s.group} ${s.label}`}
                      disabled={!enabled}
                      onSelect={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("h-4 w-4 mr-2", value === s.id ? "opacity-100" : "opacity-0")}
                      />
                      <div className="min-w-0">
                        <div className="text-sm">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {s.available ? s.hint : "Available when billing is ready"}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
