import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  title,
  icon: Icon,
  description,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
}) {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      </header>
      <div className="rounded-2xl border border-border bg-surface p-8 flex flex-col items-center text-center gap-3 shadow-sm">
        <div className="h-14 w-14 rounded-2xl bg-accent flex items-center justify-center">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        <div className="text-xs text-muted-foreground mt-2">Coming in a later step.</div>
      </div>
    </div>
  );
}
