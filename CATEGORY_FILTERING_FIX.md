# Category Filtering Fix - Menu Items Based Approach

## Problem
Categories were still showing for merchants even when those merchants didn't have any menu items in those categories. This happened because we were querying the `categories` table directly by `merchant_id`, but categories can exist in the database without having any menu items.

## Root Cause
The previous approach:
```typescript
// Old approach - query categories table directly
const { data } = await supabase
  .from('categories')
  .select('*')
  .eq('merchant_id', merchantId)
  .eq('active', true);
```

**Issue:** This would return ALL categories assigned to a merchant, even if the merchant had no menu items in those categories.

## Solution
Changed the approach to **derive categories from actual menu items** that exist for the merchant. A category should only appear if there are menu items in that category.

## Implementation

### 1. Updated `useCategories` Hook

**File:** `src/hooks/useCategories.ts`

```typescript
export const useCategories = (merchantId?: string, menuItems?: any[]) => {
  const fetchCategories = async () => {
    // If merchantId is provided, derive categories from menu items
    if (merchantId && menuItems) {
      // Get unique categories from menu items
      const uniqueCategories = new Map<string, Category>();
      
      menuItems.forEach(item => {
        if (!uniqueCategories.has(item.category)) {
          uniqueCategories.set(item.category, {
            id: item.category,
            name: item.category,
            icon: '🍽️',
            sort_order: 0,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      });
      
      // Fetch actual category details from database
      const categoryIds = Array.from(uniqueCategories.keys());
      if (categoryIds.length > 0) {
        const { data: categoryData } = await supabase
          .from('categories')
          .select('*')
          .in('id', categoryIds)
          .eq('active', true)
          .order('sort_order', { ascending: true });

        setCategories(categoryData || []);
      } else {
        setCategories([]);
      }
    } else {
      // For admin views, fetch all categories
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      setCategories(data || []);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, [merchantId, menuItems]);
};
```

**Key Changes:**
- Added `menuItems` parameter
- Extract unique category IDs from menu items
- Query categories table only for categories that have menu items
- Refetch when either `merchantId` or `menuItems` changes

---

### 2. Updated Menu Component

**File:** `src/components/Menu.tsx`

```typescript
const Menu: React.FC<MenuProps> = ({ menuItems, addToCart, cartItems, updateQuantity }) => {
  const { selectedMerchant } = useMerchant();
  const { categories } = useCategories(selectedMerchant?.id, menuItems);
  
  // ... rest of component
};
```

**Change:** Pass `menuItems` to `useCategories` hook

---

### 3. Updated Header Component

**File:** `src/components/Header.tsx`

```typescript
interface HeaderProps {
  // ... existing props
  menuItems?: any[]; // NEW
}

const Header: React.FC<HeaderProps> = ({ 
  cartItemsCount, 
  onCartClick, 
  onCategoryClick, 
  selectedCategory,
  menuItems // NEW
}) => {
  const { selectedMerchant } = useMerchant();
  const { categories } = useCategories(selectedMerchant?.id, menuItems);
  
  // ... rest of component
};
```

**Changes:**
- Added `menuItems` to props interface
- Pass `menuItems` to `useCategories` hook

---

### 4. Updated App Component

**File:** `src/App.tsx`

```typescript
<Header 
  cartItemsCount={cart.getTotalItems()}
  onCartClick={() => handleViewChange('cart')}
  onMenuClick={() => handleViewChange('menu')}
  onCategoryClick={handleCategoryClick}
  selectedCategory={selectedCategory}
  menuItems={menuItems} // NEW
/>
```

**Change:** Pass `menuItems` prop to Header component

---

### 5. Updated MobileNav Component

**File:** `src/components/MobileNav.tsx`

```typescript
interface MobileNavProps {
  activeCategory: string;
  onCategoryClick: (categoryId: string) => void;
  menuItems?: any[]; // NEW
}

const MobileNav: React.FC<MobileNavProps> = ({ 
  activeCategory, 
  onCategoryClick,
  menuItems // NEW
}) => {
  const { selectedMerchant } = useMerchant();
  const { categories } = useCategories(selectedMerchant?.id, menuItems);
  
  // ... rest of component
};
```

**Changes:**
- Added `menuItems` to props interface
- Pass `menuItems` to `useCategories` hook

---

### 6. Updated Menu Component (MobileNav Call)

**File:** `src/components/Menu.tsx`

```typescript
<MobileNav 
  activeCategory={activeCategory}
  onCategoryClick={handleCategoryClick}
  menuItems={menuItems} // NEW
/>
```

**Change:** Pass `menuItems` prop to MobileNav component

---

## How It Works Now

### Data Flow

```
1. User selects Merchant A
   ↓
2. Menu items are fetched for Merchant A
   ↓
3. useCategories extracts unique category IDs from menu items
   ↓
4. Categories table is queried for ONLY those category IDs
   ↓
5. Only categories with menu items are displayed
```

### Example Scenario

**Merchant A (Coffee Shop):**
- Menu Items:
  - Cappuccino (category: hot-coffee)
  - Iced Latte (category: cold-coffee)
  - Croissant (category: pastries)

**Result:** Only 3 categories shown:
- Hot Coffee
- Cold Coffee
- Pastries

**Merchant B (Pizza Place):**
- Menu Items:
  - Margherita Pizza (category: pizzas)
  - Garlic Bread (category: appetizers)
  - Tiramisu (category: desserts)

**Result:** Only 3 categories shown:
- Pizzas
- Appetizers
- Desserts

Even if Merchant B has a "hot-coffee" category in the database, it won't show because there are no menu items in that category.

---

## Benefits

### 1. **Accurate Category Display**
- Categories only appear if they have menu items
- No empty categories shown to customers
- Cleaner, more focused user experience

### 2. **Dynamic Updates**
- Categories automatically update when menu items change
- Adding/removing menu items updates categories
- No manual category management needed

### 3. **Performance**
- Only fetches categories that are actually used
- Reduces unnecessary database queries
- Faster page load times

### 4. **Data Integrity**
- Categories are always in sync with menu items
- No orphaned categories displayed
- Single source of truth (menu items)

---

## Admin Components

Admin components (MerchantManager, AdminDashboard, CategoryManager) continue to work as before:

```typescript
// Admin components don't pass menuItems
const { categories } = useCategories(); // Shows ALL categories
```

This allows admins to:
- See all categories in the system
- Manage categories independently
- Create categories before adding menu items

---

## Testing Checklist

- [x] Merchant with menu items shows correct categories
- [x] Merchant without menu items shows no categories
- [x] Switching merchants updates categories correctly
- [x] Adding menu items adds new categories
- [x] Removing menu items removes categories
- [x] Admin views show all categories
- [x] No linting errors
- [x] No TypeScript errors

---

## Migration Notes

### For Existing Data

If you have categories in the database that don't have menu items, they will no longer appear in the customer view. This is the desired behavior.

To clean up unused categories:

```sql
-- Find categories with no menu items
SELECT c.id, c.name, c.merchant_id
FROM categories c
LEFT JOIN menu_items m ON m.category = c.id
WHERE m.id IS NULL;

-- Delete unused categories (optional)
DELETE FROM categories
WHERE id IN (
  SELECT c.id
  FROM categories c
  LEFT JOIN menu_items m ON m.category = c.id
  WHERE m.id IS NULL
);
```

---

## Comparison: Before vs After

### Before (Direct Category Query)
```typescript
// Query categories table directly
const { data } = await supabase
  .from('categories')
  .select('*')
  .eq('merchant_id', merchantId);

// Problem: Returns ALL categories for merchant
// Even if no menu items exist in those categories
```

### After (Menu Items Based)
```typescript
// Extract categories from menu items
const categoryIds = [...new Set(menuItems.map(item => item.category))];

// Query only categories that have menu items
const { data } = await supabase
  .from('categories')
  .select('*')
  .in('id', categoryIds);

// Result: Only categories with menu items are shown
```

---

## Conclusion

The fix ensures that:
- ✅ Categories are derived from actual menu items
- ✅ Only categories with menu items are displayed
- ✅ Categories automatically update when menu changes
- ✅ Admin tools remain unaffected
- ✅ Performance is optimized
- ✅ User experience is improved

The system now provides accurate, dynamic category filtering based on actual menu content, ensuring customers only see relevant categories for each merchant.

