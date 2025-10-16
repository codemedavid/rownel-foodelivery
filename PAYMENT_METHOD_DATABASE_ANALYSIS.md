# Payment Method Database Analysis

## Overview
This document provides a comprehensive analysis of the payment method system in the database, covering schema design, relationships, security policies, and implementation details.

---

## Database Schema

### Table: `payment_methods`

**Created in Migration:** `20250901125510_floating_sky.sql`
**Enhanced in Migration:** `20250109000000_add_merchants.sql` (Multi-merchant support)

#### Column Structure

| Column Name | Data Type | Constraints | Description |
|------------|-----------|-------------|-------------|
| `id` | `text` | PRIMARY KEY | Unique identifier in kebab-case format (e.g., 'gcash', 'maya', 'bank-transfer') |
| `name` | `text` | NOT NULL | Display name shown to customers (e.g., 'GCash', 'Maya (PayMaya)') |
| `account_number` | `text` | NOT NULL | Phone number or account number for receiving payments |
| `account_name` | `text` | NOT NULL | Name of the account holder |
| `qr_code_url` | `text` | NOT NULL | URL to the QR code image stored in Cloudinary |
| `active` | `boolean` | DEFAULT true | Whether the payment method is currently available |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 | Controls display order in checkout (lower = first) |
| `merchant_id` | `uuid` | NOT NULL, FK → merchants(id) | Links payment method to specific merchant |
| `created_at` | `timestamptz` | DEFAULT now() | Timestamp of creation |
| `updated_at` | `timestamptz` | DEFAULT now() | Auto-updated timestamp |

#### Key Features

1. **Text-based Primary Key**: Uses human-readable IDs instead of UUIDs for easier reference in code
2. **QR Code Support**: Each payment method includes a QR code image for customer convenience
3. **Active/Inactive Toggle**: Allows temporary disabling without deletion
4. **Sort Order**: Enables customizable ordering in the checkout interface
5. **Multi-merchant Support**: Each merchant can have their own payment methods

---

## Database Indexes

```sql
-- For merchant-based queries
CREATE INDEX idx_payment_methods_merchant_id ON payment_methods(merchant_id);
```

**Purpose:** Optimizes queries filtering payment methods by merchant, crucial for multi-merchant marketplace functionality.

---

## Database Triggers

### Auto-Update Timestamp

```sql
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Purpose:** Automatically updates the `updated_at` timestamp whenever a record is modified.

---

## Row-Level Security (RLS)

### RLS is Enabled
```sql
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
```

### Security Policies

#### 1. Public Read Access (Active Methods Only)
```sql
CREATE POLICY "Anyone can read active payment methods"
  ON payment_methods
  FOR SELECT
  TO public
  USING (active = true);
```

**Purpose:** 
- Allows unauthenticated customers to view only active payment methods
- Protects inactive/disabled methods from public view
- Ensures checkout page only shows available options

#### 2. Admin Full Access
```sql
CREATE POLICY "Authenticated users can manage payment methods"
  ON payment_methods
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

**Purpose:**
- Grants full CRUD permissions to authenticated users (admins)
- Allows managing all payment methods regardless of active status
- Enables adding, editing, deleting, and reordering payment methods

**Security Consideration:** This assumes all authenticated users are admins. For production, consider more granular role-based access control.

---

## Default Data

### Initial Payment Methods
The system comes pre-configured with three popular Filipino payment methods:

```sql
INSERT INTO payment_methods (id, name, account_number, account_name, qr_code_url, sort_order, active) VALUES
  ('gcash', 'GCash', '09XX XXX XXXX', 'M&C Bakehouse', '[cloudinary-url]', 1, true),
  ('maya', 'Maya (PayMaya)', '09XX XXX XXXX', 'M&C Bakehouse', '[cloudinary-url]', 2, true),
  ('bank-transfer', 'Bank Transfer', 'Account: 1234-5678-9012', 'M&C Bakehouse', '[cloudinary-url]', 3, true)
ON CONFLICT (id) DO NOTHING;
```

**Note:** These are template values meant to be updated with actual merchant account details.

---

## Relationships

### Foreign Key Relationships

```
payment_methods.merchant_id → merchants.id (ON DELETE CASCADE)
```

**Behavior:**
- Each payment method belongs to exactly one merchant
- When a merchant is deleted, all their payment methods are automatically deleted
- Enables merchant-specific payment configurations

### Referenced By

```
orders.payment_method (text field, no FK constraint)
```

**Important:** The `orders` table stores `payment_method` as a text field without a foreign key constraint. This means:
- ✅ **Flexibility:** Orders retain payment method info even if the method is later deleted
- ⚠️ **No Referential Integrity:** No database-level validation that payment method exists
- 💡 **Best Practice:** Application-level validation is required to ensure valid payment methods at order creation

---

## Multi-Merchant Implementation

### Evolution
The payment methods table was enhanced to support multiple merchants in the `20250109000000_add_merchants.sql` migration.

### Key Changes
1. Added `merchant_id` column with foreign key to `merchants` table
2. Created index for efficient merchant-based queries
3. Migrated existing payment methods to default merchant
4. Made `merchant_id` NOT NULL after migration

### Merchant Payment Method Configuration

Merchants have two ways to configure payment methods:

#### 1. Individual Payment Methods (Current Implementation)
- Each merchant has separate payment method records in `payment_methods` table
- Fully customizable QR codes, account numbers, and account names per merchant
- Complete isolation between merchants

#### 2. Accepted Payment Types (In Merchants Table)
```sql
payment_methods text[] -- Array in merchants table
```
- The `merchants` table also has a `payment_methods` column (text array)
- This appears to be for storing accepted payment types (e.g., ['gcash', 'maya', 'cash'])
- **Potential Confusion:** Two payment method systems exist

**Recommendation:** Clarify the distinction or consolidate these approaches for consistency.

---

## Frontend Implementation

### TypeScript Interface
```typescript
export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

**Note:** The interface doesn't include `merchant_id`, which may cause TypeScript issues when working with merchant-specific payment methods.

### Hook: `usePaymentMethods`

**Location:** `src/hooks/usePaymentMethods.ts`

**Key Functions:**

1. **fetchPaymentMethods()** - Fetches only active payment methods (for customers)
2. **fetchAllPaymentMethods()** - Fetches all payment methods (for admin)
3. **addPaymentMethod()** - Creates new payment method
4. **updatePaymentMethod()** - Updates existing payment method
5. **deletePaymentMethod()** - Permanently deletes payment method
6. **reorderPaymentMethods()** - Updates sort_order for all methods

**Current Limitation:** Does not filter by `merchant_id`, which is required for multi-merchant functionality.

### Component: `PaymentMethodManager`

**Location:** `src/components/PaymentMethodManager.tsx`

**Features:**
- ✅ CRUD operations for payment methods
- ✅ Image upload integration via Cloudinary
- ✅ Active/inactive toggle
- ✅ Sort order management
- ✅ ID auto-generation from name (kebab-case)
- ✅ Validation for ID format and required fields
- ❌ No merchant filtering (shows all merchants' payment methods to all admins)

---

## Integration with Orders

### Order Creation Flow

1. **Customer selects payment method** in checkout (`Checkout.tsx`)
2. **Payment method ID stored** in `orders.payment_method` as text
3. **No FK constraint** - historical record preserved even if method deleted

### Checkout Implementation
```typescript
const { paymentMethods } = usePaymentMethods(); // Fetches active methods only
const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('gcash');
const selectedPaymentMethod = paymentMethods.find(method => method.id === paymentMethod);
```

**Display in Checkout:**
- Shows QR code image
- Displays account number and account name
- Customer can select from active payment methods only

---

## Issues & Recommendations

### 🔴 Critical Issues

#### 1. Missing Merchant Filtering
**Problem:** Payment methods are not filtered by merchant ID in the frontend
**Impact:** 
- Admin sees all merchants' payment methods
- Checkout might show wrong merchant's payment methods
- Data integrity risk in multi-merchant environment

**Solution:**
```typescript
// In usePaymentMethods hook
const fetchPaymentMethods = async (merchantId?: string) => {
  let query = supabase
    .from('payment_methods')
    .select('*')
    .eq('active', true);
  
  if (merchantId) {
    query = query.eq('merchant_id', merchantId);
  }
  
  const { data, error } = await query.order('sort_order', { ascending: true });
  // ...
};
```

#### 2. TypeScript Interface Missing merchant_id
**Problem:** PaymentMethod interface doesn't include merchant_id field
**Impact:** TypeScript doesn't enforce merchant_id handling

**Solution:**
```typescript
export interface PaymentMethod {
  id: string;
  name: string;
  account_number: string;
  account_name: string;
  qr_code_url: string;
  active: boolean;
  sort_order: number;
  merchant_id: string; // Add this
  created_at: string;
  updated_at: string;
}
```

#### 3. Dual Payment Method Systems
**Problem:** Both `payment_methods` table and `merchants.payment_methods` column exist
**Impact:** Confusion about which to use, potential inconsistencies

**Solution:** Choose one approach:
- **Option A:** Use `payment_methods` table only (recommended for detailed config)
- **Option B:** Use `merchants.payment_methods` array only (simpler but less flexible)
- **Option C:** Keep both but clarify: `merchants.payment_methods` = accepted types, `payment_methods` table = detailed configurations

### ⚠️ Security Concerns

#### 1. Overly Permissive Admin Policy
**Current:** All authenticated users can manage all payment methods
**Risk:** No role-based access control

**Recommendation:** Implement role-based policies:
```sql
-- Example: Check if user is admin
CREATE POLICY "Only admins can manage payment methods"
  ON payment_methods
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );
```

#### 2. No Foreign Key to orders.payment_method
**Current:** Text field without referential integrity
**Risk:** Can't prevent deletion of payment method still in use

**Recommendation:** Either:
- Add FK constraint (prevents deletion)
- Or keep current design but add application-level checks before deletion

### 📝 Data Quality Issues

#### 1. Placeholder Data in Production
**Issue:** Default payment methods have placeholder values ('09XX XXX XXXX')
**Risk:** Customers might see and attempt to use invalid payment information

**Recommendation:** 
- Remove or deactivate placeholder methods
- Provide admin UI prompt to configure real payment methods on first login
- Add validation to prevent activation with placeholder data

### 🔧 Optimization Opportunities

#### 1. Inefficient Reordering
**Current:** Sequential updates in a loop
```typescript
for (const update of updates) {
  await supabase
    .from('payment_methods')
    .update({ sort_order: update.sort_order })
    .eq('id', update.id);
}
```

**Better:** Use upsert with multiple records or a stored procedure for atomic updates

#### 2. Missing Composite Indexes
**Recommended:**
```sql
-- For merchant-specific active payment methods (most common query)
CREATE INDEX idx_payment_methods_merchant_active 
  ON payment_methods(merchant_id, active, sort_order);
```

---

## Best Practices Being Followed

✅ **Text-based IDs** - Human-readable, predictable identifiers
✅ **Soft Delete Alternative** - Active/inactive toggle instead of hard delete
✅ **Timestamp Tracking** - Automatic created_at and updated_at
✅ **RLS Enabled** - Security policies enforce access control
✅ **Cascading Deletes** - Merchant deletion cleans up payment methods
✅ **Indexed Foreign Keys** - Optimized merchant queries
✅ **QR Code Integration** - Modern payment experience
✅ **Sort Order** - Customizable display order
✅ **Image URL Storage** - Leverages Cloudinary for image management

---

## Testing Recommendations

### Database Tests
1. **RLS Policies**
   - Verify public can only see active payment methods
   - Verify authenticated users can manage all methods
   - Test merchant-specific filtering

2. **Cascading Deletes**
   - Delete a merchant and verify payment methods are removed
   - Verify orders are not affected

3. **Constraints**
   - Try inserting duplicate IDs
   - Try inserting without required fields
   - Verify sort_order accepts only integers

### Application Tests
1. **Checkout Integration**
   - Verify only active methods appear
   - Test payment method selection
   - Verify QR code display

2. **Admin Management**
   - Test CRUD operations
   - Test reordering
   - Test image upload
   - Test ID validation (kebab-case)

3. **Multi-merchant Scenarios**
   - Create multiple merchants with different payment methods
   - Verify isolation between merchants
   - Test merchant deletion impact

---

## Migration Path for Improvements

If implementing the recommended changes, follow this order:

### Phase 1: Data Integrity
1. Add merchant_id to TypeScript interface
2. Update usePaymentMethods to filter by merchant
3. Update PaymentMethodManager to work with current merchant only

### Phase 2: Security
4. Implement role-based access control
5. Add user_roles table if not exists
6. Update RLS policies

### Phase 3: Optimization
7. Add composite indexes
8. Optimize reordering function
9. Add batch update capabilities

### Phase 4: Data Quality
10. Create admin onboarding flow for payment setup
11. Add validation for placeholder data
12. Provide migration script to update existing data

---

## Related Files

### Database
- `supabase/migrations/20250901125510_floating_sky.sql` - Initial payment methods table
- `supabase/migrations/20250109000000_add_merchants.sql` - Multi-merchant support
- `supabase/migrations/20250901170000_orders.sql` - Orders table with payment_method field

### Frontend
- `src/hooks/usePaymentMethods.ts` - Payment methods data hook
- `src/components/PaymentMethodManager.tsx` - Admin management interface
- `src/components/Checkout.tsx` - Customer-facing payment selection
- `src/types/index.ts` - TypeScript type definitions

### Configuration
- `src/lib/cloudinary.ts` - Image upload configuration for QR codes
- `src/lib/supabase.ts` - Database connection

---

## Conclusion

The payment method system is well-designed with good security practices, but requires updates to properly support the multi-merchant functionality. The main areas needing attention are:

1. **Merchant filtering** in frontend code
2. **TypeScript interface updates** to include merchant_id
3. **Clarification** of dual payment method systems
4. **Enhanced security** with role-based access control
5. **Data quality** improvements to remove placeholder values

The database schema is solid and follows best practices. With the recommended frontend updates, this system will provide robust, secure, and scalable payment method management for a multi-merchant food delivery platform.

