# Convex Order Management System Design

**Date:** 2026-03-13
**Status:** Approved

## Summary

Migrate the order system from Supabase to Convex for native real-time capabilities. Add staff accounts for order management, customer order tracking via order ID lookup, and audio notifications for new orders. Supabase Auth remains for all authentication.

## Architecture: Convex as Order Hub, Supabase for Everything Else

- **Convex:** Orders, order items, staff metadata, real-time subscriptions
- **Supabase:** Auth (admin + staff), menu items, inventory, categories, merchants, payments, settings, promotions
- **Convex deployment:** `vivid-caiman-974`
- **Convex deploy key:** (see .env.local)

## Data Model

### `orders` table
| Field | Type | Description |
|---|---|---|
| merchantId | string | Links to Supabase merchant |
| customerName | string | Customer name |
| contactNumber | string | Customer phone |
| serviceType | "dine-in" \| "pickup" \| "delivery" | Service type |
| address | string? | Delivery address |
| deliveryLatitude | number? | Delivery lat |
| deliveryLongitude | number? | Delivery lng |
| distanceKm | number? | Distance in km |
| deliveryFee | number? | Calculated fee |
| deliveryFeeBreakdown | object? | Fee breakdown JSON |
| pickupTime | string? | For pickup orders |
| partySize | number? | For dine-in |
| dineInTime | string? | For dine-in |
| paymentMethod | string | Payment method |
| referenceNumber | string? | Payment reference |
| notes | string? | Order notes |
| total | number | Order total |
| status | string | pending/confirmed/preparing/ready/completed/cancelled |
| ipAddress | string? | Customer IP |
| receiptUrl | string? | Cloudinary receipt URL |
| staffId | string? | Supabase user ID of staff who last updated |

### `orderItems` table
| Field | Type | Description |
|---|---|---|
| orderId | Id<"orders"> | Convex relation |
| itemId | string | Supabase menu item ID |
| name | string | Item name |
| variation | object? | Selected variation |
| addOns | object? | Selected add-ons |
| unitPrice | number | Price per unit |
| quantity | number | Quantity |
| subtotal | number | Line total |

### `staff` table
| Field | Type | Description |
|---|---|---|
| supabaseUserId | string | Links to Supabase Auth user |
| email | string | Staff email |
| name | string | Staff display name |
| merchantId | string | Which merchant they work for |
| isActive | boolean | Active/deactivated |
| createdAt | number | Timestamp |

## Routes

| Route | Component | Auth Required | Description |
|---|---|---|---|
| `/track/:orderId` | OrderTracking | No | Customer order tracking page |
| `/staff/login` | StaffLogin | No | Staff login page |
| `/staff/orders` | StaffOrdersPanel | Staff role | Staff order management |
| `/admin` (updated) | AdminDashboard | Admin | + Staff Management section |

## Convex Functions

| Function | Type | Purpose |
|---|---|---|
| `orders.create` | Mutation | Create new order + items |
| `orders.listAll` | Query | All orders (admin) |
| `orders.listByMerchant` | Query | Orders by merchant (staff) |
| `orders.getById` | Query | Single order + items (tracking) |
| `orders.updateStatus` | Mutation | Change order status |
| `orders.exportCompleted` | Query | CSV export data |
| `staff.create` | Mutation | Add staff record |
| `staff.listByMerchant` | Query | List staff for merchant |
| `staff.deactivate` | Mutation | Disable staff account |

## Data Flows

### Order Creation
1. Customer submits checkout form
2. Convex mutation `orders.create` stores order + items
3. Convex action calls Supabase RPC to decrement inventory
4. Order ID returned to customer, redirected to `/track/:orderId`

### Real-Time Updates
- Admin: `useQuery(api.orders.listAll)` — all orders, auto-updates
- Staff: `useQuery(api.orders.listByMerchant, { merchantId })` — filtered
- Customer: `useQuery(api.orders.getById, { orderId })` — single order

### Staff Account Creation
1. Admin creates Supabase Auth user with `role: "staff"` in user_metadata
2. Convex mutation `staff.create` stores staff metadata
3. Staff logs in at `/staff/login` via Supabase Auth
4. App checks `user_metadata.role === "staff"`, routes to `/staff/orders`

### New Order Notification
- Audio notification plays when a new order appears in admin/staff views
- Uses `<audio>` element with a notification sound file
- Visual toast/badge: "New order received!"
- Triggered by Convex real-time query detecting new entries

## Features & Teams

Each feature is developed by a dedicated team:
- **Coordinator:** Plans and breaks into tasks
- **UI/UX:** Component layout and styling (Tailwind consistency)
- **Developer:** Implements Convex functions + React components
- **Reviewer:** Code review against plan and standards
- **Tester:** Verifies implementation

### Feature 1: Convex Setup & Order Schema
Install Convex, configure deployment, define schema, create base queries/mutations.

### Feature 2: Order Migration
Rewire Checkout and OrdersManager from Supabase to Convex. Remove Supabase order logic.

### Feature 3: Customer Order Tracking
New `/track/:orderId` page with real-time status display, order details, and progress visualization.

### Feature 4: Staff Authentication & Management
Admin creates staff in dashboard. Separate `/staff/login` and `/staff/orders` pages. Staff can only view/update order status.

### Feature 5: New Order Notifications
Audio ringtone + visual notification when new orders arrive in admin and staff views.

## Decisions

- **Full migration:** Orders move entirely to Convex (not dual-system)
- **Supabase Auth stays:** All authentication remains in Supabase
- **Staff role:** Order management only (no menu/inventory/settings access)
- **Customer tracking:** Order ID lookup, no authentication required
- **Staff login:** Separate `/staff/login` page, not shared with admin
