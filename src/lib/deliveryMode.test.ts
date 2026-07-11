import { describe, it, expect } from 'vitest';
import { resolveDeliveryMode } from './deliveryMode';
import type { DeliveryMode } from './deliveryTypes';

describe('resolveDeliveryMode', () => {
  it("returns 'priority' when the merchant has no economy option", () => {
    // Arrange
    const hasEconomyOption = false;
    const selectedMode: DeliveryMode = 'priority';

    // Act
    const result = resolveDeliveryMode(hasEconomyOption, selectedMode);

    // Assert — this is the regression: must not be undefined/null (NOT-NULL crash)
    expect(result).toBe('priority');
  });

  it("never returns undefined or null regardless of the selected mode when economy is unavailable", () => {
    for (const selectedMode of ['priority', 'economy'] as DeliveryMode[]) {
      const result = resolveDeliveryMode(false, selectedMode);
      expect(result).not.toBeUndefined();
      expect(result).not.toBeNull();
      expect(result).toBe('priority');
    }
  });

  it("preserves the customer's selected mode when the economy option is available", () => {
    expect(resolveDeliveryMode(true, 'economy')).toBe('economy');
    expect(resolveDeliveryMode(true, 'priority')).toBe('priority');
  });
});
