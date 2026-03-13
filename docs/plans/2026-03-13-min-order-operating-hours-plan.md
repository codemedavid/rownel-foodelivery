# Min Order & Operating Hours Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce minimum order per merchant, add merchant operating hours, and category time-window restrictions so customers can see but not order from closed merchants/categories.

**Architecture:** Frontend-only validation in React. New `timeUtils.ts` utility for PHT time checks. Category table gets `start_time`/`end_time` columns. Existing `minimumOrder` and `openingHours` fields on merchants are now enforced in Cart, Checkout, Menu, and MerchantsList.

**Tech Stack:** React 18 + TypeScript, Supabase (PostgreSQL), Tailwind CSS, Lucide icons

---

### Task 1: Create time utility library

**Files:**
- Create: `src/lib/timeUtils.ts`

**Step 1: Create `src/lib/timeUtils.ts`**

```typescript
/**
 * Time utilities for operating hours — all times in Philippine Standard Time (UTC+8)
 */

const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Returns the current date/time in Philippine Standard Time */
export function getPhilippineTime(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + PHT_OFFSET_MS);
}

/** Day names matching the openingHours keys on Merchant */
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Parse "HH:MM" into minutes since midnight */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Format "HH:MM" (24h) to "h:mm AM/PM" */
export function formatTimeForDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
}

export interface MerchantOpenStatus {
  isOpen: boolean;
  /** Human-readable next open time, e.g. "Opens at 6:00 AM" */
  nextOpenTime?: string;
  /** Today's closing time if currently open */
  closingTime?: string;
}

/**
 * Check if a merchant is currently open based on its openingHours.
 *
 * openingHours format: { "monday": "06:00-22:00", "tuesday": "closed", ... }
 * Missing day = always open (backward compat)
 */
export function isMerchantOpen(openingHours?: Record<string, string>): MerchantOpenStatus {
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return { isOpen: true };
  }

  const now = getPhilippineTime();
  const dayName = DAY_NAMES[now.getDay()];
  const schedule = openingHours[dayName];

  // Missing day = always open
  if (schedule === undefined) {
    return { isOpen: true };
  }

  // Explicitly closed
  if (schedule.toLowerCase() === 'closed') {
    // Find next open day
    for (let offset = 1; offset <= 7; offset++) {
      const nextDayIndex = (now.getDay() + offset) % 7;
      const nextDayName = DAY_NAMES[nextDayIndex];
      const nextSchedule = openingHours[nextDayName];
      if (nextSchedule && nextSchedule.toLowerCase() !== 'closed') {
        const openTime = nextSchedule.split('-')[0];
        const dayLabel = offset === 1 ? 'tomorrow' : nextDayName.charAt(0).toUpperCase() + nextDayName.slice(1);
        return { isOpen: false, nextOpenTime: `Opens ${dayLabel} at ${formatTimeForDisplay(openTime)}` };
      }
    }
    return { isOpen: false, nextOpenTime: 'Currently closed' };
  }

  // Parse "HH:MM-HH:MM"
  const parts = schedule.split('-');
  if (parts.length !== 2) {
    return { isOpen: true }; // Malformed = treat as open
  }

  const [openStr, closeStr] = parts;
  const openMinutes = parseTimeToMinutes(openStr);
  const closeMinutes = parseTimeToMinutes(closeStr);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let isOpen: boolean;
  if (closeMinutes > openMinutes) {
    // Normal range (e.g. 06:00-22:00)
    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    // Overnight range (e.g. 22:00-06:00)
    isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }

  if (isOpen) {
    return { isOpen: true, closingTime: formatTimeForDisplay(closeStr) };
  }

  // Currently before opening time today
  if (currentMinutes < openMinutes) {
    return { isOpen: false, nextOpenTime: `Opens at ${formatTimeForDisplay(openStr)}` };
  }

  // Past closing time, find next open
  for (let offset = 1; offset <= 7; offset++) {
    const nextDayIndex = (now.getDay() + offset) % 7;
    const nextDayName = DAY_NAMES[nextDayIndex];
    const nextSchedule = openingHours[nextDayName];
    if (!nextSchedule || nextSchedule.toLowerCase() === 'closed') continue;
    const nextOpen = nextSchedule.split('-')[0];
    const dayLabel = offset === 1 ? 'tomorrow' : nextDayName.charAt(0).toUpperCase() + nextDayName.slice(1);
    return { isOpen: false, nextOpenTime: `Opens ${dayLabel} at ${formatTimeForDisplay(nextOpen)}` };
  }

  return { isOpen: false, nextOpenTime: 'Currently closed' };
}

export interface CategoryAvailability {
  isAvailable: boolean;
  /** e.g. "Available from 8:00 AM to 12:00 PM" */
  availableAt?: string;
}

/**
 * Check if a category is currently available based on its start_time/end_time.
 * Times are in "HH:MM" format, checked against PHT.
 * If both are null, the category is always available.
 */
export function isCategoryAvailable(startTime?: string | null, endTime?: string | null): CategoryAvailability {
  if (!startTime || !endTime) {
    return { isAvailable: true };
  }

  const now = getPhilippineTime();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  let isAvailable: boolean;
  if (endMinutes > startMinutes) {
    isAvailable = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range
    isAvailable = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  if (isAvailable) {
    return { isAvailable: true };
  }

  return {
    isAvailable: false,
    availableAt: `Available ${formatTimeForDisplay(startTime)} - ${formatTimeForDisplay(endTime)}`,
  };
}

export interface MinOrderStatus {
  met: boolean;
  remaining: number;
  minimum: number;
}

/** Check if a merchant subtotal meets the minimum order */
export function getMinOrderStatus(minimumOrder: number, subtotal: number): MinOrderStatus {
  const met = minimumOrder <= 0 || subtotal >= minimumOrder;
  return {
    met,
    remaining: met ? 0 : minimumOrder - subtotal,
    minimum: minimumOrder,
  };
}
```

**Step 2: Commit**

```bash
git add src/lib/timeUtils.ts
git commit -m "feat: add time utilities for operating hours and min order checks"
```

---

### Task 2: Update Category type and hook to include operating hours

**Files:**
- Modify: `src/hooks/useCategories.ts:4-12` (Category interface)
- Modify: `src/hooks/useCategories.ts` (add/update functions to handle new fields)

**Step 1: Update the Category interface**

In `src/hooks/useCategories.ts`, update the interface (lines 4-12):

```typescript
export interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  active: boolean;
  start_time: string | null;  // "HH:MM" or null (always available)
  end_time: string | null;    // "HH:MM" or null (always available)
  created_at: string;
  updated_at: string;
}
```

**Step 2: Update the derived-category fallback** (line 30-37 area)

When creating categories from menu items (the `uniqueCategories.set` block), add `start_time: null, end_time: null` to the default object.

**Step 3: Update `addCategory` and `updateCategory` to pass `start_time`/`end_time`**

In `addCategory` (line ~84), add `start_time` and `end_time` to the insert object.
In `updateCategory` (line ~108), add `start_time` and `end_time` to the update object.

**Step 4: Commit**

```bash
git add src/hooks/useCategories.ts
git commit -m "feat: add start_time/end_time to Category type and hook"
```

---

### Task 3: Add Supabase migration for category time columns

**Files:**
- Create: `supabase/migrations/20260313000000_add_category_operating_hours.sql`

**Step 1: Create migration file**

```sql
-- Add operating hours columns to categories table
ALTER TABLE categories ADD COLUMN IF NOT EXISTS start_time TIME DEFAULT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS end_time TIME DEFAULT NULL;

COMMENT ON COLUMN categories.start_time IS 'Category availability start time (HH:MM in PHT). NULL = always available.';
COMMENT ON COLUMN categories.end_time IS 'Category availability end time (HH:MM in PHT). NULL = always available.';
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260313000000_add_category_operating_hours.sql
git commit -m "feat: add category operating hours migration"
```

---

### Task 4: Add "Closed" badges to MerchantsList

**Files:**
- Modify: `src/components/MerchantsList.tsx`

**Step 1: Import time utilities at the top**

Add to imports (line 1 area):
```typescript
import { isMerchantOpen } from '../lib/timeUtils';
```

**Step 2: Add open status computation to `merchantsWithDistance` memo or create new memo**

After the `merchantsWithDistance` memo (~line 197), add a new memo to annotate merchants with open/closed status. Or add it inline to `MerchantCardLarge`.

Create a helper inside the component:
```typescript
const getMerchantOpenStatus = useCallback((merchant: Merchant) => {
  return isMerchantOpen(merchant.openingHours);
}, []);
```

**Step 3: Update `allNearMeMerchants` sorting to push closed merchants to bottom**

In the `allNearMeMerchants` memo (~line 267), update sort:
```typescript
const allNearMeMerchants = useMemo(() => {
  return [...merchantsWithDistance].sort((a, b) => {
    const aOpen = isMerchantOpen(a.openingHours).isOpen;
    const bOpen = isMerchantOpen(b.openingHours).isOpen;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const distA = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const distB = b.distanceKm ?? Number.POSITIVE_INFINITY;
    return distA - distB;
  });
}, [merchantsWithDistance]);
```

**Step 4: Update `MerchantCardLarge` component to show closed badge and dim**

In the `MerchantCardLarge` component (~line 386), add open status check:

```tsx
const MerchantCardLarge = ({ merchant }: { merchant: MerchantWithDistance }) => {
  const openStatus = isMerchantOpen(merchant.openingHours);

  return (
    <button
      onClick={() => handleSelectMerchant(merchant.id)}
      className={`flex-shrink-0 w-64 sm:w-72 bg-white rounded-2xl p-0 shadow-sm hover:shadow-md transition-all text-left overflow-hidden border border-gray-100 ${!openStatus.isOpen ? 'opacity-60' : ''}`}
    >
      <div className="h-32 bg-gray-100 relative">
        {/* ... existing image code ... */}
        {!openStatus.isOpen && (
          <div className="absolute top-2 left-2 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-sm">
            Closed
          </div>
        )}
        {/* ... existing delivery time badge ... */}
      </div>
      <div className="p-4">
        {/* ... existing content ... */}
        {!openStatus.isOpen && openStatus.nextOpenTime && (
          <p className="text-xs text-red-500 mt-1">{openStatus.nextOpenTime}</p>
        )}
      </div>
    </button>
  );
};
```

**Step 5: Commit**

```bash
git add src/components/MerchantsList.tsx
git commit -m "feat: show closed badges and sort closed merchants to bottom"
```

---

### Task 5: Add closed merchant banner and category availability to Menu page

**Files:**
- Modify: `src/components/Menu.tsx`

**Step 1: Import time utilities**

```typescript
import { isMerchantOpen, isCategoryAvailable } from '../lib/timeUtils';
import { Clock } from 'lucide-react';
```

**Step 2: Add merchant open status check**

After `const { selectedMerchant } = useMerchant();` (line 38), add:
```typescript
const merchantOpenStatus = useMemo(
  () => isMerchantOpen(selectedMerchant?.openingHours),
  [selectedMerchant?.openingHours]
);
```

**Step 3: Add closed banner after merchant header**

After the closing `</div>` of the merchant header section (after line 162), add:
```tsx
{!merchantOpenStatus.isOpen && (
  <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 lg:px-8 py-3">
    <div className="max-w-7xl mx-auto flex items-center gap-2 text-red-700">
      <Clock className="h-4 w-4 flex-shrink-0" />
      <p className="text-sm font-medium">
        This store is currently closed.{' '}
        {merchantOpenStatus.nextOpenTime && <span className="font-normal">{merchantOpenStatus.nextOpenTime}</span>}
      </p>
    </div>
  </div>
)}
```

**Step 4: Add category availability tags**

In the categories.map block (~line 217), before rendering category items, check availability:
```tsx
{categories.map((category) => {
  const categoryItems = menuItems.filter(item => item.category === category.id);
  if (categoryItems.length === 0) return null;

  const categoryAvailability = isCategoryAvailable(category.start_time, category.end_time);
  const isClosed = !merchantOpenStatus.isOpen || !categoryAvailability.isAvailable;

  return (
    <section key={category.id} id={category.id} className={`mb-12 ${isClosed ? 'opacity-60' : ''}`}>
      <div className="flex items-center mb-6">
        <span className="text-3xl mr-3">{category.icon}</span>
        <h3 className="text-2xl font-bold text-gray-900">{category.name}</h3>
        <span className="ml-3 text-sm text-gray-500">({categoryItems.length})</span>
        {!categoryAvailability.isAvailable && (
          <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
            <Clock className="h-3 w-3" />
            {categoryAvailability.availableAt}
          </span>
        )}
      </div>
      {/* ... grid of MenuItemCards — pass disabled prop ... */}
    </section>
  );
})}
```

**Step 5: Pass `disabled` prop to MenuItemCard**

When rendering `MenuItemCard` inside categories, pass a `disabled` prop:
```tsx
<MenuItemCard
  key={item.id}
  item={item}
  quantity={cartItem?.quantity || 0}
  cartItemId={cartItem?.id}
  onUpdateQuantity={updateQuantity}
  onOpenDetails={handleOpenDetails}
  disabled={isClosed}
/>
```

Also do the same in the Random Picks section — if the merchant is closed, disable all random picks:
```tsx
<MenuItemCard
  key={`random-${item.id}`}
  item={item}
  quantity={cartItem?.quantity || 0}
  cartItemId={cartItem?.id}
  onUpdateQuantity={updateQuantity}
  onOpenDetails={handleOpenDetails}
  disabled={!merchantOpenStatus.isOpen}
/>
```

**Step 6: Commit**

```bash
git add src/components/Menu.tsx
git commit -m "feat: add closed banner and category availability tags to menu"
```

---

### Task 6: Update MenuItemCard to support disabled state

**Files:**
- Modify: `src/components/MenuItemCard.tsx`

**Step 1: Add `disabled` prop to interface**

At line 5-11, add `disabled?` to the interface:
```typescript
interface MenuItemCardProps {
  item: MenuItem;
  quantity: number;
  cartItemId?: string;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onOpenDetails: (itemId: string) => void;
  disabled?: boolean; // true when merchant/category is closed
}
```

**Step 2: Destructure and use the prop**

Update the component params to include `disabled`:
```typescript
const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  quantity,
  cartItemId,
  onUpdateQuantity,
  onOpenDetails,
  disabled = false,
}) => {
```

**Step 3: Apply disabled state to the card and buttons**

- Add opacity to the card container when disabled:
```tsx
<div className={`group overflow-hidden rounded-2xl ... ${!item.available || disabled ? 'opacity-60' : ''}`}>
```

- Replace the add-to-cart / quantity buttons section. When `disabled`, show a "Closed" button:
```tsx
{!item.available || disabled ? (
  <button disabled className="cursor-not-allowed rounded-xl bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500">
    {disabled ? 'Closed' : 'Unavailable'}
  </button>
) : hasCustomizations ? (
  // ... existing code
```

**Step 4: Commit**

```bash
git add src/components/MenuItemCard.tsx
git commit -m "feat: add disabled state to MenuItemCard for closed merchants/categories"
```

---

### Task 7: Update MenuItemDetailsPage to block add-to-cart when closed

**Files:**
- Modify: `src/components/MenuItemDetailsPage.tsx`

**Step 1: Import time utilities**

```typescript
import { isMerchantOpen, isCategoryAvailable } from '../lib/timeUtils';
import { useCategories } from '../hooks/useCategories';
import { Clock } from 'lucide-react';
```

**Step 2: Add open/available checks**

After the `item` memo (~line 31), add:
```typescript
const merchantOpenStatus = useMemo(
  () => isMerchantOpen(selectedMerchant?.openingHours),
  [selectedMerchant?.openingHours]
);

const { categories } = useCategories(merchantId, menuItems);
const itemCategory = categories.find(c => c.id === item?.category);
const categoryAvailability = useMemo(
  () => isCategoryAvailable(itemCategory?.start_time, itemCategory?.end_time),
  [itemCategory?.start_time, itemCategory?.end_time]
);

const isClosed = !merchantOpenStatus.isOpen || !categoryAvailability.isAvailable;
```

**Step 3: Show closed warning and disable add-to-cart button**

Before the add-to-cart button area (~line 354), add a closed warning:
```tsx
{isClosed && (
  <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
    <Clock className="h-4 w-4" />
    <span>
      {!merchantOpenStatus.isOpen
        ? `This store is currently closed. ${merchantOpenStatus.nextOpenTime || ''}`
        : categoryAvailability.availableAt || 'This category is not available right now.'}
    </span>
  </div>
)}
```

Update the add-to-cart button to be disabled when closed:
```tsx
<button
  type="button"
  onClick={handleAddToCart}
  disabled={!item.available || isClosed}
  className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
>
  <ShoppingCart className="h-4 w-4" />
  {isClosed ? 'Currently closed' : 'Add to cart'}
</button>
```

**Step 4: Commit**

```bash
git add src/components/MenuItemDetailsPage.tsx
git commit -m "feat: block add-to-cart on item details page when closed"
```

---

### Task 8: Add minimum order warnings to Cart

**Files:**
- Modify: `src/components/Cart.tsx`

**Step 1: Import utilities**

```typescript
import { getMinOrderStatus, isMerchantOpen } from '../lib/timeUtils';
import { AlertTriangle, Clock } from 'lucide-react';
```

**Step 2: Compute min order and open status per merchant**

After the `getMerchantSubtotal` function (~line 36), add a memo:
```typescript
const merchantStatuses = useMemo(() => {
  const statuses: Record<string, { minOrder: ReturnType<typeof getMinOrderStatus>; openStatus: ReturnType<typeof isMerchantOpen> }> = {};

  Object.keys(itemsByMerchant).forEach(merchantId => {
    const merchant = merchants.find(m => m.id === merchantId);
    const subtotal = getMerchantSubtotal(merchantId);
    statuses[merchantId] = {
      minOrder: getMinOrderStatus(merchant?.minimumOrder || 0, subtotal),
      openStatus: isMerchantOpen(merchant?.openingHours),
    };
  });

  return statuses;
}, [itemsByMerchant, merchants]);

const hasMinOrderIssue = Object.values(merchantStatuses).some(s => !s.minOrder.met);
const hasClosedMerchant = Object.values(merchantStatuses).some(s => !s.openStatus.isOpen);
const canCheckout = !hasMinOrderIssue && !hasClosedMerchant;
```

**Step 3: Show per-merchant warnings inside the merchant group**

After the merchant header div (the `bg-gradient-to-r from-green-50` section, ~line 93), add:
```tsx
{/* Min order warning */}
{!merchantStatuses[merchantId]?.minOrder.met && (
  <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
    <p className="text-sm text-amber-800">
      Add ₱{merchantStatuses[merchantId].minOrder.remaining.toFixed(2)} more to meet minimum order of ₱{merchantStatuses[merchantId].minOrder.minimum.toFixed(2)}
    </p>
  </div>
)}

{/* Closed merchant warning */}
{!merchantStatuses[merchantId]?.openStatus.isOpen && (
  <div className="flex items-center gap-2 bg-red-50 border-b border-red-200 px-4 sm:px-6 py-2.5">
    <Clock className="h-4 w-4 text-red-600 flex-shrink-0" />
    <p className="text-sm text-red-700">
      {merchant?.name || 'This restaurant'} is currently closed.{' '}
      {merchantStatuses[merchantId].openStatus.nextOpenTime}
    </p>
  </div>
)}
```

**Step 4: Disable the checkout button when min order not met or merchant closed**

Update the "Proceed to Checkout" button (~line 187-191):
```tsx
<button
  onClick={onCheckout}
  disabled={!canCheckout}
  className={`w-full py-3 sm:py-4 rounded-xl transition-all duration-200 transform font-medium text-base sm:text-lg ${
    canCheckout
      ? 'bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02]'
      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
  }`}
>
  Proceed to Checkout
</button>
{!canCheckout && (
  <p className="text-xs text-red-600 text-center mt-2">
    {hasMinOrderIssue && 'Some merchants have not met minimum order requirements. '}
    {hasClosedMerchant && 'Some merchants are currently closed.'}
  </p>
)}
```

**Step 5: Commit**

```bash
git add src/components/Cart.tsx
git commit -m "feat: add min order warnings and closed merchant warnings to cart"
```

---

### Task 9: Add minimum order and closed validation to Checkout

**Files:**
- Modify: `src/components/Checkout.tsx`

**Step 1: Import utilities**

```typescript
import { getMinOrderStatus, isMerchantOpen } from '../lib/timeUtils';
import { AlertTriangle, Clock } from 'lucide-react';
```

**Step 2: Add validation computations**

After the `getMerchantSubtotal` function (~line 142), add:
```typescript
const merchantValidation = useMemo(() => {
  const validation: Record<string, { minOrder: ReturnType<typeof getMinOrderStatus>; openStatus: ReturnType<typeof isMerchantOpen> }> = {};

  merchantIds.forEach(merchantId => {
    const merchant = merchants.find(m => m.id === merchantId);
    const subtotal = getMerchantSubtotal(merchantId);
    validation[merchantId] = {
      minOrder: getMinOrderStatus(merchant?.minimumOrder || 0, subtotal),
      openStatus: isMerchantOpen(merchant?.openingHours),
    };
  });

  return validation;
}, [merchantIds, merchants, itemsByMerchant]);

const hasMinOrderIssue = Object.values(merchantValidation).some(v => !v.minOrder.met);
const hasClosedMerchant = Object.values(merchantValidation).some(v => !v.openStatus.isOpen);
```

**Step 3: Add warnings in the order summary per merchant**

Inside the merchant order summary block (after the subtotal section, ~line 365), add:
```tsx
{!merchantValidation[merchantId]?.minOrder.met && (
  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
    <p className="text-xs text-amber-800">
      Add ₱{merchantValidation[merchantId].minOrder.remaining.toFixed(2)} more (min. ₱{merchantValidation[merchantId].minOrder.minimum.toFixed(2)})
    </p>
  </div>
)}
{!merchantValidation[merchantId]?.openStatus.isOpen && (
  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
    <Clock className="h-4 w-4 text-red-600 flex-shrink-0" />
    <p className="text-xs text-red-700">
      Currently closed. {merchantValidation[merchantId].openStatus.nextOpenTime}
    </p>
  </div>
)}
```

**Step 4: Update `canPlaceOrder` to include new checks**

Update the `canPlaceOrder` computation (~line 283):
```typescript
const canPlaceOrder = Boolean(isDetailsValid) && !hasUndeliverableMerchant && !hasMinOrderIssue && !hasClosedMerchant;
```

**Step 5: Update error message below the button**

Update the error message section (~line 534-538):
```tsx
{!canPlaceOrder && (
  <p className="text-xs text-red-600 text-center mt-2">
    {hasUndeliverableMerchant && 'Some merchants are outside delivery coverage. '}
    {hasMinOrderIssue && 'Some merchants have not met minimum order. '}
    {hasClosedMerchant && 'Some merchants are currently closed. '}
    {!isDetailsValid && 'Please fill in all required fields.'}
  </p>
)}
```

**Step 6: Commit**

```bash
git add src/components/Checkout.tsx
git commit -m "feat: add min order and closed merchant validation to checkout"
```

---

### Task 10: Add opening hours editor to MerchantManager

**Files:**
- Modify: `src/components/MerchantManager.tsx`

**Step 1: Find the merchant form section**

Locate where merchant form fields are rendered (search for `openingHours` or the merchant form section). Add a new "Operating Hours" section after the existing form fields.

**Step 2: Add operating hours editor UI**

Add a day-of-week schedule editor inside the merchant form. This should render 7 rows (Mon-Sun), each with:
- A checkbox for "Open" / "Closed"
- Two time inputs (open time, close time) when open

```tsx
{/* Operating Hours */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">Operating Hours (PHT)</label>
  <div className="space-y-2">
    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
      const schedule = merchantFormData.openingHours?.[day] || '';
      const isClosed = schedule.toLowerCase() === 'closed';
      const isConfigured = schedule && !isClosed;
      const [openTime, closeTime] = isConfigured ? schedule.split('-') : ['09:00', '22:00'];

      return (
        <div key={day} className="flex items-center gap-3 rounded-lg border border-gray-200 p-2">
          <span className="w-24 text-sm font-medium capitalize text-gray-700">{day}</span>
          <select
            value={isClosed ? 'closed' : isConfigured ? 'open' : 'always'}
            onChange={(e) => {
              const newHours = { ...merchantFormData.openingHours };
              if (e.target.value === 'closed') {
                newHours[day] = 'closed';
              } else if (e.target.value === 'open') {
                newHours[day] = `${openTime}-${closeTime}`;
              } else {
                delete newHours[day];
              }
              setMerchantFormData(prev => ({ ...prev, openingHours: newHours }));
            }}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="always">Always Open</option>
            <option value="open">Set Hours</option>
            <option value="closed">Closed</option>
          </select>
          {isConfigured && (
            <>
              <input
                type="time"
                value={openTime}
                onChange={(e) => {
                  const newHours = { ...merchantFormData.openingHours };
                  newHours[day] = `${e.target.value}-${closeTime}`;
                  setMerchantFormData(prev => ({ ...prev, openingHours: newHours }));
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <span className="text-gray-500">to</span>
              <input
                type="time"
                value={closeTime}
                onChange={(e) => {
                  const newHours = { ...merchantFormData.openingHours };
                  newHours[day] = `${openTime}-${e.target.value}`;
                  setMerchantFormData(prev => ({ ...prev, openingHours: newHours }));
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </>
          )}
        </div>
      );
    })}
  </div>
</div>
```

**Step 3: Add category operating hours in the category management section**

Wherever categories are edited in MerchantManager (or if there's a separate category editor), add start_time/end_time fields:
```tsx
<div className="flex gap-3">
  <div>
    <label className="block text-xs font-medium text-gray-600">Available from</label>
    <input type="time" value={categoryFormData.start_time || ''} onChange={...} className="..." />
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-600">Available until</label>
    <input type="time" value={categoryFormData.end_time || ''} onChange={...} className="..." />
  </div>
</div>
<p className="text-xs text-gray-500">Leave blank for always available (when store is open)</p>
```

**Step 4: Commit**

```bash
git add src/components/MerchantManager.tsx
git commit -m "feat: add operating hours editor and category time fields to admin"
```

---

### Task 11: Run the Supabase migration in production

**Files:** None (database operation)

**Step 1: Run the migration**

Either run via Supabase Dashboard SQL editor or via CLI:
```bash
supabase db push
```

Or manually run the SQL from Task 3 in the Supabase SQL editor.

**Step 2: Verify the columns exist**

Check the categories table in Supabase Dashboard to confirm `start_time` and `end_time` columns are present.

---

### Task 12: End-to-end manual testing

**Step 1: Test merchant operating hours**

1. In admin, set a merchant's Monday hours to "09:00-17:00"
2. View the merchants list — if outside those hours, merchant should show "Closed" badge and be dimmed
3. Click the closed merchant — menu page should show closed banner
4. Try adding an item — should be blocked

**Step 2: Test category operating hours**

1. In admin, set a category's time to "08:00-12:00" (breakfast)
2. View the menu — if outside that time, category should show "Available 8:00 AM - 12:00 PM" tag and items should be greyed out

**Step 3: Test minimum order**

1. Set a merchant's minimum order to ₱200
2. Add ₱100 worth of items
3. Cart should show "Add ₱100.00 more to meet minimum order of ₱200.00"
4. "Proceed to Checkout" should be disabled
5. Add more items to reach ₱200 — warning should disappear and button should enable
6. Go to checkout — verify validation works there too

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete min order enforcement and operating hours feature"
```
