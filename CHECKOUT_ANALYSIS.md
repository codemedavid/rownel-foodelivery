# Checkout Ordering Process Analysis

## Overview
This document provides a comprehensive analysis of the checkout and ordering system in the ClickEats application.

---

## 1. Architecture Overview

### Components Involved
1. **Frontend Components**
   - `Checkout.tsx` - Main checkout UI with two-step process
   - `Cart.tsx` - Shopping cart display
   - `useOrders.ts` - Order management hook
   - `useCart.ts` - Cart state management

2. **Database Tables**
   - `orders` - Customer order information
   - `order_items` - Individual line items for each order
   - `menu_items` - Product catalog with inventory tracking

3. **External Services**
   - Cloudinary - Receipt image storage
   - Facebook Messenger - Order confirmation channel

---

## 2. Order Flow

### Step 1: Cart Management
**Location:** `src/components/Cart.tsx`

**Features:**
- Display cart items with variations and add-ons
- Quantity adjustment (+/- buttons)
- Remove items from cart
- Calculate total price
- Clear entire cart

**Key Functions:**
```typescript
updateQuantity(id: string, quantity: number)
removeFromCart(id: string)
clearCart()
getTotalPrice()
```

### Step 2: Checkout - Customer Details
**Location:** `src/components/Checkout.tsx` (Lines 228-468)

**Required Information:**
1. **Customer Info**
   - Full Name (required)
   - Contact Number (required)

2. **Service Type Selection** (required)
   - Dine-in
   - Pickup
   - Delivery

3. **Service-Specific Details:**
   - **Dine-in:**
     - Party Size (1-20 people)
     - Preferred Time (datetime picker)
   
   - **Pickup:**
     - Pickup Time (5-10 min, 15-20 min, 25-30 min, or custom)
   
   - **Delivery:**
     - Delivery Address (required)
     - Landmark (optional)

4. **Special Instructions** (optional)
   - Notes field for custom requests

**Validation:**
```typescript
isDetailsValid = customerName && contactNumber && 
  (serviceType !== 'delivery' || address) && 
  (serviceType !== 'pickup' || (pickupTime !== 'custom' || customTime)) &&
  (serviceType !== 'dine-in' || (partySize > 0 && dineInTime))
```

### Step 3: Checkout - Payment
**Location:** `src/components/Checkout.tsx` (Lines 470-703)

**Features:**
1. **Payment Method Selection**
   - Dynamically loaded from database
   - Displays payment details (account number, name, QR code)

2. **Receipt Upload** (Optional)
   - Drag & drop or click to upload
   - Supports: JPEG, PNG, WEBP, HEIC/HEIF
   - Max size: 10MB
   - Image compression before upload (1200px, 80% quality)
   - Uploads to Cloudinary on order placement

3. **Order Summary Review**
   - Customer details confirmation
   - Full item list with variations/add-ons
   - Total price

---

## 3. Order Creation Process

### Database Transaction Flow
**Location:** `src/hooks/useOrders.ts` (Lines 104-203)

#### Phase 1: Inventory Check
```typescript
// Check stock availability before creating order
const { data: inventorySnapshot } = await supabase
  .from('menu_items')
  .select('id, track_inventory, stock_quantity')
  .in('id', stockedItemIds);

// Validate sufficient stock
const insufficientItem = inventorySnapshot?.find((row) =>
  row.track_inventory && (row.stock_quantity ?? 0) < stockAdjustments[row.id]
);

if (insufficientItem) {
  throw new Error(`Insufficient stock for ${offending?.name}`);
}
```

#### Phase 2: Create Order Record
```typescript
const { data: order } = await supabase
  .from('orders')
  .insert({
    customer_name: payload.customerName,
    contact_number: payload.contactNumber,
    service_type: payload.serviceType,
    address: payload.address ?? null,
    pickup_time: payload.pickupTime ?? null,
    party_size: payload.partySize ?? null,
    dine_in_time: payload.dineInTime ? new Date(payload.dineInTime).toISOString() : null,
    payment_method: payload.paymentMethod,
    reference_number: payload.referenceNumber ?? null,
    notes: payload.notes ?? null,
    total: payload.total,
    ip_address: clientIp ?? null,
    receipt_url: payload.receiptUrl ?? null,
  })
  .select()
  .single();
```

#### Phase 3: Create Order Items
```typescript
const orderItems = payload.items.map((ci) => ({
  order_id: order.id,
  item_id: ci.menuItemId || ci.id,
  name: ci.name,
  variation: ci.selectedVariation ? { 
    id: ci.selectedVariation.id, 
    name: ci.selectedVariation.name, 
    price: ci.selectedVariation.price 
  } : null,
  add_ons: ci.selectedAddOns && ci.selectedAddOns.length > 0
    ? ci.selectedAddOns.map((a) => ({ 
        id: a.id, 
        name: a.name, 
        price: a.price, 
        quantity: a.quantity ?? 1 
      }))
    : null,
  unit_price: ci.totalPrice,
  quantity: ci.quantity,
  subtotal: ci.totalPrice * ci.quantity,
}));

await supabase.from('order_items').insert(orderItems);
```

#### Phase 4: Decrement Inventory
```typescript
// Decrement tracked inventory for purchased items
await supabase.rpc('decrement_menu_item_stock', {
  items: inventoryPayload,
});
```

---

## 4. Security & Rate Limiting

### IP-Based Rate Limiting
**Location:** `supabase/migrations/20250901171000_orders_ip_rate_limit.sql`

**Features:**
- 60-second cooldown per IP address
- Prevents spam/duplicate orders
- Trigger: `prevent_spam_orders_per_ip()`

**Implementation:**
```sql
SELECT COUNT(*) INTO recent_count
FROM orders
WHERE ip_address = NEW.ip_address
  AND created_at >= (now() - interval '60 seconds');

IF recent_count > 0 THEN
  RAISE EXCEPTION 'Rate limit: Please wait 60 seconds before placing another order.';
END IF;
```

### Hardened Rate Limiting
**Location:** `supabase/migrations/20250901172000_orders_rate_limit_hardened.sql`

**Additional Checks:**
- Contact number rate limiting (60-second cooldown)
- Requires at least one identifier (IP or phone)
- Prevents orders with missing identifiers

```sql
-- Check by contact number when available
IF NEW.contact_number IS NOT NULL AND length(trim(NEW.contact_number)) > 0 THEN
  SELECT COUNT(*) INTO recent_phone_count
  FROM orders
  WHERE contact_number = NEW.contact_number
    AND created_at >= (now() - interval '60 seconds');
END IF;
```

### IP Address Extraction
**Location:** `supabase/migrations/20250901171500_orders_ip_from_headers.sql`

**Features:**
- Automatically extracts IP from request headers
- Supports `x-forwarded-for` and `x-real-ip` headers
- Falls back to manual IP if headers unavailable

---

## 5. Inventory Management

### Automatic Availability Sync
**Location:** `supabase/migrations/20250902090000_inventory_management.sql`

**Trigger:** `sync_menu_item_availability()`

**Behavior:**
- Automatically sets `available = false` when stock ≤ low_stock_threshold
- Sets `available = true` when stock > low_stock_threshold
- Only applies to items with `track_inventory = true`

```sql
IF NEW.stock_quantity <= NEW.low_stock_threshold THEN
  NEW.available := false;
ELSE
  NEW.available := true;
END IF;
```

### Stock Decrement Function
**Function:** `decrement_menu_item_stock(items jsonb)`

**Features:**
- Batch decrement for multiple items
- Prevents negative stock values
- Only affects items with `track_inventory = true`

```sql
UPDATE menu_items
SET stock_quantity = GREATEST(COALESCE(stock_quantity, 0) - qty, 0)
WHERE track_inventory = true
  AND id::text = entry->>'id';
```

---

## 6. Receipt Upload Process

### Upload Flow
**Location:** `src/components/Checkout.tsx` (Lines 90-116)

**Steps:**
1. User selects receipt image
2. Preview generated locally
3. On "Place Order" click:
   - Compress image (1200px, 80% quality)
   - Upload to Cloudinary
   - Store URL in database
   - Create order with receipt URL

**Error Handling:**
- Upload failures prevent order creation
- User can retry or continue without receipt
- Error messages displayed to user

```typescript
if (receiptFile && !receiptUrl) {
  try {
    setUploadingReceipt(true);
    const compressedFile = await compressImage(receiptFile, 1200, 0.8);
    uploadedReceiptUrl = await uploadReceiptToCloudinary(compressedFile);
    setReceiptUrl(uploadedReceiptUrl);
  } catch (err) {
    setUploadError(message);
    return; // Stop order placement
  }
}
```

---

## 7. Order Confirmation

### Messenger Integration
**Location:** `src/components/Checkout.tsx` (Lines 151-220)

**Process:**
1. Format order details as text
2. Copy to clipboard (fallback)
3. Open Facebook Messenger with pre-filled message
4. User confirms order in Messenger

**Order Details Format:**
```
🛒 Row-Nel FooDelivery ORDER

👤 Customer: [Name]
📞 Contact: [Phone]
📍 Service: [Type]
🏠 Address: [if delivery]
⏰ Pickup Time: [if pickup]
👥 Party Size: [if dine-in]
🕐 Preferred Time: [if dine-in]

📋 ORDER DETAILS:
• [Item] (variation) + [add-ons] x[quantity] - ₱[price]
...

💰 TOTAL: ₱[total]

💳 Payment: [Method]
📸 Payment Receipt: [URL if uploaded] OR
📸 Payment Screenshot: Please attach your payment receipt screenshot

📝 Notes: [if any]

Please confirm this order to proceed. Thank you for choosing ClickEats! 🥟
```

**Receipt URL in Message:**
- If customer uploads a receipt, the Cloudinary URL is automatically included in the message
- Recipient can click the link to view the receipt image directly
- Makes it easy to verify payment without downloading files

**Messenger Link:**
```typescript
const pageId = 'RowNelFooDelivery';
const encodedMessage = encodeURIComponent(orderDetails);
const webLink = `https://m.me/${pageId}?text=${encodedMessage}`;

if (isMobile) {
  window.location.href = webLink;
} else {
  window.open(webLink, '_blank');
}
```

---

## 8. Error Handling

### Order Creation Errors
**Types:**
1. **Insufficient Stock**
   - Message: "Insufficient stock for [item name]"
   - Action: Prevents order creation

2. **Rate Limit Exceeded**
   - Message: "Too many orders: Please wait 1 minute before placing another order."
   - Action: Blocks order creation for 60 seconds

3. **Missing Identifiers**
   - Message: "Too many orders: Please wait 1 minute before placing another order."
   - Action: Blocks order creation

4. **Receipt Upload Failure**
   - Message: "Upload failed: [error]. Please try again or continue without receipt."
   - Action: Prevents order creation, allows retry

### Database Errors
- Catch and log all database errors
- Display user-friendly error messages
- Maintain transaction integrity

---

## 9. Real-time Updates

### Order Monitoring
**Location:** `src/hooks/useOrders.ts` (Lines 205-222)

**Features:**
- Real-time order updates via Supabase subscriptions
- Automatic refresh on order status changes
- Admin dashboard updates in real-time

```typescript
const channel = supabase
  .channel('orders-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
    fetchOrders();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
    fetchOrders();
  })
  .subscribe();
```

---

## 10. Data Flow Diagram

```
User Cart
   ↓
[Cart Component]
   ↓
[Checkout - Step 1: Details]
   ↓
[Checkout - Step 2: Payment]
   ↓
[Receipt Upload to Cloudinary]
   ↓
[Create Order in Database]
   ├─→ Check Inventory
   ├─→ Insert Order Record
   ├─→ Insert Order Items
   └─→ Decrement Stock
   ↓
[Format Order Details]
   ↓
[Copy to Clipboard]
   ↓
[Open Facebook Messenger]
   ↓
[User Confirms Order]
```

---

## 11. Database Schema

### Orders Table
```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  contact_number text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('dine-in','pickup','delivery')),
  address text,
  pickup_time text,
  party_size integer,
  dine_in_time timestamptz,
  payment_method text NOT NULL,
  reference_number text,
  notes text,
  total numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  ip_address text,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Order Items Table
```sql
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  name text NOT NULL,
  variation jsonb,
  add_ons jsonb,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  subtotal numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 12. Key Features Summary

### ✅ Implemented Features
1. **Multi-step checkout process**
2. **Service type selection** (dine-in, pickup, delivery)
3. **Dynamic payment methods**
4. **Receipt upload with Cloudinary**
5. **Inventory tracking and validation**
6. **Rate limiting** (IP and phone number)
7. **Real-time order updates**
8. **Facebook Messenger integration**
9. **Automatic availability management**
10. **Stock decrement on order**
11. **Order history tracking**
12. **Error handling and validation**

### 🔒 Security Features
1. IP-based rate limiting
2. Phone number rate limiting
3. Stock validation before order creation
4. Row-level security (RLS) on all tables
5. Transaction integrity
6. Input validation

### 📊 Performance Optimizations
1. Batch inventory updates
2. Indexed database queries
3. Image compression before upload
4. Real-time subscriptions for updates
5. Efficient stock checking

---

## 13. Recommendations

### Potential Improvements
1. **Order Status Management**
   - Add more granular status tracking
   - Implement order cancellation flow
   - Add estimated delivery time

2. **Payment Integration**
   - Integrate actual payment gateway
   - Add payment confirmation webhook
   - Implement refund processing

3. **Notifications**
   - Email/SMS order confirmations
   - Admin notifications for new orders
   - Customer notifications for status updates

4. **Analytics**
   - Order analytics dashboard
   - Popular items tracking
   - Revenue reports

5. **Inventory Management**
   - Low stock alerts
   - Automatic reorder points
   - Supplier management

6. **Customer Experience**
   - Order tracking page
   - Order history for customers
   - Favorite items
   - Reorder functionality

---

## 14. Testing Checklist

### Functional Tests
- [ ] Add items to cart
- [ ] Update item quantities
- [ ] Remove items from cart
- [ ] Proceed to checkout
- [ ] Fill customer details
- [ ] Select service type
- [ ] Upload receipt image
- [ ] Create order successfully
- [ ] Verify inventory decrement
- [ ] Test rate limiting
- [ ] Test insufficient stock scenario
- [ ] Test error handling

### Edge Cases
- [ ] Empty cart checkout attempt
- [ ] Invalid customer details
- [ ] Missing required fields
- [ ] Large receipt file upload
- [ ] Network failures during upload
- [ ] Simultaneous orders from same IP
- [ ] Out of stock item ordering
- [ ] Custom pickup time entry

---

## Conclusion

The checkout ordering system is well-architected with:
- Clear separation of concerns
- Robust error handling
- Security measures (rate limiting, validation)
- Real-time updates
- Inventory management
- External service integration (Cloudinary, Messenger)

The system handles the complete order lifecycle from cart to confirmation with proper validation, security, and user experience considerations.

