import { describe, it, expect } from 'vitest';
import { ratingAverage } from '../hooks/useRiderProfile';

describe('vitest sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('ratingAverage handles zero ratings', () => {
    expect(ratingAverage({ rating_sum: 0, rating_count: 0 })).toBeNull();
    expect(ratingAverage(null)).toBeNull();
  });

  it('ratingAverage computes the mean', () => {
    expect(ratingAverage({ rating_sum: 12, rating_count: 3 })).toBe(4);
  });
});
