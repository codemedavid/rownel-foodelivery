# Payment Method Update Bug Fix

## Problem

When trying to update an existing payment method to "🌐 All Merchants (Shared)", the save operation would appear to succeed, but the merchant assignment would revert back to the previous merchant instead of saving as `null`.

## Root Cause

The bug was in the `updatePaymentMethod` function in `src/hooks/usePaymentMethods.ts`:

```typescript
// ❌ WRONG - This was the buggy code
if (updates.merchant_id) {
  updateData.merchant_id = updates.merchant_id;
}
```

### Why This Failed

The condition `if (updates.merchant_id)` is a **truthy check**, which means:
- ✅ `if ("some-uuid")` → `true` (string is truthy)
- ❌ `if (null)` → `false` (null is falsy)
- ❌ `if ("")` → `false` (empty string is falsy)

So when you selected "All Merchants", the `merchant_id` was set to `null`, but the condition evaluated to `false`, and the `merchant_id` field was **never included in the update object**. This caused the database to keep the old value.

## Solution

Changed the condition from a **truthy check** to a **property existence check**:

```typescript
// ✅ CORRECT - This is the fixed code
if ('merchant_id' in updates) {
  updateData.merchant_id = updates.merchant_id;
}
```

### Why This Works

The `'merchant_id' in updates` check looks for the **property itself**, not its value:
- ✅ `if ('merchant_id' in { merchant_id: "uuid" })` → `true`
- ✅ `if ('merchant_id' in { merchant_id: null })` → `true` ← **Now works!**
- ✅ `if ('merchant_id' in { merchant_id: "" })` → `true`
- ❌ `if ('merchant_id' in { name: "test" })` → `false`

This means the update will properly include `merchant_id` in the database update, even when its value is `null`.

## Code Changes

**File:** `src/hooks/usePaymentMethods.ts`

```typescript
const updatePaymentMethod = async (id: string, updates: Partial<PaymentMethod>) => {
  try {
    const updateData: any = {
      name: updates.name,
      account_number: updates.account_number,
      account_name: updates.account_name,
      qr_code_url: updates.qr_code_url,
      active: updates.active,
      sort_order: updates.sort_order
    };

    // ✅ FIXED: Include merchant_id if it exists in updates (can be null for "All Merchants")
    if ('merchant_id' in updates) {
      updateData.merchant_id = updates.merchant_id;
    }

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update(updateData)
      .eq('id', id);

    if (updateError) throw updateError;

    await fetchAllPaymentMethods();
  } catch (err) {
    console.error('Error updating payment method:', err);
    throw err;
  }
};
```

## Testing

### Before Fix:
1. Edit existing payment method (e.g., assigned to "Merchant A")
2. Change to "🌐 All Merchants (Shared)"
3. Click Save
4. **Bug:** Payment method still shows "Merchant A" ❌

### After Fix:
1. Edit existing payment method (e.g., assigned to "Merchant A")
2. Change to "🌐 All Merchants (Shared)"
3. Click Save
4. **Success:** Payment method now shows "🌐 All Merchants" ✅

### Test Scenarios:
- ✅ Update from specific merchant → All Merchants (null)
- ✅ Update from All Merchants (null) → specific merchant
- ✅ Update from one specific merchant → another specific merchant
- ✅ Keep All Merchants (null) when editing other fields
- ✅ Keep specific merchant when editing other fields

## JavaScript Concepts

### Truthy vs. Property Existence

**Truthy Check:**
```javascript
if (value) {
  // Executes if value is truthy
  // TRUE for: "text", 1, true, {}, []
  // FALSE for: null, undefined, 0, "", false, NaN
}
```

**Property Existence Check:**
```javascript
if ('property' in object) {
  // Executes if property exists in object
  // Regardless of the property's value
}
```

### Example Comparison:

```javascript
const obj = { merchant_id: null };

// Truthy check
if (obj.merchant_id) {
  console.log("This won't print"); // ❌ null is falsy
}

// Property existence check
if ('merchant_id' in obj) {
  console.log("This will print!"); // ✅ property exists
}
```

## Related Issues

This same pattern should be used whenever we need to:
1. Set a value to `null` explicitly
2. Distinguish between "not provided" vs. "set to null"
3. Update optional fields that can be null

## Summary

- **Issue:** Cannot set payment method to "All Merchants"
- **Cause:** Truthy check prevented `null` values from being included in updates
- **Fix:** Changed to property existence check using `'merchant_id' in updates`
- **Status:** ✅ Fixed and tested

The fix is now live and you should be able to update payment methods to "All Merchants" successfully! 🎉

---

**Fixed:** October 16, 2025  
**Severity:** Medium (blocking feature)  
**Impact:** Payment method merchant assignment updates

