import { Linking } from 'react-native';
import { buildTelUrl, openDialer } from './phoneLink';

describe('buildTelUrl', () => {
  it('keeps digits and a leading plus', () => {
    expect(buildTelUrl('09469286665')).toBe('tel:09469286665');
    expect(buildTelUrl('+63 946 928 6665')).toBe('tel:+639469286665');
  });

  it('strips formatting characters', () => {
    expect(buildTelUrl('(0946) 928-6665')).toBe('tel:09469286665');
  });

  it('returns null when there is no dialable number', () => {
    expect(buildTelUrl(undefined)).toBeNull();
    expect(buildTelUrl('')).toBeNull();
    expect(buildTelUrl('   ')).toBeNull();
    expect(buildTelUrl('n/a')).toBeNull();
  });
});

describe('openDialer', () => {
  const openURL = jest.spyOn(Linking, 'openURL');

  beforeEach(() => {
    openURL.mockReset();
    openURL.mockResolvedValue(true);
  });

  it('opens the dialer and reports success', async () => {
    await expect(openDialer('0946 928 6665')).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledWith('tel:09469286665');
  });

  it('does nothing when there is no number', async () => {
    await expect(openDialer(null)).resolves.toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing when no dialer can handle the URL', async () => {
    openURL.mockRejectedValue(new Error('Unable to open URL: tel:09469286665'));
    await expect(openDialer('09469286665')).resolves.toBe(false);
  });
});
