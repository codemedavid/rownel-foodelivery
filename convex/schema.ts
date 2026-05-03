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
    merchantLatitude: v.optional(v.float64()),
    merchantLongitude: v.optional(v.float64()),
    distanceKm: v.optional(v.float64()),
    deliveryFee: v.optional(v.float64()),
    deliveryFeeBreakdown: v.optional(v.any()),
    deliveryMode: v.optional(v.union(v.literal("priority"), v.literal("economy"))),
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
      v.literal("out_for_delivery"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    ipAddress: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    staffId: v.optional(v.string()),
    assignedRiderId: v.optional(v.string()),
    riderAssignedAt: v.optional(v.float64()),
    pickedUpAt: v.optional(v.float64()),
    deliveredAt: v.optional(v.float64()),
    riderEarning: v.optional(v.float64()),
    payoutId: v.optional(v.id("payouts")),
  })
    .index("by_merchant", ["merchantId"])
    .index("by_status", ["status"])
    .index("by_merchant_and_status", ["merchantId", "status"])
    .index("by_contact_number", ["contactNumber"])
    .index("by_assigned_rider", ["assignedRiderId"])
    .index("by_payout", ["payoutId"]),

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
    merchantId: v.optional(v.string()),
    merchantIds: v.optional(v.array(v.string())),
    allMerchants: v.optional(v.boolean()),
    isActive: v.boolean(),
    createdAt: v.optional(v.float64()),
  })
    .index("by_supabase_user", ["supabaseUserId"]),

  riderPresence: defineTable({
    supabaseUserId: v.string(),
    currentLatitude: v.optional(v.float64()),
    currentLongitude: v.optional(v.float64()),
    lastLocationUpdate: v.optional(v.float64()),
    status: v.union(
      v.literal("offline"),
      v.literal("available"),
      v.literal("busy")
    ),
    locationPermission: v.optional(
      v.union(
        v.literal("granted"),
        v.literal("denied"),
        v.literal("unknown")
      )
    ),
  })
    .index("by_supabase_user", ["supabaseUserId"])
    .index("by_status", ["status"]),

  orderOffers: defineTable({
    orderId: v.id("orders"),
    riderId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("expired")
    ),
    offeredAt: v.float64(),
    expiresAt: v.float64(),
    distanceKm: v.optional(v.float64()),
    respondedAt: v.optional(v.float64()),
  })
    .index("by_order", ["orderId"])
    .index("by_rider_and_status", ["riderId", "status"])
    .index("by_order_and_status", ["orderId", "status"]),

  orderMessages: defineTable({
    orderId: v.id("orders"),
    senderType: v.union(v.literal("customer"), v.literal("rider")),
    senderId: v.string(),
    text: v.string(),
    readAt: v.optional(v.float64()),
  })
    .index("by_order", ["orderId"]),

  dispatchSettings: defineTable({
    key: v.string(),
    offerRadiusKm: v.float64(),
    offerExpiryMs: v.float64(),
    maxConcurrentOffers: v.float64(),
    locationStaleMs: v.float64(),
    dispatchOnCreate: v.boolean(),
    maxConcurrentOrdersPerRider: v.optional(v.float64()),
    batchTimeWindowMs: v.optional(v.float64()),
    batchProximityKm: v.optional(v.float64()),
    updatedAt: v.optional(v.float64()),
  }).index("by_key", ["key"]),

  payouts: defineTable({
    riderId: v.string(),
    amount: v.float64(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("cancelled")
    ),
    notes: v.optional(v.string()),
    periodFrom: v.optional(v.float64()),
    periodTo: v.optional(v.float64()),
    orderIds: v.optional(v.array(v.string())),
    createdAt: v.float64(),
    paidAt: v.optional(v.float64()),
    createdBy: v.string(),
  })
    .index("by_rider", ["riderId"])
    .index("by_status", ["status"])
    .index("by_rider_and_status", ["riderId", "status"]),

  riderRatings: defineTable({
    orderId: v.id("orders"),
    riderId: v.string(),
    customerContact: v.string(),
    rating: v.float64(),
    comment: v.optional(v.string()),
  })
    .index("by_rider", ["riderId"])
    .index("by_order", ["orderId"]),
});
