import { v } from "convex/values";
import { action } from "./_generated/server";

export const decrementStock = action({
  args: {
    items: v.array(
      v.object({
        id: v.string(),
        quantity: v.float64(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment variables in Convex");
      return;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/decrement_menu_item_stock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ items: args.items }),
    });

    if (!response.ok) {
      console.error("Failed to decrement stock:", await response.text());
    }
  },
});
