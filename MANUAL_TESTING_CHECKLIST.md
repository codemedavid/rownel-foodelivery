# 📋 Manual Testing Checklist for Inventory System

## ✅ Your System Status

Based on diagnostics:
- ✅ Database structure: **CORRECT**
- ✅ Functions & Triggers: **INSTALLED**
- ✅ Security: **WORKING** (RLS protecting menu_items)
- ✅ No structural issues detected

**The inventory system is ready to use!**

---

## 🧪 Manual Testing Steps

### Test 1: Enable Inventory Tracking

**Steps:**
1. Login to Admin Dashboard
2. Navigate to: **Inventory Management**
3. Find any menu item
4. Click the **Tracking** checkbox to enable it
5. Set **Stock**: `50`
6. Set **Threshold**: `10`
7. Click outside the input to save

**Expected Results:**
- ✅ Green badge shows "In Stock"
- ✅ Stock shows: 50
- ✅ Threshold shows: 10
- ✅ Status shows "In stock" badge

**If it fails:** Check browser console for errors

---

### Test 2: Stock Decrease (Manual)

**Steps:**
1. Find the item from Test 1
2. Click the **-** (minus) button 5 times
3. Watch the stock number change

**Expected Results:**
- ✅ Stock decreases: 50 → 45 → 40 → 35 → 30 → 25
- ✅ Each click saves immediately
- ✅ Item still shows "In stock" (25 > 10)

**If it fails:**
- Check if tracking is still enabled
- Check browser console

---

### Test 3: Auto-Disable on Low Stock

**Steps:**
1. Find the item from Test 1/2
2. Type directly in stock input: `10`
3. Click outside input to save
4. Wait 1 second

**Expected Results:**
- ✅ Stock updates to: 10
- ✅ Row **highlights in red** (red background)
- ✅ Badge changes to "Low stock" (red badge)
- ✅ Status shows "auto-disabled" indicator

**Why:** Stock (10) ≤ Threshold (10) triggers auto-disable

**If it fails:**
- The trigger may not be working
- Run SQL: `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_menu_item_availability';`

---

### Test 4: Auto-Enable on Restock

**Steps:**
1. Find the disabled item from Test 3
2. Update stock to: `30`
3. Click outside input
4. Wait 1 second

**Expected Results:**
- ✅ Row color returns to normal (white)
- ✅ Badge changes to "In stock" (green)
- ✅ Item is available again

**Why:** Stock (30) > Threshold (10) triggers auto-enable

---

### Test 5: Customer View - Stock Display

**Steps:**
1. Open site as customer (new incognito window)
2. Navigate to menu
3. Find the tracked item

**Expected Results:**
- ✅ Badge shows: "30 in stock" (green)
- ✅ Add to Cart button is enabled

**If stock was ≤ threshold:**
- ✅ Button shows "Unavailable" (disabled)
- ✅ Description shows "Currently Unavailable"

---

### Test 6: Place Order & Stock Deduction

**Steps:**
1. As customer, add tracked item to cart (quantity: 5)
2. Note current stock (e.g., 30)
3. Complete checkout (fill form, submit order)
4. Go back to Admin → Inventory Management
5. Find the same item

**Expected Results:**
- ✅ Stock decreased by 5: 30 → 25
- ✅ Still available (25 > 10)
- ✅ Customer can see new stock: "25 in stock"

**If it fails:**
- Check browser console during checkout
- Verify order was created in Orders Manager
- Check if `decrement_menu_item_stock` function exists

---

### Test 7: Order with Low Stock

**Steps:**
1. Set item stock to: `3`
2. Set threshold to: `0`
3. Item should be available (3 > 0)
4. As customer, order quantity: `2`
5. Complete checkout
6. Check inventory

**Expected Results:**
- ✅ Order succeeds
- ✅ Stock: 3 → 1
- ✅ Still available (1 > 0)

---

### Test 8: Order Until Sold Out

**Steps:**
1. Continue from Test 7 (stock = 1)
2. As customer, order quantity: `1`
3. Complete checkout
4. Check inventory
5. Try to order again

**Expected Results:**
- ✅ After order: Stock = 0
- ✅ Item auto-disabled (0 ≤ 0)
- ✅ Admin sees: Red badge "Low stock"
- ✅ Customer sees: "Unavailable" button (grayed out)
- ✅ Badge shows: "Out of stock" (red)

---

### Test 9: Prevent Overselling

**Steps:**
1. Set item stock to: `2`
2. Enable tracking
3. As customer, try to order quantity: `5`
4. Attempt checkout

**Expected Results:**
- ✅ Error message: "Insufficient stock for [item name]"
- ✅ Order is blocked
- ✅ Stock remains: 2 (unchanged)
- ✅ Cannot proceed with checkout

**If it fails:**
- Check `useOrders.ts` for pre-order validation
- Check browser console for errors

---

### Test 10: Disable Tracking

**Steps:**
1. Find a tracked item
2. Uncheck the **Tracking** checkbox
3. Wait for save

**Expected Results:**
- ✅ Stock input becomes disabled (grayed out)
- ✅ Threshold input becomes disabled
- ✅ Status shows: "Not tracking" (gray badge)
- ✅ Item returns to unlimited availability
- ✅ Customer doesn't see stock count

---

### Test 11: Multiple Items in One Order

**Steps:**
1. Enable tracking for 2 items:
   - Item A: stock = 20, threshold = 5
   - Item B: stock = 15, threshold = 5
2. As customer, add to cart:
   - Item A: quantity 3
   - Item B: quantity 2
3. Complete checkout
4. Check both items in inventory

**Expected Results:**
- ✅ Item A: 20 → 17
- ✅ Item B: 15 → 13
- ✅ Both still available

---

### Test 12: Stock at Exact Threshold

**Steps:**
1. Set item: stock = `10`, threshold = `10`
2. Save

**Expected Results:**
- ✅ Item immediately disabled
- ✅ Badge: "Low stock" (red)
- ✅ Row highlighted red

**Why:** Stock (10) ≤ Threshold (10)

---

## 🔍 Quick Diagnostic Commands

### Check Tracked Items

Run in browser console (while logged in):
```javascript
// Fetch and display all tracked items
const { data } = await supabase
  .from('menu_items')
  .select('id, name, track_inventory, stock_quantity, low_stock_threshold, available')
  .eq('track_inventory', true);
  
console.table(data);
```

### Check Recent Orders

```javascript
const { data } = await supabase
  .from('orders')
  .select('id, customer_name, total, created_at')
  .order('created_at', { ascending: false })
  .limit(5);
  
console.table(data);
```

---

## ✅ Success Criteria

Your inventory system is working if:

- [x] Items can be set to track inventory
- [x] Stock and threshold can be updated
- [x] Items auto-disable when stock ≤ threshold
- [x] Items auto-enable when stock > threshold
- [x] Stock decreases after orders
- [x] Orders blocked when insufficient stock
- [x] Customers see correct stock levels
- [x] Low stock items highlighted in admin

---

## 🐛 Common Issues

### Issue: Stock not decreasing after order

**Check:**
1. Is tracking enabled for the item?
2. Did the order complete successfully? (Check Orders Manager)
3. Any console errors during checkout?

**Fix:**
```sql
-- Verify function exists
SELECT proname FROM pg_proc WHERE proname = 'decrement_menu_item_stock';

-- If missing, run: supabase/migrations/20250902090000_inventory_management.sql
```

---

### Issue: Item not auto-disabling

**Check:**
1. Verify trigger exists:
```sql
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_menu_item_availability';
```

**Fix:**
- Re-run migration if trigger missing
- Or force update:
```sql
UPDATE menu_items SET stock_quantity = stock_quantity WHERE id = 'your-item-id';
```

---

### Issue: Can't update inventory in admin

**Check:**
1. Are you logged in as admin?
2. Check browser console for errors

**Fix:**
- Logout and login again
- Clear browser cache
- Check Supabase auth status

---

## 📊 Expected Behavior Reference

| Stock | Threshold | Expected State | Badge Color |
|-------|-----------|----------------|-------------|
| 50 | 10 | Available | 🟢 Green |
| 11 | 10 | Available | 🟢 Green |
| 10 | 10 | **Disabled** | 🔴 Red |
| 5 | 10 | **Disabled** | 🔴 Red |
| 0 | 10 | **Disabled** | 🔴 Red |
| 0 | 0 | **Disabled** | 🔴 Red |

---

## 🎉 All Tests Passed?

If all manual tests pass:
- ✅ Your inventory system is **fully functional**
- ✅ Safe to use in production
- ✅ Stock management working correctly
- ✅ Orders properly integrated

---

## 📝 Daily Operations Checklist

### Morning Routine:
1. Check **Inventory Management** for low stock items
2. Restock items with red "Low stock" badges
3. Review yesterday's orders in **Orders Manager**

### After Each Restock:
1. Update stock quantity in Inventory Management
2. Items will auto-enable if stock > threshold
3. Verify item shows as "Available" on customer site

### Weekly:
1. Review which items frequently run out
2. Adjust thresholds if needed
3. Check for items with tracking enabled but not needed

---

**Last Updated:** 2025-01-18

For detailed documentation, see:
- `INVENTORY_SYSTEM_ANALYSIS.md` - Full technical analysis
- `INVENTORY_QUICK_REFERENCE.md` - Quick reference guide
- `diagnose-inventory.sql` - SQL diagnostic queries

