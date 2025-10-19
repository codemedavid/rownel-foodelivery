/**
 * Quick Inventory Status Check
 * 
 * This script provides a quick diagnostic of the inventory system without
 * requiring full test setup. It checks for common issues.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Try to load .env file
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

console.log('\n🔍 INVENTORY SYSTEM DIAGNOSTIC CHECK\n');
console.log('='.repeat(60));

async function checkInventoryStatus() {
  try {
    // Check 1: Database Connection
    console.log('\n✓ Checking database connection...');
    const { data: testConnection, error: connError } = await supabase
      .from('menu_items')
      .select('count')
      .limit(1);
    
    if (connError) {
      console.error('  ❌ Database connection failed:', connError.message);
      return;
    }
    console.log('  ✅ Connected to database');

    // Check 2: Inventory Columns Exist
    console.log('\n✓ Checking inventory columns...');
    const { data: sampleItem } = await supabase
      .from('menu_items')
      .select('track_inventory, stock_quantity, low_stock_threshold, available')
      .limit(1)
      .single();
    
    if (sampleItem && 'track_inventory' in sampleItem) {
      console.log('  ✅ Inventory columns present');
    } else {
      console.log('  ⚠️  Inventory columns may be missing - run migration');
    }

    // Check 3: Count Items with Tracking
    console.log('\n✓ Analyzing inventory tracking...');
    const { data: allItems } = await supabase
      .from('menu_items')
      .select('id, name, track_inventory, stock_quantity, low_stock_threshold, available');

    if (!allItems || allItems.length === 0) {
      console.log('  ⚠️  No menu items found in database');
      return;
    }

    const total = allItems.length;
    const tracked = allItems.filter(i => i.track_inventory).length;
    const untracked = total - tracked;
    const lowStock = allItems.filter(i => 
      i.track_inventory && 
      i.stock_quantity !== null && 
      i.stock_quantity <= i.low_stock_threshold
    ).length;
    const available = allItems.filter(i => i.available).length;
    const unavailable = total - available;

    console.log(`  📊 Total Items: ${total}`);
    console.log(`  📦 Tracking Enabled: ${tracked}`);
    console.log(`  📦 Tracking Disabled: ${untracked}`);
    console.log(`  ⚠️  Low Stock Items: ${lowStock}`);
    console.log(`  ✅ Available Items: ${available}`);
    console.log(`  ❌ Unavailable Items: ${unavailable}`);

    // Check 4: List Low Stock Items
    if (lowStock > 0) {
      console.log('\n⚠️  Low Stock Items:');
      allItems
        .filter(i => 
          i.track_inventory && 
          i.stock_quantity !== null && 
          i.stock_quantity <= i.low_stock_threshold
        )
        .forEach(item => {
          console.log(`     • ${item.name}`);
          console.log(`       Stock: ${item.stock_quantity}, Threshold: ${item.low_stock_threshold}, Available: ${item.available}`);
        });
    }

    // Check 5: Test Trigger Function
    console.log('\n✓ Testing trigger function...');
    const trackedItems = allItems.filter(i => i.track_inventory);
    
    if (trackedItems.length > 0) {
      const testItem = trackedItems[0];
      
      // Try to update an item to test trigger
      const { data: updated, error: updateError } = await supabase
        .from('menu_items')
        .update({ stock_quantity: testItem.stock_quantity })
        .eq('id', testItem.id)
        .select('available, stock_quantity, low_stock_threshold')
        .single();

      if (updateError) {
        console.log('  ⚠️  Could not test trigger:', updateError.message);
      } else {
        const shouldBeAvailable = updated.stock_quantity > updated.low_stock_threshold;
        const isAvailable = updated.available;
        
        if (shouldBeAvailable === isAvailable) {
          console.log('  ✅ Trigger working correctly');
        } else {
          console.log('  ❌ Trigger may not be working!');
          console.log(`     Expected available: ${shouldBeAvailable}, Got: ${isAvailable}`);
          console.log(`     Stock: ${updated.stock_quantity}, Threshold: ${updated.low_stock_threshold}`);
        }
      }
    } else {
      console.log('  ⚠️  No tracked items to test trigger');
    }

    // Check 6: Test Stock Deduction Function
    console.log('\n✓ Testing stock deduction function...');
    const { error: rpcError } = await supabase.rpc('decrement_menu_item_stock', {
      items: []  // Empty call just to check if function exists
    });

    if (rpcError) {
      if (rpcError.code === '42883') {
        console.log('  ❌ Stock deduction function NOT FOUND!');
        console.log('     Run migration: 20250902090000_inventory_management.sql');
      } else {
        console.log('  ⚠️  Function error:', rpcError.message);
      }
    } else {
      console.log('  ✅ Stock deduction function exists');
    }

    // Check 7: Recent Orders Impact
    console.log('\n✓ Checking recent orders...');
    const { data: recentOrders, error: ordersError } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!ordersError && recentOrders && recentOrders.length > 0) {
      console.log(`  📦 ${recentOrders.length} recent orders found`);
      console.log(`     Most recent: ${new Date(recentOrders[0].created_at).toLocaleString()}`);
    } else {
      console.log('  ℹ️  No recent orders found');
    }

    // Check 8: Potential Issues
    console.log('\n✓ Checking for potential issues...');
    const issues = [];

    // Issue: Items with tracking but null stock
    const trackingWithNullStock = allItems.filter(i => 
      i.track_inventory && i.stock_quantity === null
    );
    if (trackingWithNullStock.length > 0) {
      issues.push(`${trackingWithNullStock.length} items have tracking enabled but null stock`);
    }

    // Issue: Negative stock (shouldn't happen)
    const negativeStock = allItems.filter(i => 
      i.stock_quantity !== null && i.stock_quantity < 0
    );
    if (negativeStock.length > 0) {
      issues.push(`${negativeStock.length} items have NEGATIVE stock (critical!)`);
    }

    // Issue: Available items with zero/low stock
    const availableButLowStock = allItems.filter(i => 
      i.track_inventory && 
      i.available && 
      i.stock_quantity !== null &&
      i.stock_quantity <= i.low_stock_threshold
    );
    if (availableButLowStock.length > 0) {
      issues.push(`${availableButLowStock.length} items are available but stock ≤ threshold (trigger issue?)`);
    }

    if (issues.length === 0) {
      console.log('  ✅ No issues detected');
    } else {
      console.log('  ⚠️  Issues found:');
      issues.forEach(issue => console.log(`     • ${issue}`));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    
    if (issues.length === 0 && rpcError === null && tracked > 0) {
      console.log('✅ Inventory system appears to be working correctly!');
    } else if (tracked === 0) {
      console.log('ℹ️  Inventory tracking is not enabled for any items');
      console.log('   Enable tracking in Admin Dashboard → Inventory Management');
    } else {
      console.log('⚠️  Some issues detected - review the checks above');
    }

    console.log('\n💡 Next Steps:');
    if (tracked === 0) {
      console.log('   1. Enable tracking for items in Admin Dashboard');
      console.log('   2. Set stock quantities and thresholds');
    }
    if (lowStock > 0) {
      console.log('   • Restock low stock items');
    }
    if (rpcError) {
      console.log('   • Run database migration for stock deduction function');
    }
    if (issues.length > 0) {
      console.log('   • Fix identified issues above');
    }

    console.log('\n📖 For detailed testing, run: npm run test:inventory');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
  }
}

checkInventoryStatus();

