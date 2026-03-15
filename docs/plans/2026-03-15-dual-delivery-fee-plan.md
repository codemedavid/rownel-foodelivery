# Dual Delivery Fee (Priority vs Economy) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow merchants to set a fixed delivery fee so customers can choose between Priority (distance-based) and Economy (fixed rate) delivery at checkout.

**Architecture:** Extend the existing delivery pricing flow. Add `fixedDeliveryFee` to the Merchant type/hook, add `deliveryMode` to the Convex orders schema, add a Priority/Economy toggle in Checkout, and display the chosen mode in order views. Supabase migration already exists (`20260313100000_add_dual_delivery_fee.sql`).

**Tech Stack:** Convex (real-time DB + functions), React 18, TypeScript, Tailwind CSS, Supabase, Vite 5

---

## Task 1: Add `fixedDeliveryFee` to Merchant Type

**Team:** Developer implements, Reviewer checks type completeness.

**Files:**
- Modify: `src/types/index.ts:2-33`

**Step 1: Add the field to the Merchant interface**

In `src/types/index.ts`, add `fixedDeliveryFee` after the `maxDeliveryDistanceKm` field (line 30):

```typescript
  fixedDeliveryFee?: number;
```

The full block around it should look like:

```typescript
  maxDeliveryDistanceKm?: number | null;
  fixedDeliveryFee?: number;
  createdAt: string;
```

**Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add fixedDeliveryFee field to Merchant type"
```

---

## Task 2: Map `fixed_delivery_fee` in useMerchants Hook

**Team:** Developer implements, Reviewer checks both mapping locations.

**Files:**
- Modify: `src/hooks/useMerchants.ts`

**Step 1: Add mapping in `fetchMerchants` (line 50, after `maxDeliveryDistanceKm`)**

Add this line after `maxDeliveryDistanceKm: merchant.max_delivery_distance_km,` (line 50):

```typescript
        fixedDeliveryFee: merchant.fixed_delivery_fee,
```

**Step 2: Add mapping in `getMerchantById` (line 105, after `maxDeliveryDistanceKm`)**

Add this line after `maxDeliveryDistanceKm: data.max_delivery_distance_km,` (line 105):

```typescript
        fixedDeliveryFee: data.fixed_delivery_fee,
```

**Step 3: Commit**

```bash
git add src/hooks/useMerchants.ts
git commit -m "feat: map fixed_delivery_fee from Supabase in useMerchants"
```

---

## Task 3: Add `fixedDeliveryFee` Input to MerchantManager

**Team:** Developer implements, UI/UX reviews placement, Reviewer checks save logic.

**Files:**
- Modify: `src/components/MerchantManager.tsx`

**Step 1: Add `fixedDeliveryFee` to default form data**

In the `merchantFormData` initial state (line 80-105), add after `maxDeliveryDistanceKm: 20,` (line 100):

```typescript
    fixedDeliveryFee: 0,
```

Also add it in the "Add New Merchant" reset (line 138-163), after `maxDeliveryDistanceKm: 20,` (line 158):

```typescript
      fixedDeliveryFee: 0,
```

**Step 2: Include `fixedDeliveryFee` in the save payload**

In the `handleSaveMerchant` function, after `max_delivery_distance_km: maxDeliveryDistanceKm,` (line 434), add:

```typescript
        fixed_delivery_fee: Number(merchantFormData.fixedDeliveryFee ?? 0),
```

**Step 3: Include `fixedDeliveryFee` in the duplicate merchant payload**

In `handleDuplicateMerchant`, after `max_delivery_distance_km: merchant.maxDeliveryDistanceKm ?? 20,` (line 222), add:

```typescript
          fixed_delivery_fee: merchant.fixedDeliveryFee ?? 0,
```

**Step 4: Add the form field in the Pricing section**

After the "Max Delivery Radius" input (after line 1205), add a new input field:

```typescript
                <div>
                  <label className="block text-sm font-medium text-black mb-2">Fixed Delivery Fee (₱) — Economy Mode</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={merchantFormData.fixedDeliveryFee ?? 0}
                    onChange={(e) => setMerchantFormData({ ...merchantFormData, fixedDeliveryFee: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-gray-500">Set to 0 to disable Economy delivery. Customers choose between this and distance-based pricing.</p>
                </div>
```

**Step 5: Verify it compiles**

Run:
```bash
npm run build
```

**Step 6: Commit**

```bash
git add src/components/MerchantManager.tsx
git commit -m "feat: add fixed delivery fee input to MerchantManager"
```

---

## Task 4: Add `deliveryMode` to Convex Schema and Orders Mutation

**Team:** Developer implements, Reviewer checks schema backward compatibility, Tester verifies deployment.

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/orders.ts`

**Step 1: Add `deliveryMode` field to the orders table in `convex/schema.ts`**

After `deliveryFeeBreakdown: v.optional(v.any()),` (line 19), add:

```typescript
    deliveryMode: v.optional(v.union(v.literal("priority"), v.literal("economy"))),
```

**Step 2: Add `deliveryMode` arg to the `create` mutation in `convex/orders.ts`**

After `deliveryFeeBreakdown: v.optional(v.any()),` (line 20 in args), add:

```typescript
    deliveryMode: v.optional(v.union(v.literal("priority"), v.literal("economy"))),
```

**Step 3: Push schema to Convex**

Run:
```bash
npx convex dev --once
```

Expected: Schema and functions deploy successfully.

**Step 4: Commit**

```bash
git add convex/schema.ts convex/orders.ts
git commit -m "feat: add deliveryMode field to Convex orders schema and create mutation"
```

---

## Task 5: Add `deliveryMode` to `useConvexOrders` Hook

**Team:** Developer implements, Reviewer checks type alignment.

**Files:**
- Modify: `src/hooks/useConvexOrders.ts`

**Step 1: Add `deliveryMode` to the `createOrder` args type**

In the `useConvexOrders` hook, in the `createOrder` args type (around line 45-76), after `deliveryFeeBreakdown?: Record<string, unknown>;` (line 55), add:

```typescript
    deliveryMode?: "priority" | "economy";
```

No other changes needed — the `createMutation(mutationArgs)` call already spreads all args through.

**Step 2: Commit**

```bash
git add src/hooks/useConvexOrders.ts
git commit -m "feat: add deliveryMode to useConvexOrders createOrder args"
```

---

## Task 6: Add Priority/Economy Toggle to Checkout

**Team:** Coordinator plans UX flow, UI/UX designs toggle, Developer implements, Reviewer checks fee calculation logic, Tester verifies both modes.

**Files:**
- Modify: `src/components/Checkout.tsx`

**Step 1: Add delivery mode state**

After the existing state declarations (after line 39), add:

```typescript
  const [deliveryMode, setDeliveryMode] = useState<'priority' | 'economy'>('priority');
```

**Step 2: Compute whether Economy is available**

After the `merchantIds` memo (after line 56), add:

```typescript
  const hasEconomyOption = useMemo(() => {
    return merchantIds.some((merchantId) => {
      const merchant = merchants.find((m) => m.id === merchantId);
      return merchant && (merchant.fixedDeliveryFee ?? 0) > 0;
    });
  }, [merchantIds, merchants]);
```

**Step 3: Update `deliveryQuotesByMerchant` to respect delivery mode**

Replace the entire `deliveryQuotesByMerchant` memo (lines 58-121) with:

```typescript
  const deliveryQuotesByMerchant = useMemo(() => {
    const quotes: Record<
      string,
      {
        deliverable: boolean;
        reason?: string;
        distanceKm?: number;
        deliveryFee?: number;
      }
    > = {};

    for (const merchantId of merchantIds) {
      const merchant = merchants.find((m) => m.id === merchantId);

      if (!merchant) {
        quotes[merchantId] = { deliverable: false, reason: 'Merchant not found.' };
        continue;
      }

      if (deliveryLatitude === null || deliveryLongitude === null) {
        quotes[merchantId] = {
          deliverable: false,
          reason: 'Select a suggested delivery address to calculate distance and fee.',
        };
        continue;
      }

      if (merchant.latitude == null || merchant.longitude == null) {
        quotes[merchantId] = {
          deliverable: false,
          reason: 'Merchant delivery location is not configured yet.',
        };
        continue;
      }

      const distanceKm = haversineKm(merchant.latitude, merchant.longitude, deliveryLatitude, deliveryLongitude);
      const maxDistanceKm = merchant.maxDeliveryDistanceKm ?? null;
      const isDeliverable = maxDistanceKm === null || distanceKm <= maxDistanceKm;

      if (!isDeliverable) {
        quotes[merchantId] = {
          deliverable: false,
          distanceKm,
          reason: `Outside delivery radius (${maxDistanceKm} km max).`,
        };
        continue;
      }

      let deliveryFee: number;
      if (deliveryMode === 'economy' && (merchant.fixedDeliveryFee ?? 0) > 0) {
        deliveryFee = merchant.fixedDeliveryFee!;
      } else {
        deliveryFee = calculateDeliveryFee(distanceKm, {
          baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
          deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
          minDeliveryFee: merchant.minDeliveryFee,
          maxDeliveryFee: merchant.maxDeliveryFee,
        });
      }

      quotes[merchantId] = {
        deliverable: true,
        distanceKm,
        deliveryFee,
      };
    }

    return quotes;
  }, [deliveryLatitude, deliveryLongitude, merchantIds, merchants, deliveryMode]);
```

**Step 4: Add the Priority/Economy toggle UI**

In the checkout form section, after the delivery address `MapLocationPicker` block and before the Landmark input (between lines 520-522), add:

```typescript
            {hasEconomyOption && deliveryLatitude !== null && deliveryLongitude !== null && (
              <div>
                <label className="block text-sm font-medium text-black mb-3">Delivery Option</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('priority')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'priority'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Priority</span>
                      <span className="font-bold text-red-600 text-sm">₱{deliveryFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500">Distance-based pricing</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('economy')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'economy'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Economy</span>
                      <span className="font-bold text-red-600 text-sm">₱{(() => {
                        let total = 0;
                        for (const mid of merchantIds) {
                          const m = merchants.find(x => x.id === mid);
                          if (m && (m.fixedDeliveryFee ?? 0) > 0) {
                            total += m.fixedDeliveryFee!;
                          } else {
                            const q = deliveryQuotesByMerchant[mid];
                            total += q?.deliverable ? (q.deliveryFee ?? 0) : 0;
                          }
                        }
                        return total.toFixed(2);
                      })()}</span>
                    </div>
                    <p className="text-xs text-gray-500">Fixed rate delivery</p>
                  </button>
                </div>
              </div>
            )}
```

**Note on the Economy price preview:** The economy price button needs to show what the Economy total *would be*. Since `deliveryFeeTotal` already reflects the *current* mode, we compute the economy total inline for the button label only. The priority button shows the current `deliveryFeeTotal` when in priority mode. To fix this properly so each button always shows its own mode's price regardless of selection:

Replace the toggle buttons block above with this corrected version that pre-computes both totals:

Add these memos after `hasEconomyOption`:

```typescript
  const priorityFeeTotal = useMemo(() => {
    return merchantIds.reduce((sum, merchantId) => {
      const merchant = merchants.find((m) => m.id === merchantId);
      if (!merchant || merchant.latitude == null || merchant.longitude == null || deliveryLatitude === null || deliveryLongitude === null) return sum;
      const distanceKm = haversineKm(merchant.latitude, merchant.longitude, deliveryLatitude, deliveryLongitude);
      const maxDist = merchant.maxDeliveryDistanceKm ?? null;
      if (maxDist !== null && distanceKm > maxDist) return sum;
      const fee = calculateDeliveryFee(distanceKm, {
        baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
        deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
        minDeliveryFee: merchant.minDeliveryFee,
        maxDeliveryFee: merchant.maxDeliveryFee,
      });
      return sum + fee;
    }, 0);
  }, [merchantIds, merchants, deliveryLatitude, deliveryLongitude]);

  const economyFeeTotal = useMemo(() => {
    return merchantIds.reduce((sum, merchantId) => {
      const merchant = merchants.find((m) => m.id === merchantId);
      if (!merchant || merchant.latitude == null || merchant.longitude == null || deliveryLatitude === null || deliveryLongitude === null) return sum;
      const distanceKm = haversineKm(merchant.latitude, merchant.longitude, deliveryLatitude, deliveryLongitude);
      const maxDist = merchant.maxDeliveryDistanceKm ?? null;
      if (maxDist !== null && distanceKm > maxDist) return sum;
      if ((merchant.fixedDeliveryFee ?? 0) > 0) {
        return sum + merchant.fixedDeliveryFee!;
      }
      const fee = calculateDeliveryFee(distanceKm, {
        baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
        deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
        minDeliveryFee: merchant.minDeliveryFee,
        maxDeliveryFee: merchant.maxDeliveryFee,
      });
      return sum + fee;
    }, 0);
  }, [merchantIds, merchants, deliveryLatitude, deliveryLongitude]);
```

Then the toggle buttons use `priorityFeeTotal` and `economyFeeTotal`:

```typescript
            {hasEconomyOption && deliveryLatitude !== null && deliveryLongitude !== null && (
              <div>
                <label className="block text-sm font-medium text-black mb-3">Delivery Option</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('priority')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'priority'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Priority</span>
                      <span className="font-bold text-red-600 text-sm">₱{priorityFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500">Distance-based pricing</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('economy')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                      deliveryMode === 'economy'
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">Economy</span>
                      <span className="font-bold text-red-600 text-sm">₱{economyFeeTotal.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500">Fixed rate delivery</p>
                  </button>
                </div>
              </div>
            )}
```

**Step 5: Pass `deliveryMode` to the order creation**

In `handlePlaceOrder`, in the `createOrderMutation` call (around line 256), add `deliveryMode` after `deliveryFee: merchantDeliveryFee,` (line 265):

```typescript
          deliveryMode,
```

**Step 6: Include delivery mode in the Messenger summary**

In the Messenger order details string (around line 318), update the delivery total line to include the mode:

Replace:
```typescript
      orderDetails += `\n💰 FOOD TOTAL: ₱${totalPrice.toFixed(2)}\n🚚 DELIVERY TOTAL: ₱${deliveryFeeTotal.toFixed(2)}\n📍 DELIVERY ADDRESS: ${trimmedAddress}\n💵 GRAND TOTAL: ₱${grandTotal.toFixed(2)}\n\n💳 Payment: ${selectedPaymentMethod?.name || paymentMethod}\n\n${mergedNotes ? `📝 Notes: ${mergedNotes}\n\n` : ''}Please confirm this order to proceed. Thank you for choosing Row-Nel FooDelivery! 🥟`;
```

With:
```typescript
      orderDetails += `\n💰 FOOD TOTAL: ₱${totalPrice.toFixed(2)}\n🚚 DELIVERY TOTAL: ₱${deliveryFeeTotal.toFixed(2)} (${deliveryMode === 'economy' ? 'Economy' : 'Priority'})\n📍 DELIVERY ADDRESS: ${trimmedAddress}\n💵 GRAND TOTAL: ₱${grandTotal.toFixed(2)}\n\n💳 Payment: ${selectedPaymentMethod?.name || paymentMethod}\n\n${mergedNotes ? `📝 Notes: ${mergedNotes}\n\n` : ''}Please confirm this order to proceed. Thank you for choosing Row-Nel FooDelivery! 🥟`;
```

**Step 7: Verify it compiles**

Run:
```bash
npm run build
```

**Step 8: Commit**

```bash
git add src/components/Checkout.tsx
git commit -m "feat: add Priority/Economy delivery toggle to Checkout"
```

---

## Task 7: Display Delivery Mode in Order Views

**Team:** Developer implements, UI/UX reviews badge placement, Reviewer checks all three views.

**Files:**
- Modify: `src/components/OrdersManager.tsx`
- Modify: `src/components/StaffOrdersPanel.tsx`
- Modify: `src/components/OrderTracking.tsx`

**Step 1: Add delivery mode display in OrdersManager**

In `src/components/OrdersManager.tsx`, find the order detail modal where order fields are displayed. Search for where `serviceType` or `paymentMethod` is shown. Add after the service type display:

```typescript
                {selectedOrder.deliveryMode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Delivery Mode</span>
                    <span className={`font-medium capitalize ${selectedOrder.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                      {selectedOrder.deliveryMode === 'economy' ? 'Economy (Fixed)' : 'Priority (Distance)'}
                    </span>
                  </div>
                )}
```

Also, in the orders list view, find where delivery fee is shown per order card. If there's a delivery fee shown, add a small badge next to it. Search for `deliveryFee` in the component — if it's not displayed in the list cards, just display it in the detail modal (above).

**Step 2: Add delivery mode display in StaffOrdersPanel**

In `src/components/StaffOrdersPanel.tsx`, in the order detail modal (the `selectedOrder` section), add after the service type display:

```typescript
                {selectedOrder.deliveryMode && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Delivery Mode</span>
                    <span className={`capitalize ${selectedOrder.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                      {selectedOrder.deliveryMode === 'economy' ? 'Economy (Fixed)' : 'Priority (Distance)'}
                    </span>
                  </div>
                )}
```

**Step 3: Add delivery mode display in OrderTracking**

In `src/components/OrderTracking.tsx`, in the "Order Details" section (the `<div className="space-y-3">` block), add after the service type display:

```typescript
                {order.deliveryMode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Delivery Mode</span>
                    <span className={`font-medium capitalize ${order.deliveryMode === 'economy' ? 'text-green-600' : 'text-blue-600'}`}>
                      {order.deliveryMode === 'economy' ? 'Economy (Fixed)' : 'Priority (Distance)'}
                    </span>
                  </div>
                )}
```

**Step 4: Verify it compiles**

Run:
```bash
npm run build
```

**Step 5: Commit**

```bash
git add src/components/OrdersManager.tsx src/components/StaffOrdersPanel.tsx src/components/OrderTracking.tsx
git commit -m "feat: display delivery mode in order views"
```

---

## Task 8: Verify Full Build and Test

**Team:** Tester runs through all flows, Reviewer does final code review.

**Step 1: Run full build**

```bash
npm run build
```

Expected: Clean build with no TypeScript errors.

**Step 2: Fix any type errors**

Address any remaining type mismatches.

**Step 3: Manual testing checklist**

1. **Admin — MerchantManager:** Set a fixed delivery fee (e.g., ₱50) on a merchant. Save. Verify the value persists after refresh.
2. **Customer — Checkout:** Add items from a merchant with fixed fee set. Enter delivery address. Verify Priority/Economy toggle appears. Switch between modes and verify the delivery fee and grand total update correctly.
3. **Customer — Checkout with no fixed fee:** Add items from a merchant with fixedDeliveryFee = 0. Verify the toggle does NOT appear.
4. **Order creation:** Place an order with Economy mode. Check the Convex dashboard to verify `deliveryMode: "economy"` is stored.
5. **OrdersManager:** Open the order detail. Verify "Delivery Mode: Economy (Fixed)" is shown.
6. **StaffOrdersPanel:** Same check.
7. **OrderTracking:** Navigate to `/track/<orderId>`. Verify delivery mode is shown.
8. **Backward compatibility:** Old orders without `deliveryMode` should display normally (no badge shown).

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any remaining issues from dual delivery fee implementation"
```

---

## Summary of All Changes

### Modified Files
| File | Change |
|---|---|
| `src/types/index.ts` | Add `fixedDeliveryFee?: number` to Merchant |
| `src/hooks/useMerchants.ts` | Map `fixed_delivery_fee` from Supabase |
| `src/components/MerchantManager.tsx` | Add fixed delivery fee input field |
| `convex/schema.ts` | Add `deliveryMode` to orders table |
| `convex/orders.ts` | Accept `deliveryMode` in create mutation |
| `src/hooks/useConvexOrders.ts` | Add `deliveryMode` to createOrder args |
| `src/components/Checkout.tsx` | Add Priority/Economy toggle, update fee calc |
| `src/components/OrdersManager.tsx` | Display delivery mode in order detail |
| `src/components/StaffOrdersPanel.tsx` | Display delivery mode in order detail |
| `src/components/OrderTracking.tsx` | Display delivery mode in order detail |

### No New Files
All changes are modifications to existing files.
