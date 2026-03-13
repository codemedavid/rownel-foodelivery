# Dual Delivery Fee Options — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two delivery mode options (Priority and Economy) at checkout, where Priority uses distance-based pricing and Economy uses a fixed rate per merchant. Both modes charge only the farthest merchant's fee for multi-merchant orders.

**Architecture:** Add a `fixed_delivery_fee` column to merchants and `delivery_mode` to orders. Extend `deliveryPricing.ts` with economy fee lookup and farthest-merchant selection. Update Checkout UI with a delivery mode selector above the order summary. Update MerchantManager with fixed fee input.

**Tech Stack:** React, TypeScript, Supabase (PostgreSQL), Tailwind CSS

---

### Task 1: Database Migration — Add new columns

**Files:**
- Create: `supabase/migrations/20260313100000_add_dual_delivery_fee.sql`

**Step 1: Write the migration**

```sql
-- Add fixed delivery fee to merchants (for economy mode)
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS fixed_delivery_fee numeric NOT NULL DEFAULT 0
  CONSTRAINT fixed_delivery_fee_non_negative CHECK (fixed_delivery_fee >= 0);

-- Add delivery mode to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'priority'
  CONSTRAINT delivery_mode_valid CHECK (delivery_mode IN ('priority', 'economy'));
```

**Step 2: Run the migration**

Run: `npx supabase db push` or apply via Supabase dashboard.

**Step 3: Commit**

```bash
git add supabase/migrations/20260313100000_add_dual_delivery_fee.sql
git commit -m "feat: add migration for fixed_delivery_fee and delivery_mode columns"
```

---

### Task 2: Update Supabase Types — Add new fields to generated types

**Files:**
- Modify: `src/lib/supabase.ts` — merchants Row/Insert/Update types (add `fixed_delivery_fee`), orders Row/Insert/Update types (add `delivery_mode`)

**Step 1: Add `fixed_delivery_fee` to merchants Row type**

In the merchants `Row` type (around line 57-62), add after `max_delivery_distance_km`:

```typescript
fixed_delivery_fee: number;
```

**Step 2: Add `fixed_delivery_fee` to merchants Insert type**

In the merchants `Insert` type (around line 88-93), add:

```typescript
fixed_delivery_fee?: number;
```

**Step 3: Add `fixed_delivery_fee` to merchants Update type**

In the merchants `Update` type (around line 120-125), add:

```typescript
fixed_delivery_fee?: number;
```

**Step 4: Add `delivery_mode` to orders Row type**

In the orders `Row` type, add:

```typescript
delivery_mode: string;
```

**Step 5: Add `delivery_mode` to orders Insert type**

In the orders `Insert` type, add:

```typescript
delivery_mode?: string;
```

**Step 6: Add `delivery_mode` to orders Update type**

In the orders `Update` type, add:

```typescript
delivery_mode?: string;
```

**Step 7: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: add fixed_delivery_fee and delivery_mode to Supabase types"
```

---

### Task 3: Update Application Types — Add DeliveryMode and new fields

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add DeliveryMode type**

After the existing `ServiceType` export (line 120), add:

```typescript
export type DeliveryMode = 'priority' | 'economy';
```

**Step 2: Add `fixedDeliveryFee` to Merchant interface**

In the `Merchant` interface (around line 30, after `maxDeliveryDistanceKm`), add:

```typescript
fixedDeliveryFee?: number;
```

**Step 3: Add `deliveryMode` to OrderData interface**

In the `OrderData` interface (around line 107, after `deliveryFeeBreakdown`), add:

```typescript
deliveryMode?: DeliveryMode;
```

**Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add DeliveryMode type, fixedDeliveryFee, and deliveryMode to app types"
```

---

### Task 4: Extend deliveryPricing.ts — Add economy fee and farthest-merchant logic

**Files:**
- Modify: `src/lib/deliveryPricing.ts`

**Step 1: Add the `getEconomyDeliveryFee` function**

After the existing `haversineKm` function (after line 47), add:

```typescript
export const getEconomyDeliveryFee = (fixedDeliveryFee: number): number => {
  return roundToCurrency(Math.max(0, fixedDeliveryFee));
};
```

**Step 2: Add the `MerchantDeliveryQuote` interface and `getFarthestMerchantFee` function**

After the new function, add:

```typescript
export interface MerchantDeliveryQuote {
  merchantId: string;
  distanceKm: number;
  priorityFee: number;
  economyFee: number;
}

export const getFarthestMerchantFee = (
  quotes: MerchantDeliveryQuote[],
  mode: 'priority' | 'economy'
): { merchantId: string; distanceKm: number; fee: number } | null => {
  if (quotes.length === 0) return null;

  const farthest = quotes.reduce((far, q) =>
    q.distanceKm > far.distanceKm ? q : far
  );

  return {
    merchantId: farthest.merchantId,
    distanceKm: farthest.distanceKm,
    fee: mode === 'priority' ? farthest.priorityFee : farthest.economyFee,
  };
};
```

**Step 3: Commit**

```bash
git add src/lib/deliveryPricing.ts
git commit -m "feat: add economy fee and farthest-merchant selection to deliveryPricing"
```

---

### Task 5: Update useMerchants hook — Map `fixed_delivery_fee` from DB

**Files:**
- Modify: `src/hooks/useMerchants.ts` — find where merchant rows are mapped to the `Merchant` type and add `fixedDeliveryFee: row.fixed_delivery_fee ?? 0`

**Step 1: Find the mapping code and add the new field**

In the merchant mapping/transform section, add:

```typescript
fixedDeliveryFee: row.fixed_delivery_fee ?? 0,
```

alongside the existing `baseDeliveryFee`, `deliveryFeePerKm`, etc. mappings.

**Step 2: Commit**

```bash
git add src/hooks/useMerchants.ts
git commit -m "feat: map fixed_delivery_fee from DB in useMerchants hook"
```

---

### Task 6: Update MerchantManager — Add Fixed Delivery Fee input

**Files:**
- Modify: `src/components/MerchantManager.tsx`

**Step 1: Add `fixedDeliveryFee` to initial form state**

In the initial form data (around line 96-100), add:

```typescript
fixedDeliveryFee: 0,
```

**Step 2: Add `fixedDeliveryFee` to form submission handler**

In the form submission handler (around lines 401-434), add validation and include in the DB payload:

```typescript
const fixedDeliveryFee = Number(merchantFormData.fixedDeliveryFee ?? 0);
```

Add to the validation block (after line 408):

```typescript
if (fixedDeliveryFee < 0) {
  alert('Fixed delivery fee cannot be negative');
  return;
}
```

Add to the Supabase upsert payload (around line 434):

```typescript
fixed_delivery_fee: fixedDeliveryFee,
```

**Step 3: Add `fixedDeliveryFee` to edit form population**

When a merchant is selected for editing, ensure `fixedDeliveryFee` is loaded from the merchant data:

```typescript
fixedDeliveryFee: merchant.fixedDeliveryFee ?? 0,
```

**Step 4: Add the Fixed Delivery Fee input to the UI**

In the pricing section (around lines 1194-1204, after Max Delivery Radius), add a new input:

```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Fixed Delivery Fee — Economy (₱)
  </label>
  <input
    type="number"
    min="0"
    step="1"
    value={merchantFormData.fixedDeliveryFee ?? 0}
    onChange={(e) =>
      setMerchantFormData((prev) => ({
        ...prev,
        fixedDeliveryFee: Number(e.target.value),
      }))
    }
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
    placeholder="e.g., 40"
  />
  <p className="text-xs text-gray-500 mt-1">
    Flat rate charged for economy (slower) delivery mode
  </p>
</div>
```

**Step 5: Commit**

```bash
git add src/components/MerchantManager.tsx
git commit -m "feat: add fixed delivery fee input to MerchantManager"
```

---

### Task 7: Update Checkout.tsx — Add delivery mode selector and farthest-merchant logic

This is the largest task. It modifies the checkout to:
1. Add `deliveryMode` state
2. Compute both priority and economy fees
3. Use farthest-merchant-only logic for both modes
4. Display a delivery mode selector above the order summary
5. Update totals and order message based on selected mode

**Files:**
- Modify: `src/components/Checkout.tsx`

**Step 1: Add imports**

Update the import from `deliveryPricing.ts` (line 10) to also import the new functions:

```typescript
import { calculateDeliveryFee, haversineKm, getEconomyDeliveryFee, getFarthestMerchantFee } from '../lib/deliveryPricing';
import type { MerchantDeliveryQuote } from '../lib/deliveryPricing';
```

Add `DeliveryMode` to the types import (line 3):

```typescript
import { PaymentMethod, DeliveryMode } from '../types';
```

Also import the `Truck` icon from lucide-react (line 2):

```typescript
import { ArrowLeft, Store, AlertTriangle, Clock, Truck } from 'lucide-react';
```

**Step 2: Add `deliveryMode` state**

After the existing state declarations (around line 31), add:

```typescript
const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('priority');
```

**Step 3: Update `deliveryQuotesByMerchant` to include both fees**

Replace the existing `deliveryQuotesByMerchant` useMemo (lines 50-113) with a version that computes both priority and economy fees:

```typescript
const deliveryQuotesByMerchant = useMemo(() => {
  const quotes: Record<
    string,
    {
      deliverable: boolean;
      reason?: string;
      distanceKm?: number;
      priorityFee?: number;
      economyFee?: number;
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

    const priorityFee = calculateDeliveryFee(distanceKm, {
      baseDeliveryFee: merchant.baseDeliveryFee ?? merchant.deliveryFee ?? 0,
      deliveryFeePerKm: merchant.deliveryFeePerKm ?? 4,
      minDeliveryFee: merchant.minDeliveryFee,
      maxDeliveryFee: merchant.maxDeliveryFee,
    });

    const economyFee = getEconomyDeliveryFee(merchant.fixedDeliveryFee ?? 0);

    quotes[merchantId] = {
      deliverable: true,
      distanceKm,
      priorityFee,
      economyFee,
    };
  }

  return quotes;
}, [deliveryLatitude, deliveryLongitude, merchantIds, merchants]);
```

**Step 4: Compute farthest-merchant fees for both modes**

Replace the existing `deliveryFeeTotal` useMemo (lines 115-120) with:

```typescript
const { priorityTotal, economyTotal, deliveryFeeTotal } = useMemo(() => {
  const deliverableQuotes: MerchantDeliveryQuote[] = merchantIds
    .filter((id) => deliveryQuotesByMerchant[id]?.deliverable)
    .map((id) => {
      const q = deliveryQuotesByMerchant[id];
      return {
        merchantId: id,
        distanceKm: q.distanceKm ?? 0,
        priorityFee: q.priorityFee ?? 0,
        economyFee: q.economyFee ?? 0,
      };
    });

  const farthestPriority = getFarthestMerchantFee(deliverableQuotes, 'priority');
  const farthestEconomy = getFarthestMerchantFee(deliverableQuotes, 'economy');

  const pTotal = farthestPriority?.fee ?? 0;
  const eTotal = farthestEconomy?.fee ?? 0;

  return {
    priorityTotal: pTotal,
    economyTotal: eTotal,
    deliveryFeeTotal: deliveryMode === 'priority' ? pTotal : eTotal,
  };
}, [merchantIds, deliveryQuotesByMerchant, deliveryMode]);
```

**Step 5: Add the Delivery Mode Selector UI**

In the JSX, **above** the Order Summary section (before the `<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">` on line 318), add:

```tsx
{/* Delivery Mode Selector */}
<div className="bg-white rounded-xl shadow-sm p-6 mb-8">
  <h2 className="text-lg font-noto font-medium text-black mb-4 flex items-center gap-2">
    <Truck className="h-5 w-5 text-red-600" />
    Choose Delivery Option
  </h2>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {/* Priority Option */}
    <button
      type="button"
      onClick={() => setDeliveryMode('priority')}
      className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
        deliveryMode === 'priority'
          ? 'border-red-600 bg-red-50 ring-1 ring-red-600'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-black">⚡ Priority</span>
        <span className="text-lg font-bold text-red-600">
          ₱{priorityTotal.toFixed(2)}
        </span>
      </div>
      <p className="text-sm text-gray-600">Faster delivery, distance-based fee</p>
      <p className="text-xs text-gray-400 mt-1">Est. 20–45 min</p>
    </button>

    {/* Economy Option */}
    <button
      type="button"
      onClick={() => setDeliveryMode('economy')}
      className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
        deliveryMode === 'economy'
          ? 'border-red-600 bg-red-50 ring-1 ring-red-600'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-black">🛵 Economy</span>
        <span className="text-lg font-bold text-red-600">
          ₱{economyTotal.toFixed(2)}
        </span>
      </div>
      <p className="text-sm text-gray-600">Cheaper flat rate, batched delivery</p>
      <p className="text-xs text-gray-400 mt-1">Est. 45–120 min</p>
    </button>
  </div>
  {merchantIds.length > 1 && (
    <p className="text-xs text-gray-500 mt-3">
      Multi-merchant order: delivery fee is based on the farthest merchant only.
    </p>
  )}
</div>
```

**Step 6: Update per-merchant delivery fee display in order summary**

In the per-merchant section (around lines 368-375), update the delivery fee display to show the fee for the selected mode:

Replace:
```tsx
<span className="text-sm text-gray-700">
  {deliveryQuotesByMerchant[merchantId]?.deliverable
    ? `₱${(deliveryQuotesByMerchant[merchantId].deliveryFee ?? 0).toFixed(2)}`
    : 'Not available'}
</span>
```

With:
```tsx
<span className="text-sm text-gray-700">
  {deliveryQuotesByMerchant[merchantId]?.deliverable
    ? `₱${(deliveryMode === 'priority'
        ? deliveryQuotesByMerchant[merchantId].priorityFee ?? 0
        : deliveryQuotesByMerchant[merchantId].economyFee ?? 0
      ).toFixed(2)}`
    : 'Not available'}
</span>
```

**Step 7: Update the delivery fee label in the totals section**

In the totals section (around line 414-416), update:

Replace:
```tsx
<span>Delivery fee:</span>
```

With:
```tsx
<span>Delivery fee ({deliveryMode === 'priority' ? 'Priority' : 'Economy'}):</span>
```

**Step 8: Update the order message in `handlePlaceOrder`**

In the `handlePlaceOrder` function (around lines 254-258), update the order details to include the delivery mode:

Replace:
```
🚚 DELIVERY TOTAL: ₱${deliveryFeeTotal.toFixed(2)}
```

With:
```
🚚 DELIVERY (${deliveryMode === 'priority' ? 'Priority ⚡' : 'Economy 🛵'}): ₱${deliveryFeeTotal.toFixed(2)}
```

**Step 9: Commit**

```bash
git add src/components/Checkout.tsx
git commit -m "feat: add delivery mode selector with priority/economy options at checkout"
```

---

### Task 8: Verify and test end-to-end

**Step 1: Run the dev server**

Run: `npm run dev`

**Step 2: Manual testing checklist**

1. **Admin — Merchant Manager:**
   - Open merchant edit form
   - Verify "Fixed Delivery Fee — Economy (₱)" input appears in pricing section
   - Set a value (e.g., ₱40) and save
   - Reload and verify it persists

2. **Customer — Checkout (single merchant):**
   - Add items from one merchant to cart
   - Go to checkout, enter delivery address
   - Verify delivery mode selector appears above order summary
   - Verify Priority shows distance-based fee with "Est. 20–45 min"
   - Verify Economy shows the fixed fee with "Est. 45–120 min"
   - Toggle between modes and verify grand total updates
   - Verify the order summary per-merchant fee updates with mode switch

3. **Customer — Checkout (multi-merchant):**
   - Add items from 2+ merchants to cart
   - Go to checkout, enter delivery address
   - Verify both modes show only the **farthest merchant's fee** (not sum of all)
   - Verify the info message about farthest merchant appears
   - Toggle modes and verify totals reflect farthest-only logic

4. **Order submission:**
   - Place an order and check the Messenger message includes delivery mode label
   - Verify the correct fee amount is shown

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during delivery mode testing"
```

---

### Task 9: Final review and cleanup

**Step 1: Review all changed files**

Run: `git diff main --stat` to see all changed files.

**Step 2: Verify no regressions**

- Ensure existing distance-based delivery fee still works correctly when Priority is selected
- Ensure checkout still blocks orders outside delivery radius for both modes
- Ensure dine-in and pickup service types are unaffected

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: dual delivery fee options — priority (distance-based) and economy (fixed rate)"
```
