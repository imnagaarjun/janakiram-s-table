export interface Pool { id: string; name: string }
export interface Recipe { menu_item_id: string; stock_pool_id: string; consume_ratio: number }
export interface MenuItem {
  id: string;
  name: string;
  kot_short_name: string;
  category_id: string | null;
  image_url: string | null;
  is_favorite: boolean;
  is_active: boolean;
  is_86: boolean;
  stock_mode: "counted" | "unlimited";
  display_order: number;
}
export interface Category { id: string; name: string; display_order: number; image_url: string | null }
export interface LedgerRow { id: string; pool_id: string; qty_delta: number; created_at: string }
export interface DraftLine {
  key: string;
  menu_item_id: string;
  name: string;
  qty: number;
  note?: string;
}

export const UNLIMITED = 999999;

export function computePoolQty(ledger: LedgerRow[], poolId: string): number {
  let s = 0;
  for (const l of ledger) if (l.pool_id === poolId) s += Number(l.qty_delta);
  return s;
}

export function availableFor(
  item: MenuItem,
  recipes: Recipe[],
  poolQtys: Record<string, number>,
): number {
  if (!item.is_active || item.is_86) return 0;
  if (item.stock_mode === "unlimited") return UNLIMITED;
  const myRecipes = recipes.filter((r) => r.menu_item_id === item.id);
  if (myRecipes.length === 0) return 0;
  let min = Infinity;
  for (const r of myRecipes) {
    const q = poolQtys[r.stock_pool_id] ?? 0;
    const possible = Math.floor(q / r.consume_ratio);
    if (possible < min) min = possible;
  }
  return Math.max(0, min);
}

export function projectedPoolQtys(
  ledger: LedgerRow[],
  recipes: Recipe[],
  draft: DraftLine[],
): Record<string, number> {
  const pools = new Set(recipes.map((r) => r.stock_pool_id));
  const qtys: Record<string, number> = {};
  pools.forEach((p) => (qtys[p] = computePoolQty(ledger, p)));
  for (const d of draft) {
    for (const r of recipes.filter((r) => r.menu_item_id === d.menu_item_id)) {
      qtys[r.stock_pool_id] = (qtys[r.stock_pool_id] ?? 0) - d.qty * Number(r.consume_ratio);
    }
  }
  return qtys;
}

export function parseRpcError(msg: string): string {
  // Recognise our raised codes
  if (msg.startsWith("INSUFFICIENT_STOCK:")) {
    const [, name, n] = msg.split(":");
    return `${name}: only ${n} left in kitchen.`;
  }
  if (msg.startsWith("ITEM_86:")) return `${msg.slice(8)} is 86'd.`;
  if (msg.startsWith("ITEM_INACTIVE:")) return `${msg.slice(14)} is inactive.`;
  if (msg === "BAD_PIN") return "Manager PIN didn't match.";
  if (msg === "NOT_MANAGER") return "That PIN isn't a manager.";
  if (msg === "REASON_REQUIRED") return "Pick a void reason.";
  if (msg === "SESSION_CLOSED") return "Session is already closed.";
  if (msg === "ALREADY_VOID") return "Line is already voided.";
  if (msg === "NO_STOCK_DEFINED") return "A counted item has no stock recipe.";
  if (msg === "EMPTY_KOT") return "Add at least one item.";
  return msg;
}
