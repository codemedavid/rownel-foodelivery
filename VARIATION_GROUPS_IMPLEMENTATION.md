# Variation Groups - Complete Implementation Guide

## 📋 Overview

This document provides a comprehensive guide to the **Variation Groups** feature, which allows menu items to have multiple types of variations (e.g., Size, Temperature, Style) instead of a single flat list.

---

## 🎯 Problem Solved

**Before (Old System):**
- Coffee: Small (+₱0), Medium (+₱20), Large (+₱40)
- Only ONE type of variation per item
- Can't combine Size + Temperature + Milk Type

**After (New System):**
- Coffee:
  - **Size** (required): Small (+₱0), Medium (+₱20), Large (+₱40)
  - **Temperature** (required): Hot (+₱0), Iced (+₱10)
  - **Milk Type** (optional): Regular (+₱0), Oat (+₱20), Almond (+₱25)
- Multiple variation types per item
- Each type can be required or optional
- Customer selects one option from each required group

---

## 🏗️ Architecture

### Database Changes

#### 1. **variations table** - Added columns:
```sql
ALTER TABLE variations 
ADD COLUMN variation_group text NOT NULL DEFAULT 'default',
ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
```

#### 2. **variation_groups table** - New table:
```sql
CREATE TABLE variation_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

### TypeScript Types

```typescript
export interface Variation {
  id: string;
  name: string;
  price: number;
  variationGroup?: string; // NEW: The group this belongs to
  sortOrder?: number; // NEW: Order within the group
}

export interface VariationGroup {
  id: string;
  name: string; // e.g., "Size", "Temperature", "Style"
  required: boolean; // If true, customer must select one
  sortOrder: number; // Order of groups in UI
  variations: Variation[]; // Variations in this group
}

export interface MenuItem {
  // ... existing fields
  variations?: Variation[]; // Flat list (backward compatibility)
  variationGroups?: VariationGroup[]; // NEW: Grouped variations
  // ... other fields
}

export interface CartItem {
  // ... existing fields
  selectedVariation?: Variation; // Single (backward compatibility)
  selectedVariations?: Record<string, Variation>; // NEW: Multiple selections
  // ... other fields
}
```

---

## 📝 Admin Usage

### Creating Menu Items with Grouped Variations

**Step 1:** Navigate to Admin Dashboard → Menu Items → Add New Item

**Step 2:** Fill basic information (name, description, price, etc.)

**Step 3:** Scroll to "Variation Groups" section

**Step 4:** Click "Add Variation Group"

**Step 5:** Configure each group:
- **Group Name**: Size, Temperature, Style, etc.
- **Required**: Check if customer must select from this group
- **Variations**: Add options with names and price adjustments

### Example 1: Coffee with Multiple Variations

**Item:** Artisan Coffee (Base Price: ₱150)

**Variation Group 1: Size** (Required)
- Small: +₱0
- Medium: +₱20
- Large: +₱40

**Variation Group 2: Temperature** (Required)
- Hot: +₱0
- Iced: +₱10

**Variation Group 3: Milk Type** (Optional)
- Regular: +₱0
- Oat Milk: +₱20
- Almond Milk: +₱25
- Soy Milk: +₱15

**Customer Selections & Pricing:**
```
Selection 1: Medium + Hot + Regular
= ₱150 (base) + ₱20 (Medium) + ₱0 (Hot) + ₱0 (Regular) = ₱170

Selection 2: Large + Iced + Oat Milk
= ₱150 (base) + ₱40 (Large) + ₱10 (Iced) + ₱20 (Oat Milk) = ₱220
```

### Example 2: Fries with Style Options

**Item:** French Fries (Base Price: ₱80)

**Variation Group 1: Size** (Required)
- Regular: +₱0
- Large: +₱30
- Extra Large: +₱50

**Variation Group 2: Style** (Optional)
- Straight Cut: +₱0
- Curly: +₱15
- Waffle: +₱20
- Crinkle: +₱10

**Customer Selections & Pricing:**
```
Selection 1: Regular + Straight Cut
= ₱80 (base) + ₱0 (Regular) + ₱0 (Straight) = ₱80

Selection 2: Large + Waffle
= ₱80 (base) + ₱30 (Large) + ₱20 (Waffle) = ₱130
```

### Example 3: Pizza with Multiple Customizations

**Item:** Margherita Pizza (Base Price: ₱250)

**Variation Group 1: Size** (Required)
- Personal (8"): +₱0
- Regular (12"): +₱100
- Large (16"): +₱200

**Variation Group 2: Crust** (Required)
- Thin Crust: +₱0
- Regular Crust: +₱0
- Thick Crust: +₱20
- Stuffed Crust: +₱50

**Variation Group 3: Cheese Level** (Optional)
- Regular Cheese: +₱0
- Extra Cheese: +₱40
- Triple Cheese: +₱80

---

## 🗄️ Database Examples

### Inserting a Menu Item with Grouped Variations

```sql
-- 1. Insert the menu item
INSERT INTO menu_items (id, merchant_id, name, description, base_price, category, available)
VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'merchant-uuid',
  'Artisan Coffee',
  'Premium single-origin coffee',
  150,
  'hot-coffee',
  true
);

-- 2. Insert variation groups
INSERT INTO variation_groups (menu_item_id, name, required, sort_order)
VALUES 
  ('123e4567-e89b-12d3-a456-426614174000', 'Size', true, 0),
  ('123e4567-e89b-12d3-a456-426614174000', 'Temperature', true, 1),
  ('123e4567-e89b-12d3-a456-426614174000', 'Milk Type', false, 2);

-- 3. Insert variations for each group
INSERT INTO variations (menu_item_id, name, price, variation_group, sort_order)
VALUES
  -- Size variations
  ('123e4567-e89b-12d3-a456-426614174000', 'Small', 0, 'Size', 0),
  ('123e4567-e89b-12d3-a456-426614174000', 'Medium', 20, 'Size', 1),
  ('123e4567-e89b-12d3-a456-426614174000', 'Large', 40, 'Size', 2),
  -- Temperature variations
  ('123e4567-e89b-12d3-a456-426614174000', 'Hot', 0, 'Temperature', 0),
  ('123e4567-e89b-12d3-a456-426614174000', 'Iced', 10, 'Temperature', 1),
  -- Milk Type variations
  ('123e4567-e89b-12d3-a456-426614174000', 'Regular', 0, 'Milk Type', 0),
  ('123e4567-e89b-12d3-a456-426614174000', 'Oat Milk', 20, 'Milk Type', 1),
  ('123e4567-e89b-12d3-a456-426614174000', 'Almond Milk', 25, 'Milk Type', 2),
  ('123e4567-e89b-12d3-a456-426614174000', 'Soy Milk', 15, 'Milk Type', 3);
```

### Querying Menu Items with Grouped Variations

```sql
-- Get menu item with all variations and groups
SELECT 
  mi.*,
  json_agg(DISTINCT jsonb_build_object(
    'id', vg.id,
    'name', vg.name,
    'required', vg.required,
    'sortOrder', vg.sort_order
  )) FILTER (WHERE vg.id IS NOT NULL) as variation_groups,
  json_agg(DISTINCT jsonb_build_object(
    'id', v.id,
    'name', v.name,
    'price', v.price,
    'variationGroup', v.variation_group,
    'sortOrder', v.sort_order
  )) FILTER (WHERE v.id IS NOT NULL) as variations
FROM menu_items mi
LEFT JOIN variation_groups vg ON vg.menu_item_id = mi.id
LEFT JOIN variations v ON v.menu_item_id = mi.id
WHERE mi.id = '123e4567-e89b-12d3-a456-426614174000'
GROUP BY mi.id;
```

---

## 🎨 Customer UI Implementation

### Display Variation Groups (Customer View)

The customer will see variation groups organized by type:

```tsx
{/* Menu Item Modal */}
<div className="variation-groups">
  {item.variationGroups?.map((group) => (
    <div key={group.id} className="variation-group mb-4">
      <h3 className="text-lg font-medium mb-2">
        {group.name}
        {group.required && <span className="text-red-500">*</span>}
      </h3>
      
      <div className="grid grid-cols-2 gap-2">
        {group.variations.map((variation) => (
          <button
            key={variation.id}
            onClick={() => handleSelectVariation(group.name, variation)}
            className={`p-3 border rounded-lg ${
              selectedVariations[group.name]?.id === variation.id
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300'
            }`}
          >
            <div className="font-medium">{variation.name}</div>
            {variation.price > 0 && (
              <div className="text-sm text-gray-600">+₱{variation.price}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  ))}
</div>
```

### Price Calculation

```typescript
const calculateTotalPrice = (
  basePrice: number,
  selectedVariations: Record<string, Variation>
): number => {
  let total = basePrice;
  
  // Add price from each selected variation
  Object.values(selectedVariations).forEach(variation => {
    total += variation.price;
  });
  
  return total;
};

// Example usage:
const selectedVariations = {
  "Size": { id: "1", name: "Medium", price: 20, ... },
  "Temperature": { id: "2", name: "Iced", price: 10, ... },
  "Milk Type": { id: "3", name: "Oat Milk", price: 20, ... }
};

const totalPrice = calculateTotalPrice(150, selectedVariations);
// Result: 150 + 20 + 10 + 20 = ₱200
```

---

## 🛒 Cart & Order Implementation

### Storing Cart Items with Multiple Variations

```typescript
interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  selectedVariations: Record<string, Variation>; // NEW
  selectedAddOns: AddOn[];
  totalPrice: number;
}

// Example cart item:
const cartItem: CartItem = {
  id: "cart-1",
  menuItemId: "coffee-123",
  name: "Artisan Coffee",
  basePrice: 150,
  quantity: 2,
  selectedVariations: {
    "Size": { id: "v1", name: "Medium", price: 20 },
    "Temperature": { id: "v2", name: "Iced", price: 10 },
    "Milk Type": { id: "v3", name: "Oat Milk", price: 20 }
  },
  selectedAddOns: [],
  totalPrice: 200 // (150 + 20 + 10 + 20) * 1 = 200
};
```

### Order Items Storage

```sql
-- order_items table stores variations as JSONB
CREATE TABLE order_items (
  id uuid PRIMARY KEY,
  order_id uuid REFERENCES orders(id),
  item_id text NOT NULL,
  name text NOT NULL,
  variation jsonb, -- Stores selected variations
  add_ons jsonb,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL,
  subtotal numeric(12,2) NOT NULL
);

-- Example insert:
INSERT INTO order_items (order_id, item_id, name, variation, unit_price, quantity, subtotal)
VALUES (
  'order-uuid',
  'coffee-123',
  'Artisan Coffee',
  '{"Size": {"id": "v1", "name": "Medium", "price": 20}, "Temperature": {"id": "v2", "name": "Iced", "price": 10}, "Milk Type": {"id": "v3", "name": "Oat Milk", "price": 20}}'::jsonb,
  200,
  2,
  400
);
```

---

## ✅ Validation Rules

### Admin Side

1. **Group Name Required**: Each variation group must have a name
2. **Unique Group Names**: Group names must be unique within an item
3. **At Least One Variation**: Each group must have at least one variation
4. **Variation Names Required**: Each variation must have a name
5. **Price Validation**: Prices must be >= 0

### Customer Side

1. **Required Groups**: Customer must select one option from each required group
2. **Optional Groups**: Customer can skip optional groups
3. **Single Selection**: Only one option can be selected per group
4. **Price Display**: Show running total as selections change

---

## 🧪 Testing Examples

### Test Case 1: Coffee with All Variations

```typescript
// Admin creates item
const coffeeItem = {
  name: "Artisan Coffee",
  basePrice: 150,
  variationGroups: [
    {
      name: "Size",
      required: true,
      sortOrder: 0,
      variations: [
        { name: "Small", price: 0, sortOrder: 0 },
        { name: "Medium", price: 20, sortOrder: 1 },
        { name: "Large", price: 40, sortOrder: 2 }
      ]
    },
    {
      name: "Temperature",
      required: true,
      sortOrder: 1,
      variations: [
        { name: "Hot", price: 0, sortOrder: 0 },
        { name: "Iced", price: 10, sortOrder: 1 }
      ]
    },
    {
      name: "Milk Type",
      required: false,
      sortOrder: 2,
      variations: [
        { name: "Regular", price: 0, sortOrder: 0 },
        { name: "Oat Milk", price: 20, sortOrder: 1 },
        { name: "Almond Milk", price: 25, sortOrder: 2 }
      ]
    }
  ]
};

// Customer selects: Large + Iced + Oat Milk
const selections = {
  "Size": { name: "Large", price: 40 },
  "Temperature": { name: "Iced", price: 10 },
  "Milk Type": { name: "Oat Milk", price: 20 }
};

// Expected total: 150 + 40 + 10 + 20 = ₱220
```

### Test Case 2: Fries with Optional Style

```typescript
const friesItem = {
  name: "French Fries",
  basePrice: 80,
  variationGroups: [
    {
      name: "Size",
      required: true,
      sortOrder: 0,
      variations: [
        { name: "Regular", price: 0, sortOrder: 0 },
        { name: "Large", price: 30, sortOrder: 1 }
      ]
    },
    {
      name: "Style",
      required: false,
      sortOrder: 1,
      variations: [
        { name: "Straight", price: 0, sortOrder: 0 },
        { name: "Curly", price: 15, sortOrder: 1 },
        { name: "Waffle", price: 20, sortOrder: 2 }
      ]
    }
  ]
};

// Customer selects: Large (skips Style)
const selections = {
  "Size": { name: "Large", price: 30 }
  // Style not selected (optional)
};

// Expected total: 80 + 30 = ₱110
```

---

## 🔄 Migration from Old System

### Backward Compatibility

The system supports both old and new formats:

**Old Format (still works):**
```typescript
{
  variations: [
    { name: "Small", price: 0 },
    { name: "Medium", price: 20 },
    { name: "Large", price: 40 }
  ]
}
```

**New Format:**
```typescript
{
  variationGroups: [
    {
      name: "Size",
      required: true,
      variations: [
        { name: "Small", price: 0 },
        { name: "Medium", price: 20 },
        { name: "Large", price: 40 }
      ]
    }
  ]
}
```

### Converting Existing Items

Run this migration to convert existing variations to groups:

```sql
-- For each item with variations, create a default "Size" group
INSERT INTO variation_groups (menu_item_id, name, required, sort_order)
SELECT DISTINCT 
  v.menu_item_id,
  'Size' as name,
  true as required,
  0 as sort_order
FROM variations v
WHERE v.variation_group = 'default'
AND NOT EXISTS (
  SELECT 1 FROM variation_groups vg 
  WHERE vg.menu_item_id = v.menu_item_id
);

-- Update variations to belong to "Size" group
UPDATE variations
SET variation_group = 'Size'
WHERE variation_group = 'default';
```

---

## 📊 Common Use Cases

### 1. Drinks (Coffee, Tea, Smoothies)
- **Size**: Small, Medium, Large
- **Temperature**: Hot, Cold, Iced
- **Sweetness**: No Sugar, Less Sweet, Regular, Extra Sweet
- **Milk**: Regular, Oat, Almond, Soy, Coconut

### 2. Food (Burgers, Sandwiches)
- **Size**: Regular, Large
- **Bread Type**: White, Wheat, Sourdough, Gluten-free
- **Cooking Level**: Rare, Medium Rare, Medium, Well Done

### 3. Pizza
- **Size**: Personal, Regular, Large, Family
- **Crust**: Thin, Regular, Thick, Stuffed
- **Cheese**: Regular, Extra, Triple

### 4. Pasta
- **Size**: Half Order, Full Order, Family Size
- **Pasta Type**: Spaghetti, Penne, Fettuccine, Linguine
- **Sauce**: Marinara, Alfredo, Carbonara, Pesto

### 5. Fried Items (Fries, Chicken)
- **Size**: Regular, Large, Extra Large
- **Style**: Original, Spicy, Extra Crispy
- **Coating**: Plain, Breaded, Battered

---

## 🎯 Best Practices

### 1. Group Organization
- ✅ Use clear, descriptive group names
- ✅ Order groups from most to least important
- ✅ Mark essential selections as "Required"
- ✅ Limit to 3-5 groups per item (avoid overwhelming customers)

### 2. Pricing Strategy
- ✅ Use ₱0 for default/standard options
- ✅ Add cost for premium options
- ✅ Show price adjustments clearly (+₱20, not just 20)
- ✅ Calculate and display total price in real-time

### 3. Naming Conventions
- ✅ Group names: Title Case (Size, Temperature, Milk Type)
- ✅ Variation names: Title Case (Small, Medium, Large)
- ✅ Keep names short and clear
- ✅ Avoid abbreviations unless commonly understood

### 4. UI/UX
- ✅ Display required groups first
- ✅ Pre-select default option if applicable
- ✅ Use visual indicators for selection state
- ✅ Show running price total
- ✅ Validate before adding to cart

---

## 🐛 Troubleshooting

### Issue: Variations not showing
**Solution:** Check that `variation_group` matches group `name` exactly

### Issue: Price calculation wrong
**Solution:** Ensure all prices are numbers, not strings

### Issue: Can't save item
**Solution:** Verify each group has at least one variation

### Issue: Old items not working
**Solution:** System supports backward compatibility - no action needed

---

## 🚀 Future Enhancements

1. **Default Selection**: Auto-select most popular option
2. **Conditional Groups**: Show/hide groups based on other selections
3. **Group Dependencies**: If Size=Large, show Extra Toppings group
4. **Quantity per Variation**: Track inventory per variation (Small vs Large)
5. **Variation Images**: Show image for each variation option
6. **Popular Combinations**: Suggest commonly ordered combinations

---

## 📚 Related Documentation

- **`ADD_MENU_ITEMS_ANALYSIS.md`**: Complete menu item creation guide
- **`MENU_ITEMS_ANALYSIS.md`**: Menu items system overview
- **Migration File**: `supabase/migrations/20251019000000_add_variation_groups.sql`

---

## 🎉 Summary

The **Variation Groups** feature provides:

✅ **Flexibility**: Multiple types of variations per item  
✅ **Control**: Required vs optional selections  
✅ **Clarity**: Organized by logical groups  
✅ **Compatibility**: Works with existing system  
✅ **User-Friendly**: Intuitive admin and customer UIs  

This system enables restaurants to offer highly customizable menu items while maintaining a clear and organized structure for both admins and customers.

---

*Last Updated: October 19, 2025*

