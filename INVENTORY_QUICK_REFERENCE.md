# Inventory System - Quick Reference Guide

## 🎯 What Does It Do?

Your inventory system automatically tracks stock levels and manages item availability in real-time. When stock runs low, items are automatically disabled. When orders are placed, stock is automatically decremented.

---

## 📊 System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        INVENTORY FLOW                           │
└────────────────────────────────────────────────────────────────┘

ADMIN SIDE                          CUSTOMER SIDE
    │                                     │
    ├─ Enable Inventory Tracking         ├─ Browse Menu
    │                                     │
    ├─ Set Stock: 50                     ├─ See "50 in stock"
    │  Set Threshold: 10                 │
    │                                     │
    ├─ Auto-Save ──┐                     ├─ Add to Cart (qty: 5)
    │              │                     │
    │         [DATABASE]                 ├─ Place Order
    │              │                     │
    │         ┌────┴─────┐              │
    │         │ TRIGGER  │              │
    │         │  Fires   │              │
    │         └────┬─────┘              │
    │              │                     │
    │         Stock: 50 > 10            ├─ Order Success ──┐
    │         Available: ✓               │                  │
    │                                     │            [DATABASE]
    │                                     │                  │
    │                                     │            Stock -= 5
    │                                     │            Stock: 45
    │                                     │                  │
    │                                     │         ┌────────┴─────┐
    │                                     │         │   TRIGGER    │
    │                                     │         │    Fires     │
    │                                     │         └────────┬─────┘
    │                                     │                  │
    ├─ View Inventory Dashboard          │         45 > 10
    │  Stock: 45 ✓ In Stock             ├─ See "45 in stock"
    │                                     │
    │                                     │
    ├─ (More orders placed...)           ├─ (More purchases...)
    │                                     │
    │  Stock: 10                          │  Stock: 10
    │                                     │
    │         ┌───────────┐              │
    │         │ TRIGGER   │              │
    │         │  Fires    │              │
    │         └─────┬─────┘              │
    │               │                     │
    │         10 ≤ 10                     │
    │         Available: ✗                │
    │               │                     │
    │               └────────────────────┼─ See "Unavailable"
    │                                     │  Order button disabled
    ├─ See "Low stock" badge              │
    │  Item auto-disabled ✗               │
    │                                     │
    ├─ Restock: Set Stock: 100           │
    │                                     │
    ├─ Auto-Enabled ✓                    ├─ See "100 in stock"
    │                                     │  Can order again ✓
    │                                     │
```

---

## 🔑 Key Features

### ✅ Automatic Availability Management
- Items **automatically disable** when stock ≤ threshold
- Items **automatically enable** when stock > threshold
- **Zero manual intervention** required

### ✅ Real-Time Stock Display
- Customers see exact stock count
- "Only X left!" urgency messaging
- Color-coded status badges

### ✅ Oversell Prevention
- **Pre-order validation** checks stock before accepting order
- Error shown if insufficient stock
- Database-level safety constraints

### ✅ Automatic Stock Deduction
- Stock decrements **automatically** on order placement
- Batch processing for multiple items
- Atomic transactions prevent errors

### ✅ Per-Item Control
- Enable/disable tracking per item
- Items without tracking have unlimited availability
- Flexible for different product types

---

## 🗄️ Database Fields

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `track_inventory` | boolean | Master on/off switch | `true` |
| `stock_quantity` | integer | Current stock count | `50` |
| `low_stock_threshold` | integer | Auto-disable trigger | `10` |
| `available` | boolean | Computed by trigger | `true`/`false` |

---

## 🎨 Admin Interface

### Inventory Manager View
**Path:** Admin Dashboard → Inventory Management

**Features:**
- 📊 Table view of all items
- 🔍 Search by name or category
- ⚡ Quick stock adjustments (+/- buttons)
- ✏️ Direct input for precise counts
- 🎛️ Toggle tracking on/off
- 📈 Real-time status indicators

**Status Badges:**
- 🟢 **In Stock** - Stock > threshold
- 🟠 **Low Stock** - Stock ≤ threshold (highlighted row)
- ⚪ **Not Tracking** - Tracking disabled

### Add/Edit Item Form
**Path:** Admin Dashboard → Menu Items → Add/Edit

**Inventory Section:**
```
☑️ Track inventory and auto-disable when stock is low
┌───────────────────────────────────────┐
│ Current Stock:         [    50    ]   │
│ Low Stock Threshold:   [    10    ]   │
└───────────────────────────────────────┘
ℹ️ When current stock ≤ threshold, item is auto-disabled
```

---

## 👥 Customer Interface

### Menu Card Display

**In Stock (Stock > Threshold):**
```
┌─────────────────────────────┐
│   [Item Image]              │
│   🌟 POPULAR                │
├─────────────────────────────┤
│ Item Name                   │
│ Description here...         │
│ ₱99.00                      │
│                             │
│ ✓ 50 in stock               │ ← Green badge
│ [Add to Cart]               │
└─────────────────────────────┘
```

**Low Stock (Stock ≤ Threshold but > 0):**
```
┌─────────────────────────────┐
│   [Item Image]              │
├─────────────────────────────┤
│ Item Name                   │
│ Description here...         │
│ ₱99.00                      │
│                             │
│ ⚠️ Only 3 left! 📢          │ ← Orange badge (animated)
│ [Add to Cart]               │
└─────────────────────────────┘
```

**Out of Stock (Stock = 0):**
```
┌─────────────────────────────┐
│   [Item Image]              │
│   ❌ UNAVAILABLE            │
├─────────────────────────────┤
│ Item Name                   │
│ Currently Unavailable       │
│ ₱99.00                      │
│                             │
│ ✕ Out of stock              │ ← Red badge
│ [Unavailable]               │ ← Disabled button
└─────────────────────────────┘
```

---

## 🔄 Order Flow with Inventory

### Step-by-Step Process

**1️⃣ Customer Adds Item to Cart**
- Sees current stock level
- No reservation yet

**2️⃣ Customer Proceeds to Checkout**
- Fills out order form
- Reviews cart items

**3️⃣ Customer Submits Order**
- **Pre-Validation:** System checks if stock is available
  - ✅ If available → Continue
  - ❌ If insufficient → Show error, block order

**4️⃣ Order Created**
- Order record saved
- Order items saved

**5️⃣ Stock Deducted Automatically**
- `decrement_menu_item_stock()` function called
- Stock quantity reduced by order quantity
- Batch processed for all items

**6️⃣ Trigger Fires**
- `sync_menu_item_availability()` trigger executes
- Compares new stock vs threshold
- Updates `available` flag automatically

**7️⃣ UI Updates**
- Customers see new stock level
- Admin sees updated inventory
- Auto-disabled if stock ≤ threshold

---

## ⚠️ Edge Cases Handled

### ✅ Concurrent Orders
- Database-level locking prevents overselling
- Pre-order validation catches most race conditions

### ✅ Negative Stock Prevention
- Database constraints enforce stock ≥ 0
- Functions use `GREATEST(stock - qty, 0)` pattern

### ✅ Mixed Tracking Status
- Some items tracked, others not
- Only tracked items affected by deduction function

### ✅ Zero Stock with Zero Threshold
- `0 ≤ 0` → Item disabled
- Consistent with threshold logic

### ✅ Manual Availability Override
- Can still be overridden manually
- But will auto-sync on next stock update

---

## 🛠️ Common Admin Tasks

### Enable Tracking for an Item
1. Go to **Inventory Management**
2. Find item
3. Check ✅ **Tracking** toggle
4. Set **Stock** and **Threshold**
5. Auto-saves immediately

### Update Stock Quantity
1. Go to **Inventory Management**
2. Find item
3. Use **+** / **-** buttons or type directly
4. Click outside input to save
5. Status updates automatically

### Restock an Item
1. Go to **Inventory Management**
2. Find low-stock item (red highlighted)
3. Update stock to higher number
4. Item auto-enables if above threshold

### Disable Tracking
1. Go to **Inventory Management**
2. Find item
3. Uncheck ❌ **Tracking** toggle
4. Item returns to unlimited availability

---

## 📈 Status Logic Reference

### Availability Calculation

```javascript
if (trackInventory === true) {
  if (stockQuantity > lowStockThreshold) {
    available = true   // ✓ In Stock
  } else {
    available = false  // ✗ Unavailable
  }
} else {
  available = true     // Unlimited (tracking disabled)
}
```

### Examples

| Track? | Stock | Threshold | Available? | Badge |
|--------|-------|-----------|------------|-------|
| ✅ Yes | 50 | 10 | ✓ Yes | 🟢 In Stock |
| ✅ Yes | 10 | 10 | ✗ No | 🟠 Low Stock |
| ✅ Yes | 5 | 10 | ✗ No | 🟠 Low Stock |
| ✅ Yes | 0 | 10 | ✗ No | 🔴 Out of Stock |
| ❌ No | - | - | ✓ Yes | ⚪ Not Tracking |

---

## 🚀 Quick Start Checklist

### For New Menu Items

- [ ] Navigate to Admin Dashboard
- [ ] Click "Add New Menu Item"
- [ ] Fill in basic details (name, price, category)
- [ ] Scroll to **Inventory** section
- [ ] Check ✅ "Track inventory"
- [ ] Set **Current Stock** (e.g., 100)
- [ ] Set **Low Stock Threshold** (e.g., 10)
- [ ] Save item
- [ ] Verify in Inventory Management view

### For Existing Items

- [ ] Go to **Inventory Management**
- [ ] Search for item
- [ ] Enable tracking toggle
- [ ] Set stock and threshold
- [ ] Verify status badge updates

---

## 🎯 Best Practices

### 1. Set Appropriate Thresholds

**Restaurant (Perishable):**
- Threshold: 5-10 units
- Reason: Need time to prepare more

**Cafe (Non-Perishable):**
- Threshold: 20-30 units
- Reason: Bulk items, reorder buffer

**Bakery (Daily Fresh):**
- Threshold: 0 units
- Reason: Sold out = closed for day

### 2. Enable Tracking Selectively

**Track These:**
- ✅ Daily specials
- ✅ Limited edition items
- ✅ Seasonal products
- ✅ High-demand items

**Don't Track These:**
- ❌ Standard menu items with unlimited supply
- ❌ Made-to-order items with always-available ingredients
- ❌ Digital products

### 3. Regular Monitoring

**Daily:**
- Check low stock alerts
- Restock popular items
- Review sales vs inventory

**Weekly:**
- Audit actual vs system stock
- Adjust thresholds if needed
- Analyze stock movement

---

## 🔧 Troubleshooting

### Item Not Disabling When Out of Stock?

**Check:**
1. Is `track_inventory` enabled? ✅
2. Is stock ≤ threshold? (e.g., 0 ≤ 0)
3. Refresh the page

**Fix:**
- Toggle tracking off and on again
- Or manually set stock to trigger update

### Stock Not Decreasing After Order?

**Check:**
1. Is `track_inventory` enabled?
2. Did order complete successfully?
3. Check browser console for errors

**Fix:**
- Verify order in Orders Manager
- Check database directly
- Manually adjust if needed

### Getting "Insufficient Stock" Error?

**Reason:**
- Someone else ordered first (race condition)
- Stock changed while customer was browsing

**Solution:**
- Reduce quantity in cart
- Or remove item and choose alternative

---

## 📊 Key Metrics to Track

### Inventory Health
- Number of items with tracking enabled
- Average stock levels
- Number of low-stock items
- Frequency of stockouts

### Sales Impact
- Orders blocked due to insufficient stock
- Lost revenue from stockouts
- Popular items running out frequently

### Operational Efficiency
- Time to restock
- Accuracy of stock counts
- Manual adjustments needed

---

## 🎓 Training Tips

### For Admin Staff
1. Practice enabling/disabling tracking
2. Learn to use +/- buttons vs direct input
3. Understand threshold vs stock
4. Know where to view inventory status
5. Practice restocking scenarios

### For Merchants
1. Review inventory daily
2. Set thresholds based on sales patterns
3. Monitor low-stock alerts
4. Plan restocking schedules
5. Track best-selling items

---

## 📞 Support Resources

### Documentation
- Full Analysis: `INVENTORY_SYSTEM_ANALYSIS.md`
- Database Schema: `supabase/migrations/20250902090000_inventory_management.sql`
- Components: `src/components/InventoryManager.tsx`

### Key Files
- Admin UI: `AdminDashboard.tsx`, `InventoryManager.tsx`
- Customer UI: `MenuItemCard.tsx`, `Menu.tsx`
- Business Logic: `useMenu.ts`, `useOrders.ts`
- Database: `inventory_management.sql`

---

## ✨ Summary

Your inventory system is a **powerful, automated solution** that:

✅ Tracks stock in real-time
✅ Prevents overselling
✅ Auto-disables out-of-stock items
✅ Shows stock levels to customers
✅ Provides admin control & visibility

**Zero configuration needed** - it works automatically once enabled!

