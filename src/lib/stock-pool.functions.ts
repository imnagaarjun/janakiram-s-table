import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SyncSchema = z.object({
  itemId: z.string().uuid(),
  itemName: z.string().min(1),
  restaurantId: z.string().uuid(),
  isBase: z.boolean(),
  baseItems: z.array(z.object({ id: z.string().uuid(), qty: z.number().positive() })),
});

/**
 * Syncs the underlying stock_pool + recipes for a menu item after save.
 * Runs server-side with service role to bypass RLS on stock_pools/recipes.
 */
export const syncItemStockPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SyncSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Always wipe existing recipes first
    await supabaseAdmin.from("recipes").delete().eq("menu_item_id", data.itemId);

    if (data.isBase) {
      // Ensure a pool named after this item exists
      let { data: pool } = await supabaseAdmin
        .from("stock_pools")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .eq("name", data.itemName)
        .maybeSingle();

      if (!pool) {
        const ins = await supabaseAdmin
          .from("stock_pools")
          .insert({ restaurant_id: data.restaurantId, name: data.itemName, type: "prepared_base", unit: "portion" })
          .select("id")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        pool = ins.data;
      }

      const { error } = await supabaseAdmin.from("recipes").insert({
        restaurant_id: data.restaurantId,
        menu_item_id: data.itemId,
        stock_pool_id: pool!.id,
        consume_ratio: 1,
      });
      if (error) throw new Error(error.message);

    } else if (data.baseItems.length > 0) {
      // For each base item, find its pool and link this item with the specified qty
      for (const base of data.baseItems) {
        const { data: baseRecipe } = await supabaseAdmin
          .from("recipes")
          .select("stock_pool_id")
          .eq("menu_item_id", base.id)
          .maybeSingle();

        if (!baseRecipe) throw new Error("A selected base item has no stock pool yet — save it first");

        const { error } = await supabaseAdmin.from("recipes").insert({
          restaurant_id: data.restaurantId,
          menu_item_id: data.itemId,
          stock_pool_id: baseRecipe.stock_pool_id,
          consume_ratio: base.qty,
        });
        if (error) throw new Error(error.message);
      }
    }

    return { synced: true };
  });
