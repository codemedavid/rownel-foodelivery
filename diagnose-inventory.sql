-- ============================================
-- INVENTORY SYSTEM DIAGNOSTIC QUERIES
-- ============================================
-- Run these queries in your Supabase SQL Editor
-- to diagnose inventory system issues

-- Query 1: Check if inventory columns exist
-- ============================================
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns
WHERE table_name = 'menu_items'
    AND column_name IN ('track_inventory', 'stock_quantity', 'low_stock_threshold')
ORDER BY column_name;

-- Expected Output:
-- low_stock_threshold | integer | NO
-- stock_quantity      | integer | YES
-- track_inventory     | boolean | NO


-- Query 2: Check if trigger exists
-- ============================================
SELECT 
    tgname as trigger_name,
    tgenabled as enabled
FROM pg_trigger
WHERE tgname = 'trg_sync_menu_item_availability';

-- Expected Output:
-- trg_sync_menu_item_availability | O (enabled)


-- Query 3: Check if stock deduction function exists
-- ============================================
SELECT 
    proname as function_name,
    prosrc as source_code
FROM pg_proc
WHERE proname = 'decrement_menu_item_stock';

-- Expected Output: Should return the function details


-- Query 4: Inventory Status Overview
-- ============================================
SELECT 
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE track_inventory = true) as items_tracked,
    COUNT(*) FILTER (WHERE track_inventory = false) as items_not_tracked,
    COUNT(*) FILTER (WHERE track_inventory = true AND stock_quantity IS NOT NULL) as items_with_stock,
    COUNT(*) FILTER (WHERE track_inventory = true AND stock_quantity <= low_stock_threshold) as items_low_stock,
    COUNT(*) FILTER (WHERE available = true) as items_available,
    COUNT(*) FILTER (WHERE available = false) as items_unavailable
FROM menu_items;


-- Query 5: List all tracked items with their status
-- ============================================
SELECT 
    id,
    name,
    track_inventory,
    stock_quantity,
    low_stock_threshold,
    available,
    CASE 
        WHEN NOT track_inventory THEN '⚪ Not Tracking'
        WHEN stock_quantity > low_stock_threshold THEN '🟢 In Stock'
        WHEN stock_quantity <= low_stock_threshold AND stock_quantity > 0 THEN '🟠 Low Stock'
        WHEN stock_quantity = 0 THEN '🔴 Out of Stock'
        ELSE '⚠️ Unknown'
    END as status,
    CASE 
        WHEN track_inventory AND available AND stock_quantity <= low_stock_threshold THEN '⚠️ ISSUE: Available but low stock'
        WHEN track_inventory AND NOT available AND stock_quantity > low_stock_threshold THEN '⚠️ ISSUE: Unavailable but has stock'
        ELSE '✅ OK'
    END as consistency_check
FROM menu_items
WHERE track_inventory = true
ORDER BY stock_quantity ASC NULLS LAST;


-- Query 6: Find potential issues
-- ============================================
-- Items with tracking enabled but null stock
SELECT 
    'Tracking enabled but null stock' as issue_type,
    id,
    name,
    track_inventory,
    stock_quantity,
    low_stock_threshold,
    available
FROM menu_items
WHERE track_inventory = true AND stock_quantity IS NULL

UNION ALL

-- Items with negative stock (critical issue!)
SELECT 
    'NEGATIVE STOCK (CRITICAL)' as issue_type,
    id,
    name,
    track_inventory,
    stock_quantity,
    low_stock_threshold,
    available
FROM menu_items
WHERE stock_quantity < 0

UNION ALL

-- Items available but stock <= threshold
SELECT 
    'Available but stock <= threshold' as issue_type,
    id,
    name,
    track_inventory,
    stock_quantity,
    low_stock_threshold,
    available
FROM menu_items
WHERE track_inventory = true 
    AND available = true 
    AND stock_quantity IS NOT NULL 
    AND stock_quantity <= low_stock_threshold

UNION ALL

-- Items unavailable but stock > threshold
SELECT 
    'Unavailable but stock > threshold' as issue_type,
    id,
    name,
    track_inventory,
    stock_quantity,
    low_stock_threshold,
    available
FROM menu_items
WHERE track_inventory = true 
    AND available = false 
    AND stock_quantity IS NOT NULL 
    AND stock_quantity > low_stock_threshold;


-- Query 7: Test the trigger manually
-- ============================================
-- This updates an item's stock to the same value, which should trigger the availability sync
DO $$
DECLARE
    test_item_id UUID;
BEGIN
    -- Get a tracked item
    SELECT id INTO test_item_id
    FROM menu_items
    WHERE track_inventory = true
    LIMIT 1;

    IF test_item_id IS NOT NULL THEN
        -- Force trigger to fire
        UPDATE menu_items
        SET stock_quantity = stock_quantity
        WHERE id = test_item_id;
        
        RAISE NOTICE 'Trigger test completed for item: %', test_item_id;
    ELSE
        RAISE NOTICE 'No tracked items found to test';
    END IF;
END $$;


-- Query 8: View recent order impact on inventory
-- ============================================
SELECT 
    oi.item_id,
    mi.name,
    mi.track_inventory,
    mi.stock_quantity as current_stock,
    mi.low_stock_threshold,
    mi.available,
    SUM(oi.quantity) as total_ordered_recently,
    COUNT(DISTINCT o.id) as number_of_orders,
    MAX(o.created_at) as last_order_time
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
JOIN menu_items mi ON oi.item_id::uuid = mi.id
WHERE o.created_at > NOW() - INTERVAL '7 days'
    AND mi.track_inventory = true
GROUP BY oi.item_id, mi.name, mi.track_inventory, mi.stock_quantity, mi.low_stock_threshold, mi.available
ORDER BY total_ordered_recently DESC;


-- Query 9: Manually fix inconsistent availability
-- ============================================
-- CAUTION: This will override availability for all tracked items based on stock
-- Uncomment and run if you find inconsistencies

/*
UPDATE menu_items
SET available = CASE 
    WHEN stock_quantity > low_stock_threshold THEN true
    ELSE false
END
WHERE track_inventory = true;

SELECT 
    COUNT(*) as items_updated,
    COUNT(*) FILTER (WHERE available = true) as now_available,
    COUNT(*) FILTER (WHERE available = false) as now_unavailable
FROM menu_items
WHERE track_inventory = true;
*/


-- Query 10: Test stock deduction function
-- ============================================
-- This tests the decrement function with a dummy call
-- Replace 'YOUR_ITEM_ID_HERE' with an actual item ID

/*
-- First, check current stock
SELECT id, name, stock_quantity FROM menu_items WHERE id = 'YOUR_ITEM_ID_HERE';

-- Deduct 1 from stock
SELECT decrement_menu_item_stock('[{"id": "YOUR_ITEM_ID_HERE", "quantity": 1}]'::jsonb);

-- Check new stock (should be 1 less)
SELECT id, name, stock_quantity, available FROM menu_items WHERE id = 'YOUR_ITEM_ID_HERE';
*/


-- ============================================
-- QUICK FIX: Re-enable tracking for an item
-- ============================================
/*
UPDATE menu_items
SET 
    track_inventory = true,
    stock_quantity = 100,  -- Set your desired stock
    low_stock_threshold = 10  -- Set your desired threshold
WHERE id = 'YOUR_ITEM_ID_HERE';
*/


-- ============================================
-- QUICK FIX: Disable tracking for an item
-- ============================================
/*
UPDATE menu_items
SET 
    track_inventory = false,
    stock_quantity = NULL,
    available = true
WHERE id = 'YOUR_ITEM_ID_HERE';
*/

