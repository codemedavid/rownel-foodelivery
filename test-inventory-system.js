/**
 * Inventory System Test Script
 * 
 * This script tests the inventory management functionality including:
 * - Database trigger (sync_menu_item_availability)
 * - Stock deduction function (decrement_menu_item_stock)
 * - Inventory tracking enable/disable
 * - Stock quantity updates
 * - Low stock threshold logic
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment variables from .env file
let SUPABASE_URL, SUPABASE_ANON_KEY;

try {
  const envContent = readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key === 'VITE_SUPABASE_URL') SUPABASE_URL = value;
    if (key === 'VITE_SUPABASE_ANON_KEY') SUPABASE_ANON_KEY = value;
  });
} catch (error) {
  console.error('❌ .env file not found or unreadable');
  console.log('\n💡 Please create a .env file with:');
  console.log('   VITE_SUPABASE_URL=your_url');
  console.log('   VITE_SUPABASE_ANON_KEY=your_key\n');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper function to log test results
function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) console.log(`   └─ ${details}`);
  
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

// Helper to create a test menu item
async function createTestItem(name, options = {}) {
  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      merchant_id: options.merchantId || '00000000-0000-0000-0000-000000000000',
      name: name,
      description: 'Test item for inventory testing',
      base_price: 99.99,
      category: 'test-category',
      track_inventory: options.trackInventory || false,
      stock_quantity: options.stockQuantity !== undefined ? options.stockQuantity : null,
      low_stock_threshold: options.lowStockThreshold || 0,
      available: options.available !== undefined ? options.available : true
    })
    .select()
    .single();
  
  return { data, error };
}

// Helper to get item by ID
async function getItem(id) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', id)
    .single();
  
  return { data, error };
}

// Helper to update item
async function updateItem(id, updates) {
  const { data, error } = await supabase
    .from('menu_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  return { data, error };
}

// Helper to delete test items
async function cleanupTestItems() {
  await supabase
    .from('menu_items')
    .delete()
    .like('name', 'TEST_%');
}

// ============================================
// TEST SUITE
// ============================================

console.log('\n🧪 INVENTORY SYSTEM TEST SUITE\n');
console.log('='.repeat(60));

async function runTests() {
  try {
    // Cleanup any previous test items
    console.log('\n📋 Setup: Cleaning up previous test data...\n');
    await cleanupTestItems();

    // ==========================================
    // TEST 1: Database Connection
    // ==========================================
    console.log('\n1️⃣  Testing Database Connection...');
    const { data: merchants, error: dbError } = await supabase
      .from('merchants')
      .select('id')
      .limit(1);
    
    const merchantId = merchants?.[0]?.id;
    logTest(
      'Database Connection',
      !dbError && merchantId,
      dbError ? dbError.message : `Connected (Merchant ID: ${merchantId})`
    );

    if (!merchantId) {
      console.log('\n⚠️  No merchants found in database. Some tests may fail.');
    }

    // ==========================================
    // TEST 2: Create Item Without Tracking
    // ==========================================
    console.log('\n2️⃣  Testing Item Creation (No Tracking)...');
    const { data: item1, error: error1 } = await createTestItem('TEST_NO_TRACKING', {
      merchantId,
      trackInventory: false,
      stockQuantity: null
    });

    logTest(
      'Create item without tracking',
      !error1 && item1,
      error1 ? error1.message : `ID: ${item1?.id}`
    );

    if (item1) {
      logTest(
        'Item available when tracking disabled',
        item1.available === true,
        `available = ${item1.available}`
      );
    }

    // ==========================================
    // TEST 3: Enable Tracking with Stock
    // ==========================================
    console.log('\n3️⃣  Testing Inventory Tracking Enable...');
    const { data: item2, error: error2 } = await createTestItem('TEST_WITH_TRACKING', {
      merchantId,
      trackInventory: true,
      stockQuantity: 50,
      lowStockThreshold: 10
    });

    logTest(
      'Create item with tracking enabled',
      !error2 && item2,
      error2 ? error2.message : `ID: ${item2?.id}`
    );

    if (item2) {
      logTest(
        'Item available when stock > threshold',
        item2.available === true,
        `stock: ${item2.stock_quantity}, threshold: ${item2.low_stock_threshold}, available: ${item2.available}`
      );
    }

    // ==========================================
    // TEST 4: Trigger - Auto Disable on Low Stock
    // ==========================================
    console.log('\n4️⃣  Testing Auto-Disable Trigger...');
    if (item2) {
      const { data: updated, error: updateError } = await updateItem(item2.id, {
        stock_quantity: 5  // Below threshold of 10
      });

      logTest(
        'Trigger: Auto-disable when stock ≤ threshold',
        !updateError && updated && updated.available === false,
        updateError ? updateError.message : `stock: ${updated?.stock_quantity}, threshold: ${updated?.low_stock_threshold}, available: ${updated?.available}`
      );
    }

    // ==========================================
    // TEST 5: Trigger - Auto Enable on Restock
    // ==========================================
    console.log('\n5️⃣  Testing Auto-Enable Trigger...');
    if (item2) {
      const { data: restocked, error: restockError } = await updateItem(item2.id, {
        stock_quantity: 100  // Above threshold
      });

      logTest(
        'Trigger: Auto-enable when stock > threshold',
        !restockError && restocked && restocked.available === true,
        restockError ? restockError.message : `stock: ${restocked?.stock_quantity}, threshold: ${restocked?.low_stock_threshold}, available: ${restocked?.available}`
      );
    }

    // ==========================================
    // TEST 6: Edge Case - Stock Equals Threshold
    // ==========================================
    console.log('\n6️⃣  Testing Edge Case (Stock = Threshold)...');
    if (item2) {
      const { data: edge, error: edgeError } = await updateItem(item2.id, {
        stock_quantity: 10,  // Exactly at threshold
        low_stock_threshold: 10
      });

      logTest(
        'Item disabled when stock = threshold',
        !edgeError && edge && edge.available === false,
        edgeError ? edgeError.message : `stock: ${edge?.stock_quantity}, threshold: ${edge?.low_stock_threshold}, available: ${edge?.available}`
      );
    }

    // ==========================================
    // TEST 7: Zero Stock with Zero Threshold
    // ==========================================
    console.log('\n7️⃣  Testing Zero Stock...');
    const { data: item3, error: error3 } = await createTestItem('TEST_ZERO_STOCK', {
      merchantId,
      trackInventory: true,
      stockQuantity: 0,
      lowStockThreshold: 0
    });

    logTest(
      'Item disabled when stock = 0',
      !error3 && item3 && item3.available === false,
      error3 ? error3.message : `stock: ${item3?.stock_quantity}, available: ${item3?.available}`
    );

    // ==========================================
    // TEST 8: Stock Deduction Function
    // ==========================================
    console.log('\n8️⃣  Testing Stock Deduction Function...');
    if (item2) {
      // First set stock to known value
      await updateItem(item2.id, { stock_quantity: 50, low_stock_threshold: 10 });
      
      const { data: beforeDeduction } = await getItem(item2.id);
      const stockBefore = beforeDeduction?.stock_quantity;

      // Call the decrement function
      const { error: decrementError } = await supabase.rpc('decrement_menu_item_stock', {
        items: [{ id: item2.id, quantity: 5 }]
      });

      const { data: afterDeduction } = await getItem(item2.id);
      const stockAfter = afterDeduction?.stock_quantity;

      logTest(
        'Stock deduction function works',
        !decrementError && stockBefore === 50 && stockAfter === 45,
        decrementError ? decrementError.message : `Before: ${stockBefore}, After: ${stockAfter}, Expected: 45`
      );

      logTest(
        'Item still available after deduction',
        afterDeduction?.available === true,
        `stock: ${stockAfter}, threshold: ${afterDeduction?.low_stock_threshold}, available: ${afterDeduction?.available}`
      );
    }

    // ==========================================
    // TEST 9: Prevent Negative Stock
    // ==========================================
    console.log('\n9️⃣  Testing Negative Stock Prevention...');
    if (item2) {
      // Set stock to 5
      await updateItem(item2.id, { stock_quantity: 5, low_stock_threshold: 0 });
      
      // Try to deduct 10 (should result in 0, not -5)
      await supabase.rpc('decrement_menu_item_stock', {
        items: [{ id: item2.id, quantity: 10 }]
      });

      const { data: result } = await getItem(item2.id);

      logTest(
        'Stock cannot go negative',
        result?.stock_quantity === 0,
        `After deducting 10 from stock of 5: stock = ${result?.stock_quantity} (expected: 0)`
      );
    }

    // ==========================================
    // TEST 10: Batch Stock Deduction
    // ==========================================
    console.log('\n🔟 Testing Batch Stock Deduction...');
    const { data: item4, error: error4 } = await createTestItem('TEST_BATCH_1', {
      merchantId,
      trackInventory: true,
      stockQuantity: 30,
      lowStockThreshold: 5
    });

    const { data: item5, error: error5 } = await createTestItem('TEST_BATCH_2', {
      merchantId,
      trackInventory: true,
      stockQuantity: 40,
      lowStockThreshold: 5
    });

    if (item4 && item5) {
      await supabase.rpc('decrement_menu_item_stock', {
        items: [
          { id: item4.id, quantity: 3 },
          { id: item5.id, quantity: 7 }
        ]
      });

      const { data: batch1 } = await getItem(item4.id);
      const { data: batch2 } = await getItem(item5.id);

      logTest(
        'Batch deduction works for multiple items',
        batch1?.stock_quantity === 27 && batch2?.stock_quantity === 33,
        `Item1: 30→${batch1?.stock_quantity} (expected: 27), Item2: 40→${batch2?.stock_quantity} (expected: 33)`
      );
    }

    // ==========================================
    // TEST 11: Disable Tracking
    // ==========================================
    console.log('\n1️⃣1️⃣  Testing Disable Tracking...');
    if (item2) {
      const { data: disabled, error: disableError } = await updateItem(item2.id, {
        track_inventory: false,
        stock_quantity: null
      });

      logTest(
        'Disabling tracking sets stock to null',
        !disableError && disabled && disabled.stock_quantity === null,
        disableError ? disableError.message : `track_inventory: ${disabled?.track_inventory}, stock_quantity: ${disabled?.stock_quantity}`
      );
    }

    // ==========================================
    // TEST 12: Function Exists Check
    // ==========================================
    console.log('\n1️⃣2️⃣  Testing Database Function Exists...');
    const { data: funcCheck, error: funcError } = await supabase.rpc('decrement_menu_item_stock', {
      items: []
    });

    logTest(
      'decrement_menu_item_stock function exists',
      !funcError || funcError.code === 'PGRST103',
      funcError ? `Error code: ${funcError.code}` : 'Function callable'
    );

    // ==========================================
    // TEST 13: Trigger Exists Check
    // ==========================================
    console.log('\n1️⃣3️⃣  Testing Database Trigger...');
    const { data: item6 } = await createTestItem('TEST_TRIGGER_CHECK', {
      merchantId,
      trackInventory: true,
      stockQuantity: 100,
      lowStockThreshold: 50
    });

    if (item6) {
      // Update multiple times to ensure trigger fires consistently
      const updates = [
        { stock_quantity: 60, expectedAvailable: true },
        { stock_quantity: 50, expectedAvailable: false },
        { stock_quantity: 49, expectedAvailable: false },
        { stock_quantity: 51, expectedAvailable: true }
      ];

      let triggerWorking = true;
      for (const update of updates) {
        const { data: result } = await updateItem(item6.id, { stock_quantity: update.stock_quantity });
        if (result?.available !== update.expectedAvailable) {
          triggerWorking = false;
          console.log(`   ⚠️  Trigger failed: stock=${update.stock_quantity}, expected available=${update.expectedAvailable}, got ${result?.available}`);
        }
      }

      logTest(
        'Trigger fires consistently on updates',
        triggerWorking,
        triggerWorking ? 'All trigger tests passed' : 'Some trigger tests failed'
      );
    }

    // ==========================================
    // CLEANUP
    // ==========================================
    console.log('\n\n🧹 Cleanup: Removing test data...');
    await cleanupTestItems();
    console.log('✓ Test data cleaned up');

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error);
  }

  // ==========================================
  // FINAL REPORT
  // ==========================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📝 Total:  ${testResults.passed + testResults.failed}`);
  
  const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
  console.log(`\n🎯 Success Rate: ${successRate}%`);

  if (testResults.failed > 0) {
    console.log('\n⚠️  FAILED TESTS:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`   ❌ ${t.name}`);
        if (t.details) console.log(`      └─ ${t.details}`);
      });
  }

  console.log('\n' + '='.repeat(60));

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run the tests
runTests();

