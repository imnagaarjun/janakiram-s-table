import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

// One tidy control: up/down arrows (work everywhere, incl. touch) and a drag handle (desktop).
export function ReorderControls({
  canUp,
  canDown,
  onUp,
  onDown,
  onDragStart,
  onDragEnd,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="flex flex-col items-center shrink-0 -ml-1 text-muted-foreground">
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        aria-label="Move up"
        className="h-5 w-6 grid place-items-center rounded hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <span
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        className="hidden md:grid h-5 w-6 place-items-center cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </span>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        aria-label="Move down"
        className="h-5 w-6 grid place-items-center rounded hover:bg-accent disabled:opacity-25 disabled:hover:bg-transparent"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}

// Moves `fromId` next to `toId` (after it when dragging down, before it when dragging up).
export function moved<T extends { id: string }>(list: T[], fromId: string, toId: string): T[] {
  const fromIdx = list.findIndex((x) => x.id === fromId);
  const toIdx0 = list.findIndex((x) => x.id === toId);
  if (fromIdx < 0 || toIdx0 < 0 || fromIdx === toIdx0) return list;
  const next = list.filter((x) => x.id !== fromId);
  const toIdx = next.findIndex((x) => x.id === toId);
  next.splice(fromIdx < toIdx0 ? toIdx + 1 : toIdx, 0, list[fromIdx]);
  return next;
}

export function swapped<T>(list: T[], i: number, j: number): T[] {
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
