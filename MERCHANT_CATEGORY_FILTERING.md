# Merchant Category Filtering Implementation

## Overview
This document describes the implementation of merchant-specific category filtering to ensure customers only see categories that belong to the selected merchant/store.

---

## Problem Statement
Previously, the application was displaying ALL categories from the database to all customers, regardless of which merchant they selected. This caused confusion as customers would see categories that don't exist in their selected merchant's menu.

---

## Solution
Implemented merchant-specific category filtering by:
1. Updating the `useCategories` hook to accept an optional `merchantId` parameter
2. Filtering categories at the database level using `merchant_id`
3. Updating all customer-facing components to pass the selected merchant's ID

---

## Changes Made

### 1. **useCategories Hook** (`src/hooks/useCategories.ts`)

#### Before:
```typescript
export const useCategories = () => {
  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    // ... returns ALL categories
  };
}
```

#### After:
```typescript
export const useCategories = (merchantId?: string) => {
  const fetchCategories = async () => {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('active', true);
    
    // Filter by merchant_id if provided
    if (merchantId) {
      query = query.eq('merchant_id', merchantId);
    }
    
    const { data, error } = await query
      .order('sort_order', { ascending: true });
    // ... returns only categories for the specified merchant
  };
  
  useEffect(() => {
    fetchCategories();
  }, [merchantId]); // Refetch when merchant changes
}
```

**Key Changes:**
- Added optional `merchantId` parameter
- Conditional filtering based on merchant ID
- Effect dependency updated to refetch when merchant changes

---

### 2. **Menu Component** (`src/components/Menu.tsx`)

#### Before:
```typescript
const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems, updateQuantity }) => {
  const { categories } = useCategories();
  const { selectedMerchant } = useMerchant();
  // ... categories not filtered by merchant
}
```

#### After:
```typescript
const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems, updateQuantity }) => {
  const { selectedMerchant } = useMerchant();
  const { categories } = useCategories(selectedMerchant?.id);
  // ... categories filtered by selected merchant
}
```

**Key Changes:**
- Pass `selectedMerchant?.id` to `useCategories` hook
- Categories now automatically filter when merchant changes

---

### 3. **Header Component** (`src/components/Header.tsx`)

#### Before:
```typescript
const Header: React.FC<HeaderProps> = ({ cartItemsCount, onCartClick, onCategoryClick, selectedCategory }) => {
  const { siteSettings, loading } = useSiteSettings();
  const { categories, loading: categoriesLoading } = useCategories();
  // ... shows all categories
}
```

#### After:
```typescript
const Header: React.FC<HeaderProps> = ({ cartItemsCount, onCartClick, onCategoryClick, selectedCategory }) => {
  const { siteSettings, loading } = useSiteSettings();
  const { selectedMerchant } = useMerchant();
  const { categories, loading: categoriesLoading } = useCategories(selectedMerchant?.id);
  // ... shows only merchant's categories
}
```

**Key Changes:**
- Import `useMerchant` hook
- Get `selectedMerchant` from context
- Pass `selectedMerchant?.id` to `useCategories` hook

---

### 4. **MobileNav Component** (`src/components/MobileNav.tsx`)

#### Before:
```typescript
const MobileNav: React.FC<MobileNavProps> = ({ activeCategory, onCategoryClick }) => {
  const { categories } = useCategories();
  // ... shows all categories
}
```

#### After:
```typescript
const MobileNav: React.FC<MobileNavProps> = ({ activeCategory, onCategoryClick }) => {
  const { selectedMerchant } = useMerchant();
  const { categories } = useCategories(selectedMerchant?.id);
  // ... shows only merchant's categories
}
```

**Key Changes:**
- Import `useMerchant` hook
- Get `selectedMerchant` from context
- Pass `selectedMerchant?.id` to `useCategories` hook

---

## Components NOT Modified

The following admin components were **intentionally NOT modified** as they need to see all categories:

1. **MerchantManager** - Admin needs to see all categories for merchant management
2. **AdminDashboard** - Admin needs to see all categories for dashboard overview
3. **CategoryManager** - Admin needs to see all categories for category management

These components continue to call `useCategories()` without a merchant ID parameter.

---

## Data Flow

```
User clicks merchant
       ↓
MerchantContext.setSelectedMerchant(merchant)
       ↓
selectedMerchant.id becomes available
       ↓
useCategories(selectedMerchant.id) is called
       ↓
Database query with merchant_id filter
       ↓
Only merchant's categories are returned
       ↓
Components display filtered categories
```

---

## Database Schema

The `categories` table has a `merchant_id` column that was added in a previous migration:

```sql
CREATE TABLE categories (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  icon text,
  sort_order integer,
  active boolean DEFAULT true,
  merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX idx_categories_merchant_id ON categories(merchant_id);
```

---

## Benefits

### 1. **Better User Experience**
- Customers only see relevant categories
- No confusion about unavailable items
- Cleaner, more focused interface

### 2. **Performance**
- Reduced data transfer (fewer categories)
- Faster query execution with indexed `merchant_id`
- Less DOM rendering

### 3. **Scalability**
- Each merchant can have completely different categories
- No cross-contamination between merchants
- Easy to add new merchants with custom categories

### 4. **Data Integrity**
- Categories are properly scoped to merchants
- Foreign key constraints ensure referential integrity
- Cascade delete prevents orphaned categories

---

## Testing Checklist

- [x] Customer selects Merchant A → sees only Merchant A's categories
- [x] Customer selects Merchant B → sees only Merchant B's categories
- [x] Categories update when switching between merchants
- [x] Admin dashboard shows all categories (no merchant filter)
- [x] Category manager shows all categories (no merchant filter)
- [x] No linting errors
- [x] No TypeScript errors

---

## Example Scenarios

### Scenario 1: Customer Browsing Different Merchants

**Merchant A (Coffee Shop):**
- Hot Coffee
- Cold Coffee
- Pastries
- Sandwiches

**Merchant B (Pizza Place):**
- Pizzas
- Appetizers
- Desserts
- Beverages

When customer switches from Merchant A to Merchant B:
1. Old categories disappear
2. New categories appear
3. Active category resets to first category
4. Menu items filter to new merchant

### Scenario 2: Admin Managing Categories

Admin in Category Manager:
- Sees ALL categories from ALL merchants
- Can filter by merchant using admin interface
- Can create categories for any merchant
- Can edit/delete any category

---

## Future Enhancements

### Potential Improvements:

1. **Category Caching**
   ```typescript
   // Cache categories per merchant
   const categoryCache = new Map<string, Category[]>();
   ```

2. **Optimistic Updates**
   ```typescript
   // Update UI immediately, sync with server later
   setCategories(newCategories);
   ```

3. **Category Search**
   ```typescript
   // Allow searching within merchant's categories
   const filteredCategories = categories.filter(cat => 
     cat.name.toLowerCase().includes(searchTerm)
   );
   ```

4. **Category Analytics**
   ```typescript
   // Track which categories are most popular per merchant
   trackCategoryView(merchantId, categoryId);
   ```

---

## Migration Notes

### For Existing Data:
If you have existing categories without `merchant_id`:
```sql
-- Set all existing categories to default merchant
UPDATE categories 
SET merchant_id = (SELECT id FROM merchants WHERE name = 'ClickEats Main Store' LIMIT 1)
WHERE merchant_id IS NULL;
```

### For New Merchants:
When creating a new merchant, create default categories:
```sql
INSERT INTO categories (name, icon, sort_order, active, merchant_id)
VALUES 
  ('Hot Coffee', '☕', 1, true, 'new-merchant-id'),
  ('Cold Coffee', '🧊', 2, true, 'new-merchant-id'),
  ('Pastries', '🥐', 3, true, 'new-merchant-id');
```

---

## Conclusion

The merchant category filtering implementation ensures that:
- ✅ Customers only see relevant categories
- ✅ Each merchant has complete control over their categories
- ✅ Admin tools remain flexible for managing all categories
- ✅ Performance is optimized with database-level filtering
- ✅ Code is maintainable and follows React best practices

The system is now properly scoped to provide a multi-merchant experience where each merchant's menu is completely independent.

