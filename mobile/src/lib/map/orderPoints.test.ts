// Every map coordinate in this app comes off a database row, and PostgREST
// hands back numeric columns as strings. A type check that insists on `number`
// would silently drop every real coordinate; Number() on its own would turn
// every missing one into 0,0.

import { toMapPoint } from './orderPoints';

describe('toMapPoint', () => {
  it('accepts a numeric pair', () => {
    // Arrange / Act / Assert
    expect(toMapPoint(14.5995, 120.9842)).toEqual({ latitude: 14.5995, longitude: 120.9842 });
  });

  it('accepts the strings PostgREST returns for numeric columns', () => {
    // Arrange / Act / Assert
    expect(toMapPoint('14.5995', '120.9842')).toEqual({
      latitude: 14.5995,
      longitude: 120.9842,
    });
  });

  it('returns null when either half is missing', () => {
    // Arrange / Act / Assert
    expect(toMapPoint(null, 120.9842)).toBeNull();
    expect(toMapPoint(14.5995, undefined)).toBeNull();
    expect(toMapPoint(undefined, undefined)).toBeNull();
  });

  it('treats an empty string as missing, not as zero', () => {
    // Arrange / Act / Assert — Number('') is 0, which looks like a coordinate
    expect(toMapPoint('', '')).toBeNull();
  });

  it('rejects 0,0, which is two empty columns far more often than a place', () => {
    // Arrange / Act / Assert
    expect(toMapPoint(0, 0)).toBeNull();
  });

  it('keeps a genuine zero on one axis', () => {
    // Arrange / Act — the equator and the prime meridian are real lines
    expect(toMapPoint(0, 120.9842)).toEqual({ latitude: 0, longitude: 120.9842 });
  });

  it('rejects a value that is not a number at all', () => {
    // Arrange / Act / Assert
    expect(toMapPoint('north', '120.9842')).toBeNull();
    expect(toMapPoint(NaN, 120.9842)).toBeNull();
  });
});
