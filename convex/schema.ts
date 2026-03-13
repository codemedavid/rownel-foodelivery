import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  orders: defineTable({
    merchantId: v.string(),
    customerName: v.string(),
    contactNumber: v.string(),
    serviceType: v.union(
      v.literal("dine-in"),
      v.literal("pickup"),
      v.literal("delivery")
    ),
    address: v.optional(v.string()),
    deliveryLatitude: v.optional(v.float64()),
    deliveryLongitude: v.optional(v.float64()),
    distanceKm: v.optional(v.float64()),
    deliveryFee: v.optional(v.float64()),
    deliveryFeeBreakdown: v.optional(v.any()),
    pickupTime: v.optional(v.string()),
    partySize: v.optional(v.float64()),
    dineInTime: v.optional(v.string()),
    paymentMethod: v.string(),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    total: v.float64(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    ipAddress: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    staffId: v.optional(v.string()),
  })
    .index("by_merchant", ["merchantId"])
    .index("by_status", ["status"])
    .index("by_merchant_and_status", ["merchantId", "status"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    itemId: v.string(),
    name: v.string(),
    variation: v.optional(v.any()),
    addOns: v.optional(v.any()),
    unitPrice: v.float64(),
    quantity: v.float64(),
    subtotal: v.float64(),
  })
    .index("by_order", ["orderId"]),

  staff: defineTable({
    supabaseUserId: v.string(),
    email: v.string(),
    name: v.string(),
    merchantId: v.string(),
    isActive: v.boolean(),
  })
    .index("by_supabase_user", ["supabaseUserId"])
    .index("by_merchant", ["merchantId"]),
});
