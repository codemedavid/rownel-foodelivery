// Pin ids are the contract that lets a rider's pin glide instead of blinking:
// the page moves an annotation it already has rather than removing and
// re-adding it. So the ids are asserted directly, not just the pin count.
//
// The other half is 0,0. A missing delivery_latitude column reads as 0 once it
// has been through Number(), and 0,0 is a real coordinate in the Gulf of
// Guinea — a map that framed it would zoom out to the whole Atlantic.

import { buildOrderPins, hasMappablePoints, pickMapCenter, PIN_IDS } from './orderPins';

const RIDER = { latitude: 14.6, longitude: 121.0 };
const MERCHANT = { latitude: 14.61, longitude: 121.01 };
const DESTINATION = { latitude: 14.62, longitude: 121.02 };

describe('buildOrderPins', () => {
  it('gives each role a stable id, so a moved pin is matched not replaced', () => {
    // Arrange / Act
    const pins = buildOrderPins({
      rider: RIDER,
      merchant: MERCHANT,
      destination: DESTINATION,
    });

    // Assert
    expect(pins.map((pin) => pin.id).sort()).toEqual(
      [PIN_IDS.destination, PIN_IDS.merchant, PIN_IDS.rider].sort()
    );
  });

  it('uses a distinct pin kind for each role', () => {
    // Arrange / Act
    const pins = buildOrderPins({
      rider: RIDER,
      merchant: MERCHANT,
      destination: DESTINATION,
    });

    // Assert
    expect(pins.find((pin) => pin.id === PIN_IDS.rider)?.kind).toBe('tracked-rider');
    expect(pins.find((pin) => pin.id === PIN_IDS.merchant)?.kind).toBe('merchant');
    expect(pins.find((pin) => pin.id === PIN_IDS.destination)?.kind).toBe('delivery');
  });

  it('draws the tracked rider last, so nothing covers the subject', () => {
    // Arrange / Act
    const pins = buildOrderPins({
      rider: RIDER,
      destination: DESTINATION,
      ambientRiders: [{ id: 'a', ...MERCHANT }],
    });

    // Assert
    expect(pins[pins.length - 1].id).toBe(PIN_IDS.rider);
  });

  it('namespaces ambient riders so one cannot collide with the tracked pin', () => {
    // Arrange / Act
    const pins = buildOrderPins({ ambientRiders: [{ id: 'rider', ...RIDER }] });

    // Assert — an ambient rider whose row id is literally "rider" is possible
    expect(pins[0].id).not.toBe(PIN_IDS.rider);
    expect(pins[0].kind).toBe('ambient-rider');
  });

  it('omits a role that has no coordinates', () => {
    // Arrange / Act
    const pins = buildOrderPins({ rider: null, destination: DESTINATION });

    // Assert
    expect(pins).toHaveLength(1);
    expect(pins[0].id).toBe(PIN_IDS.destination);
  });

  it('omits 0,0, which is an empty column rather than a place', () => {
    // Arrange / Act
    const pins = buildOrderPins({ destination: { latitude: 0, longitude: 0 } });

    // Assert
    expect(pins).toEqual([]);
  });

  it('omits a coordinate that is not a finite number', () => {
    // Arrange / Act
    const pins = buildOrderPins({ rider: { latitude: NaN, longitude: 121 } });

    // Assert
    expect(pins).toEqual([]);
  });

  it('returns nothing when the order has no mappable points at all', () => {
    // Arrange / Act / Assert — the screen hides the map rather than showing grey
    expect(buildOrderPins({})).toEqual([]);
    expect(hasMappablePoints({})).toBe(false);
  });
});

describe('pickMapCenter', () => {
  it('centres on the rider, who is the subject when there is one', () => {
    // Arrange / Act
    const center = pickMapCenter({ rider: RIDER, merchant: MERCHANT, destination: DESTINATION });

    // Assert
    expect(center).toEqual(RIDER);
  });

  it('falls back to the destination before the merchant', () => {
    // Arrange / Act
    const center = pickMapCenter({ merchant: MERCHANT, destination: DESTINATION });

    // Assert — the customer cares where it is going, not where it came from
    expect(center).toEqual(DESTINATION);
  });

  it('falls back to the merchant when that is all there is', () => {
    // Arrange / Act / Assert
    expect(pickMapCenter({ merchant: MERCHANT })).toEqual(MERCHANT);
  });

  it('returns null when there is nothing worth centring on', () => {
    // Arrange / Act / Assert — the caller opens a neutral view instead
    expect(pickMapCenter({})).toBeNull();
    expect(pickMapCenter({ rider: { latitude: 0, longitude: 0 } })).toBeNull();
  });
});
