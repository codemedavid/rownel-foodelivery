# Inventory System Testing Guide

## 🚀 Quick Start

### Method 1: Run Diagnostic Check (Recommended)

This is the fastest way to check if your inventory system is working:

```bash
npm run check:inventory
```

**What it checks:**
- ✅ Database connection
- ✅ Inventory columns exist
- ✅ Trigger function status
- ✅ Stock deduction function
- ✅ Current inventory status
- ⚠️ Potential issues

### Method 2: Run Full Test Suite

For comprehensive testing of all inventory features:

```bash
npm run test:inventory
```

**What it tests:**
- Database connection
- Item creation with/without tracking
- Auto-enable/disable triggers
- Stock deduction function
- Edge cases (zero stock, negative prevention)
- Batch operations
- Consistency checks

### Method 3: Manual SQL Queries

Run the queries in `diagnose-inventory.sql` in your Supabase SQL Editor.

---

## 📋 Prerequisites

### 1. Check Environment Variables

Make sure you have a `.env` file with:

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Verify Migration Applied

Check that `20250902090000_inventory_management.sql` has been run in Supabase.

---

## 🔍 Common Issues & Solutions

### Issue 1: "Function decrement_menu_item_stock does not exist"

**Cause:** Migration not applied

**Solution:**
1. Go to Supabase Dashboard → SQL Editor
2. Run the migration: `supabase/migrations/20250902090000_inventory_management.sql`
3. Verify with:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'decrement_menu_item_stock';
   ```

### Issue 2: "Items not auto-disabling when out of stock"

**Possible Causes:**
- Trigger not installed
- `track_inventory` not enabled
- Stock > threshold

**Solution:**
1. Check trigger exists:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_menu_item_availability';
   ```

2. Verify item settings:
   ```sql
   SELECT id, name, track_inventory, stock_quantity, low_stock_threshold, available
   FROM menu_items
   WHERE id = 'your-item-id';
   ```

3. Manually trigger sync:
   ```sql
   UPDATE menu_items
   SET stock_quantity = stock_quantity
   WHERE id = 'your-item-id';
   ```

### Issue 3: "Stock not decreasing after orders"

**Possible Causes:**
- `track_inventory` disabled
- Function error
- Order creation failing

**Solution:**
1. Check if tracking is enabled:
   ```sql
   SELECT id, name, track_inventory FROM menu_items WHERE id = 'your-item-id';
   ```

2. Test function manually:
   ```sql
   SELECT decrement_menu_item_stock('[{"id": "your-item-id", "quantity": 1}]'::jsonb);
   ```

3. Check browser console for errors during checkout

### Issue 4: "Items with null stock but tracking enabled"

**Cause:** Tracking enabled without setting stock

**Solution:**
```sql
UPDATE menu_items
SET stock_quantity = 0  -- or your desired value
WHERE track_inventory = true AND stock_quantity IS NULL;
```

### Issue 5: "Negative stock values"

**Cause:** Database constraint missing

**Solution:**
```sql
-- Add constraint
ALTER TABLE menu_items
ADD CONSTRAINT menu_items_stock_quantity_non_negative
CHECK (stock_quantity IS NULL OR stock_quantity >= 0);

-- Fix existing data
UPDATE menu_items
SET stock_quantity = 0
WHERE stock_quantity < 0;
```

---

## 🧪 Manual Testing Steps

### Test 1: Enable Tracking

1. Open Admin Dashboard → Inventory Management
2. Find an item
3. Enable tracking toggle
4. Set stock = 50, threshold = 10
5. ✅ Expected: Item shows "In Stock" badge

### Test 2: Update Stock

1. In Inventory Management, find tracked item
2. Click "-" button 5 times
3. ✅ Expected: Stock decreases by 5
4. ✅ Expected: If stock > threshold, still available

### Test 3: Low Stock Auto-Disable

1. Set item: stock = 10, threshold = 10
2. ✅ Expected: Item auto-disabled immediately
3. ✅ Expected: Red "Low stock" badge shown
4. ✅ Expected: Row highlighted in red

### Test 4: Restock Auto-Enable

1. Find disabled item from Test 3
2. Update stock to 20
3. ✅ Expected: Item auto-enabled
4. ✅ Expected: Green "In Stock" badge shown

### Test 5: Place Order

1. As customer, add tracked item to cart (qty: 3)
2. Note current stock (e.g., 50)
3. Complete checkout
4. Check inventory in admin
5. ✅ Expected: Stock decreased by 3 (now 47)
6. ✅ Expected: If 47 > threshold, still available

### Test 6: Order with Insufficient Stock

1. Set item: stock = 2
2. Try to order quantity = 5
3. ✅ Expected: Error message shown
4. ✅ Expected: Order blocked
5. ✅ Expected: Stock unchanged

### Test 7: Stock Reaches Zero

1. Set item: stock = 3, threshold = 0
2. Order quantity = 3
3. ✅ Expected: Stock = 0
4. ✅ Expected: Item auto-disabled
5. ✅ Expected: Customer sees "Unavailable"

---

## 📊 Interpreting Test Results

### Diagnostic Check Output

```
✅ Connected to database
  📊 Total Items: 50
  📦 Tracking Enabled: 10
  📦 Tracking Disabled: 40
  ⚠️  Low Stock Items: 2
  ✅ Available Items: 48
  ❌ Unavailable Items: 2

✅ Trigger working correctly
✅ Stock deduction function exists
✅ No issues detected
```

**This is GOOD** - System working as expected

---

```
✅ Connected to database
  📊 Total Items: 50
  📦 Tracking Enabled: 0
  
ℹ️  Inventory tracking is not enabled for any items
```

**This is OK** - No tracking enabled yet (expected for new setup)

---

```
⚠️  Issues found:
   • 3 items are available but stock ≤ threshold (trigger issue?)

❌ Stock deduction function NOT FOUND!
   Run migration: 20250902090000_inventory_management.sql
```

**This is BAD** - Migration not applied, trigger not working

**Solution:** Run the migration file

---

## 🐛 Debug Mode

### Enable Debug Logging

To see detailed logs during order placement:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Place an order
4. Look for logs like:
   ```
   [DEBUG] updateMenuItem called with: {...}
   [DEBUG] Stock before: 50
   [DEBUG] Stock after: 45
   ```

### Check Network Tab

1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Look for requests to:
   - `menu_items` (updates)
   - `decrement_menu_item_stock` (RPC calls)
4. Check status codes (should be 200 or 201)

---

## 📖 SQL Diagnostic Queries

### Quick Status Check

```sql
SELECT 
    name,
    track_inventory,
    stock_quantity,
    low_stock_threshold,
    available,
    CASE 
        WHEN stock_quantity > low_stock_threshold THEN '🟢 OK'
        WHEN stock_quantity <= low_stock_threshold THEN '🔴 LOW'
        ELSE '⚪ N/A'
    END as status
FROM menu_items
WHERE track_inventory = true
ORDER BY stock_quantity ASC;
```

### Find Inconsistencies

```sql
-- Items that should be available but aren't
SELECT id, name, stock_quantity, low_stock_threshold, available
FROM menu_items
WHERE track_inventory = true
    AND stock_quantity > low_stock_threshold
    AND available = false;

-- Items that should be unavailable but are available
SELECT id, name, stock_quantity, low_stock_threshold, available
FROM menu_items
WHERE track_inventory = true
    AND stock_quantity <= low_stock_threshold
    AND available = true;
```

### Force Consistency Fix

```sql
-- Re-sync all tracked items
UPDATE menu_items
SET stock_quantity = stock_quantity  -- Forces trigger to fire
WHERE track_inventory = true;
```

---

## 🎯 Expected Behavior Summary

| Scenario | Expected Result |
|----------|----------------|
| `stock > threshold` | `available = true` |
| `stock = threshold` | `available = false` |
| `stock < threshold` | `available = false` |
| `stock = 0` | `available = false` |
| `tracking = false` | `available = true` (unlimited) |
| Order placed | Stock decrements by order quantity |
| Stock updated | Trigger fires, availability syncs |
| Insufficient stock | Order blocked with error |
| Stock goes negative | Prevented by constraint |

---

## 💡 Tips for Testing

1. **Use Test Items**
   - Create items with "TEST_" prefix
   - Easy to identify and clean up
   - Don't affect production data

2. **Check After Each Action**
   - Don't assume it worked
   - Verify in database or admin UI
   - Check both stock and availability

3. **Test Edge Cases**
   - Stock = 0
   - Stock = threshold
   - Large quantities
   - Multiple items in one order

4. **Test Different Paths**
   - Admin UI updates
   - Customer orders
   - Direct SQL updates
   - API calls

5. **Monitor Console**
   - Keep DevTools open
   - Watch for errors
   - Check network requests

---

## 📞 Getting Help

If tests are failing:

1. ✅ Run `npm run check:inventory` first
2. ✅ Check the diagnostic output
3. ✅ Look at "Issues found" section
4. ✅ Review logs in `diagnose-inventory.sql`
5. ✅ Check browser console for errors
6. ✅ Verify migration is applied

Common fixes:
- Re-run migration
- Clear browser cache
- Restart development server
- Check Supabase dashboard for errors

---

## 📚 Related Documentation

- **Full Analysis:** `INVENTORY_SYSTEM_ANALYSIS.md`
- **Quick Reference:** `INVENTORY_QUICK_REFERENCE.md`
- **SQL Diagnostics:** `diagnose-inventory.sql`
- **Test Script:** `test-inventory-system.js`
- **Check Script:** `check-inventory-status.js`

---

## ✅ Checklist for Production

Before deploying to production:

- [ ] Run full test suite: `npm run test:inventory`
- [ ] All tests passing
- [ ] Migration applied to production database
- [ ] Test with real merchant data
- [ ] Test order flow end-to-end
- [ ] Verify stock deduction on live orders
- [ ] Check trigger works consistently
- [ ] Test with multiple concurrent orders
- [ ] Monitor for 24 hours after deployment
- [ ] Set up alerts for low stock items

---

## 🎉 Success Indicators

Your inventory system is working correctly if:

✅ All diagnostic checks pass
✅ Items auto-disable when stock ≤ threshold
✅ Items auto-enable when restocked
✅ Stock decrements on every order
✅ Orders blocked when insufficient stock
✅ No negative stock values
✅ Trigger fires consistently
✅ Function callable without errors
✅ No console errors during operations

---

**Last Updated:** 2025-01-18

