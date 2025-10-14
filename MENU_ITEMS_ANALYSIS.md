# Menu Items Analysis

## Overview
This document provides a comprehensive analysis of the menu items system in the food delivery application, including database schema, features, and implementation details.

---

## Database Schema

### Core Table: `menu_items`

#### Base Fields (Initial Schema)
```sql
- id (uuid, PRIMARY KEY)
- name (text, NOT NULL)
- description (text, NOT NULL)
- base_price (decimal(10,2), NOT NULL)
- category (text, NOT NULL)
- popular (boolean, DEFAULT false)
- image_url (text, nullable)
- created_at (timestamptz, DEFAULT now())
- updated_at (timestamptz, DEFAULT now())
```

#### Availability Management
```sql
- available (boolean, DEFAULT true)
```
- Controls whether item is visible/purchasable
- Can be manually set by admin
- Auto-updated when inventory tracking is enabled

#### Discount Pricing (Added in Migration: `20250101000000`)
```sql
- discount_price (decimal(10,2), nullable)
- discount_start_date (timestamptz, nullable)
- discount_end_date (timestamptz, nullable)
- discount_active (boolean, DEFAULT false)
```

**Features:**
- Time-based discount scheduling
- Automatic discount activation/deactivation
- Visual indicators for discounted items
- Percentage-off calculations

#### Inventory Management (Added in Migration: `20250902090000`)
```sql
- track_inventory (boolean, DEFAULT false)
- stock_quantity (integer, nullable)
- low_stock_threshold (integer, DEFAULT 0)
```

**Features:**
- Optional inventory tracking per item
- Automatic availability updates when stock is low
- Low stock warnings
- Real-time stock quantity display

**Constraints:**
- `stock_quantity >= 0` (non-negative)
- `low_stock_threshold >= 0` (non-negative)

**Trigger Behavior:**
```sql
-- Automatically updates 'available' field when:
-- 1. track_inventory = true
-- 2. stock_quantity or low_stock_threshold changes
-- 3. Sets available = false when stock_quantity <= low_stock_threshold
```

---

## Related Tables

### `variations` Table
**Purpose:** Size or variant options for menu items (e.g., Small, Medium, Large)

```sql
- id (uuid, PRIMARY KEY)
- menu_item_id (uuid, FOREIGN KEY → menu_items.id, ON DELETE CASCADE)
- name (text, NOT NULL) -- e.g., "Small", "Medium", "Large"
- price (decimal(10,2), NOT NULL, DEFAULT 0) -- Price adjustment from base
- created_at (timestamptz, DEFAULT now())
```

**Example:**
- Item: "Coffee"
- Variations: 
  - Small (+₱0)
  - Medium (+₱20)
  - Large (+₱40)

### `add_ons` Table
**Purpose:** Optional extras that can be added to menu items

```sql
- id (uuid, PRIMARY KEY)
- menu_item_id (uuid, FOREIGN KEY → menu_items.id, ON DELETE CASCADE)
- name (text, NOT NULL) -- e.g., "Extra Cheese", "Extra Shot"
- price (decimal(10,2), NOT NULL, DEFAULT 0)
- category (text, NOT NULL) -- Groups related add-ons (e.g., "toppings", "sauces")
- created_at (timestamptz, DEFAULT now())
```

**Example:**
- Item: "Pizza"
- Add-ons:
  - Category: "Toppings"
    - Extra Cheese (+₱50)
    - Pepperoni (+₱60)
  - Category: "Sauces"
    - Garlic Sauce (+₱10)
    - Hot Sauce (+₱10)

---

## TypeScript Interface

```typescript
export interface MenuItem {
  // Core fields
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
  image?: string;
  popular?: boolean;
  available?: boolean;
  
  // Related data
  variations?: Variation[];
  addOns?: AddOn[];
  
  // Discount pricing
  discountPrice?: number;
  discountStartDate?: string;
  discountEndDate?: string;
  discountActive?: boolean;
  
  // Computed fields (calculated in app)
  effectivePrice?: number; // Base or discounted price
  isOnDiscount?: boolean;
  
  // Inventory controls
  trackInventory?: boolean;
  stockQuantity?: number | null;
  lowStockThreshold?: number;
  autoDisabled?: boolean; // Set when inventory tracking auto-disables item
}

export interface Variation {
  id: string;
  name: string;
  price: number;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  category: string;
  quantity?: number; // For cart items
}
```

---

## Features & Functionality

### 1. Dynamic Pricing
- **Base Price:** Standard price for the item
- **Discount Price:** Temporary promotional price
- **Effective Price:** Automatically calculated based on:
  - Current date vs. discount dates
  - `discount_active` flag
  - Falls back to `base_price` when discount is inactive

**Calculation Logic:**
```typescript
const now = new Date();
const discountStart = item.discount_start_date ? new Date(item.discount_start_date) : null;
const discountEnd = item.discount_end_date ? new Date(item.discount_end_date) : null;

const isDiscountActive = item.discount_active && 
  (!discountStart || now >= discountStart) && 
  (!discountEnd || now <= discountEnd);

const effectivePrice = isDiscountActive && item.discount_price 
  ? item.discount_price 
  : item.base_price;
```

### 2. Inventory Management
**When `track_inventory = true`:**
- Stock quantity is tracked and displayed
- Low stock warnings shown when `stock_quantity <= low_stock_threshold`
- Automatic availability updates via database trigger
- Stock decrements on order completion

**Stock Indicators:**
- **In Stock:** Green badge, shows quantity
- **Low Stock:** Orange badge with warning, shows remaining quantity
- **Out of Stock:** Red badge, item marked unavailable

### 3. Customization Options
**Variations:**
- Customer selects one variation (e.g., size)
- Price adjusts based on variation
- Displayed in modal for items with variations

**Add-ons:**
- Customer can select multiple add-ons
- Each add-on can have multiple quantities
- Grouped by category for better UX
- Price added to total

### 4. Visual Indicators
**Badges:**
- ⭐ **POPULAR** - Yellow/Orange gradient
- 🔴 **SALE** - Red gradient, animated pulse
- **UNAVAILABLE** - Red badge
- **% OFF** - Shows discount percentage

**Stock Status:**
- ✓ In stock (green)
- ⚠️ Low stock (orange, animated)
- ✕ Out of stock (red)

---

## Data Flow

### Fetching Menu Items
```typescript
// useMenu hook
const { data } = await supabase
  .from('menu_items')
  .select(`
    *,
    variations (*),
    add_ons (*)
  `)
  .order('created_at', { ascending: true });
```

**Process:**
1. Fetch all menu items
2. Include related variations and add-ons
3. Calculate discount status
4. Calculate effective price
5. Format for frontend consumption

### Adding Menu Items
```typescript
// 1. Insert menu item
const { data: menuItem } = await supabase
  .from('menu_items')
  .insert({...})
  .select()
  .single();

// 2. Insert variations (if any)
await supabase.from('variations').insert([...]);

// 3. Insert add-ons (if any)
await supabase.from('add_ons').insert([...]);
```

### Updating Menu Items
```typescript
// 1. Update menu item
await supabase
  .from('menu_items')
  .update({...})
  .eq('id', id);

// 2. Delete existing variations and add-ons
await supabase.from('variations').delete().eq('menu_item_id', id);
await supabase.from('add_ons').delete().eq('menu_item_id', id);

// 3. Insert new variations and add-ons
await supabase.from('variations').insert([...]);
await supabase.from('add_ons').insert([...]);
```

### Deleting Menu Items
```typescript
// Cascade delete handles variations and add-ons
await supabase
  .from('menu_items')
  .delete()
  .eq('id', id);
```

---

## Admin Features

### Menu Item Management
**Dashboard View:**
- Table view with all menu items
- Sortable columns
- Bulk selection and actions
- Quick edit/delete buttons

**Add/Edit Form:**
- Basic information (name, description, price, category)
- Image upload via Cloudinary
- Popular flag toggle
- Availability toggle
- Discount pricing configuration
- Inventory tracking configuration
- Variations management
- Add-ons management

**Bulk Actions:**
- Delete multiple items
- Toggle availability
- Update categories

---

## Security

### Row Level Security (RLS)
**Public Policies:**
- Read access to all menu items (for customers)
- Read access to variations and add-ons

**Authenticated Policies:**
- Full CRUD access for admin users
- Write access to menu_items, variations, and add_ons tables

### Functions
```sql
-- Decrements stock quantities after order completion
CREATE FUNCTION decrement_menu_item_stock(items jsonb)
RETURNS void
SECURITY DEFINER;
```

---

## Migration History

1. **20250829160942_green_stream.sql**
   - Initial menu_items, variations, add_ons tables
   - Basic RLS policies

2. **20250829162038_lucky_portal.sql**
   - Added `available` field

3. **20250101000000_add_discount_pricing_and_site_settings.sql**
   - Added discount pricing fields
   - Time-based discount support

4. **20250103000000_fix_availability_trigger.sql**
   - Improved availability trigger
   - Respects manual availability changes

5. **20250902090000_inventory_management.sql**
   - Added inventory tracking fields
   - Automatic availability management
   - Stock decrement function

6. **20250901015559_frosty_wildflower.sql**
   - Sample bakery menu items
   - Demonstrates variations and add-ons

---

## Performance Considerations

### Optimizations
1. **Image Preloading:** Images preloaded for visible category first
2. **Lazy Loading:** Images loaded on demand with `loading="lazy"`
3. **Efficient Queries:** Single query fetches items with relations
4. **Caching:** Menu items cached in React state

### Scalability
- Database indexes on frequently queried fields
- Cascade deletes for related data
- Efficient JSONB operations for stock decrements

---

## Example Usage

### Creating a Menu Item with Variations and Add-ons

```typescript
const newItem = {
  name: "Artisan Coffee",
  description: "Premium single-origin coffee",
  basePrice: 150,
  category: "hot-coffee",
  popular: true,
  available: true,
  image: "https://example.com/coffee.jpg",
  discountPrice: 120,
  discountStartDate: "2025-01-01",
  discountEndDate: "2025-01-31",
  discountActive: true,
  trackInventory: true,
  stockQuantity: 100,
  lowStockThreshold: 10,
  variations: [
    { name: "Small", price: 0 },
    { name: "Medium", price: 20 },
    { name: "Large", price: 40 }
  ],
  addOns: [
    { name: "Extra Shot", price: 30, category: "extras" },
    { name: "Oat Milk", price: 15, category: "milk" },
    { name: "Vanilla Syrup", price: 10, category: "syrups" }
  ]
};

await addMenuItem(newItem);
```

---

## Best Practices

### 1. Naming Conventions
- Use descriptive item names
- Keep descriptions concise but informative
- Use consistent category names

### 2. Pricing
- Always set `base_price`
- Use `discount_price` for promotions
- Test discount date ranges

### 3. Inventory
- Enable tracking for limited items
- Set realistic `low_stock_threshold`
- Monitor stock levels regularly

### 4. Images
- Use high-quality images
- Optimize image sizes
- Provide fallback for missing images

### 5. Variations & Add-ons
- Keep variation names short
- Group add-ons by logical categories
- Set appropriate prices for extras

---

## Future Enhancements

### Potential Features
1. **Nutritional Information**
   - Calories, macros, allergens
   - Display on item cards

2. **Item Reviews & Ratings**
   - Customer feedback system
   - Average rating display

3. **Recommended Items**
   - "Frequently bought together"
   - AI-powered suggestions

4. **Seasonal Items**
   - Automatic availability based on season
   - Time-limited items

5. **Multi-language Support**
   - Translated names and descriptions
   - Locale-specific pricing

6. **Advanced Inventory**
   - Supplier management
   - Reorder points
   - Cost tracking

---

## Troubleshooting

### Common Issues

**Issue:** Item not showing on menu
- Check `available` field
- Verify category exists
- Check stock quantity if tracking enabled

**Issue:** Discount not applying
- Verify `discount_active = true`
- Check date ranges
- Ensure `discount_price` is set

**Issue:** Stock not updating
- Verify `track_inventory = true`
- Check trigger is active
- Verify stock decrement function is called on order completion

**Issue:** Variations not showing
- Check foreign key relationship
- Verify variations are linked to correct `menu_item_id`
- Check RLS policies

---

## Summary

The menu items system is a comprehensive solution for managing a food delivery menu with:
- ✅ Flexible pricing (base + discounts)
- ✅ Inventory tracking
- ✅ Customization options (variations & add-ons)
- ✅ Time-based promotions
- ✅ Real-time availability
- ✅ Admin management interface
- ✅ Secure data access
- ✅ Scalable architecture

The system is production-ready and handles complex scenarios like inventory management, discount scheduling, and item customization while maintaining data integrity and security.

