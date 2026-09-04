import { serviceTypeLabel, shortOrderId, timeAgo } from './formatters';

describe('formatters', () => {
  it('shortens order ids to 8 uppercase chars', () => {
    expect(shortOrderId('7159df57-ce42-40a4')).toBe('7159DF57');
  });

  it('formats relative time buckets', () => {
    const now = 1_000_000_000;
    expect(timeAgo(now, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(timeAgo(now + 10_000, now)).toBe('just now');
  });

  it('labels service types', () => {
    expect(serviceTypeLabel('dine-in')).toBe('Dine-in');
    expect(serviceTypeLabel('unknown')).toBe('unknown');
  });
});
