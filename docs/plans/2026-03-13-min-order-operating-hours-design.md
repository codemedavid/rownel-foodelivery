# Min Order Enforcement & Operating Hours Design

**Date:** 2026-03-13
**Status:** Approved
**Approach:** Frontend-only validation (Approach A)

## Features

1. **Minimum order per merchant** — per-merchant enforcement in cart + checkout
2. **Merchant operating hours** — merchants have daily open/close schedules
3. **Category operating hours** — per-merchant category time windows (e.g., breakfast 8am-12pm)
4. **Closed UX** — visible but greyed out with "Closed" tag, can't add to cart

## Decisions

- **Timezone:** Philippine Standard Time (UTC+8) for all time checks
- **Min order scope:** Per-merchant (each merchant's cart subtotal checked independently)
- **Block points:** Warnings shown in both Cart and Checkout; submission blocked in both
- **Category hours scope:** Per-merchant (categories belong to merchants via merchant_id)
- **Closed behavior:** Visible but greyed out, "Closed"/"Opens at X" tag, add-to-cart disabled

## Data Model Changes

### Merchant (existing fields, no schema changes)

- `minimumOrder: number` — already exists, just needs enforcement
- `openingHours: Record<string, string>` — already exists as JSON
  - Format: `{ "monday": "06:00-22:00", "tuesday": "closed", ... }`
  - Missing day = open 24hrs (backward compat)
  - `"closed"` value = closed that day

### Categories (new columns)

```sql
ALTER TABLE categories ADD COLUMN start_time TIME;  -- e.g., '08:00'
ALTER TABLE categories ADD COLUMN end_time TIME;    -- e.g., '12:00'
```

- NULL start_time/end_time = always available (when merchant is open)
- Categories already scoped to merchants via merchant_id

## UI Components & Behavior

### Merchant Listing Page (MerchantsList.tsx)

- Merchant card shows red "Closed" or "Opens at 6:00 AM" badge when outside hours
- Closed merchants sorted to bottom of list
- Card slightly dimmed (opacity reduction)
- Tapping still opens menu page (with restrictions)

### Menu Page (Menu.tsx)

- Closed merchant: banner at top — "This store is currently closed. Opens at [time]"
- Closed categories: "Not available right now" tag next to category name
- Items under closed categories are greyed out, "Add to Cart" disabled
- Items can't be added to cart when merchant is closed

### Cart (Cart.tsx)

- Per-merchant: "Add X more to meet minimum order (Y)" warning banner
- "Proceed to Checkout" disabled if any merchant below minimum
- "Merchant is currently closed" warning if merchant closed while items in cart

### Checkout (Checkout.tsx)

- Final validation before submission
- Per-merchant minimum order status display
- "Place Order" blocked if minimums not met or merchants closed

## New Utility: src/lib/timeUtils.ts

```typescript
getPhilippineTime(): Date
isMerchantOpen(merchant): { isOpen: boolean; nextOpenTime?: string }
isCategoryAvailable(category): { isAvailable: boolean; availableAt?: string }
formatTimeForDisplay(time: string): string  // "08:00" -> "8:00 AM"
```

## Min Order Logic (in useCart hook / Checkout)

```typescript
getMerchantSubtotal(merchantId): number
getMinOrderStatus(merchant, subtotal): { met: boolean; remaining: number; minimum: number }
```

## Admin Changes

- **MerchantManager:** Add opening hours editor (day-of-week time pickers)
- **Category management:** Add start_time/end_time fields when editing categories

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Update Category interface with start_time/end_time |
| `src/lib/timeUtils.ts` | NEW — time checking utilities |
| `src/hooks/useCategories.ts` | Fetch new time fields |
| `src/hooks/useCart.ts` | Add getMerchantSubtotal, min order helpers |
| `src/components/MerchantsList.tsx` | Closed badge, sorting, dimming |
| `src/components/Menu.tsx` | Closed banner, category availability tags |
| `src/components/MenuItemCard.tsx` | Disable add-to-cart when closed |
| `src/components/MenuItemDetailsPage.tsx` | Disable add-to-cart when closed |
| `src/components/Cart.tsx` | Min order warnings, closed merchant warnings |
| `src/components/Checkout.tsx` | Final validation, block submission |
| `src/components/MerchantManager.tsx` | Opening hours editor |
| `supabase/migrations/` | NEW — add category time columns |
