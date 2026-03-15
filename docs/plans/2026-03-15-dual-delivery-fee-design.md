# Dual Delivery Fee Design (Priority vs Economy)

**Date:** 2026-03-15
**Status:** Approved

## Goal

Allow merchants to set a fixed delivery fee alongside the existing distance-based pricing. Customers choose between Priority (distance-based) and Economy (fixed rate) at checkout.

## Decisions

- **Labels:** "Priority Delivery" (distance-based) and "Economy Delivery" (fixed rate)
- **Visibility:** Economy option only appears when merchant has `fixedDeliveryFee > 0`
- **Multi-merchant:** One toggle for all merchants. Merchants without a fixed fee always use distance-based regardless of toggle.
- **Edge cases:** Both options shown even when fixed fee > distance fee. Customer decides.
- **Default:** Priority (distance-based) is pre-selected.

## Architecture

Extend existing delivery pricing flow:

1. **Merchant config:** Add `fixedDeliveryFee` to `Merchant` type, map from Supabase `fixed_delivery_fee` column (migration already exists).
2. **Checkout UI:** When any cart merchant has `fixedDeliveryFee > 0`, show Priority/Economy toggle.
3. **Fee calculation:** Economy mode uses `merchant.fixedDeliveryFee`. Priority mode keeps existing `calculateDeliveryFee()`.
4. **Order storage:** Add `deliveryMode` field to Convex orders schema. Supabase migration already has `delivery_mode` column.
5. **Display:** OrdersManager, StaffOrdersPanel, OrderTracking show delivery mode.

## Data Flow

```
Merchant (Supabase) → fixedDeliveryFee field
                    ↓
Checkout.tsx → Toggle: Priority/Economy
            → Economy: use fixedDeliveryFee
            → Priority: use calculateDeliveryFee() (existing)
                    ↓
Convex Order → deliveryMode: "priority" | "economy"
             → deliveryFee: calculated amount
```

## Files to Change

| File | Change |
|---|---|
| `src/types/index.ts` | Add `fixedDeliveryFee?: number` to Merchant |
| `src/hooks/useMerchants.ts` | Map `fixed_delivery_fee` from DB |
| `convex/schema.ts` | Add `deliveryMode` optional field to orders |
| `convex/orders.ts` | Accept `deliveryMode` in create mutation |
| `src/components/Checkout.tsx` | Add Priority/Economy toggle, update fee calc |
| `src/components/MerchantManager.tsx` | Add fixed delivery fee input |
| `src/components/OrdersManager.tsx` | Display delivery mode |
| `src/components/StaffOrdersPanel.tsx` | Display delivery mode |
| `src/components/OrderTracking.tsx` | Display delivery mode |

## Edge Cases

- No fixed fee set → No toggle, distance-based only
- Mixed merchants (some have fixed fee, some don't) → Toggle shown; merchants without fixed fee always use distance-based
- Fixed fee > distance fee → Both shown, customer decides
