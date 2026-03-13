# Dual Delivery Fee Options — Design Document

**Date**: 2026-03-13
**Status**: Approved

## Problem

Currently, delivery fees are calculated per-merchant using distance-based pricing (`base fee + distance × per-km rate`), and multi-merchant orders sum all merchant fees. Customers have no choice — they always pay the distance-based rate.

## Solution

Offer two delivery modes at checkout:

| | **Priority Delivery** | **Economy Delivery** |
|---|---|---|
| **Fee Calculation** | Base fee + (distance × per-km rate) | Fixed rate per merchant |
| **Multi-merchant** | Farthest merchant's fee only | Farthest merchant's fee only |
| **Time Estimate** | 20–45 min | 45–120 min |
| **Use Case** | Fast, distance-based | Cheap, batched delivery |

## Data Changes

### Merchants table — 1 new column
- `fixed_delivery_fee` (numeric, default: 0) — the flat rate charged for economy delivery

### Orders table — 1 new column
- `delivery_mode` (text, default: `'priority'`) — either `'priority'` or `'economy'`

## Component Changes

### 1. Checkout.tsx
- Add delivery mode selector (radio buttons) **above** the order summary
- Show Priority card: calculated distance fee + "20–45 min"
- Show Economy card: fixed rate + "45–120 min"
- Multi-merchant logic: use **farthest merchant's fee only** for both modes
- Update grand total based on selected mode

### 2. MerchantManager.tsx
- Add "Fixed Delivery Fee (₱)" input in the delivery pricing section

### 3. deliveryPricing.ts
- Add `getEconomyDeliveryFee()` function
- Add `getFarthestMerchantFee()` helper for multi-merchant fee selection
- Refactor existing logic to support both modes

### 4. Types (types/index.ts, supabase.ts)
- Add `fixed_delivery_fee` to Merchant type
- Add `delivery_mode` to OrderData type
- Add `DeliveryMode` type (`'priority' | 'economy'`)

## Checkout Flow

1. Customer selects delivery address
2. System calculates distance to each merchant via Haversine
3. For Priority: compute distance-based fee per merchant, pick farthest
4. For Economy: get `fixed_delivery_fee` per merchant, pick farthest
5. Display both options with fees and time estimates
6. Customer selects one
7. Grand total updates accordingly
8. Order placed with `delivery_mode` saved

## Edge Cases

- If `fixed_delivery_fee` is 0/unset, economy shows ₱0 — admin should configure it
- "Farthest merchant" = greatest Haversine distance from customer address
- Single-merchant orders: that merchant's fee used directly
- Max delivery radius validation applies to both modes
