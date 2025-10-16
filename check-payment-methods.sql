-- Payment Methods Database Diagnostic Queries
-- Run these queries to inspect the current state of payment methods

-- 1. View all payment methods with merchant information
SELECT 
  pm.id,
  pm.name,
  pm.account_number,
  pm.account_name,
  pm.active,
  pm.sort_order,
  pm.merchant_id,
  m.name as merchant_name,
  m.category as merchant_category,
  pm.created_at,
  pm.updated_at
FROM payment_methods pm
LEFT JOIN merchants m ON pm.merchant_id = m.id
ORDER BY pm.merchant_id, pm.sort_order;

-- 2. Count payment methods per merchant
SELECT 
  m.id as merchant_id,
  m.name as merchant_name,
  COUNT(pm.id) as total_payment_methods,
  COUNT(pm.id) FILTER (WHERE pm.active = true) as active_payment_methods,
  COUNT(pm.id) FILTER (WHERE pm.active = false) as inactive_payment_methods
FROM merchants m
LEFT JOIN payment_methods pm ON m.id = pm.merchant_id
GROUP BY m.id, m.name
ORDER BY m.name;

-- 3. View only active payment methods (what customers see)
SELECT 
  pm.id,
  pm.name,
  pm.account_number,
  pm.account_name,
  pm.qr_code_url,
  pm.sort_order,
  m.name as merchant_name
FROM payment_methods pm
JOIN merchants m ON pm.merchant_id = m.id
WHERE pm.active = true
ORDER BY pm.merchant_id, pm.sort_order;

-- 4. Check for payment methods with placeholder data
SELECT 
  pm.id,
  pm.name,
  pm.account_number,
  pm.account_name,
  m.name as merchant_name,
  CASE 
    WHEN pm.account_number LIKE '%09XX%' OR pm.account_number LIKE '%XXXX%' THEN '⚠️ Placeholder Account Number'
    ELSE '✓ Valid'
  END as validation_status
FROM payment_methods pm
JOIN merchants m ON pm.merchant_id = m.id
WHERE pm.account_number LIKE '%XX%' OR pm.account_number LIKE '%xxxx%';

-- 5. Recent orders with payment method information
SELECT 
  o.id as order_id,
  o.customer_name,
  o.payment_method as payment_method_id,
  pm.name as payment_method_name,
  CASE 
    WHEN pm.id IS NULL THEN '⚠️ Payment method not found or deleted'
    WHEN pm.active = false THEN '⚠️ Payment method is now inactive'
    ELSE '✓ Valid'
  END as status,
  o.total,
  o.created_at
FROM orders o
LEFT JOIN payment_methods pm ON o.payment_method = pm.id
ORDER BY o.created_at DESC
LIMIT 20;

-- 6. Check for orphaned payment methods (merchant doesn't exist)
SELECT 
  pm.id,
  pm.name,
  pm.merchant_id,
  '⚠️ Merchant not found' as issue
FROM payment_methods pm
LEFT JOIN merchants m ON pm.merchant_id = m.id
WHERE m.id IS NULL;

-- 7. Payment method usage statistics
SELECT 
  pm.id,
  pm.name,
  pm.active,
  m.name as merchant_name,
  COUNT(o.id) as times_used,
  SUM(o.total) as total_revenue,
  MAX(o.created_at) as last_used
FROM payment_methods pm
JOIN merchants m ON pm.merchant_id = m.id
LEFT JOIN orders o ON o.payment_method = pm.id
GROUP BY pm.id, pm.name, pm.active, m.name
ORDER BY times_used DESC;

-- 8. Check RLS policies on payment_methods table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'payment_methods';

-- 9. Check table structure and constraints
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'payment_methods'
ORDER BY ordinal_position;

-- 10. Check indexes on payment_methods table
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'payment_methods';

