# Convex Order Management System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the order system from Supabase to Convex for native real-time, add staff accounts for order management, customer order tracking, and new-order audio notifications.

**Architecture:** Convex becomes the order hub (orders, order_items, staff tables). Supabase retains auth for all users and all non-order data (menu items, inventory, categories, merchants, payments, settings, promotions). Checkout submits orders directly to Convex (replacing the current Facebook Messenger redirect). Staff get a separate login/orders portal. Customers track orders via order ID lookup.

**Tech Stack:** Convex (real-time DB + functions), React 18, TypeScript, Tailwind CSS, Supabase Auth, Vite 5

**Convex Deployment:** `vivid-caiman-974`
**Convex Deploy Key:** (see .env.local)

---

## Feature 1: Convex Setup & Order Schema

**Team:** Coordinator plans tasks, UI/UX reviews types, Developer implements, Reviewer checks schema design, Tester verifies deployment.

### Task 1.1: Install Convex and Initialize Project

**Files:**
- Modify: `package.json`
- Create: `convex/_generated/` (auto-generated)
- Create: `convex/tsconfig.json` (auto-generated)
- Modify: `vite.config.ts`
- Modify: `src/main.tsx`

**Step 1: Install Convex dependencies**

Run:
```bash
npm install convex
```

**Step 2: Initialize Convex in the project**

Run:
```bash
npx convex init
```

When prompted, select "vivid-caiman-974" as the existing project or configure manually.

**Step 3: Set the deploy key as environment variable**

Create `.env.local` (or add to existing `.env`):
```
CONVEX_DEPLOY_KEY=dev:vivid-caiman-974|eyJ2MiI6IjBkYWRjNzg2MDdkMDQ3ODFhYTNlMTIzNGEyM2ZiM2ViIn0=
```

**Step 4: Update `vite.config.ts` to include Convex plugin**

Replace the entire file with:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
```

Note: Convex does not require a Vite plugin. The Convex client connects directly via the deployment URL.

**Step 5: Create `src/lib/convex.ts` with the Convex client**

```typescript
import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error('Missing VITE_CONVEX_URL environment variable');
}

export const convex = new ConvexReactClient(convexUrl);
```

**Step 6: Add `VITE_CONVEX_URL` to environment**

Add to `.env.local`:
```
VITE_CONVEX_URL=https://vivid-caiman-974.convex.cloud
```

**Step 7: Wrap the app with ConvexProvider in `src/main.tsx`**

Read `src/main.tsx` first. Then wrap the `<App />` with:

```typescript
import { ConvexProvider } from "convex/react";
import { convex } from "./lib/convex";

// Wrap App:
<ConvexProvider client={convex}>
  <App />
</ConvexProvider>
```

Keep existing providers (`AuthProvider`, etc.) inside — they stay as-is.

**Step 8: Run `npx convex dev` to verify connection**

Run:
```bash
npx convex dev
```

Expected: Convex dev server starts, watches for schema changes, shows "✓ Connected to vivid-caiman-974".

**Step 9: Commit**

```bash
git add package.json package-lock.json convex/ vite.config.ts src/main.tsx src/lib/convex.ts .env.local
git commit -m "feat: install and initialize Convex with deployment vivid-caiman-974"
```

---

### Task 1.2: Define Convex Schema

**Files:**
- Create: `convex/schema.ts`

**Step 1: Create the schema file**

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  orders: defineTable({
    merchantId: v.string(),
    customerName: v.string(),
    contactNumber: v.string(),
    serviceType: v.union(
      v.literal("dine-in"),
      v.literal("pickup"),
      v.literal("delivery")
    ),
    address: v.optional(v.string()),
    deliveryLatitude: v.optional(v.float64()),
    deliveryLongitude: v.optional(v.float64()),
    distanceKm: v.optional(v.float64()),
    deliveryFee: v.optional(v.float64()),
    deliveryFeeBreakdown: v.optional(v.any()),
    pickupTime: v.optional(v.string()),
    partySize: v.optional(v.float64()),
    dineInTime: v.optional(v.string()),
    paymentMethod: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    total: v.float64(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    ipAddress: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    staffId: v.optional(v.string()),
  })
    .index("by_merchant", ["merchantId"])
    .index("by_status", ["status"])
    .index("by_merchant_and_status", ["merchantId", "status"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    itemId: v.string(),
    name: v.string(),
    variation: v.optional(v.any()),
    addOns: v.optional(v.any()),
    unitPrice: v.float64(),
    quantity: v.float64(),
    subtotal: v.float64(),
  })
    .index("by_order", ["orderId"]),

  staff: defineTable({
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
    merchantId: v.string(),
    isActive: v.boolean(),
  })
    .index("by_supabase_user", ["supabaseUserId"])
    .index("by_merchant", ["merchantId"]),
});
```

**Step 2: Push schema to Convex**

Run:
```bash
npx convex dev
```

Expected: Schema deploys successfully, tables created.

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: define Convex schema for orders, orderItems, and staff"
```

---

### Task 1.3: Create Core Order Convex Functions

**Files:**
- Create: `convex/orders.ts`

**Step 1: Create the orders module with all queries and mutations**

```typescript
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Create a new order with items
export const create = mutation({
  args: {
    merchantId: v.string(),
    customerName: v.string(),
    contactNumber: v.string(),
    serviceType: v.union(
      v.literal("dine-in"),
      v.literal("pickup"),
      v.literal("delivery")
    ),
    address: v.optional(v.string()),
    deliveryLatitude: v.optional(v.float64()),
    deliveryLongitude: v.optional(v.float64()),
    distanceKm: v.optional(v.float64()),
    deliveryFee: v.optional(v.float64()),
    deliveryFeeBreakdown: v.optional(v.any()),
    pickupTime: v.optional(v.string()),
    partySize: v.optional(v.float64()),
    dineInTime: v.optional(v.string()),
    paymentMethod: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    total: v.float64(),
    ipAddress: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    items: v.array(
      v.object({
        itemId: v.string(),
        name: v.string(),
        variation: v.optional(v.any()),
        addOns: v.optional(v.any()),
        unitPrice: v.float64(),
        quantity: v.float64(),
        subtotal: v.float64(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { items, ...orderData } = args;

    const orderId = await ctx.db.insert("orders", {
      ...orderData,
      status: "pending",
    });

    for (const item of items) {
      await ctx.db.insert("orderItems", {
        orderId,
        ...item,
      });
    }

    return orderId;
  },
});

// Get all orders with items (admin view)
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db
      .query("orders")
      .order("desc")
      .collect();

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );

    return ordersWithItems;
  },
});

// Get orders for a specific merchant (staff view)
export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_merchant", (q) => q.eq("merchantId", args.merchantId))
      .order("desc")
      .collect();

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, order_items: items };
      })
    );

    return ordersWithItems;
  },
});

// Get a single order by ID (customer tracking)
export const getById = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return { ...order, order_items: items };
  },
});

// Update order status
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    staffId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      status: args.status,
      staffId: args.staffId,
    });
  },
});
```

**Step 2: Verify functions deploy**

Run:
```bash
npx convex dev
```

Expected: All functions deploy without errors.

**Step 3: Commit**

```bash
git add convex/orders.ts
git commit -m "feat: create Convex order queries and mutations"
```

---

### Task 1.4: Create Staff Convex Functions

**Files:**
- Create: `convex/staff.ts`

**Step 1: Create the staff module**

```typescript
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const create = mutation({
  args: {
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
    merchantId: v.string(),
  },
  handler: async (ctx, args) => {
    const staffId = await ctx.db.insert("staff", {
      ...args,
      isActive: true,
    });
    return staffId;
  },
});

export const listByMerchant = query({
  args: { merchantId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staff")
      .withIndex("by_merchant", (q) => q.eq("merchantId", args.merchantId))
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("staff").collect();
  },
});

export const getBySupabaseUser = query({
  args: { supabaseUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("staff")
      .withIndex("by_supabase_user", (q) =>
        q.eq("supabaseUserId", args.supabaseUserId)
      )
      .first();
  },
});

export const deactivate = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.staffId, { isActive: false });
  },
});

export const activate = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.staffId, { isActive: true });
  },
});
```

**Step 2: Verify functions deploy**

Run:
```bash
npx convex dev
```

**Step 3: Commit**

```bash
git add convex/staff.ts
git commit -m "feat: create Convex staff queries and mutations"
```

---

### Task 1.5: Create Convex Action for Supabase Inventory Decrement

**Files:**
- Create: `convex/inventoryActions.ts`

Since inventory stays in Supabase, we need a Convex action (not mutation) to call Supabase's RPC for stock decrement. Actions can make external HTTP calls.

**Step 1: Set Supabase environment variables in Convex**

Run:
```bash
npx convex env set SUPABASE_URL <your-supabase-url>
npx convex env set SUPABASE_ANON_KEY <your-supabase-anon-key>
```

Get the values from the existing `.env` or `src/lib/supabase.ts` runtime.

**Step 2: Create the inventory action**

```typescript
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
```

**Step 3: Verify it deploys**

Run:
```bash
npx convex dev
```

**Step 4: Commit**

```bash
git add convex/inventoryActions.ts
git commit -m "feat: add Convex action for Supabase inventory decrement"
```

---

## Feature 2: Order Migration (Checkout + Admin OrdersManager)

**Team:** Coordinator plans migration, UI/UX ensures checkout UX stays smooth, Developer rewires hooks, Reviewer verifies no Supabase order logic remains, Tester verifies order creation end-to-end.

### Task 2.1: Create `useConvexOrders` Hook

**Files:**
- Create: `src/hooks/useConvexOrders.ts`

This replaces `useOrders.ts` with Convex-native queries and mutations.

**Step 1: Create the hook**

```typescript
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export type ConvexOrder = {
  _id: Id<"orders">;
  _creationTime: number;
  merchantId: string;
  customerName: string;
  contactNumber: string;
  serviceType: "dine-in" | "pickup" | "delivery";
  address?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  distanceKm?: number;
  deliveryFee?: number;
  deliveryFeeBreakdown?: any;
  pickupTime?: string;
  partySize?: number;
  dineInTime?: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  total: number;
  status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
  ipAddress?: string;
  receiptUrl?: string;
  staffId?: string;
  order_items: Array<{
    _id: Id<"orderItems">;
    _creationTime: number;
    orderId: Id<"orders">;
    itemId: string;
    name: string;
    variation?: any;
    addOns?: any;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>;
};

export const useConvexOrders = () => {
  const orders = useQuery(api.orders.listAll) ?? [];
  const createOrderMutation = useMutation(api.orders.create);
  const updateStatusMutation = useMutation(api.orders.updateStatus);
  const decrementStock = useAction(api.inventoryActions.decrementStock);

  const createOrder = async (payload: {
    merchantId: string;
    customerName: string;
    contactNumber: string;
    serviceType: "dine-in" | "pickup" | "delivery";
    address?: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
    distanceKm?: number;
    deliveryFee?: number;
    deliveryFeeBreakdown?: any;
    pickupTime?: string;
    partySize?: number;
    dineInTime?: string;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
    total: number;
    ipAddress?: string;
    receiptUrl?: string;
    items: Array<{
      itemId: string;
      name: string;
      variation?: any;
      addOns?: any;
      unitPrice: number;
      quantity: number;
      subtotal: number;
    }>;
  }) => {
    const orderId = await createOrderMutation(payload);

    // Decrement inventory in Supabase via Convex action
    const stockItems = payload.items.map((item) => ({
      id: item.itemId,
      quantity: item.quantity,
    }));
    try {
      await decrementStock({ items: stockItems });
    } catch (err) {
      console.error("Failed to decrement stock:", err);
    }

    return orderId;
  };

  const updateOrderStatus = async (
    orderId: Id<"orders">,
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled",
    staffId?: string
  ) => {
    await updateStatusMutation({ orderId, status, staffId });
  };

  return {
    orders: orders as ConvexOrder[],
    loading: orders === undefined,
    createOrder,
    updateOrderStatus,
  };
};

export const useConvexOrdersByMerchant = (merchantId: string) => {
  const orders = useQuery(api.orders.listByMerchant, { merchantId }) ?? [];
  const updateStatusMutation = useMutation(api.orders.updateStatus);

  const updateOrderStatus = async (
    orderId: Id<"orders">,
    status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled",
    staffId?: string
  ) => {
    await updateStatusMutation({ orderId, status, staffId });
  };

  return {
    orders: orders as ConvexOrder[],
    loading: orders === undefined,
    updateOrderStatus,
  };
};

export const useConvexOrderById = (orderId: string | undefined) => {
  // We need to handle the case where orderId might not be a valid Convex ID
  const order = useQuery(
    api.orders.getById,
    orderId ? { orderId: orderId as Id<"orders"> } : "skip"
  );

  return {
    order: order as ConvexOrder | null | undefined,
    loading: order === undefined,
  };
};
```

**Step 2: Commit**

```bash
git add src/hooks/useConvexOrders.ts
git commit -m "feat: create useConvexOrders hook replacing Supabase order logic"
```

---

### Task 2.2: Rewire OrdersManager to Use Convex

**Files:**
- Modify: `src/components/OrdersManager.tsx`

**Step 1: Update imports and hook usage**

In `src/components/OrdersManager.tsx`, replace the import of `useOrders` and `OrderWithItems`:

Replace line 3:
```typescript
import { useOrders, OrderWithItems } from '../hooks/useOrders';
```
With:
```typescript
import { useConvexOrders, ConvexOrder } from '../hooks/useConvexOrders';
```

**Step 2: Replace hook destructuring**

Replace line 10-11 (the `useOrders()` destructuring):
```typescript
const { orders, loading, error, updateOrderStatus } = useOrders();
```
With:
```typescript
const { orders, loading, updateOrderStatus } = useConvexOrders();
```

Remove the `error` state variable if it was declared separately, or add a local one:
```typescript
const [error] = useState<string | null>(null);
```

**Step 3: Update type references**

Replace all `OrderWithItems` type references with `ConvexOrder` throughout the file. Key locations:
- `selectedOrder` state type: `useState<ConvexOrder | null>(null)`
- Any function parameter types

**Step 4: Update ID references**

Throughout the file, replace `.id` with `._id` for order IDs (Convex uses `_id`):
- `order.id` → `order._id`
- In search filter: update the text search to use `order._id` instead of `order.id`

Replace `.created_at` with `._creationTime`:
- `order.created_at` → `order._creationTime`
- The `_creationTime` is a Unix timestamp (milliseconds), same as `Date.now()`

Replace `order.order_items` references — these stay the same since we named the property `order_items` in the Convex query.

For order items within the detail view:
- `item.id` → `item._id`
- `item.unit_price` → `item.unitPrice`
- `item.add_ons` → `item.addOns`

**Step 5: Update handleStatusUpdate**

The `updateOrderStatus` now takes a Convex `Id<"orders">` instead of a string UUID. Update the call:
```typescript
const handleStatusUpdate = async (orderId: string, newStatus: string) => {
  setUpdating(orderId);
  try {
    await updateOrderStatus(
      orderId as any,
      newStatus as any
    );
  } catch (err) {
    console.error('Failed to update order status:', err);
  } finally {
    setUpdating(null);
  }
};
```

**Step 6: Update date formatting**

Since `_creationTime` is a number (ms timestamp), update `formatDateTime` calls:
```typescript
// Before: formatDateTime(order.created_at)
// After:  formatDateTime(new Date(order._creationTime).toISOString())
```

Or update `formatDateTime` to accept a number:
```typescript
const formatDateTime = (timestamp: string | number) => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
```

**Step 7: Update CSV export**

In `exportToCSV`, update field references to match Convex naming:
- `o.customer_name` → `o.customerName`
- `o.contact_number` → `o.contactNumber`
- `o.service_type` → `o.serviceType`
- `o.created_at` → use `new Date(o._creationTime).toISOString()`

**Step 8: Update the filtered memo**

Update the search filter to use camelCase Convex fields:
- `o.customer_name` → `o.customerName`
- `o.contact_number` → `o.contactNumber`
- `o.service_type` → `o.serviceType`

**Step 9: Verify the component compiles**

Run:
```bash
npm run build
```

Expected: No TypeScript errors related to OrdersManager.

**Step 10: Commit**

```bash
git add src/components/OrdersManager.tsx
git commit -m "feat: rewire OrdersManager to use Convex instead of Supabase"
```

---

### Task 2.3: Rewire Checkout to Submit Orders to Convex

**Files:**
- Modify: `src/components/Checkout.tsx`

**Important context:** Currently `Checkout.tsx` does NOT call `createOrder`. It builds a text summary and redirects to Facebook Messenger. We need to change it to:
1. Create the order in Convex
2. Show the order ID / redirect to tracking page
3. Optionally still send to Messenger as a notification

**Step 1: Add Convex imports**

Add at the top of `src/components/Checkout.tsx`:
```typescript
import { useConvexOrders } from '../hooks/useConvexOrders';
import { useNavigate } from 'react-router-dom';
```

**Step 2: Add hook usage inside the component**

After the existing hooks (around line 20), add:
```typescript
const { createOrder } = useConvexOrders();
const navigate = useNavigate();
```

**Step 3: Add order submission state**

Add state variables:
```typescript
const [submitting, setSubmitting] = useState(false);
const [orderError, setOrderError] = useState<string | null>(null);
```

**Step 4: Rewrite `handlePlaceOrder`**

Replace the existing `handlePlaceOrder` function (lines ~183-279) with:

```typescript
const handlePlaceOrder = async () => {
  setSubmitting(true);
  setOrderError(null);

  try {
    // Get client IP
    let ipAddress: string | undefined;
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      const ipRes = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal,
      });
      const ipData = await ipRes.json();
      ipAddress = ipData.ip;
    } catch {
      // IP fetch is best-effort
    }

    // Create one order per merchant
    const orderIds: string[] = [];

    for (const [merchantId, items] of Object.entries(itemsByMerchant)) {
      const quote = deliveryQuotesByMerchant[merchantId];
      const merchantTotal = items.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );
      const orderTotal =
        serviceType === 'delivery' && quote?.deliverable
          ? merchantTotal + (quote.fee ?? 0)
          : merchantTotal;

      const orderId = await createOrder({
        merchantId,
        customerName: customerName.trim(),
        contactNumber: contactNumber.trim(),
        serviceType,
        address: serviceType === 'delivery' ? address.trim() : undefined,
        deliveryLatitude:
          serviceType === 'delivery' ? deliveryLatitude ?? undefined : undefined,
        deliveryLongitude:
          serviceType === 'delivery' ? deliveryLongitude ?? undefined : undefined,
        distanceKm:
          serviceType === 'delivery' ? quote?.distanceKm ?? undefined : undefined,
        deliveryFee:
          serviceType === 'delivery' ? quote?.fee ?? undefined : undefined,
        deliveryFeeBreakdown:
          serviceType === 'delivery' ? quote?.breakdown ?? undefined : undefined,
        pickupTime: serviceType === 'pickup' ? pickupTime ?? undefined : undefined,
        partySize:
          serviceType === 'dine-in' ? (partySize ? Number(partySize) : undefined) : undefined,
        dineInTime: serviceType === 'dine-in' ? dineInTime ?? undefined : undefined,
        paymentMethod: paymentMethod ?? 'cash',
        referenceNumber: referenceNumber?.trim() || undefined,
        notes: notes?.trim() || undefined,
        total: orderTotal,
        ipAddress,
        receiptUrl: receiptUrl || undefined,
        items: items.map((item) => ({
          itemId: item.id,
          name: item.name,
          variation: item.selectedVariation
            ? { name: item.selectedVariation.name, price: item.selectedVariation.price }
            : undefined,
          addOns:
            item.selectedAddOns && item.selectedAddOns.length > 0
              ? item.selectedAddOns.map((a) => ({ name: a.name, price: a.price }))
              : undefined,
          unitPrice: item.totalPrice / item.quantity,
          quantity: item.quantity,
          subtotal: item.totalPrice,
        })),
      });

      orderIds.push(orderId);
    }

    // Clear the cart
    clearCart();

    // Navigate to tracking page for the first order
    if (orderIds.length === 1) {
      navigate(`/track/${orderIds[0]}`);
    } else {
      // Multiple merchants = multiple orders, show the first
      navigate(`/track/${orderIds[0]}`);
    }
  } catch (err: any) {
    setOrderError(err.message || 'Failed to place order. Please try again.');
  } finally {
    setSubmitting(false);
  }
};
```

**Step 5: Add `clearCart` from cart context**

In the destructuring of `useCartContext()`, add `clearCart`:
```typescript
const { items, totalPrice, clearCart } = useCartContext();
```

Check that `clearCart` exists in the cart context. If not, we'll need to add it.

**Step 6: Update the Place Order button**

Replace the existing button to use `submitting` state:
```typescript
<button
  onClick={handlePlaceOrder}
  disabled={!canPlaceOrder || submitting}
  className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold disabled:opacity-50"
>
  {submitting ? 'Placing Order...' : 'Place Order'}
</button>
```

**Step 7: Add error display**

Below the button, add:
```typescript
{orderError && (
  <p className="text-red-500 text-sm mt-2 text-center">{orderError}</p>
)}
```

**Step 8: Remove the old Messenger redirect logic**

Delete the clipboard copy + `window.location.replace` to `m.me/RowNelFooDelivery` code. The order now goes to Convex.

**Step 9: Verify it compiles**

Run:
```bash
npm run build
```

**Step 10: Commit**

```bash
git add src/components/Checkout.tsx
git commit -m "feat: rewire Checkout to submit orders to Convex instead of Messenger"
```

---

### Task 2.4: Clean Up Old Supabase Order Logic

**Files:**
- Modify: `src/hooks/useOrders.ts` (deprecate or delete)

**Step 1: Check for any remaining imports of `useOrders`**

Search the codebase for `useOrders` imports. If `OrdersManager` was the only consumer and it now uses `useConvexOrders`, delete or rename the file.

Run search:
```bash
grep -r "useOrders" src/ --include="*.ts" --include="*.tsx"
```

**Step 2: If no other consumers, rename to `useOrders.ts.bak` or delete**

If the only import was `OrdersManager.tsx` (now updated), delete:
```bash
rm src/hooks/useOrders.ts
```

If other files still import it, keep it but add a deprecation comment.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated Supabase order hook"
```

---

## Feature 3: Customer Order Tracking

**Team:** Coordinator plans tracking UX, UI/UX designs the tracking page layout and status visualization, Developer builds the component, Reviewer checks real-time subscription works, Tester verifies order ID lookup.

### Task 3.1: Create OrderTracking Page Component

**Files:**
- Create: `src/components/OrderTracking.tsx`

**Step 1: Create the tracking page**

```typescript
import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Package,
  CheckCircle,
  Clock,
  ChefHat,
  Truck,
  XCircle,
  Search,
  ArrowLeft,
} from 'lucide-react';
import { useConvexOrderById } from '../hooks/useConvexOrders';

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: Clock, color: 'text-yellow-500' },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle, color: 'text-blue-500' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, color: 'text-orange-500' },
  { key: 'ready', label: 'Ready', icon: Package, color: 'text-green-500' },
  { key: 'completed', label: 'Completed', icon: Truck, color: 'text-green-600' },
] as const;

const OrderTracking: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [searchId, setSearchId] = useState('');
  const { order, loading } = useConvexOrderById(orderId);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      navigate(`/track/${searchId.trim()}`);
    }
  };

  const currentStepIndex = order
    ? STATUS_STEPS.findIndex((s) => s.key === order.status)
    : -1;

  const isCancelled = order?.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Track Your Order</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder="Enter your Order ID..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Search size={20} />
          </button>
        </form>

        {/* Loading state */}
        {loading && orderId && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading order details...</p>
          </div>
        )}

        {/* Not found */}
        {!loading && orderId && !order && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <XCircle size={48} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Order Not Found</h2>
            <p className="text-gray-500">
              No order found with ID: <span className="font-mono text-sm">{orderId}</span>
            </p>
            <p className="text-gray-400 text-sm mt-2">
              Please check the order ID and try again.
            </p>
          </div>
        )}

        {/* No order ID yet */}
        {!orderId && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Search size={48} className="text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-800 mb-2">
              Enter Your Order ID
            </h2>
            <p className="text-gray-500">
              Use the search bar above to look up your order status.
            </p>
          </div>
        )}

        {/* Order found */}
        {order && (
          <>
            {/* Status progress */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Order Status</h2>
                <span className="font-mono text-xs text-gray-400">
                  {order._id}
                </span>
              </div>

              {isCancelled ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
                  <XCircle size={24} className="text-red-500" />
                  <div>
                    <p className="font-semibold text-red-700">Order Cancelled</p>
                    <p className="text-sm text-red-500">
                      This order has been cancelled.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {STATUS_STEPS.map((step, index) => {
                    const isCompleted = index <= currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    const Icon = step.icon;

                    return (
                      <div key={step.key} className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isCompleted
                              ? 'bg-green-100'
                              : 'bg-gray-100'
                          }`}
                        >
                          <Icon
                            size={20}
                            className={
                              isCompleted
                                ? step.color
                                : 'text-gray-300'
                            }
                          />
                        </div>
                        <div className="flex-1">
                          <p
                            className={`font-medium ${
                              isCompleted ? 'text-gray-800' : 'text-gray-400'
                            }`}
                          >
                            {step.label}
                          </p>
                          {isCurrent && (
                            <p className="text-sm text-green-600 font-medium">
                              Current status
                            </p>
                          )}
                        </div>
                        {isCompleted && (
                          <CheckCircle size={16} className="text-green-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order details */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Order Details
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{order.customerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium capitalize">
                    {order.serviceType.replace('-', ' ')}
                  </span>
                </div>
                {order.address && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Address</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {order.address}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Payment</span>
                  <span className="font-medium">{order.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Placed</span>
                  <span className="font-medium">
                    {new Date(order._creationTime).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Items</h2>
              <div className="space-y-3">
                {order.order_items.map((item) => (
                  <div
                    key={item._id}
                    className="flex justify-between items-start text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.variation && (
                        <p className="text-gray-400 text-xs">
                          {(item.variation as any).name}
                        </p>
                      )}
                      {item.addOns &&
                        Array.isArray(item.addOns) &&
                        item.addOns.length > 0 && (
                          <p className="text-gray-400 text-xs">
                            +{' '}
                            {(item.addOns as any[])
                              .map((a) => a.name)
                              .join(', ')}
                          </p>
                        )}
                      <p className="text-gray-400 text-xs">
                        x{item.quantity}
                      </p>
                    </div>
                    <p className="font-medium">
                      ₱{item.subtotal.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t mt-4 pt-4 flex justify-between">
                {order.deliveryFee && order.deliveryFee > 0 && (
                  <div className="flex justify-between text-sm w-full mb-2">
                    <span className="text-gray-500">Delivery Fee</span>
                    <span>₱{order.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-red-600">
                  ₱{order.total.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
```

**Step 2: Commit**

```bash
git add src/components/OrderTracking.tsx
git commit -m "feat: create OrderTracking page for customer order lookup"
```

---

### Task 3.2: Add Tracking Route to App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add import**

At the top of `src/App.tsx`, add:
```typescript
import OrderTracking from './components/OrderTracking';
```

**Step 2: Add route**

Inside the `<Routes>` block (around line 80), add before the `/admin` routes:
```typescript
<Route path="/track" element={<OrderTracking />} />
<Route path="/track/:orderId" element={<OrderTracking />} />
```

**Step 3: Verify it compiles**

Run:
```bash
npm run build
```

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add /track/:orderId route for customer order tracking"
```

---

## Feature 4: Staff Authentication & Management

**Team:** Coordinator plans the staff flow, UI/UX designs the staff portal and admin staff management section, Developer implements auth + components, Reviewer verifies role-based access, Tester verifies staff can only access orders.

### Task 4.1: Update Auth Context for Staff Role

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

**Step 1: Add `isStaff` to the context**

In the `AuthContextType` interface, add:
```typescript
isStaff: boolean;
```

**Step 2: Compute `isStaff` in the provider**

After the `isAdmin` computation (line ~81), add:
```typescript
const isStaff = user?.user_metadata?.role === 'staff';
```

**Step 3: Add to the context value**

Add `isStaff` to the value prop object passed to the provider.

**Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: add isStaff role detection to AuthContext"
```

---

### Task 4.2: Create Staff Login Page

**Files:**
- Create: `src/components/StaffLogin.tsx`

**Step 1: Create the component** (modeled after AdminLogin.tsx)

```typescript
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, ShoppingCart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const StaffLogin: React.FC = () => {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    const { error } = await signIn(email, password);

    if (error) {
      setLoginError(error.message);
      setIsLoading(false);
    } else {
      navigate('/staff/orders');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingCart size={32} className="text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Staff Portal</h1>
            <p className="text-gray-500 mt-1">Sign in to manage orders</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent pr-12"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {loginError && (
              <p className="text-red-500 text-sm text-center">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-red-600 hover:text-red-700">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
```

**Step 2: Commit**

```bash
git add src/components/StaffLogin.tsx
git commit -m "feat: create StaffLogin page component"
```

---

### Task 4.3: Create Staff Orders Panel

**Files:**
- Create: `src/components/StaffOrdersPanel.tsx`

**Step 1: Create the staff order management component**

This is a simplified version of OrdersManager, scoped to one merchant. Staff can only view and update order status.

```typescript
import React, { useState, useMemo } from 'react';
import {
  Search,
  LogOut,
  Clock,
  CheckCircle,
  ChefHat,
  Package,
  Truck,
  XCircle,
  Eye,
  X,
  Filter,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConvexOrdersByMerchant, ConvexOrder } from '../hooks/useConvexOrders';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const StaffOrdersPanel: React.FC = () => {
  const { user, signOut } = useAuth();
  const staffRecord = useQuery(
    api.staff.getBySupabaseUser,
    user ? { supabaseUserId: user.id } : 'skip'
  );
  const merchantId = staffRecord?.merchantId ?? '';
  const { orders, loading, updateOrderStatus } = useConvexOrdersByMerchant(merchantId);

  const [selectedOrder, setSelectedOrder] = useState<ConvexOrder | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-orange-100 text-orange-800',
      ready: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, React.ElementType> = {
      pending: Clock,
      confirmed: CheckCircle,
      preparing: ChefHat,
      ready: Package,
      completed: Truck,
      cancelled: XCircle,
    };
    return icons[status] || Clock;
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      await updateOrderStatus(
        orderId as any,
        newStatus as any,
        user?.id
      );
    } catch (err) {
      console.error('Failed to update order status:', err);
    } finally {
      setUpdating(null);
    }
  };

  const filtered = useMemo(() => {
    let result = [...orders];
    if (statusFilter !== 'all') {
      result = result.filter((o) => o.status === statusFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          o.contactNumber.includes(q) ||
          o._id.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, statusFilter, query]);

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!staffRecord && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Staff Account Not Found
          </h2>
          <p className="text-gray-500 mb-4">
            Your account is not set up as staff. Contact your administrator.
          </p>
          <button
            onClick={signOut}
            className="px-4 py-2 bg-red-600 text-white rounded-lg"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Order Management</h1>
            <p className="text-sm text-gray-500">
              {staffRecord?.name} &middot; Staff
            </p>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, phone, or order ID..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Orders count */}
        <p className="text-sm text-gray-500 mb-4">
          {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        </p>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Loading orders...</p>
          </div>
        )}

        {/* Orders list */}
        {!loading && (
          <div className="space-y-3">
            {filtered.map((order) => {
              const StatusIcon = getStatusIcon(order.status);
              return (
                <div
                  key={order._id}
                  className="bg-white rounded-xl shadow-sm p-4 border border-gray-100"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {order.customerName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {order.contactNumber}
                      </p>
                      <p className="text-xs text-gray-400 font-mono">
                        {order._id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600">
                        ₱{order.total.toFixed(2)}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          order.status
                        )}`}
                      >
                        <StatusIcon size={12} />
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {formatDateTime(order._creationTime)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Eye size={16} />
                      </button>
                      {order.status !== 'completed' &&
                        order.status !== 'cancelled' && (
                          <select
                            value={order.status}
                            onChange={(e) =>
                              handleStatusUpdate(order._id, e.target.value)
                            }
                            disabled={updating === order._id}
                            className="text-sm px-2 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                          >
                            <option value="pending">Pending</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="preparing">Preparing</option>
                            <option value="ready">Ready</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Package size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No orders found</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Order Details</h2>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Order ID</span>
                <span className="font-mono text-xs">{selectedOrder._id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Customer</span>
                <span className="font-medium">{selectedOrder.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Contact</span>
                <span>{selectedOrder.contactNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Service</span>
                <span className="capitalize">
                  {selectedOrder.serviceType.replace('-', ' ')}
                </span>
              </div>
              {selectedOrder.address && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Address</span>
                  <span className="text-right max-w-[60%]">
                    {selectedOrder.address}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Payment</span>
                <span>{selectedOrder.paymentMethod}</span>
              </div>
              {selectedOrder.notes && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Notes</span>
                  <span className="text-right max-w-[60%]">
                    {selectedOrder.notes}
                  </span>
                </div>
              )}

              <div className="border-t pt-3 mt-3">
                <h3 className="font-semibold mb-2">Items</h3>
                {selectedOrder.order_items.map((item) => (
                  <div key={item._id} className="flex justify-between py-1">
                    <div>
                      <span>{item.name}</span>
                      <span className="text-gray-400 ml-1">x{item.quantity}</span>
                    </div>
                    <span>₱{item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {selectedOrder.deliveryFee && selectedOrder.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery Fee</span>
                  <span>₱{selectedOrder.deliveryFee.toFixed(2)}</span>
                </div>
              )}

              <div className="border-t pt-3 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-red-600">
                  ₱{selectedOrder.total.toFixed(2)}
                </span>
              </div>

              {selectedOrder.receiptUrl && (
                <div className="mt-3">
                  <p className="text-gray-500 mb-2">Receipt</p>
                  <img
                    src={selectedOrder.receiptUrl}
                    alt="Receipt"
                    className="w-full rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffOrdersPanel;
```

**Step 2: Commit**

```bash
git add src/components/StaffOrdersPanel.tsx
git commit -m "feat: create StaffOrdersPanel for staff order management"
```

---

### Task 4.4: Create Protected Staff Route

**Files:**
- Create: `src/components/ProtectedStaffRoute.tsx`

**Step 1: Create the route guard**

```typescript
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedStaffRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, loading, isStaff } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/staff/login" replace />;
  }

  if (!isStaff) {
    return <Navigate to="/staff/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedStaffRoute;
```

**Step 2: Commit**

```bash
git add src/components/ProtectedStaffRoute.tsx
git commit -m "feat: create ProtectedStaffRoute for staff auth guard"
```

---

### Task 4.5: Add Staff Routes to App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add imports**

```typescript
import StaffLogin from './components/StaffLogin';
import StaffOrdersPanel from './components/StaffOrdersPanel';
import ProtectedStaffRoute from './components/ProtectedStaffRoute';
```

**Step 2: Add routes**

Inside the `<Routes>` block, add:
```typescript
<Route path="/staff/login" element={<StaffLogin />} />
<Route
  path="/staff/orders"
  element={
    <ProtectedStaffRoute>
      <StaffOrdersPanel />
    </ProtectedStaffRoute>
  }
/>
```

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add staff login and orders routes"
```

---

### Task 4.6: Create Staff Management Section in Admin Dashboard

**Files:**
- Create: `src/components/StaffManager.tsx`

**Step 1: Create the staff management component**

```typescript
import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { supabase } from '../lib/supabase';
import { useMerchants } from '../hooks/useMerchants';

interface StaffManagerProps {
  onBack: () => void;
}

const StaffManager: React.FC<StaffManagerProps> = ({ onBack }) => {
  const staffList = useQuery(api.staff.listAll) ?? [];
  const createStaffMutation = useMutation(api.staff.create);
  const deactivateStaff = useMutation(api.staff.deactivate);
  const activateStaff = useMutation(api.staff.activate);
  const { merchants } = useMerchants();

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    merchantId: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      // Create user in Supabase Auth with staff role
      const { data, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: formData.password,
        user_metadata: { role: 'staff', name: formData.name },
        email_confirm: true,
      });

      if (authError) {
        // Fallback: try signUp if admin API is not available
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
              data: { role: 'staff', name: formData.name },
            },
          });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error('Failed to create user');

        // Create staff record in Convex
        await createStaffMutation({
          supabaseUserId: signUpData.user.id,
          email: formData.email,
          name: formData.name,
          merchantId: formData.merchantId,
        });
      } else {
        if (!data.user) throw new Error('Failed to create user');

        // Create staff record in Convex
        await createStaffMutation({
          supabaseUserId: data.user.id,
          email: formData.email,
          name: formData.name,
          merchantId: formData.merchantId,
        });
      }

      setSuccess(`Staff account created for ${formData.name}`);
      setFormData({ name: '', email: '', password: '', merchantId: '' });
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create staff account');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (staffId: any, isActive: boolean) => {
    try {
      if (isActive) {
        await deactivateStaff({ staffId });
      } else {
        await activateStaff({ staffId });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update staff status');
    }
  };

  const getMerchantName = (merchantId: string) => {
    const merchant = merchants?.find((m: any) => m.id === merchantId);
    return merchant?.name || merchantId;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Staff Management</h2>
            <p className="text-sm text-gray-500">
              {staffList.length} staff member{staffList.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus size={18} />
          Add Staff
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right">
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="float-right">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Add Staff Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">New Staff Account</h3>
            <button onClick={() => setShowAddForm(false)}>
              <X size={20} className="text-gray-400" />
            </button>
          </div>
          <form onSubmit={handleCreateStaff} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                minLength={6}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assigned Merchant
              </label>
              <select
                value={formData.merchantId}
                onChange={(e) =>
                  setFormData({ ...formData, merchantId: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              >
                <option value="">Select a merchant...</option>
                {merchants?.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full py-2 bg-red-600 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Staff Account'}
            </button>
          </form>
        </div>
      )}

      {/* Staff List */}
      <div className="space-y-3">
        {staffList.length === 0 ? (
          <div className="text-center py-12">
            <Users size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No staff members yet</p>
            <p className="text-gray-400 text-sm">
              Click "Add Staff" to create a staff account
            </p>
          </div>
        ) : (
          staffList.map((staff) => (
            <div
              key={staff._id}
              className="bg-white rounded-xl shadow-sm border p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-gray-800">{staff.name}</p>
                <p className="text-sm text-gray-500">{staff.email}</p>
                <p className="text-xs text-gray-400">
                  Merchant: {getMerchantName(staff.merchantId)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    staff.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {staff.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => handleToggleActive(staff._id, staff.isActive)}
                  className={`p-2 rounded-lg ${
                    staff.isActive
                      ? 'text-red-500 hover:bg-red-50'
                      : 'text-green-500 hover:bg-green-50'
                  }`}
                  title={staff.isActive ? 'Deactivate' : 'Activate'}
                >
                  {staff.isActive ? (
                    <UserX size={18} />
                  ) : (
                    <UserCheck size={18} />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StaffManager;
```

**Step 2: Commit**

```bash
git add src/components/StaffManager.tsx
git commit -m "feat: create StaffManager component for admin dashboard"
```

---

### Task 4.7: Add Staff View to AdminDashboard

**Files:**
- Modify: `src/components/AdminDashboard.tsx`

**Step 1: Add import**

Add at the top:
```typescript
import StaffManager from './StaffManager';
```

**Step 2: Add 'staff' to the currentView union type**

In the `currentView` state declaration (line 22), add `'staff'` to the union:
```typescript
const [currentView, setCurrentView] = useState<
  'dashboard' | 'items' | 'add' | 'edit' | 'categories' | 'payments' | 'settings' | 'orders' | 'inventory' | 'customers' | 'merchants' | 'promotions' | 'staff'
>('dashboard');
```

**Step 3: Add the staff view case**

After the `'promotions'` case (around line 1099-1102), add:
```typescript
if (currentView === 'staff') {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <StaffManager onBack={() => setCurrentView('dashboard')} />
      </div>
    </div>
  );
}
```

**Step 4: Add Staff button to dashboard quick actions**

In the quick actions list (around line 1192-1263), add a new button:
```typescript
<button
  onClick={() => setCurrentView('staff')}
  className="flex items-center gap-3 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100"
>
  <Users size={24} className="text-indigo-600" />
  <span className="font-medium text-gray-700">Staff</span>
</button>
```

**Step 5: Add Users icon import if not already present**

Check the lucide-react import line — `Users` is already imported (line 2).

**Step 6: Commit**

```bash
git add src/components/AdminDashboard.tsx
git commit -m "feat: add Staff management section to admin dashboard"
```

---

## Feature 5: New Order Notifications

**Team:** Coordinator plans notification UX, UI/UX chooses the sound and visual design, Developer implements audio + visual notifications, Reviewer checks browser audio policies, Tester verifies sound plays on new orders.

### Task 5.1: Add Notification Sound Asset

**Files:**
- Create: `public/sounds/new-order.mp3`

**Step 1: Add a notification sound file**

Download or generate a short notification sound (a pleasant "ding" or chime, 1-2 seconds). Place it at `public/sounds/new-order.mp3`.

You can use any free notification sound. A simple approach: use a base64-encoded short beep generated in code (fallback if no file).

**Step 2: Commit**

```bash
git add public/sounds/
git commit -m "feat: add new-order notification sound asset"
```

---

### Task 5.2: Create useNewOrderNotification Hook

**Files:**
- Create: `src/hooks/useNewOrderNotification.ts`

**Step 1: Create the hook**

```typescript
import { useEffect, useRef } from 'react';
import { ConvexOrder } from './useConvexOrders';

export const useNewOrderNotification = (orders: ConvexOrder[]) => {
  const prevCountRef = useRef<number>(orders.length);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    // Create audio element once
    if (!audioRef.current) {
      audioRef.current = new Audio('/sounds/new-order.mp3');
      audioRef.current.volume = 0.7;
    }
  }, []);

  useEffect(() => {
    // Skip the initial load
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      prevCountRef.current = orders.length;
      return;
    }

    // Check if new orders were added
    if (orders.length > prevCountRef.current) {
      const newOrderCount = orders.length - prevCountRef.current;

      // Play sound
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Browser may block autoplay — user needs to interact first
          console.warn('Audio play blocked by browser policy');
        });
      }

      // Show browser notification if permitted
      if (Notification.permission === 'granted') {
        new Notification('New Order Received!', {
          body: `${newOrderCount} new order${newOrderCount > 1 ? 's' : ''} received`,
          icon: '/favicon.ico',
        });
      }
    }

    prevCountRef.current = orders.length;
  }, [orders.length]);

  // Request notification permission
  const requestPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  return { requestPermission };
};
```

**Step 2: Commit**

```bash
git add src/hooks/useNewOrderNotification.ts
git commit -m "feat: create useNewOrderNotification hook with audio + browser notification"
```

---

### Task 5.3: Integrate Notification into OrdersManager

**Files:**
- Modify: `src/components/OrdersManager.tsx`

**Step 1: Add import**

```typescript
import { useNewOrderNotification } from '../hooks/useNewOrderNotification';
```

**Step 2: Add the hook call inside the component**

After the `useConvexOrders()` call, add:
```typescript
const { requestPermission } = useNewOrderNotification(orders);
```

**Step 3: Add notification permission button**

In the header area of OrdersManager, add a small button:
```typescript
<button
  onClick={requestPermission}
  className="text-xs text-gray-400 hover:text-gray-600 underline"
  title="Enable browser notifications for new orders"
>
  Enable notifications
</button>
```

**Step 4: Commit**

```bash
git add src/components/OrdersManager.tsx
git commit -m "feat: integrate new-order notification into OrdersManager"
```

---

### Task 5.4: Integrate Notification into StaffOrdersPanel

**Files:**
- Modify: `src/components/StaffOrdersPanel.tsx`

**Step 1: Add import**

```typescript
import { useNewOrderNotification } from '../hooks/useNewOrderNotification';
```

**Step 2: Add the hook call**

After the `useConvexOrdersByMerchant()` call, add:
```typescript
const { requestPermission } = useNewOrderNotification(orders);
```

**Step 3: Add notification permission button in the header**

```typescript
<button
  onClick={requestPermission}
  className="text-xs text-gray-400 hover:text-gray-600 underline"
>
  Enable notifications
</button>
```

**Step 4: Commit**

```bash
git add src/components/StaffOrdersPanel.tsx
git commit -m "feat: integrate new-order notification into StaffOrdersPanel"
```

---

## Feature 6: Final Integration & Cleanup

**Team:** Coordinator verifies all features work together, UI/UX does final visual QA, Developer fixes integration issues, Reviewer does full code review, Tester runs end-to-end flows.

### Task 6.1: Verify Full Build

**Step 1: Run build**

```bash
npm run build
```

Expected: Clean build with no TypeScript errors.

**Step 2: Fix any type errors**

Address any remaining type mismatches between Supabase types and Convex types.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors from Convex migration"
```

---

### Task 6.2: Test Convex Dev Server

**Step 1: Start Convex dev in one terminal**

```bash
npx convex dev
```

**Step 2: Start Vite dev in another terminal**

```bash
npm run dev
```

**Step 3: Verify these flows:**

1. **Customer checkout** → Order appears in Convex dashboard
2. **Admin OrdersManager** → Shows orders in real-time
3. **Order status update** → Change reflects immediately
4. **Customer tracking** → `/track/:orderId` shows correct status, updates in real-time
5. **Staff login** → `/staff/login` works, routes to `/staff/orders`
6. **Staff orders** → Shows only merchant-specific orders
7. **New order notification** → Sound plays when new order arrives
8. **Staff management** → Admin can create/deactivate staff from dashboard

---

### Task 6.3: Final Commit

```bash
git add -A
git commit -m "feat: complete Convex order management system with staff portal and customer tracking"
```

---

## Summary of All New/Modified Files

### New Files
| File | Purpose |
|---|---|
| `convex/schema.ts` | Convex schema (orders, orderItems, staff) |
| `convex/orders.ts` | Order queries and mutations |
| `convex/staff.ts` | Staff queries and mutations |
| `convex/inventoryActions.ts` | Supabase inventory decrement action |
| `src/lib/convex.ts` | Convex client initialization |
| `src/hooks/useConvexOrders.ts` | React hooks for Convex orders |
| `src/hooks/useNewOrderNotification.ts` | Audio + browser notification hook |
| `src/components/OrderTracking.tsx` | Customer order tracking page |
| `src/components/StaffLogin.tsx` | Staff login page |
| `src/components/StaffOrdersPanel.tsx` | Staff order management panel |
| `src/components/ProtectedStaffRoute.tsx` | Staff route guard |
| `src/components/StaffManager.tsx` | Admin staff management component |
| `public/sounds/new-order.mp3` | Notification sound |

### Modified Files
| File | Changes |
|---|---|
| `package.json` | Add `convex` dependency |
| `src/main.tsx` | Add ConvexProvider wrapper |
| `src/App.tsx` | Add tracking + staff routes |
| `src/components/OrdersManager.tsx` | Rewire from Supabase to Convex |
| `src/components/Checkout.tsx` | Submit orders to Convex |
| `src/components/AdminDashboard.tsx` | Add staff management view |
| `src/contexts/AuthContext.tsx` | Add `isStaff` role |

### Deleted Files
| File | Reason |
|---|---|
| `src/hooks/useOrders.ts` | Replaced by `useConvexOrders.ts` |
