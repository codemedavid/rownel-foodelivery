import { useEffect, useState } from 'react';
import { detectCurrentPlatform, type Platform } from '../lib/appDownload';

/**
 * The visitor's platform, resolved after mount so the first paint is identical
 * for everyone and platform-specific copy never flashes the wrong variant.
 */
export function usePlatform(): { platform: Platform; isResolved: boolean } {
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    setPlatform(detectCurrentPlatform());
    setIsResolved(true);
  }, []);

  return { platform, isResolved };
}
