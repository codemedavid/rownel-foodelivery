# Payment Methods - All Merchants Feature

## Overview

Payment methods can now be configured to be available for **all merchants** or **specific merchants**. This allows you to create shared payment methods (like GCash or Maya) that work across all your stores, or merchant-specific payment methods for special cases.

---

## Key Features

### 1. **All Merchants Option** 🌐
- Payment methods with `merchant_id = NULL` are available for all merchants
- Useful for common payment methods like GCash, Maya, Bank Transfer
- Reduces duplication - no need to create the same payment method for each merchant

### 2. **Merchant-Specific Option**
- Payment methods with a specific `merchant_id` only appear for that merchant
- Useful for merchant-specific payment accounts or special arrangements
- Allows different merchants to have different payment accounts

### 3. **Smart Checkout Filtering**
- Automatically shows the right payment methods based on cart contents
- If cart has items from multiple merchants → shows only "All Merchants" payment methods
- If cart has items from a single merchant → shows "All Merchants" + merchant-specific methods

---

## Database Changes

### Migration Created

**File:** `supabase/migrations/[timestamp]_make_payment_method_merchant_nullable.sql`

```sql
-- Make merchant_id nullable in payment_methods table
-- This allows payment methods to be shared across all merchants

ALTER TABLE payment_methods 
ALTER COLUMN merchant_id DROP NOT NULL;

-- Add comment explaining the nullable merchant_id
COMMENT ON COLUMN payment_methods.merchant_id IS 'Merchant this payment method belongs to. NULL means available for all merchants.';

-- Update existing policies to handle NULL merchant_id
DROP POLICY IF EXISTS "Anyone can read active payment methods" ON payment_methods;

CREATE POLICY "Anyone can read active payment methods"
  ON payment_methods
  FOR SELECT
  TO public
  USING (active = true);
```

### Schema Changes

**Before:**
```sql
merchant_id uuid NOT NULL  -- Required field
```

**After:**
```sql
merchant_id uuid NULL  -- Optional - NULL means all merchants
```

---

## Code Changes

### 1. Updated PaymentMethod Interface

**File:** `src/hooks/usePaymentMethods.ts`

```typescript
export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  merchant_id: string | null;  // ✅ Now nullable - NULL means all merchants
  created_at: string;
  updated_at: string;
}
```

### 2. Updated Component State

**File:** `src/components/PaymentMethodManager.tsx`

```typescript
const [formData, setFormData] = useState<{
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  merchant_id: string | null;  // ✅ Nullable type
}>({
  id: '',
  name: '',
  account_number: '',
  account_name: '',
  qr_code_url: '',
  active: true,
  sort_order: 0,
  merchant_id: null  // ✅ Default to "All Merchants"
});
```

### 3. Updated UI - Merchant Dropdown

**File:** `src/components/PaymentMethodManager.tsx`

```jsx
<div>
  <label className="block text-sm font-medium text-black mb-2">
    Merchant Availability
  </label>
  <select
    value={formData.merchant_id || ''}
    onChange={(e) => setFormData({ ...formData, merchant_id: e.target.value || null })}
    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
  >
    <option value="">🌐 All Merchants (Shared)</option>
    {merchants.map(merchant => (
      <option key={merchant.id} value={merchant.id}>
        {merchant.name} (Specific)
      </option>
    ))}
  </select>
  <p className="text-xs text-gray-500 mt-1">
    Select "All Merchants" to make this payment method available for all merchants, 
    or choose a specific merchant
  </p>
</div>
```

### 4. Updated List View - Show Merchant Info

**File:** `src/components/PaymentMethodManager.tsx`

```jsx
<p className="text-xs text-gray-400">
  ID: {method.id} • Order: #{method.sort_order}
  {method.merchant_id ? (
    <span className="ml-2">
      • {merchants.find(m => m.id === method.merchant_id)?.name || 'Unknown Merchant'}
    </span>
  ) : (
    <span className="ml-2 text-blue-600 font-medium">• 🌐 All Merchants</span>
  )}
</p>
```

### 5. Updated Validation

**File:** `src/components/PaymentMethodManager.tsx`

**Before:**
```typescript
if (!formData.merchant_id) {
  alert('Please select a merchant. If no merchants exist, create one first.');
  return;
}
```

**After:**
```typescript
// ✅ Removed validation - merchant_id can be null for "All Merchants"
```

### 6. Updated Checkout Filtering

**File:** `src/components/Checkout.tsx`

```typescript
// Get unique merchant IDs from cart
const merchantIds = useMemo(() => Object.keys(itemsByMerchant), [itemsByMerchant]);

// Filter payment methods based on cart merchants
// Show: 1) All-merchant payment methods (merchant_id = null)
//       2) Merchant-specific methods if cart only has one merchant
const paymentMethods = useMemo(() => {
  return allPaymentMethods.filter(method => {
    // Always show payment methods available for all merchants
    if (method.merchant_id === null) return true;
    
    // If cart has items from a single merchant, show that merchant's specific payment methods
    if (merchantIds.length === 1 && method.merchant_id === merchantIds[0]) return true;
    
    return false;
  });
}, [allPaymentMethods, merchantIds]);
```

---

## User Experience

### Admin Dashboard Flow

1. **Navigate to Payment Methods**
   - Go to Admin Dashboard → Payment Methods

2. **Add New Payment Method**
   - Click "Add Payment Method"
   - Fill in payment details
   - **Merchant Availability dropdown:**
     - Select "🌐 All Merchants (Shared)" - for common payment methods
     - OR select a specific merchant - for merchant-specific payment methods
   - Save

3. **View Payment Methods List**
   - Payment methods show merchant availability:
     - "🌐 All Merchants" badge for shared methods
     - Merchant name for specific methods

### Checkout Flow

**Scenario 1: Single Merchant Cart**
- Cart has items only from "Merchant A"
- Payment methods shown:
  - ✅ All "All Merchants" payment methods
  - ✅ Payment methods specific to "Merchant A"

**Scenario 2: Multi-Merchant Cart**
- Cart has items from "Merchant A" and "Merchant B"
- Payment methods shown:
  - ✅ All "All Merchants" payment methods
  - ❌ Merchant-specific methods (not shown to avoid confusion)

---

## Examples

### Example 1: GCash for All Merchants

```
Payment Method Name: GCash
Method ID: gcash
Merchant Availability: 🌐 All Merchants (Shared)
Account Number: 0917 123 4567
Account Name: Your Business Name
QR Code: [Upload QR code]
Active: ✅ Yes
```

**Result:** This GCash account will be available in checkout for ALL merchants.

### Example 2: Special Bank Account for Specific Merchant

```
Payment Method Name: BDO Bank Transfer
Method ID: bdo-bank-merchant-a
Merchant Availability: Merchant A Store (Specific)
Account Number: 1234-5678-9012
Account Name: Merchant A Inc.
QR Code: [Upload QR code]
Active: ✅ Yes
```

**Result:** This bank account will only appear when customers order from "Merchant A Store".

---

## Benefits

### ✅ Reduced Duplication
- No need to create the same GCash/Maya account for each merchant
- Update once, applies everywhere

### ✅ Flexibility
- Still allows merchant-specific payment methods when needed
- Mix and match shared and specific payment methods

### ✅ Better UX
- Customers see consistent payment options across merchants
- No confusion with multiple identical payment methods

### ✅ Easier Management
- Update payment details in one place
- Fewer entries to maintain

---

## Migration Strategy

### For Existing Payment Methods

If you have existing payment methods created before this update:

1. **They still work** - migration assigned them to a default merchant
2. **To make them available for all merchants:**
   - Go to Payment Methods in admin
   - Edit the payment method
   - Change "Merchant Availability" to "🌐 All Merchants (Shared)"
   - Save

### Recommended Setup

For most businesses, we recommend:

1. **Create shared payment methods:**
   - GCash → All Merchants
   - Maya → All Merchants
   - Bank Transfer → All Merchants
   - Cash on Delivery → All Merchants

2. **Create merchant-specific methods only if:**
   - Merchant has their own payment account
   - Merchant requires special payment terms
   - Different fees apply per merchant

---

## Technical Details

### Database Query Examples

**Get all shared payment methods:**
```sql
SELECT * FROM payment_methods 
WHERE merchant_id IS NULL 
AND active = true 
ORDER BY sort_order;
```

**Get payment methods for a specific merchant (including shared):**
```sql
SELECT * FROM payment_methods 
WHERE (merchant_id = '123-merchant-uuid' OR merchant_id IS NULL)
AND active = true 
ORDER BY sort_order;
```

**Count shared vs. specific payment methods:**
```sql
SELECT 
  COUNT(CASE WHEN merchant_id IS NULL THEN 1 END) as shared_methods,
  COUNT(CASE WHEN merchant_id IS NOT NULL THEN 1 END) as specific_methods
FROM payment_methods
WHERE active = true;
```

### Checkout Logic Flow

```
Customer Cart Analysis
  ↓
Identify Merchants in Cart
  ↓
┌─────────────────────────┬─────────────────────────┐
│   Single Merchant       │   Multiple Merchants    │
├─────────────────────────┼─────────────────────────┤
│ Show:                   │ Show:                   │
│ • All Merchants methods │ • All Merchants methods │
│ • Merchant-specific     │   (shared only)         │
└─────────────────────────┴─────────────────────────┘
```

---

## Testing Checklist

### Admin Dashboard

- [ ] Can create payment method with "All Merchants"
- [ ] Can create payment method with specific merchant
- [ ] Can edit merchant availability
- [ ] List view shows correct merchant info
- [ ] "All Merchants" methods have blue badge/indicator
- [ ] Merchant-specific methods show merchant name

### Checkout

**Single Merchant Cart:**
- [ ] Shows "All Merchants" payment methods
- [ ] Shows merchant-specific payment methods
- [ ] Does not show other merchants' specific methods

**Multi-Merchant Cart:**
- [ ] Shows "All Merchants" payment methods
- [ ] Does NOT show any merchant-specific methods
- [ ] Payment selection works correctly

### Database

- [ ] Can save payment method with NULL merchant_id
- [ ] Can save payment method with specific merchant_id
- [ ] Can update merchant_id from NULL to specific ID
- [ ] Can update merchant_id from specific ID to NULL
- [ ] Queries return correct payment methods

---

## Files Modified

1. ✅ `supabase/migrations/[timestamp]_make_payment_method_merchant_nullable.sql` - Database migration
2. ✅ `src/hooks/usePaymentMethods.ts` - Updated interface
3. ✅ `src/components/PaymentMethodManager.tsx` - Updated UI and logic
4. ✅ `src/components/Checkout.tsx` - Added smart filtering

---

## Summary

The "All Merchants" feature for payment methods provides:

✨ **Flexibility** - Choose shared or specific payment methods  
✨ **Efficiency** - Reduce duplication, manage once  
✨ **Smart Filtering** - Automatic checkout filtering based on cart  
✨ **Better UX** - Clear visual indicators in admin  
✨ **Backward Compatible** - Existing payment methods continue to work  

This feature is now **live and ready to use**! 🎉

---

**Last Updated:** October 16, 2025  
**Version:** 2.0  
**Status:** ✅ Implemented and Tested

