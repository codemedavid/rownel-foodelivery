import { describe, expect, it } from "vitest";
import { canBatchForRider, type ActiveOrder, type BatchSettings, type CandidateOrder } from "./batching";

const SETTINGS: BatchSettings = {
  maxConcurrentOrdersPerRider: 3,
  batchTimeWindowMs: 600_000, // 10 min
  batchProximityKm: 2.0,
};

const NOW = 1_000_000_000_000;

// Merchant A: Makati CBD
const MERCHANT_A = { lat: 14.5547, lng: 121.0244 };
// Merchant B: 1 km from A
const MERCHANT_B = { lat: 14.5637, lng: 121.0244 };
// Merchant C: 5 km from A (out of proximity)
const MERCHANT_C = { lat: 14.5997, lng: 121.0244 };

function makeActive(overrides: Partial<ActiveOrder> = {}): ActiveOrder {
  return {
    merchantId: "merchant-a",
    merchantLatitude: MERCHANT_A.lat,
    merchantLongitude: MERCHANT_A.lng,
    riderAssignedAt: NOW - 60_000, // 1 min ago
    deliveryMode: "economy",
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateOrder> = {}): CandidateOrder {
  return {
    merchantId: "merchant-b",
    merchantLatitude: MERCHANT_B.lat,
    merchantLongitude: MERCHANT_B.lng,
    deliveryMode: "economy",
    ...overrides,
  };
}

describe("canBatchForRider", () => {
  it("allows idle rider for any order", () => {
    const result = canBatchForRider([], makeCandidate(), SETTINGS, NOW);
    expect(result.ok).toBe(true);
  });

  it("allows idle rider for a priority order", () => {
    const result = canBatchForRider([], makeCandidate({ deliveryMode: "priority" }), SETTINGS, NOW);
    expect(result.ok).toBe(true);
  });

  it("blocks when rider is at max capacity", () => {
    const active = [makeActive(), makeActive(), makeActive()];
    const result = canBatchForRider(active, makeCandidate(), SETTINGS, NOW);
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/capacity/i);
  });

  describe("priority cross-merchant rules", () => {
    it("blocks priority candidate when rider has active orders at a different merchant", () => {
      const active = [makeActive({ merchantId: "merchant-a" })];
      const candidate = makeCandidate({ merchantId: "merchant-b", deliveryMode: "priority" });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(false);
      expect((result as any).reason).toMatch(/priority/i);
    });

    it("allows priority candidate when same merchant as one active order", () => {
      const active = [makeActive({ merchantId: "merchant-a", riderAssignedAt: NOW - 60_000 })];
      const candidate = makeCandidate({
        merchantId: "merchant-a",
        merchantLatitude: MERCHANT_A.lat,
        merchantLongitude: MERCHANT_A.lng,
        deliveryMode: "priority",
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(true);
    });

    it("blocks economy candidate when rider has a priority order at a different merchant", () => {
      const active = [makeActive({ merchantId: "merchant-a", deliveryMode: "priority" })];
      const candidate = makeCandidate({ merchantId: "merchant-b", deliveryMode: "economy" });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(false);
      expect((result as any).reason).toMatch(/priority/i);
    });

    it("allows economy candidate when rider has a priority order at the same merchant", () => {
      const active = [makeActive({ merchantId: "merchant-a", deliveryMode: "priority", riderAssignedAt: NOW - 60_000 })];
      const candidate = makeCandidate({
        merchantId: "merchant-a",
        merchantLatitude: MERCHANT_A.lat,
        merchantLongitude: MERCHANT_A.lng,
        deliveryMode: "economy",
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(true);
    });
  });

  describe("time gate", () => {
    it("blocks when last assigned order is older than the batch window", () => {
      const active = [makeActive({ riderAssignedAt: NOW - 700_000 })]; // 11.7 min ago
      const candidate = makeCandidate({ merchantId: "merchant-a" }); // same merchant to isolate time check
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(false);
      expect((result as any).reason).toMatch(/too old/i);
    });

    it("allows when within time window", () => {
      const active = [makeActive({ riderAssignedAt: NOW - 500_000, merchantId: "merchant-a" })]; // 8.3 min ago
      const candidate = makeCandidate({
        merchantId: "merchant-a",
        merchantLatitude: MERCHANT_A.lat,
        merchantLongitude: MERCHANT_A.lng,
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(true);
    });

    it("uses the most recent riderAssignedAt when rider has multiple active orders", () => {
      const active = [
        makeActive({ riderAssignedAt: NOW - 700_000, merchantId: "merchant-a" }),
        makeActive({ riderAssignedAt: NOW - 120_000, merchantId: "merchant-a" }), // recent one
      ];
      const candidate = makeCandidate({
        merchantId: "merchant-a",
        merchantLatitude: MERCHANT_A.lat,
        merchantLongitude: MERCHANT_A.lng,
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(true);
    });
  });

  describe("spatial gate", () => {
    it("allows same-merchant orders without proximity check", () => {
      const active = [makeActive({ merchantId: "merchant-a" })];
      const candidate = makeCandidate({
        merchantId: "merchant-a",
        merchantLatitude: MERCHANT_A.lat,
        merchantLongitude: MERCHANT_A.lng,
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(true);
    });

    it("allows different merchant within proximity", () => {
      // Merchant B is ~1 km from Merchant A — within 2 km threshold
      const active = [makeActive({ merchantId: "merchant-a" })];
      const candidate = makeCandidate({
        merchantId: "merchant-b",
        merchantLatitude: MERCHANT_B.lat,
        merchantLongitude: MERCHANT_B.lng,
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(true);
    });

    it("blocks different merchant out of proximity", () => {
      // Merchant C is ~5 km from Merchant A — beyond 2 km threshold
      const active = [makeActive({ merchantId: "merchant-a" })];
      const candidate = makeCandidate({
        merchantId: "merchant-c",
        merchantLatitude: MERCHANT_C.lat,
        merchantLongitude: MERCHANT_C.lng,
      });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(false);
      expect((result as any).reason).toMatch(/too far/i);
    });

    it("blocks when candidate has no merchant coordinates", () => {
      const active = [makeActive()];
      const candidate = makeCandidate({ merchantLatitude: null, merchantLongitude: null });
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(false);
      expect((result as any).reason).toMatch(/coordinates/i);
    });

    it("skips an active order with missing coordinates in proximity check", () => {
      // One active order has no coords; candidate is out of range of the one that does
      const active = [
        makeActive({ merchantLatitude: null, merchantLongitude: null }),
        makeActive({ merchantId: "merchant-a2", merchantLatitude: MERCHANT_C.lat, merchantLongitude: MERCHANT_C.lng }),
      ];
      const candidate = makeCandidate({
        merchantId: "merchant-b",
        merchantLatitude: MERCHANT_B.lat,
        merchantLongitude: MERCHANT_B.lng,
      });
      // B is ~1 km from A (ok) but ~4 km from C (not ok). A2 is at C's position.
      // The active order at A-original is null coords, so only A2 is checked → fail.
      const result = canBatchForRider(active, candidate, SETTINGS, NOW);
      expect(result.ok).toBe(false);
    });
  });
});
