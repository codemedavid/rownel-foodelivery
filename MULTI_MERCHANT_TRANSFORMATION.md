# Multi-Merchant Marketplace Transformation

## Overview
This document outlines the transformation of ClickEats from a single-restaurant food delivery app into a multi-merchant marketplace platform.

## What Has Been Implemented

### 1. Database Schema Changes ✅
**File**: `supabase/migrations/20250109000000_add_merchants.sql`

- Created `merchants` table with comprehensive merchant information
- Added `merchant_id` foreign key to:
  - `menu_items`
  - `categories`
  - `orders`
  - `payment_methods`
- Created indexes for performance optimization
- Implemented Row Level Security (RLS) policies
- Added default merchant for existing data migration

**Key Merchant Fields**:
- Basic info: name, description, logo, cover image
- Business details: category, cuisine type, address, contact
- Pricing: delivery fee, minimum order
- Operational: opening hours, payment methods
- Status: active, featured, rating, reviews

### 2. TypeScript Type Definitions ✅
**File**: `src/types/index.ts`

Added:
- `Merchant` interface with all merchant properties
- `merchantId` field to `MenuItem`
- `merchantId` field to `OrderData`

### 3. Custom Hooks ✅
**File**: `src/hooks/useMerchants.ts`

Created hook for:
- Fetching all active merchants
- Getting merchant by ID
- Loading states and error handling

### 4. Merchant Context ✅
**File**: `src/contexts/MerchantContext.tsx`

Implemented:
- Global merchant state management
- Selected merchant tracking
- LocalStorage persistence
- Merchant selection methods

### 5. Merchants List Component ✅
**File**: `src/components/MerchantsList.tsx`

Features:
- Beautiful merchant cards with images
- Featured merchants section
- Category icons
- Rating display with stars
- Delivery time and fee information
- Responsive grid layout
- Click to view merchant menu

### 6. Updated App Routing ✅
**File**: `src/App.tsx`

New routes:
- `/` - Merchants list (homepage)
- `/merchant/:merchantId` - Merchant menu view
- `/admin` - Admin dashboard (unchanged)
- `/admin/login` - Admin login (unchanged)

### 7. Updated Menu Hook ✅
**File**: `src/hooks/useMenu.ts`

Modified to:
- Include `merchantId` in menu items
- Support merchant-specific filtering
- Handle merchant_id in add/update operations

## What Still Needs to Be Done

### 1. Update Checkout Component ⚠️
**File**: `src/components/Checkout.tsx`

**Required Changes**:
```typescript
// Add merchant context
const { selectedMerchant } = useMerchant();

// Update order submission to include merchantId
const orderData: OrderData = {
  merchantId: selectedMerchant?.id || '', // Add this
  items: cartItems,
  // ... rest of order data
};
```

### 2. Update Admin Dashboard ⚠️
**File**: `src/components/AdminDashboard.tsx`

**Required Changes**:
- Add "Merchants" management section
- Add merchant selector when creating/editing menu items
- Filter menu items by merchant in admin view
- Add merchant management UI

### 3. Create Merchant Manager Component ⚠️
**New File**: `src/components/MerchantManager.tsx`

**Features to Implement**:
- List all merchants
- Add new merchant
- Edit merchant details
- Upload merchant logo and cover image
- Set merchant status (active/inactive)
- Set featured status
- Manage opening hours
- Manage payment methods

### 4. Update Categories Hook ⚠️
**File**: `src/hooks/useCategories.ts`

**Required Changes**:
- Filter categories by merchant
- Include merchant_id when creating categories
- Update category queries to include merchant_id

### 5. Update Payment Methods Hook ⚠️
**File**: `src/hooks/usePaymentMethods.ts`

**Required Changes**:
- Filter payment methods by merchant
- Include merchant_id when creating payment methods
- Update payment method queries to include merchant_id

### 6. Update Orders Hook ⚠️
**File**: `src/hooks/useOrders.ts`

**Required Changes**:
- Include merchant_id when creating orders
- Filter orders by merchant in admin view
- Update order queries to include merchant_id

### 7. Update Header Component ⚠️
**File**: `src/components/Header.tsx`

**Required Changes**:
- Add "Back to Merchants" button when viewing a merchant
- Display merchant name in header
- Add merchant logo if available

### 8. Update Cart Component ⚠️
**File**: `src/components/Cart.tsx`

**Required Changes**:
- Display merchant information in cart
- Show merchant logo
- Display merchant delivery fee
- Validate minimum order amount

## Database Migration Instructions

### Step 1: Run the Migration
```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase Dashboard
# Go to SQL Editor and run the migration file
```

### Step 2: Verify Migration
```sql
-- Check merchants table
SELECT * FROM merchants;

-- Check that menu_items have merchant_id
SELECT id, name, merchant_id FROM menu_items LIMIT 10;

-- Check foreign key constraints
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name
FROM pg_constraint
WHERE contype = 'f' 
  AND conrelid::regclass::text = 'menu_items';
```

### Step 3: Create Test Merchants
```sql
-- Add more merchants for testing
INSERT INTO merchants (name, description, category, cuisine_type, active, featured)
VALUES 
  ('Pizza Palace', 'Authentic Italian pizzas', 'restaurant', 'Italian', true, true),
  ('Coffee Corner', 'Premium coffee and pastries', 'cafe', 'International', true, true),
  ('Burger House', 'Gourmet burgers and fries', 'fast-food', 'American', true, false);
```

## Testing Checklist

### Customer-Facing Features
- [ ] Homepage shows list of merchants
- [ ] Can click on merchant to view their menu
- [ ] Menu items are filtered by selected merchant
- [ ] Cart shows merchant information
- [ ] Checkout includes merchant ID
- [ ] Can switch between merchants
- [ ] Featured merchants appear first
- [ ] Merchant ratings display correctly
- [ ] Delivery fees show per merchant

### Admin Features
- [ ] Can view all merchants
- [ ] Can add new merchant
- [ ] Can edit merchant details
- [ ] Can upload merchant images
- [ ] Can set merchant as featured
- [ ] Can activate/deactivate merchants
- [ ] Can assign menu items to merchants
- [ ] Can filter menu items by merchant
- [ ] Can view orders per merchant

## Architecture Decisions

### Why Separate Merchants Table?
- **Scalability**: Easy to add unlimited merchants
- **Flexibility**: Each merchant can have unique settings
- **Performance**: Can filter and query by merchant efficiently
- **Multi-tenancy**: Supports multiple businesses on one platform

### Why Merchant Context?
- **Global State**: Selected merchant accessible throughout app
- **Persistence**: Selected merchant saved in localStorage
- **Performance**: Avoids prop drilling
- **Consistency**: Single source of truth for merchant data

### Why Merchant ID in All Tables?
- **Data Integrity**: Clear relationship between entities
- **Filtering**: Easy to filter by merchant
- **Analytics**: Track performance per merchant
- **Multi-tenancy**: Support multiple merchants securely

## Future Enhancements

### Phase 2 Features
1. **Merchant Profiles**
   - Detailed merchant pages
   - Reviews and ratings
   - Photos gallery
   - Operating hours display

2. **Search & Filters**
   - Search merchants by name
   - Filter by cuisine type
   - Filter by delivery time
   - Filter by rating
   - Sort by price, rating, distance

3. **Merchant Analytics**
   - Sales dashboard per merchant
   - Popular items tracking
   - Revenue reports
   - Customer insights

4. **Multi-Merchant Cart**
   - Allow items from multiple merchants
   - Split orders by merchant
   - Separate checkout per merchant

5. **Merchant Onboarding**
   - Self-service merchant signup
   - Document verification
   - Bank account setup
   - Menu import tools

6. **Delivery Management**
   - Delivery zones per merchant
   - Delivery fee calculator
   - Real-time tracking
   - Delivery partner integration

## Support & Troubleshooting

### Common Issues

**Issue**: Menu items not showing
- **Solution**: Verify merchant_id is set in menu_items table
- **Check**: `SELECT * FROM menu_items WHERE merchant_id IS NULL;`

**Issue**: Cannot select merchant
- **Solution**: Check MerchantContext is wrapping the app
- **Check**: Verify localStorage is not blocking the app

**Issue**: Orders not saving merchant_id
- **Solution**: Update Checkout component to include merchantId
- **Check**: Verify orders table has merchant_id column

**Issue**: Admin cannot see merchants
- **Solution**: Check RLS policies allow authenticated users
- **Check**: Verify merchant table has proper policies

## Migration Rollback

If you need to rollback the changes:

```sql
-- Remove merchant_id columns
ALTER TABLE menu_items DROP COLUMN merchant_id;
ALTER TABLE categories DROP COLUMN merchant_id;
ALTER TABLE orders DROP COLUMN merchant_id;
ALTER TABLE payment_methods DROP COLUMN merchant_id;

-- Drop merchants table
DROP TABLE IF EXISTS merchants CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_menu_items_merchant_id;
DROP INDEX IF EXISTS idx_categories_merchant_id;
DROP INDEX IF EXISTS idx_orders_merchant_id;
DROP INDEX IF EXISTS idx_payment_methods_merchant_id;
DROP INDEX IF EXISTS idx_merchants_active;
DROP INDEX IF EXISTS idx_merchants_featured;
DROP INDEX IF EXISTS idx_merchants_category;
```

## Conclusion

The multi-merchant transformation is approximately **70% complete**. The core infrastructure is in place:

✅ Database schema
✅ Type definitions
✅ Merchant context
✅ Merchants list UI
✅ Routing
✅ Menu filtering

Still needed:
⚠️ Admin merchant management
⚠️ Checkout updates
⚠️ Complete hook updates
⚠️ Testing and refinement

This transformation positions ClickEats as a scalable marketplace platform capable of supporting multiple merchants while maintaining the existing features and user experience.

