// These pins are styled inline rather than with Tailwind classes, because the
// Expo app loads them through a standalone page that has no Tailwind build.
// The assertions below read computed style for that reason: a class name would
// pass here and still render a white circle on a white map in the WebView.
import { describe, expect, it } from 'vitest';
import {
  createAmbientRiderPin,
  createDeliveryPin,
  createLocationPin,
  createMerchantPin,
  createTrackedRiderPin,
  PIN_FACTORIES,
} from './mapPins';

const ALL_FACTORIES = Object.values(PIN_FACTORIES);

describe('map pins', () => {
  it('builds each pin as a detached element an annotation can adopt', () => {
    // Arrange / Act / Assert — MapKit takes a DOM node, not a React element
    for (const create of ALL_FACTORIES) {
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

  it('carries its colour inline, so it survives outside the Tailwind build', () => {
    // Arrange / Act / Assert — the WebView page ships no stylesheet of its own
    for (const create of ALL_FACTORIES) {
      const element = create();
      const hasOwnPaint =
        element.style.backgroundColor !== '' || element.style.filter !== '';
      expect(hasOwnPaint).toBe(true);
    }
  });

  it('sizes the followed rider larger than the ambient ones', () => {
    // Arrange / Act
    const tracked = createTrackedRiderPin();
    const ambient = createAmbientRiderPin();

    // Assert
    expect(tracked.style.height).toBe('40px');
    expect(ambient.style.height).toBe('28px');
  });

  it('keeps every pin kind visually distinct from the others', () => {
    // Arrange / Act — a rider and a destination must never be confusable
    const backgrounds = [
      createTrackedRiderPin(),
      createAmbientRiderPin(),
      createDeliveryPin(),
      createMerchantPin(),
    ].map((element) => element.style.backgroundColor);

    // Assert
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });

  it('dims the ambient riders so they read as context, not as the subject', () => {
    // Arrange / Act / Assert
    expect(Number(createAmbientRiderPin().style.opacity)).toBeLessThan(1);
    expect(createTrackedRiderPin().style.opacity).toBe('');
  });

  it('exposes every pin under the name the map embed protocol sends', () => {
    // Arrange / Act / Assert — a kind with no factory would be a silent no-op
    expect(Object.keys(PIN_FACTORIES).sort()).toEqual([
      'ambient-rider',
      'delivery',
      'location',
      'merchant',
      'tracked-rider',
    ]);
  });

  it('draws the draggable location pin without a badge behind it', () => {
    // Arrange / Act — it is a bare teardrop, matching the web picker
    const element = createLocationPin();

    // Assert
    expect(element.style.backgroundColor).toBe('');
    expect(element.style.filter).not.toBe('');
  });
});
