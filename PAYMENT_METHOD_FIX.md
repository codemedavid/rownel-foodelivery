# Payment Method Fix - Missing merchant_id Field

## Problem

When trying to add a new payment method in the admin dashboard, you received a **400 error**:

```
Failed to load resource: the server responded with a status of 400 ()
Error adding payment method: Object
```

## Root Cause

The `payment_methods` table has a **required** `merchant_id` column (added in the multi-merchant migration), but:

1. The `PaymentMethod` interface didn't include `merchant_id`
2. The insert statement in `addPaymentMethod()` wasn't providing `merchant_id`
3. The PaymentMethodManager component wasn't collecting `merchant_id` from the user

This caused the database to reject the insert with a 400 error because a NOT NULL column was missing.

## Solution

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
  merchant_id: string;  // ✅ Added
  created_at: string;
  updated_at: string;
}
```

### 2. Updated Insert Statement

**File:** `src/hooks/usePaymentMethods.ts`

```typescript
const addPaymentMethod = async (method: Omit<PaymentMethod, 'created_at' | 'updated_at'>) => {
  try {
    const { data, error: insertError } = await supabase
      .from('payment_methods')
      .insert({
        id: method.id,
        name: method.name,
        account_number: method.account_number,
        account_name: method.account_name,
        qr_code_url: method.qr_code_url,
        active: method.active,
        sort_order: method.sort_order,
        merchant_id: method.merchant_id  // ✅ Added
      })
      .select()
      .single();
    
    // ... rest of code
  }
};
```

### 3. Updated Update Statement

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

    // Only include merchant_id if it's provided
    if (updates.merchant_id) {
      updateData.merchant_id = updates.merchant_id;
    }

    const { error: updateError } = await supabase
      .from('payment_methods')
      .update(updateData)
      .eq('id', id);
    
    // ... rest of code
  }
};
```

### 4. Updated Component State

**File:** `src/components/PaymentMethodManager.tsx`

```typescript
// ✅ Added useMerchants hook
const { merchants } = useMerchants();

// ✅ Added merchant_id to form state
const [formData, setFormData] = useState({
  id: '',
  name: '',
  account_number: '',
  account_name: '',
  qr_code_url: '',
  active: true,
  sort_order: 0,
  merchant_id: ''  // ✅ Added
});
```

### 5. Updated handleAddMethod

**File:** `src/components/PaymentMethodManager.tsx`

```typescript
const handleAddMethod = () => {
  const nextSortOrder = Math.max(...paymentMethods.map(m => m.sort_order), 0) + 1;
  const defaultMerchantId = merchants.length > 0 ? merchants[0].id : '';  // ✅ Get first merchant
  
  setFormData({
    id: '',
    name: '',
    account_number: '',
    account_name: '',
    qr_code_url: '',
    active: true,
    sort_order: nextSortOrder,
    merchant_id: defaultMerchantId  // ✅ Set default merchant
  });
  setCurrentView('add');
};
```

### 6. Updated handleEditMethod

**File:** `src/components/PaymentMethodManager.tsx`

```typescript
const handleEditMethod = (method: PaymentMethod) => {
  setEditingMethod(method);
  setFormData({
    id: method.id,
    name: method.name,
    account_number: method.account_number,
    account_name: method.account_name,
    qr_code_url: method.qr_code_url,
    active: method.active,
    sort_order: method.sort_order,
    merchant_id: method.merchant_id  // ✅ Include merchant_id
  });
  setCurrentView('edit');
};
```

### 7. Added Validation

**File:** `src/components/PaymentMethodManager.tsx`

```typescript
const handleSaveMethod = async () => {
  // ... existing validation
  
  // ✅ Added merchant_id validation
  if (!formData.merchant_id) {
    alert('Please select a merchant. If no merchants exist, create one first.');
    return;
  }
  
  // ... rest of code
};
```

### 8. Added Merchant Selector UI

**File:** `src/components/PaymentMethodManager.tsx`

```jsx
<div>
  <label className="block text-sm font-medium text-black mb-2">Merchant *</label>
  <select
    value={formData.merchant_id}
    onChange={(e) => setFormData({ ...formData, merchant_id: e.target.value })}
    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
  >
    <option value="">Select a merchant</option>
    {merchants.map(merchant => (
      <option key={merchant.id} value={merchant.id}>
        {merchant.name}
      </option>
    ))}
  </select>
  <p className="text-xs text-gray-500 mt-1">
    Select which merchant this payment method belongs to
  </p>
</div>
```

## Testing

### Steps to Test:

1. **Navigate to Admin Dashboard**
   - Go to `/admin`
   - Login if needed

2. **Open Payment Methods**
   - Click "Payment Methods" from dashboard

3. **Add New Payment Method**
   - Click "Add Payment Method"
   - Fill in all fields:
     - Payment Method Name: e.g., "GCash"
     - Method ID: Auto-generated (e.g., "gcash")
     - **Merchant**: Select a merchant from dropdown ✅
     - Account Number: e.g., "0917 123 4567"
     - Account Name: e.g., "Your Business Name"
     - QR Code: Upload an image
     - Sort Order: e.g., 1
     - Active: Check the box
   - Click "Save"

4. **Verify Success**
   - Payment method should be created without errors
   - Should appear in the payment methods list
   - Should be available in checkout for the selected merchant

### Expected Behavior:

✅ **Before Fix:** 400 error when saving  
✅ **After Fix:** Payment method saves successfully  

## Important Notes

### Multi-Merchant Support

Payment methods are now **merchant-specific**:
- Each payment method belongs to one merchant
- When adding a payment method, you must select which merchant it belongs to
- Checkout only shows payment methods for the selected merchant
- Different merchants can have different payment methods

### Default Merchant Selection

The component automatically selects the **first merchant** when adding a new payment method. If you have multiple merchants, make sure to select the correct one from the dropdown.

### Migration Considerations

If you have **existing payment methods** without a `merchant_id`, they may have been automatically assigned to a default merchant during migration:

```sql
UPDATE payment_methods 
SET merchant_id = (SELECT id FROM merchants WHERE name = 'ClickEats Main Store' LIMIT 1)
WHERE merchant_id IS NULL;
```

You can edit these payment methods to assign them to the correct merchant.

## Files Modified

1. ✅ `src/hooks/usePaymentMethods.ts` - Added merchant_id to interface and database operations
2. ✅ `src/components/PaymentMethodManager.tsx` - Added merchant selection UI and logic

## No Breaking Changes

This fix is **backward compatible**:
- Existing payment methods continue to work
- No changes needed to checkout flow
- Admin UI now properly handles merchant association

## Summary

The 400 error was caused by a missing required field (`merchant_id`) in the database insert. The fix ensures that:
1. The interface includes `merchant_id`
2. The insert/update operations include `merchant_id`
3. The UI allows selecting a merchant
4. Validation ensures a merchant is selected
5. Default merchant is set for new payment methods

You should now be able to add payment methods without errors! 🎉

