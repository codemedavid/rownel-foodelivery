import { describe, expect, it } from 'vitest';
import {
  createAmbientRiderPin,
  createDeliveryPin,
  createLocationPin,
  createTrackedRiderPin,
} from './mapPins';

describe('map pins', () => {
  it('builds each pin as a detached element an annotation can adopt', () => {
    // Arrange / Act / Assert — MapKit takes a DOM node, not a React element
    for (const create of [
      createTrackedRiderPin,
      createAmbientRiderPin,
      createDeliveryPin,
      createLocationPin,
    ]) {
      const element = create();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.querySelector('svg')).not.toBeNull();
      expect(element.isConnected).toBe(false);
    }
  });

  it('returns a new element per call, since one node cannot be in two places', () => {
    // Arrange / Act
    const first = createAmbientRiderPin();
    const second = createAmbientRiderPin();

    // Assert — a shared node would make every ambient rider share one pin
    expect(first).not.toBe(second);
  });

  it('sizes the followed rider larger than the ambient ones', () => {
    // Arrange / Act
    const tracked = createTrackedRiderPin();
    const ambient = createAmbientRiderPin();

    // Assert
    expect(tracked.className).toContain('h-10');
    expect(ambient.className).toContain('h-7');
  });

  it('keeps the delivery pin visually distinct from the rider pins', () => {
    expect(createDeliveryPin().className).toContain('bg-green-600');
    expect(createTrackedRiderPin().className).toContain('bg-red-600');
  });
});
